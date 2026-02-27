const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Ism majburiy"],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, "Telefon raqam majburiy"],
    unique: true,
    trim: true,
  },
  telegram: {
    type: String,
    trim: true,
    default: "",
  },
  avatar: {
    type: String,
    default: null,
  },
  joined: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
