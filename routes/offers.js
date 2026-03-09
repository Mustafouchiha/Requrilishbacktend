const express = require("express");
const Offer = require("../models/Offer");
const Product = require("../models/Product");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// POST /api/offers — taklif yuborish
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { productId, message } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Mahsulot ID majburiy" });
    }

    const product = await Product.findById(productId);
    if (!product || !product.is_active) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }

    if (product.owner_id === req.user.id) {
      return res.status(400).json({ message: "O'z mahsulotingizga taklif yubora olmaysiz" });
    }

    const existing = await Offer.findOne({
      product_id: productId,
      buyer_id: req.user.id,
      status: "pending",
    });
    if (existing) {
      return res.status(400).json({ message: "Bu mahsulotga allaqachon taklif yuborgan" });
    }

    const offer = await Offer.create({
      product_id: productId,
      buyer_id:   req.user.id,
      seller_id:  product.owner_id,
      message:    message || "",
    });

    res.status(201).json({
      id:           offer.id,
      productId:    product.id,
      productName:  product.name,
      productPrice: Number(product.price),
      productUnit:  product.unit,
      buyerId:      req.user.id,
      buyerName:    req.user.name,
      buyerPhone:   req.user.phone,
      buyerTelegram: req.user.telegram,
      sellerId:     product.owner_id,
      status:       offer.status,
      sentAt:       offer.created_at,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/offers — o'zimga kelgan takliflar (seller)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const offers = await Offer.findBySeller(req.user.id);

    const formatted = offers.map((o) => ({
      id:           o.id,
      productId:    o.product_id,
      productName:  o.product_name,
      productPrice: Number(o.product_price),
      productUnit:  o.product_unit,
      buyerId:      o.buyer_id,
      buyerName:    o.buyer_name,
      buyerPhone:   o.buyer_phone,
      buyerTelegram: o.buyer_telegram,
      ownerId:      o.seller_id,
      status:       o.status,
      sentAt:       o.created_at,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/offers/sent — o'zim yuborgan takliflar (buyer)
router.get("/sent", authMiddleware, async (req, res) => {
  try {
    const offers = await Offer.findByBuyer(req.user.id);

    const formatted = offers.map((o) => ({
      id:           o.id,
      productId:    o.product_id,
      productName:  o.product_name,
      productPrice: Number(o.product_price),
      productUnit:  o.product_unit,
      sellerId:     o.seller_id,
      sellerName:   o.seller_name,
      status:       o.status,
      sentAt:       o.created_at,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/offers/:id/paid — to'lov tasdiqlash (seller)
router.put("/:id/paid", authMiddleware, async (req, res) => {
  try {
    const offer = await Offer.updateStatus(req.params.id, req.user.id, "paid");
    if (!offer) {
      return res.status(404).json({ message: "Taklif topilmadi yoki ruxsat yo'q" });
    }
    res.json({ message: "To'lov tasdiqlandi", id: offer.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
