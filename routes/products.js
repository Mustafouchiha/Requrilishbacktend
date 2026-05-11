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
    viewCount:        Number(p.view_count || 0),
    likeCount:        Number(p.like_count || 0),
    isLiked:          p.is_liked || false,
    pendingSaleUntil: p.pending_sale_until || null,
    paidFee:          Number(p.paid_fee || 0),
  };
}

// GET /api/products — faqat active postlar (guest + user)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { category, viloyat, tuman, search } = req.query;
    const userId = req.user?.id || null;

    const conditions = [`p.status = 'active'`];
    const values = [];
    let i = 1;

    if (userId) { conditions.push(`p.owner_id != $${i++}`); values.push(userId); }
    if (category && category !== "Barchasi") { conditions.push(`p.category = $${i++}`); values.push(category); }
    if (viloyat) { conditions.push(`p.viloyat = $${i++}`); values.push(viloyat); }
    if (tuman)   { conditions.push(`p.tuman = $${i++}`);   values.push(tuman); }
    if (search)  {
      conditions.push(`(p.name ILIKE $${i} OR p.viloyat ILIKE $${i} OR p.tuman ILIKE $${i})`);
      values.push(`%${search}%`); i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    let isLikedSql = `false AS is_liked`;
    if (userId) {
      isLikedSql = `EXISTS(SELECT 1 FROM product_likes WHERE user_id=$${i++} AND product_id=p.id) AS is_liked`;
      values.push(userId);
    }

    const { rows } = await query(
      `SELECT p.*, u.name AS owner_name, u.phone AS owner_phone, u.telegram AS owner_telegram,
              ${isLikedSql}
       FROM products p LEFT JOIN users u ON u.id = p.owner_id
       ${where}
       ORDER BY p.created_at DESC`,
      values
    );

    res.json(rows.map(p => formatProduct(p, !!userId)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/my — o'z postlari (barcha statuslar)
router.get("/my", authMiddleware, async (req, res) => {
  try {
    // pending_sale muddati o'tgan — avtomatik active ga qaytarish + fee refund
    const { rows: expired } = await query(
      `UPDATE products
       SET status='active', pending_sale_until=NULL, updated_at=NOW()
       WHERE owner_id=$1 AND status='pending_sale' AND pending_sale_until IS NOT NULL AND pending_sale_until < NOW()
       RETURNING id, paid_fee, owner_id`,
      [req.user.id]
    ).catch(() => ({ rows: [] }));

    for (const p of expired) {
      if (Number(p.paid_fee) > 0) {
        await query(
          "UPDATE users SET balance = balance + $1 WHERE id = $2",
          [p.paid_fee, p.owner_id]
        ).catch(() => {});
        await query(
          "UPDATE products SET paid_fee=0, paid_offer_id=NULL WHERE id=$1",
          [p.id]
        ).catch(() => {});
      }
    }

    const { rows } = await query(
      `SELECT p.*, u.name AS owner_name, u.phone AS owner_phone, u.telegram AS owner_telegram,
              false AS is_liked
       FROM products p LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.owner_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.map(p => formatProduct(p, true)));
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

// POST /api/products/:id/sold — sotuvchi: mahsulot sotildi (o'chirish)
router.post("/:id/sold", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE products SET status='deleted', is_active=false, pending_sale_until=NULL, updated_at=NOW()
       WHERE id=$1 AND owner_id=$2 AND status='pending_sale'
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Topilmadi yoki ruxsat yo'q" });
    res.json({ ok: true, message: "Post o'chirildi — tabriklaymiz!" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/products/:id/not-sold — sotuvchi: sotilmadi, qaytarish + to'lov refund
router.post("/:id/not-sold", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE products
       SET status='active', is_active=true, pending_sale_until=NULL, updated_at=NOW()
       WHERE id=$1 AND owner_id=$2 AND status='pending_sale'
       RETURNING id, paid_fee`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Topilmadi yoki ruxsat yo'q" });
    const fee = Number(rows[0].paid_fee || 0);
    if (fee > 0) {
      await query(
        "UPDATE users SET balance = balance + $1, updated_at=NOW() WHERE id=$2",
        [fee, req.user.id]
      );
      await query(
        "UPDATE products SET paid_fee=0, paid_offer_id=NULL WHERE id=$1",
        [req.params.id]
      );
    }
    res.json({ ok: true, refunded: fee, message: `Post qayta faollashtirildi${fee > 0 ? `. ${fee.toLocaleString()} so'm qaytarildi` : ""}` });
  } catch (err) { res.status(500).json({ message: err.message }); }
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
