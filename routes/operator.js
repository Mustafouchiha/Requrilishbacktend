const express = require("express");
const { query } = require("../db");
const operatorAuth = require("../middleware/operatorAuth");

const router = express.Router();

// Barcha route larda operator tekshiruvi
router.use(operatorAuth);

// ── Foydalanuvchilarni qidirish ────────────────────────────────────
// GET /api/operator/users?q=telefon_yoki_ism_yoki_id
router.get("/users", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    let rows;

    if (!q) {
      // So'nggi 50 ta foydalanuvchi
      ({ rows } = await query(
        "SELECT id, name, phone, telegram, balance, tg_chat_id, joined FROM users ORDER BY joined DESC LIMIT 50"
      ));
    } else {
      ({ rows } = await query(
        `SELECT id, name, phone, telegram, balance, tg_chat_id, joined FROM users
         WHERE phone ILIKE $1 OR name ILIKE $1 OR id::text ILIKE $1
         ORDER BY joined DESC LIMIT 30`,
        [`%${q}%`]
      ));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Foydalanuvchiga pul qo'shish ──────────────────────────────────
// POST /api/operator/deposit  { phone, amount }
router.post("/deposit", async (req, res) => {
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount) return res.status(400).json({ message: "phone va amount majburiy" });

    const sum = Number(amount);
    if (isNaN(sum) || sum <= 0) return res.status(400).json({ message: "Summa noto'g'ri" });

    const { rows: found } = await query("SELECT * FROM users WHERE phone = $1 LIMIT 1", [phone.replace(/\D/g, "").slice(-9)]);
    if (!found[0]) return res.status(404).json({ message: "Bu raqamli foydalanuvchi topilmadi" });

    const { rows } = await query(
      "UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, phone, balance",
      [sum, found[0].id]
    );

    // Foydalanuvchiga Telegram xabari
    if (found[0].tg_chat_id) {
      try {
        const { notifyUser } = require("../bot");
        await notifyUser(found[0].tg_chat_id,
          `💰 *Hisobingiz to'ldirildi!*\n\nSumma: *${sum.toLocaleString()} so'm*\nJami balans: *${Number(rows[0].balance).toLocaleString()} so'm*`,
          { parse_mode: "Markdown" }
        );
      } catch { /* xabar yuborilmasa ham davom etsin */ }
    }

    res.json({ message: `${sum.toLocaleString()} so'm qo'shildi`, user: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Foydalanuvchini o'chirish ─────────────────────────────────────
// DELETE /api/operator/users/:id
router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Operator o'zini o'chira olmaydi
    if (id === req.user.id) return res.status(400).json({ message: "O'zingizni o'chira olmaysiz" });

    await query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "Foydalanuvchi o'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Mahsulotlarni qidirish ────────────────────────────────────────
// GET /api/operator/products?q=
router.get("/products", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    let rows;

    if (!q) {
      ({ rows } = await query(
        `SELECT p.id, p.name, p.price, p.unit, p.qty, p.category, p.viloyat,
                u.name AS owner_name, u.phone AS owner_phone, p.created_at
         FROM products p JOIN users u ON p.owner_id = u.id
         WHERE p.is_active = true
         ORDER BY p.created_at DESC LIMIT 50`
      ));
    } else {
      ({ rows } = await query(
        `SELECT p.id, p.name, p.price, p.unit, p.qty, p.category, p.viloyat,
                u.name AS owner_name, u.phone AS owner_phone, p.created_at
         FROM products p JOIN users u ON p.owner_id = u.id
         WHERE p.is_active = true
           AND (p.name ILIKE $1 OR p.id::text ILIKE $1 OR u.phone ILIKE $1 OR u.name ILIKE $1)
         ORDER BY p.created_at DESC LIMIT 30`,
        [`%${q}%`]
      ));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Mahsulotni o'chirish ──────────────────────────────────────────
// DELETE /api/operator/products/:id
router.delete("/products/:id", async (req, res) => {
  try {
    await query("UPDATE products SET is_active = false WHERE id = $1", [req.params.id]);
    res.json({ message: "Mahsulot o'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
