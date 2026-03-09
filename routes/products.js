const express = require("express");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");

const router = express.Router();

// GET /api/products — barchaning mahsulotlari (o'zinikidan tashqari)
// query: ?category=&viloyat=&tuman=&search=
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { category, viloyat, tuman, search } = req.query;
    const filter = {};

    if (req.user?.id) filter.owner_ne = req.user.id;
    if (category && category !== "Barchasi") filter.category = category;
    if (viloyat) filter.viloyat = viloyat;
    if (tuman)   filter.tuman   = tuman;
    if (search)  filter.search  = search;

    const products = await Product.find(filter);
    const loggedIn = !!req.user?.id;

    const formatted = products.map((p) => ({
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
      ownerId:      p.owner_id,
      ownerName:    p.owner_name,
      ownerPhone:   loggedIn ? p.owner_phone : null,
      ownerTelegram: loggedIn ? p.owner_telegram : null,
      createdAt:    p.created_at,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/my — faqat o'z mahsulotlari
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ owner_id: req.user.id });

    const formatted = products.map((p) => ({
      id:        p.id,
      name:      p.name,
      category:  p.category,
      price:     Number(p.price),
      unit:      p.unit,
      qty:       p.qty,
      condition: p.condition,
      viloyat:   p.viloyat,
      tuman:     p.tuman,
      photo:     p.photo,
      ownerId:   p.owner_id,
      createdAt: p.created_at,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products — yangi mahsulot qo'shish
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, category, price, unit, qty, condition, viloyat, tuman, photo } = req.body;

    if (!name || !price || !qty || !viloyat) {
      return res.status(400).json({ message: "Barcha majburiy maydonlarni to'ldiring" });
    }

    const product = await Product.create({
      name,
      category:  category  || "boshqa",
      price:     Number(price),
      unit:      unit      || "dona",
      qty:       Number(qty),
      condition: condition || "Yaxshi",
      viloyat,
      tuman:     tuman || "",
      photo:     photo || null,
      owner_id:  req.user.id,
    });

    res.status(201).json({
      id:        product.id,
      name:      product.name,
      category:  product.category,
      price:     Number(product.price),
      unit:      product.unit,
      qty:       product.qty,
      condition: product.condition,
      viloyat:   product.viloyat,
      tuman:     product.tuman,
      photo:     product.photo,
      ownerId:   product.owner_id,
      ownerName: req.user.name,
      createdAt: product.created_at,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/products/:id — mahsulotni yangilash
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const fields = {};
    const allowed = ["name","category","price","unit","qty","condition","viloyat","tuman","photo"];
    for (const f of allowed) {
      if (req.body[f] !== undefined) fields[f] = req.body[f];
    }

    const updated = await Product.update(req.params.id, req.user.id, fields);
    if (!updated) {
      return res.status(404).json({ message: "Mahsulot topilmadi yoki ruxsat yo'q" });
    }

    res.json({ message: "Yangilandi", id: updated.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id — soft delete
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const updated = await Product.update(req.params.id, req.user.id, { is_active: false });
    if (!updated) {
      return res.status(404).json({ message: "Mahsulot topilmadi yoki ruxsat yo'q" });
    }
    res.json({ message: "O'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
