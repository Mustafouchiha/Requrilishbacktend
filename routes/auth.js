const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { sendSMS } = require("../utils/sms");

const router = express.Router();

// ── OTP: telefon → 6 xonali kod (xotirada saqlanadi) ─────────────
const otpStore = new Map(); // phone → { code, expires }

const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

const makeToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });

const formatUser = (u) => ({
  id:       u._id,
  name:     u.name,
  phone:    u.phone,
  telegram: u.telegram,
  avatar:   u.avatar,
  joined:   u.joined,
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/send-code
// Body: { phone }
// → 6 xonali tasdiqlash kodini console.log da ko'rsatadi
// ─────────────────────────────────────────────────────────────────
router.post("/send-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "Telefon raqam majburiy" });

  const code    = genCode();
  const expires = Date.now() + 5 * 60 * 1000; // 5 daqiqa
  otpStore.set(phone, { code, expires });

  try {
    await sendSMS(phone, `ReMarket tasdiqlash kodi: ${code}\nMuddat: 5 daqiqa`);
    res.json({ message: "Kod yuborildi", phone });
  } catch (err) {
    // SMS yuborishda xatolik bo'lsa ham kod consolda qoladi
    console.error("SMS xatosi:", err.message);
    res.json({ message: "Kod yuborildi (console)", phone });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { name, phone, code, telegram? }
// ─────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, phone, code, telegram } = req.body;

    if (!name || !phone || !code)
      return res.status(400).json({ message: "Ism, telefon va kod majburiy" });

    // Kodni tekshirish
    const otp = otpStore.get(phone);
    if (!otp)
      return res.status(400).json({ message: "Avval kod so'rang" });
    if (Date.now() > otp.expires)
      return res.status(400).json({ message: "Kod muddati tugagan. Qayta so'rang" });
    if (otp.code !== code)
      return res.status(400).json({ message: "Kod noto'g'ri" });

    otpStore.delete(phone);

    const exists = await User.findOne({ phone });
    if (exists)
      return res.status(400).json({ message: "Bu raqam allaqachon ro'yxatdan o'tgan" });

    const user  = await User.create({ name, phone, telegram: telegram || "" });
    const token = makeToken(user._id);

    res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { phone, code }
// ─────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code)
      return res.status(400).json({ message: "Telefon va kod majburiy" });

    // Kodni tekshirish
    const otp = otpStore.get(phone);
    if (!otp)
      return res.status(400).json({ message: "Avval kod so'rang" });
    if (Date.now() > otp.expires)
      return res.status(400).json({ message: "Kod muddati tugagan. Qayta so'rang" });
    if (otp.code !== code)
      return res.status(400).json({ message: "Kod noto'g'ri" });

    otpStore.delete(phone);

    const user = await User.findOne({ phone });
    if (!user)
      return res.status(404).json({ message: "Bu raqam topilmadi. Ro'yxatdan o'ting" });

    const token = makeToken(user._id);
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
    if (name)              update.name     = name;
    if (phone)             update.phone    = phone;
    if (telegram !== undefined) update.telegram = telegram;
    if (avatar   !== undefined) update.avatar   = avatar;

    const user = await User.findByIdAndUpdate(req.user._id, update,
      { new: true, runValidators: true });

    res.json(formatUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
