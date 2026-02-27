const express = require("express");
const Offer = require("../models/Offer");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// POST /api/offers  — taklif yuborish
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { productId, message } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Mahsulot ID majburiy" });
    }

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }

    if (product.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "O'z mahsulotingizga taklif yubora olmaysiz" });
    }

    // Allaqachon taklif yuborilganmi?
    const existing = await Offer.findOne({
      product: productId,
      buyer: req.user._id,
      status: "pending",
    });
    if (existing) {
      return res.status(400).json({ message: "Bu mahsulotga allaqachon taklif yuborgan" });
    }

    const offer = await Offer.create({
      product: productId,
      buyer: req.user._id,
      seller: product.owner,
      message: message || "",
    });

    await offer.populate([
      { path: "product", select: "name price unit" },
      { path: "buyer", select: "name phone telegram" },
    ]);

    res.status(201).json({
      id: offer._id,
      productId: offer.product._id,
      productName: offer.product.name,
      productPrice: offer.product.price,
      productUnit: offer.product.unit,
      buyerId: offer.buyer._id,
      buyerName: offer.buyer.name,
      buyerPhone: offer.buyer.phone,
      buyerTelegram: offer.buyer.telegram,
      sellerId: offer.seller,
      status: offer.status,
      sentAt: offer.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/offers  — o'zimga kelgan takliflar (seller sifatida)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const offers = await Offer.find({ seller: req.user._id })
      .populate("product", "name price unit photo")
      .populate("buyer", "name phone telegram")
      .sort({ createdAt: -1 });

    const formatted = offers.map(o => ({
      id: o._id,
      productId: o.product?._id,
      productName: o.product?.name,
      productPrice: o.product?.price,
      productUnit: o.product?.unit,
      buyerId: o.buyer?._id,
      buyerName: o.buyer?.name,
      buyerPhone: o.buyer?.phone,
      buyerTelegram: o.buyer?.telegram,
      ownerId: o.seller,
      status: o.status,
      sentAt: o.createdAt,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/offers/sent  — o'zim yuborgan takliflar (buyer sifatida)
router.get("/sent", authMiddleware, async (req, res) => {
  try {
    const offers = await Offer.find({ buyer: req.user._id })
      .populate("product", "name price unit photo")
      .populate("seller", "name phone")
      .sort({ createdAt: -1 });

    const formatted = offers.map(o => ({
      id: o._id,
      productId: o.product?._id,
      productName: o.product?.name,
      productPrice: o.product?.price,
      productUnit: o.product?.unit,
      sellerId: o.seller?._id,
      sellerName: o.seller?.name,
      status: o.status,
      sentAt: o.createdAt,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/offers/:id/paid  — to'lov tasdiqlash (seller)
router.put("/:id/paid", authMiddleware, async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, seller: req.user._id });
    if (!offer) {
      return res.status(404).json({ message: "Taklif topilmadi yoki ruxsat yo'q" });
    }

    offer.status = "paid";
    await offer.save();
    res.json({ message: "To'lov tasdiqlandi", id: offer._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
