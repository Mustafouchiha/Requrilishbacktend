const express = require("express");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// GET /api/products  — barchaning mahsulotlari (o'zinikidan tashqari)
// query: ?category=&viloyat=&tuman=&search=
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { category, viloyat, tuman, search } = req.query;
    const filter = {
      isActive: true,
      owner: { $ne: req.user._id }, // o'z mahsulotlarini ko'rsatma
    };

    if (category && category !== "Barchasi") filter.category = category;
    if (viloyat) filter.viloyat = viloyat;
    if (tuman) filter.tuman = tuman;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { viloyat: { $regex: search, $options: "i" } },
        { tuman: { $regex: search, $options: "i" } },
      ];
    }

    const products = await Product.find(filter)
      .populate("owner", "name phone telegram avatar")
      .sort({ createdAt: -1 });

    const formatted = products.map(p => ({
      id: p._id,
      name: p.name,
      category: p.category,
      price: p.price,
      unit: p.unit,
      qty: p.qty,
      condition: p.condition,
      viloyat: p.viloyat,
      tuman: p.tuman,
      photo: p.photo,
      ownerId: p.owner._id,
      ownerName: p.owner.name,
      ownerPhone: p.owner.phone,
      ownerTelegram: p.owner.telegram,
      createdAt: p.createdAt,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/my  — faqat o'z mahsulotlari
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ owner: req.user._id, isActive: true })
      .sort({ createdAt: -1 });

    const formatted = products.map(p => ({
      id: p._id,
      name: p.name,
      category: p.category,
      price: p.price,
      unit: p.unit,
      qty: p.qty,
      condition: p.condition,
      viloyat: p.viloyat,
      tuman: p.tuman,
      photo: p.photo,
      ownerId: p.owner,
      createdAt: p.createdAt,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products  — yangi mahsulot qo'shish
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, category, price, unit, qty, condition, viloyat, tuman, photo } = req.body;

    if (!name || !price || !qty || !viloyat) {
      return res.status(400).json({ message: "Barcha majburiy maydonlarni to'ldiring" });
    }

    const product = await Product.create({
      name,
      category: category || "boshqa",
      price: Number(price),
      unit: unit || "dona",
      qty: Number(qty),
      condition: condition || "Yaxshi",
      viloyat,
      tuman: tuman || "",
      photo: photo || null,
      owner: req.user._id,
    });

    await product.populate("owner", "name phone telegram");

    res.status(201).json({
      id: product._id,
      name: product.name,
      category: product.category,
      price: product.price,
      unit: product.unit,
      qty: product.qty,
      condition: product.condition,
      viloyat: product.viloyat,
      tuman: product.tuman,
      photo: product.photo,
      ownerId: product.owner._id,
      ownerName: product.owner.name,
      createdAt: product.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/products/:id  — mahsulotni yangilash
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, owner: req.user._id });
    if (!product) {
      return res.status(404).json({ message: "Mahsulot topilmadi yoki ruxsat yo'q" });
    }

    const fields = ["name", "category", "price", "unit", "qty", "condition", "viloyat", "tuman", "photo"];
    fields.forEach(f => { if (req.body[f] !== undefined) product[f] = req.body[f]; });

    await product.save();
    res.json({ message: "Yangilandi", id: product._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id  — mahsulotni o'chirish (soft delete)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, owner: req.user._id });
    if (!product) {
      return res.status(404).json({ message: "Mahsulot topilmadi yoki ruxsat yo'q" });
    }

    product.isActive = false;
    await product.save();
    res.json({ message: "O'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
