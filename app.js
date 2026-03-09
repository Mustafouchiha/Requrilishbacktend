const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const offerRoutes = require("./routes/offers");
const paymentRoutes = require("./routes/payments");

const app = express();

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== "production"
      ) {
        return cb(null, true);
      }
      cb(new Error("CORS: ruxsat yo'q — " + origin));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

// ── Flags logging (local/dev) ─────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const smsEnabled = process.env.SMS_ENABLED === "true";
  const payEnabled = process.env.PAYMENT_ENABLED === "true";
  console.log(
    `\n⚙️  SMS_ENABLED=${smsEnabled ? "true" : "false"} | PAYMENT_ENABLED=${
      payEnabled ? "true" : "false"
    }\n`
  );
}

// ── Routes ────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/payments", paymentRoutes);

// ── Health check ─────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "ReMarket API ishlayapti ✅",
    database: "PostgreSQL",
    smsEnabled: process.env.SMS_ENABLED === "true",
    paymentEnabled: process.env.PAYMENT_ENABLED === "true",
    timestamp: new Date().toISOString(),
  });
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Bu yo'l topilmadi" });
});

module.exports = app;

