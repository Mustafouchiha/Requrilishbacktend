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

function otpRequired() {
  if (process.env.SMS_ENABLED !== undefined) return process.env.SMS_ENABLED === "true";
  return true;
}

function otpStrict() {
  if (process.env.OTP_STRICT !== undefined) return process.env.OTP_STRICT === "true";
  return false;
}

const formatUser = (u) => ({
  id:       u.id,
  name:     u.name,
  phone:    u.phone,
  telegram: u.telegram,
  avatar:   u.avatar,
  joined:   u.joined,
});

// POST /api/auth/send-code
router.post("/send-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "Telefon raqam majburiy" });

  if (!otpRequired()) {
    return res.json({
      message: "SMS o'chiq — kod talab qilinmaydi",
      phone,
      otpRequired: false,
    });
  }

  const code    = genCode();
  const expires = Date.now() + 5 * 60 * 1000;
  otpStore.set(phone, { code, expires });

  try {
    await sendSMS(phone, `ReMarket tasdiqlash kodi: ${code}\nMuddat: 5 daqiqa`);
    res.json({ message: "Kod yuborildi", phone, otpRequired: true });
  } catch (err) {
    console.error("SMS xatosi:", err.message);
    res.json({ message: "Kod yuborildi (console)", phone, otpRequired: true });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, phone, code, telegram } = req.body;

    if (!name || !phone)
      return res.status(400).json({ message: "Ism va telefon majburiy" });

    if (otpRequired()) {
      if (!code) return res.status(400).json({ message: "Kod majburiy" });
      if (otpStrict()) {
        const otp = otpStore.get(phone);
        if (!otp) return res.status(400).json({ message: "Avval kod so'rang" });
        if (Date.now() > otp.expires)
          return res.status(400).json({ message: "Kod muddati tugagan. Qayta so'rang" });
        if (otp.code !== code)
          return res.status(400).json({ message: "Kod noto'g'ri" });
        otpStore.delete(phone);
      }
    }

    const exists = await User.findOne({ phone });
    const user = exists || (await User.create({ name, phone, telegram: telegram || "" }));
    const token = makeToken(user.id);

    res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone) return res.status(400).json({ message: "Telefon majburiy" });

    if (otpRequired()) {
      if (!code) return res.status(400).json({ message: "Kod majburiy" });
      if (otpStrict()) {
        const otp = otpStore.get(phone);
        if (!otp) return res.status(400).json({ message: "Avval kod so'rang" });
        if (Date.now() > otp.expires)
          return res.status(400).json({ message: "Kod muddati tugagan. Qayta so'rang" });
        if (otp.code !== code)
          return res.status(400).json({ message: "Kod noto'g'ri" });
        otpStore.delete(phone);
      }
    }

    const user = await User.findOne({ phone });
    if (!user)
      return res.status(404).json({ message: "Bu raqam topilmadi. Ro'yxatdan o'ting" });

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
