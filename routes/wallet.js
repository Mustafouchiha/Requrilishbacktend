const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const formatWallet = (u) => ({
  id:      u.id,
  name:    u.name,
  phone:   u.phone,
  balance: Number(u.balance),
});

// GET /api/wallet/balance — joriy balansni ko'rish
router.get("/balance", authMiddleware, (req, res) => {
  res.json({ balance: Number(req.user.balance) });
});

// POST /api/wallet/deposit — balansga pul qo'shish (Demo)
// Body: { amount: 50000 }
router.post("/deposit", authMiddleware, async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "amount musbat son bo'lishi kerak" });
    }
    if (amount > 100_000_000) {
      return res.status(400).json({ message: "Maksimal to'ldirish: 100,000,000" });
    }

    const user = await User.deposit(req.user.id, amount);
    console.log(`💰 Deposit: ${req.user.phone} → +${amount} (jami: ${user.balance})`);

    res.json({
      message: `Balans muvaffaqiyatli to'ldirildi`,
      deposited: amount,
      wallet: formatWallet(user),
    });
  } catch (err) {
    console.error("❌ Deposit xatosi:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/wallet/pay — balansdan pul ayirish
// Body: { amount: 20000, description: "Mahsulot uchun" }
router.post("/pay", authMiddleware, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const { description } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "amount musbat son bo'lishi kerak" });
    }

    const currentBalance = Number(req.user.balance);
    if (currentBalance < amount) {
      return res.status(400).json({
        message: "Balansda yetarli mablag' yo'q",
        balance: currentBalance,
        required: amount,
        shortfall: amount - currentBalance,
      });
    }

    const user = await User.deduct(req.user.id, amount);
    console.log(`💸 Pay: ${req.user.phone} → -${amount} (qoldi: ${user.balance}) | ${description || ""}`);

    res.json({
      message: "To'lov muvaffaqiyatli amalga oshirildi",
      paid: amount,
      description: description || null,
      wallet: formatWallet(user),
    });
  } catch (err) {
    console.error("❌ Pay xatosi:", err.message);
    // deduct() "Balansda yetarli mablag' yo'q" xatosini otadi
    if (err.message.includes("yetarli mablag'")) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
