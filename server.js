require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { initDB } = require("./db/postgres");

const authRoutes     = require("./routes/auth");
const productRoutes  = require("./routes/products");
const offerRoutes    = require("./routes/offers");
const paymentRoutes  = require("./routes/payments");

const app = express();

// ── Middleware ────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// ── Routes ────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/offers",   offerRoutes);
app.use("/api/payments", paymentRoutes);

// ── Health check ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "ReMarket API ishlayapti ✅",
    databases: { mongodb: "connected", postgresql: "connected" },
  });
});

// ── Server ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server http://localhost:${PORT} da ishlamoqda`);
});

// ── MongoDB ──────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI, { dbName: "remarket" })
  .then(() => console.log("✅ MongoDB ga ulandi"))
  .catch(err => console.error("❌ MongoDB ulanish xatosi:", err.message));

// ── PostgreSQL (payments) ─────────────────────────────────────────
initDB();
