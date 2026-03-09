const express = require("express");
const Payment = require("../models/Payment");
const Offer   = require("../models/Offer");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

function paymentEnabled() {
  if (process.env.PAYMENT_ENABLED !== undefined) return process.env.PAYMENT_ENABLED === "true";
  return false;
}

const DEFAULT_CARD = "8600 0000 0000 0000";
const DEFAULT_NAME = "ReMarket Operator";

function getOperatorCard() {
  const card = process.env.OPERATOR_CARD;
  const name = process.env.OPERATOR_NAME;

  const isDefaultCard = !card || card === DEFAULT_CARD;

  if (paymentEnabled() && isDefaultCard) {
    return {
      ok: false,
      error: "To'lov xatosi: PAYMENT_ENABLED=true, lekin OPERATOR_CARD .env da sozlanmagan.",
    };
  }

  if (!paymentEnabled() && isDefaultCard) {
    console.log("⚠️  To'lov [CONSOLE REJIM]: OPERATOR_CARD sozlanmagan, default ishlatilmoqda");
  }

  return {
    ok: true,
    card: card || DEFAULT_CARD,
    name: name || DEFAULT_NAME,
  };
}

// GET /api/payments/info — operator karta ma'lumotlari
router.get("/info", authMiddleware, (_req, res) => {
  const op = getOperatorCard();
  if (!op.ok) {
    console.error("❌ PAYMENT XATO:", op.error);
    return res.status(500).json({ message: op.error });
  }
  res.json({ card: op.card, name: op.name });
});

// POST /api/payments — to'lov boshlash (buyer)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { offerId, cardFrom, note } = req.body;
    if (!offerId) return res.status(400).json({ message: "Offer ID majburiy" });

    const op = getOperatorCard();
    if (!op.ok) {
      console.error("❌ PAYMENT XATO:", op.error);
      return res.status(500).json({ message: op.error });
    }

    const offer = await Offer.findById(offerId);
    if (!offer)
      return res.status(404).json({ message: "Taklif topilmadi" });
    if (offer.buyer_id !== req.user.id)
      return res.status(403).json({ message: "Bu taklif sizniki emas" });
    if (offer.status === "paid")
      return res.status(400).json({ message: "Bu taklif allaqachon to'langan" });

    let payment = await Payment.findByOfferId(offerId);

    if (payment) {
      payment = await Payment.updatePending(offerId, { card_from: cardFrom, note });
    } else {
      payment = await Payment.create({
        offer_id:   offer.id,
        buyer_id:   offer.buyer_id,
        seller_id:  offer.seller_id,
        product_id: offer.product_id,
        amount:     offer.product_price,
        card_from:  cardFrom || null,
        card_to:    op.card.replace(/\s/g, ""),
        note:       note || null,
      });
    }

    console.log(`💳 To'lov yaratildi: offer=${offerId}, miqdor=${offer.product_price}`);

    res.status(201).json({
      message:      "To'lov ma'lumotlari saqlandi",
      payment:      formatPayment(payment),
      operatorCard: op.card,
      operatorName: op.name,
    });
  } catch (err) {
    console.error("❌ Payment POST xatosi:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/payments/:offerId/confirm — to'lovni tasdiqlash (seller)
router.put("/:offerId/confirm", authMiddleware, async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.offerId);
    if (!offer)
      return res.status(404).json({ message: "Taklif topilmadi" });
    if (offer.seller_id !== req.user.id)
      return res.status(403).json({ message: "Faqat sotuvchi tasdiqlashi mumkin" });

    const payment = await Payment.confirm(req.params.offerId);
    if (!payment)
      return res.status(404).json({ message: "To'lov yozuvi topilmadi" });

    // Offer statusini yangilash
    await Offer.updateStatus(req.params.offerId, req.user.id, "paid");

    console.log(`✅ To'lov tasdiqlandi: offer=${req.params.offerId}`);

    res.json({ message: "To'lov tasdiqlandi ✅", payment: formatPayment(payment) });
  } catch (err) {
    console.error("❌ Payment confirm xatosi:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/payments/my — o'z to'lovlari tarixi
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const payments = await Payment.findByUser(req.user.id);
    res.json(payments.map(formatPayment));
  } catch (err) {
    console.error("❌ Payment my xatosi:", err.message);
    res.status(500).json({ message: err.message });
  }
});

function formatPayment(p) {
  return {
    id:           p.id,
    offer_id:     p.offer_id,
    amount:       Number(p.amount),
    status:       p.status,
    card_from:    p.card_from,
    card_to:      p.card_to,
    note:         p.note,
    created_at:   p.created_at,
    confirmed_at: p.confirmed_at,
  };
}

module.exports = router;
