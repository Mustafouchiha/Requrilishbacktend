const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Mahsulot nomi majburiy"],
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ["g'isht", "metall", "yog'och", "beton", "boshqa"],
    default: "boshqa",
  },
  price: {
    type: Number,
    required: [true, "Narx majburiy"],
    min: 0,
  },
  unit: {
    type: String,
    required: true,
    default: "dona",
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
  },
  condition: {
    type: String,
    enum: ["A'lo", "Yaxshi", "O'rta"],
    default: "Yaxshi",
  },
  viloyat: {
    type: String,
    required: [true, "Viloyat majburiy"],
  },
  tuman: {
    type: String,
    default: "",
  },
  photo: {
    type: String,
    default: null,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
