const express = require("express");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const { query } = require("../db");

const router = express.Router();

function formatProduct(p, loggedIn = false) {
  return {
    id:           p.id,
    name:         p.name,
    category:     p.category,
    price:        Number(p.price),
    unit:         p.unit,
    qty:          p.qty,
    condition:    p.condition,
    viloyat:      p.viloyat,
    tuman:        p.tuman,
    photo:        p.photo,
    photos:       p.photos ? JSON.parse(p.photos) : (p.photo ? [p.photo] : []),
    ownerId:      p.owner_id,
    ownerName:    p.owner_name || "Noma'lum",
    ownerPhone:   loggedIn ? p.owner_phone : null,
    ownerTelegram: loggedIn ? p.owner_telegram : null,
    status:       p.status || "active",
    rejectedReason: p.rejected_reason || null,
    createdAt:    p.created_at,
    viewCount:    Number(p.view_count || 0),
    likeCount:    Number(p.like_count || 0),
    isLiked:      p.is_liked || false,
  };
}

// GET /api/products — faqat active postlar (guest + user)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { category, viloyat, tuman, search } = req.query;
    const filter = { status: "active" };

    if (req.user?.id) filter.owner_ne = req.user.id;
    if (category && category !== "Barchasi") filter.category = category;
    if (viloyat) filter.viloyat = viloyat;
    if (tuman)   filter.tuman   = tuman;
    if (search)  filter.search  = search;

    const products = await Product.find(filter);
    res.json(products.map(p => formatProduct(p, !!req.user?.id)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/my — o'z postlari (barcha statuslar)
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ owner_id: req.user.id, status: "all" });
    res.json(products.map(p => formatProduct(p, true)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products — yangi post (pending_approval ga ketadi)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, category, price, unit, qty, condition, viloyat, tuman, photo, photos } = req.body;

    if (!name || !price || !qty || !viloyat) {
      return res.status(400).json({ message: "Barcha majburiy maydonlarni to'ldiring" });
    }

    const photosJson = Array.isArray(photos) && photos.length
      ? JSON.stringify(photos)
      : (photo ? JSON.stringify([photo]) : null);

    const product = await Product.create({
      name, category: category || "boshqa",
      price: Number(price), unit: unit || "dona",
      qty: Number(qty), condition: condition || "Yaxshi",
      viloyat, tuman: tuman || "",
      photo: photo || (Array.isArray(photos) ? photos[0] : null) || null,
      photos: photosJson,
      owner_id: req.user.id,
      status: "pending_approval",
    });

    const { notifyUser, notifyOperator } = require("../bot");

    // Foydalanuvchiga: post tekshirilmoqda
    if (req.user.tg_chat_id) {
      notifyUser(req.user.tg_chat_id,
        `⏳ *E'loningiz qabul qilindi!*\n\n` +
        `📦 ${name}\n\n` +
        `E'loningiz tekshirilmoqda (30-60 daqiqa). Operator tasdiqlasa, to'lov yo'riqnomasi yuboriladi.`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }

    // Operatorga xabar
    notifyOperator(
      `📋 *Yangi e'lon tekshiruv kutmoqda!*\n\n` +
      `📦 Mahsulot: ${name}\n` +
      `💰 Narx: ${Number(price).toLocaleString()} so'm\n` +
      `📍 Manzil: ${viloyat}${tuman ? ", " + tuman : ""}\n` +
      `👤 Sotuvchi: ${req.user.name} (${req.user.phone})`
    ).catch(() => {});

    const parsedPhotos = product.photos ? JSON.parse(product.photos) : (product.photo ? [product.photo] : []);

    res.status(201).json({
      ...formatProduct(product, true),
      photos: parsedPhotos,
      ownerName: req.user.name,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id — bitta mahsulot
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { rows } = await query(
      `SELECT p.*, u.name AS owner_name, u.phone AS owner_phone, u.telegram AS owner_telegram,
              ${userId ? `EXISTS(SELECT 1 FROM product_likes WHERE user_id=$2 AND product_id=p.id) AS is_liked` : `false AS is_liked`}
       FROM products p LEFT JOIN users u ON u.id=p.owner_id
       WHERE p.id=$1 LIMIT 1`,
      userId ? [req.params.id, userId] : [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Topilmadi" });
    res.json(formatProduct(rows[0], !!req.user));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/products/:id/view — ko'rishlar sonini oshirish
router.post("/:id/view", async (req, res) => {
  try {
    await query(`UPDATE products SET view_count = view_count + 1 WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/products/:id/like — like toggle
router.post("/:id/like", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT 1 FROM product_likes WHERE user_id=$1 AND product_id=$2`,
      [req.user.id, req.params.id]
    );
    if (rows.length > 0) {
      await query(`DELETE FROM product_likes WHERE user_id=$1 AND product_id=$2`, [req.user.id, req.params.id]);
      await query(`UPDATE products SET like_count = GREATEST(0, like_count - 1) WHERE id=$1`, [req.params.id]);
      res.json({ liked: false });
    } else {
      await query(`INSERT INTO product_likes (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, req.params.id]);
      await query(`UPDATE products SET like_count = like_count + 1 WHERE id=$1`, [req.params.id]);
      res.json({ liked: true });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/products/:id — yangilash
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const fields = {};
    const allowed = ["name","category","price","unit","qty","condition","viloyat","tuman","photo","photos"];
    for (const f of allowed) {
      if (req.body[f] !== undefined) fields[f] = req.body[f];
    }
    const updated = await Product.update(req.params.id, req.user.id, fields);
    if (!updated) return res.status(404).json({ message: "Mahsulot topilmadi yoki ruxsat yo'q" });
    res.json({ message: "Yangilandi", id: updated.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id — o'z postini o'chirish
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const updated = await Product.update(req.params.id, req.user.id, { status: "deleted", is_active: false });
    if (!updated) return res.status(404).json({ message: "Mahsulot topilmadi yoki ruxsat yo'q" });
    res.json({ message: "O'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
