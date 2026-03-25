const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'remarket_secret_key_2024';

const makeToken = (id) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: "30d" });

const formatUser = (u) => ({
  id:       u.id,
  name:     u.name,
  phone:    u.phone,
  telegram: u.telegram,
  avatar:   u.avatar,
  joined:   u.joined,
  balance:  u.balance,
});

// POST /api/auth/send-code  (SMS yo'q — faqat OK qaytaradi)
router.post("/send-code", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "Telefon raqam majburiy" });
  res.json({ message: "Demo rejim: ixtiyoriy kod kiriting", phone, otpRequired: false });
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, phone, telegram, tgChatId } = req.body;
    if (!name || !phone)
      return res.status(400).json({ message: "Ism va telefon majburiy" });

    // Avvaldan ro'yxatdan o'tgan bo'lsa — o'sha userni qaytaradi
    const exists = await User.findOne({ phone });
    let user = exists || (await User.create({ name, phone, telegram: telegram || "" }));

    // Telegram chat_id ni saqlash
    if (tgChatId && user.tg_chat_id !== tgChatId) {
      user = await User.findByIdAndUpdate(user.id, { tg_chat_id: tgChatId }) || user;
    }

    const token = makeToken(user.id);
    res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { phone, tgChatId } = req.body;
    if (!phone) return res.status(400).json({ message: "Telefon majburiy" });

    let user = await User.findOne({ phone });
    if (!user)
      return res.status(404).json({ message: "Bu raqam topilmadi. Ro'yxatdan o'ting" });

    // Telegram chat_id ni yangilash
    if (tgChatId && user.tg_chat_id !== tgChatId) {
      user = await User.findByIdAndUpdate(user.id, { tg_chat_id: tgChatId }) || user;
    }

    const token = makeToken(user.id);
    res.json({ token, user: formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, (req, res) => {
  res.json(formatUser(req.user));
});

// PUT /api/auth/me
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name, phone, telegram, avatar } = req.body;
    const update = {};
    if (name !== undefined)     update.name     = name;
    if (phone !== undefined)    update.phone    = phone;
    if (telegram !== undefined) update.telegram = telegram;
    if (avatar !== undefined)   update.avatar   = avatar;

    const user = await User.findByIdAndUpdate(req.user.id, update);
    res.json(formatUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
