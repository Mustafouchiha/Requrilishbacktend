const express = require("express");
const Payment = require("../models/Payment");
const Offer   = require("../models/Offer");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

function paymentEnabled() {
  if (process.env.PAYMENT_ENABLED !== undefined) return process.env.PAYMENT_ENABLED === "true";
  return false;
}

const DEFAULT_CARD = "9860160619731286";
const DEFAULT_NAME = "Ismoiljonov Mustafo";

function getOperatorCard() {
  const card = process.env.OPERATOR_CARD;
  const name = process.env.OPERATOR_NAME;
  const telegram = process.env.OPERATOR_TELEGRAM || "@Requrilish_admin";

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
    telegram,
  };
}

// GET /api/payments/info — operator karta ma'lumotlari
router.get("/info", authMiddleware, (_req, res) => {
  const op = getOperatorCard();
  if (!op.ok) {
    console.error("❌ PAYMENT XATO:", op.error);
    return res.status(500).json({ message: op.error });
  }
  res.json({ card: op.card, name: op.name, telegram: op.telegram });
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

// POST /api/payments/balance-pay — balansdan 5% xizmat haqi to'lash (seller)
router.post("/balance-pay", authMiddleware, async (req, res) => {
  try {
    const { offerId } = req.body;
    if (!offerId) return res.status(400).json({ message: "offerId majburiy" });

    const { query } = require("../db");
    const Product = require("../models/Product");

    const { rows: offerRows } = await query(
      `SELECT o.*, p.name AS product_name, p.price AS product_price,
              b.name AS buyer_name, b.phone AS buyer_phone, b.telegram AS buyer_tg, b.tg_chat_id AS buyer_chat
       FROM offers o
       LEFT JOIN products p ON p.id = o.product_id
       LEFT JOIN users b ON b.id = o.buyer_id
       WHERE o.id = $1 LIMIT 1`,
      [offerId]
    );
    const offer = offerRows[0];
    if (!offer) return res.status(404).json({ message: "Offer topilmadi" });
    if (String(offer.seller_id) !== String(req.user.id))
      return res.status(403).json({ message: "Ruxsat yo'q" });
    if (offer.status === "paid")
      return res.status(400).json({ message: "Allaqachon to'langan" });

    const fee = Math.max(1, Math.round(Number(offer.product_price) * 0.05));
    const balance = Number(req.user.balance);
    if (balance < fee) {
      return res.status(400).json({
        message: `Balansingiz yetarli emas. Kerak: ${fee.toLocaleString()} so'm, mavjud: ${balance.toLocaleString()} so'm`,
      });
    }

    const { rowCount } = await query(
      "INSERT INTO payment_locks (offer_id) VALUES ($1) ON CONFLICT DO NOTHING", [offerId]
    );
    if (rowCount === 0)
      return res.status(400).json({ message: "Allaqachon qayta ishlanmoqda" });

    try {
      await query("UPDATE users SET balance = balance - $1 WHERE id = $2", [fee, req.user.id]);
      await query(
        `INSERT INTO payments (offer_id, buyer_id, seller_id, product_id, amount, status, card_to, note, confirmed_at)
         VALUES ($1,$2,$3,$4,$5,'confirmed','balance','Balansdan to''landi',NOW())
         ON CONFLICT (offer_id) DO UPDATE SET status='confirmed', confirmed_at=NOW(), updated_at=NOW()`,
        [offerId, offer.buyer_id, offer.seller_id, offer.product_id, fee]
      );
      await query("UPDATE offers SET status='paid' WHERE id=$1", [offerId]);
      if (offer.product_id) await Product.setStatus(offer.product_id, "deleted");

      const { notifyUser } = require("../bot");
      if (offer.buyer_chat) {
        await notifyUser(offer.buyer_chat,
          `✅ *Bitim yakunlandi!*\n\n📦 ${offer.product_name}\n\n📞 Sotuvchi:\n👤 ${req.user.name}\n📱 +998 ${req.user.phone}\n✈️ ${req.user.telegram || "—"}`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
      }
      res.json({ message: "To'lov muvaffaqiyatli amalga oshirildi ✅" });
    } finally {
      await query("DELETE FROM payment_locks WHERE offer_id=$1", [offerId]).catch(() => {});
    }
  } catch (err) {
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
