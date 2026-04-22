const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

function validateTgInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return true; // dev: skip
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;
    params.delete("hash");
    const dataCheckStr = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expected = crypto.createHmac("sha256", secret).update(dataCheckStr).digest("hex");
    return expected === hash;
  } catch { return false; }
}

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
  role:     u.role || "user",
});

// POST /api/auth/tg-init — Mini App ochilganda initData bilan avtomatik kirish
router.post("/tg-init", async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ needBot: true, message: "initData yo'q" });

    if (!validateTgInitData(initData)) {
      return res.status(400).json({ needBot: true, message: "Telegram ma'lumotlari yaroqsiz" });
    }

    const params = new URLSearchParams(initData);
    const tgUser = JSON.parse(params.get("user") || "{}");
    const tgChatId = Number(tgUser.id);
    if (!tgChatId) return res.status(400).json({ needBot: true, message: "Telegram ID topilmadi" });

    const dbUser = await User.findByTgChatId(tgChatId);
    if (!dbUser) {
      return res.status(404).json({ needBot: true, message: "Ro'yxatdan o'tmagan. @Requrilishbot da /start bosing." });
    }

    const token = makeToken(dbUser.id);
    res.json({ token, user: formatUser(dbUser) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/send-code — Telegram orqali haqiqiy OTP yuborish
router.post("/send-code", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Telefon raqam majburiy" });

    const user = await User.findOne({ phone });

    // Foydalanuvchi topilmasa yoki tg_chat_id yo'q bo'lsa — botdan ro'yxatdan o'tish kerak
    if (!user || !user.tg_chat_id) {
      return res.status(400).json({
        needBot: true,
        message: "Bu raqam botda ro'yxatdan o'tmagan. @Requrilishbot da /start bosing",
      });
    }

    const { createOtp } = require('../otpStore');
    const { notifyUser } = require('../bot');

    const code = createOtp(phone);
    await notifyUser(user.tg_chat_id,
      `🔐 *ReQurilish kirish kodi*\n\nKodingiz: \`${code}\`\n\n⏱ 5 daqiqa amal qiladi.\nBu kodni hech kimga bermang.`,
      { parse_mode: 'Markdown' }
    );

    res.json({ sent: true, message: "Telegram'ga 6 xonali kod yuborildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/register — faqat bot orqali kelgan foydalanuvchilar uchun
router.post("/register", async (req, res) => {
  try {
    const { name, phone, telegram, tgChatId } = req.body;

    // 1. If tgChatId provided, check if this Telegram account already has a user
    //    → return THAT user's token (prevents fake phone registrations)
    if (tgChatId) {
      const byTg = await User.findByTgChatId(Number(tgChatId));
      if (byTg) {
        const token = makeToken(byTg.id);
        return res.json({ token, user: formatUser(byTg) });
      }
    }

    if (!name || !phone)
      return res.status(400).json({ message: "Ism va telefon majburiy" });

    const phoneKey = phone.replace(/\D/g, "").slice(-9);
    const exists = await User.findOne({ phone: phoneKey });

    // 2. Phone already registered
    if (exists) {
      // If this phone is already linked to a DIFFERENT Telegram account → deny
      if (exists.tg_chat_id && tgChatId && String(exists.tg_chat_id) !== String(tgChatId)) {
        return res.status(403).json({
          needBot: true,
          message: "Bu telefon raqam boshqa Telegram akkauntiga bog'liq. Faqat o'z raqamingizdan foydalaning.",
        });
      }
      let user = exists;
      // Link tgChatId if not yet set
      if (tgChatId && !user.tg_chat_id) {
        user = await User.findByIdAndUpdate(user.id, { tg_chat_id: tgChatId }) || user;
      }
      const token = makeToken(user.id);
      return res.json({ token, user: formatUser(user) });
    }

    // 3. New user — must come through bot (tgChatId required)
    if (!tgChatId) {
      return res.status(400).json({
        needBot: true,
        message: "Ro'yxatdan o'tish uchun avval @Requrilishbot da /start bosing va telefon raqamingizni yuboring",
      });
    }

    // 4. Create new user (from bot redirect)
    let user = await User.create({ name, phone: phoneKey, telegram: telegram || "" });
    user = await User.findByIdAndUpdate(user.id, { tg_chat_id: Number(tgChatId) }) || user;

    const { notifyUser } = require('../bot');
    await notifyUser(user.tg_chat_id,
      `✅ *ReQurilish'ga xush kelibsiz, ${user.name}!*\n\nRo'yxatdan o'tdingiz.\nTelefon: +998 ${user.phone}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    const token = makeToken(user.id);
    res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login — OTP kodi bilan kirish
router.post("/login", async (req, res) => {
  try {
    const { phone, code, tgChatId } = req.body;
    if (!phone) return res.status(400).json({ message: "Telefon majburiy" });
    if (!code)  return res.status(400).json({ message: "Kod majburiy" });

    let user = await User.findOne({ phone });
    if (!user)
      return res.status(404).json({ message: "Bu raqam topilmadi. @Requrilishbot da ro'yxatdan o'ting" });

    const { verifyOtp } = require('../otpStore');
    const result = verifyOtp(phone, code);
    if (!result.ok) return res.status(400).json({ message: result.reason });

    if (tgChatId && String(user.tg_chat_id) !== String(tgChatId)) {
      user = await User.findByIdAndUpdate(user.id, { tg_chat_id: tgChatId }) || user;
    }

    const token = makeToken(user.id);
    res.json({ token, user: formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tg-token/:token  — Telegram bot yuborgan 1 martalik token orqali kirish
router.get("/tg-token/:token", async (req, res) => {
  try {
    const { verifyToken } = require('../tgTokens');
    const data = await verifyToken(req.params.token);
    if (!data) {
      return res.status(400).json({ message: "Token yaroqsiz yoki muddati o'tgan" });
    }
    const user = await User.findById(data.userId);
    if (!user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

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

// PUT /api/auth/me — faqat ism va avatar o'zgartiriladi
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const update = {};
    if (name   !== undefined) update.name   = name;
    if (avatar !== undefined) update.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user.id, update);
    res.json(formatUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
