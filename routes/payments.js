const express = require("express");
const { pool } = require("../db/postgres");
const Offer = require("../models/Offer");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// ── Operator karta ma'lumotlari (env dan olinadi yoki default) ────
const OPERATOR_CARD = process.env.OPERATOR_CARD || "8600 0000 0000 0000";
const OPERATOR_NAME = process.env.OPERATOR_NAME || "ReMarket Operator";

// POST /api/payments  — to'lov boshlash (buyer)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { offerId, cardFrom, note } = req.body;

    if (!offerId) return res.status(400).json({ message: "Offer ID majburiy" });

    const offer = await Offer.findById(offerId)
      .populate("product", "name price unit")
      .populate("seller", "name");

    if (!offer) return res.status(404).json({ message: "Taklif topilmadi" });
    if (offer.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Bu taklif sizniki emas" });
    }
    if (offer.status === "paid") {
      return res.status(400).json({ message: "Bu taklif allaqachon to'langan" });
    }

    // Avval bor-yo'qligini tekshirish
    const existing = await pool.query(
      "SELECT id FROM payments WHERE offer_id = $1",
      [offerId]
    );

    let payment;
    if (existing.rows.length > 0) {
      // Yangilash
      const upd = await pool.query(
        `UPDATE payments SET card_from=$1, note=$2, status='pending', created_at=NOW()
         WHERE offer_id=$3 RETURNING *`,
        [cardFrom || null, note || null, offerId]
      );
      payment = upd.rows[0];
    } else {
      // Yangi to'lov yozuvi
      const ins = await pool.query(
        `INSERT INTO payments (offer_id, buyer_id, seller_id, product_id, amount, card_from, card_to, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          offerId,
          offer.buyer.toString(),
          offer.seller.toString(),
          offer.product._id.toString(),
          offer.product.price,
          cardFrom || null,
          OPERATOR_CARD.replace(/\s/g, ""),
          note || null,
        ]
      );
      payment = ins.rows[0];
    }

    res.status(201).json({
      message: "To'lov ma'lumotlari saqlandi",
      payment,
      operatorCard: OPERATOR_CARD,
      operatorName: OPERATOR_NAME,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/payments/:offerId/confirm  — to'lovni tasdiqlash (seller)
router.put("/:offerId/confirm", authMiddleware, async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.offerId);
    if (!offer) return res.status(404).json({ message: "Taklif topilmadi" });
    if (offer.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Faqat sotuvchi tasdiqlashi mumkin" });
    }

    // PostgreSQL da tasdiqlash
    await pool.query(
      `UPDATE payments SET status='confirmed', confirmed_at=NOW() WHERE offer_id=$1`,
      [req.params.offerId]
    );

    // MongoDB da ham status yangilash
    offer.status = "paid";
    await offer.save();

    res.json({ message: "To'lov tasdiqlandi ✅" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/payments/my  — o'z to'lovlari tarixi
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const uid = req.user._id.toString();
    const result = await pool.query(
      `SELECT * FROM payments WHERE buyer_id=$1 OR seller_id=$1 ORDER BY created_at DESC`,
      [uid]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/payments/info  — operator karta
router.get("/info", authMiddleware, (_req, res) => {
  res.json({ card: OPERATOR_CARD, name: OPERATOR_NAME });
});

module.exports = router;
