const express = require("express");
const { query } = require("../db");
const authMiddleware = require("../middleware/auth");
const optionalAuth   = require("../middleware/optionalAuth");

const router = express.Router();

const MINI_APP_URL = () => process.env.MINI_APP_URL || "https://frontend-353d.vercel.app/";

function fmtRental(r, loggedIn = false) {
  return {
    id:           r.id,
    name:         r.name,
    category:     r.category,
    pricePerDay:  Number(r.price_per_day || 0),
    pricePerHour: Number(r.price_per_hour || 0),
    viloyat:      r.viloyat,
    tuman:        r.tuman || "",
    description:  r.description || "",
    photo:        r.photo,
    photos:       r.photos ? JSON.parse(r.photos) : (r.photo ? [r.photo] : []),
    ownerId:      r.owner_id,
    ownerName:    r.owner_name || "Noma'lum",
    ownerPhone:   loggedIn ? r.owner_phone : null,
    ownerTelegram: loggedIn ? r.owner_telegram : null,
    status:       r.status || "active",
    viewCount:    Number(r.view_count || 0),
    createdAt:    r.created_at,
  };
}

function fmtBooking(b) {
  return {
    id:         b.id,
    rentalId:   b.rental_id,
    renterId:   b.renter_id,
    renterName: b.renter_name || "Noma'lum",
    renterPhone: b.renter_phone || "",
    renterTelegram: b.renter_telegram || "",
    rentalName: b.rental_name || "",
    ownerName:  b.owner_name || "",
    ownerPhone: b.owner_phone || "",
    ownerId:    b.owner_id || null,
    ownerChatId: b.owner_chat_id || null,
    startDate:  b.start_date,
    endDate:    b.end_date,
    totalDays:  Number(b.total_days || 0),
    totalPrice: Number(b.total_price || 0),
    fee:        Number(b.fee || 0),
    status:     b.status,
    note:       b.note || "",
    createdAt:  b.created_at,
  };
}

// ─── GET /api/rentals — faol arendalar ──────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { category, viloyat, tuman, search } = req.query;
    const conds = [`r.status = 'active'`];
    const vals  = [];
    let i = 1;

    if (req.user?.id) { conds.push(`r.owner_id != $${i++}`); vals.push(req.user.id); }
    if (category && category !== "Barchasi") { conds.push(`r.category = $${i++}`); vals.push(category); }
    if (viloyat)  { conds.push(`r.viloyat = $${i++}`); vals.push(viloyat); }
    if (tuman)    { conds.push(`r.tuman = $${i++}`);   vals.push(tuman); }
    if (search)   {
      conds.push(`(r.name ILIKE $${i} OR r.viloyat ILIKE $${i} OR r.tuman ILIKE $${i})`);
      vals.push(`%${search}%`); i++;
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const { rows } = await query(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone, u.telegram AS owner_telegram
       FROM rentals r LEFT JOIN users u ON u.id = r.owner_id
       ${where} ORDER BY r.created_at DESC`,
      vals
    );
    res.json(rows.map(r => fmtRental(r, !!req.user?.id)));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/rentals/my — mening arenda e'lonlarim ─────────────
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone, u.telegram AS owner_telegram
       FROM rentals r LEFT JOIN users u ON u.id = r.owner_id
       WHERE r.owner_id = $1 AND r.status != 'deleted'
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.map(r => fmtRental(r, true)));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/rentals/my-bookings — mening bronlarim (ijorachi) ─
router.get("/my-bookings", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT b.*,
              u.name AS renter_name, u.phone AS renter_phone, u.telegram AS renter_telegram,
              r.name AS rental_name, r.owner_id,
              o.name AS owner_name, o.phone AS owner_phone, o.tg_chat_id AS owner_chat_id
       FROM rental_bookings b
       LEFT JOIN users u ON u.id = b.renter_id
       LEFT JOIN rentals r ON r.id = b.rental_id
       LEFT JOIN users o ON o.id = r.owner_id
       WHERE b.renter_id = $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.map(fmtBooking));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/rentals/:id — bitta arenda ────────────────────────
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone, u.telegram AS owner_telegram
       FROM rentals r LEFT JOIN users u ON u.id = r.owner_id
       WHERE r.id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Topilmadi" });

    // view_count oshirish
    await query(`UPDATE rentals SET view_count = view_count + 1 WHERE id = $1`, [req.params.id]).catch(() => {});

    res.json(fmtRental(rows[0], !!req.user));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/rentals/:id/booked-dates — band sanalar ───────────
router.get("/:id/booked-dates", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT start_date, end_date FROM rental_bookings
       WHERE rental_id = $1 AND status = 'confirmed' AND end_date >= CURRENT_DATE`,
      [req.params.id]
    );
    res.json(rows.map(r => ({
      startDate: r.start_date,
      endDate:   r.end_date,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/rentals — yangi arenda e'lon ──────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, category, pricePerDay, pricePerHour, viloyat, tuman, description, photo, photos } = req.body;
    if (!name || !viloyat || (!pricePerDay && !pricePerHour)) {
      return res.status(400).json({ message: "Nomi, viloyat va narx majburiy" });
    }

    const photosJson = Array.isArray(photos) && photos.length
      ? JSON.stringify(photos)
      : (photo ? JSON.stringify([photo]) : null);

    const { rows } = await query(
      `INSERT INTO rentals (name, category, price_per_day, price_per_hour, viloyat, tuman, description, photo, photos, owner_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_approval') RETURNING *`,
      [
        name,
        category || "boshqa",
        Number(pricePerDay || 0),
        Number(pricePerHour || 0),
        viloyat,
        tuman || "",
        description || "",
        photo || (Array.isArray(photos) ? photos[0] : null) || null,
        photosJson,
        req.user.id,
      ]
    );
    const rental = rows[0];

    // Foydalanuvchiga xabar
    if (req.user.tg_chat_id) {
      const { notifyUser } = require("../bot");
      await notifyUser(req.user.tg_chat_id,
        `⏳ *Arenda e'loningiz qabul qilindi!*\n\n📦 ${name}\n\nOperator tekshirilgach, faollashtiriladi.`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }

    // Operatorga xabar
    const { notifyOperator } = require("../bot");
    await notifyOperator(
      `🏠 *Yangi arenda e'lon tekshiruv kutmoqda!*\n\n📦 ${name}\n💰 ${Number(pricePerDay||0).toLocaleString()} so'm/kun\n📍 ${viloyat}${tuman ? ", " + tuman : ""}\n👤 ${req.user.name} (${req.user.phone})`
    ).catch(() => {});

    res.status(201).json(fmtRental({ ...rental, owner_name: req.user.name, owner_phone: req.user.phone }, true));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PUT /api/rentals/:id — o'z e'lonini yangilash ──────────────
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { name, category, pricePerDay, pricePerHour, viloyat, tuman, description, photo, photos } = req.body;
    const sets = []; const vals = []; let i = 1;
    if (name !== undefined)         { sets.push(`name=$${i++}`);           vals.push(name); }
    if (category !== undefined)     { sets.push(`category=$${i++}`);       vals.push(category); }
    if (pricePerDay !== undefined)  { sets.push(`price_per_day=$${i++}`);  vals.push(Number(pricePerDay)); }
    if (pricePerHour !== undefined) { sets.push(`price_per_hour=$${i++}`); vals.push(Number(pricePerHour)); }
    if (viloyat !== undefined)      { sets.push(`viloyat=$${i++}`);        vals.push(viloyat); }
    if (tuman !== undefined)        { sets.push(`tuman=$${i++}`);          vals.push(tuman); }
    if (description !== undefined)  { sets.push(`description=$${i++}`);   vals.push(description); }
    if (photo !== undefined)        { sets.push(`photo=$${i++}`);          vals.push(photo); }
    if (photos !== undefined)       { sets.push(`photos=$${i++}`);         vals.push(JSON.stringify(photos)); }
    if (!sets.length) return res.status(400).json({ message: "Hech narsa o'zgarmadi" });
    sets.push(`updated_at=NOW()`);
    vals.push(req.params.id, req.user.id);
    const { rows } = await query(
      `UPDATE rentals SET ${sets.join(",")} WHERE id=$${i++} AND owner_id=$${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ message: "Topilmadi yoki ruxsat yo'q" });
    res.json(fmtRental({ ...rows[0], owner_name: req.user.name, owner_phone: req.user.phone }, true));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DELETE /api/rentals/:id — o'z e'lonini o'chirish ───────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE rentals SET status='deleted', updated_at=NOW() WHERE id=$1 AND owner_id=$2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Topilmadi yoki ruxsat yo'q" });
    res.json({ message: "O'chirildi" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/rentals/:id/book — zakaz berish ──────────────────
router.post("/:id/book", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, note } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "Sana majburiy" });

    const start = new Date(startDate);
    const end   = new Date(endDate);
    if (end < start) return res.status(400).json({ message: "Noto'g'ri sana oralig'i" });

    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);

    // Rental ma'lumotlari
    const { rows: rRows } = await query(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone, u.tg_chat_id AS owner_chat
       FROM rentals r LEFT JOIN users u ON u.id = r.owner_id
       WHERE r.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const rental = rRows[0];
    if (!rental) return res.status(404).json({ message: "Arenda topilmadi" });
    if (rental.status !== "active") return res.status(400).json({ message: "Bu arenda faol emas" });
    if (rental.owner_id === req.user.id) return res.status(400).json({ message: "O'z arendangizni ololmaysiz" });

    // Sanalar band emasligini tekshirish
    const { rows: conflict } = await query(
      `SELECT 1 FROM rental_bookings
       WHERE rental_id=$1 AND status='confirmed'
         AND start_date <= $2 AND end_date >= $3`,
      [req.params.id, endDate, startDate]
    );
    if (conflict.length > 0) return res.status(400).json({ message: "Tanlangan sanalar band" });

    const totalPrice = Number(rental.price_per_day) * totalDays;
    const fee        = Math.max(1, Math.round(totalPrice * 0.05));

    // Balansni tekshirish
    const balance = Number(req.user.balance || 0);
    if (balance < fee) {
      return res.status(400).json({
        message: `Balans yetarli emas. Kerak: ${fee.toLocaleString()} so'm, mavjud: ${balance.toLocaleString()} so'm`,
      });
    }

    // Lock va to'lov
    const lockKey = `rental_${req.params.id}_${req.user.id}`;
    const { rowCount } = await query(
      "INSERT INTO payment_locks (offer_id) VALUES ($1) ON CONFLICT DO NOTHING", [lockKey]
    );
    if (rowCount === 0) return res.status(400).json({ message: "Iltimos kuting..." });

    try {
      await query("UPDATE users SET balance = balance - $1 WHERE id = $2", [fee, req.user.id]);

      const { rows: bRows } = await query(
        `INSERT INTO rental_bookings (rental_id, renter_id, start_date, end_date, total_days, total_price, fee, status, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',$8) RETURNING *`,
        [req.params.id, req.user.id, startDate, endDate, totalDays, totalPrice, fee, note || ""]
      );
      const booking = bRows[0];

      // Notifikatsiyalar
      const { notifyUser } = require("../bot");

      // Egaga: kimdir oldi
      if (rental.owner_chat) {
        await notifyUser(rental.owner_chat,
          `🎉 *Arendangiz band qilindi!*\n\n` +
          `🏠 ${rental.name}\n` +
          `📅 ${startDate} → ${endDate} (${totalDays} kun)\n` +
          `💰 Narx: ${totalPrice.toLocaleString()} so'm\n\n` +
          `📞 Ijorachi:\n👤 ${req.user.name}\n📱 +998 ${req.user.phone}\n✈️ ${req.user.telegram || "—"}`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
      }

      // Ijorachi: xaridor
      if (req.user.tg_chat_id) {
        await notifyUser(req.user.tg_chat_id,
          `✅ *Arenda zabron qilindi!*\n\n` +
          `🏠 ${rental.name}\n` +
          `📅 ${startDate} → ${endDate} (${totalDays} kun)\n` +
          `💰 Umumiy narx: ${totalPrice.toLocaleString()} so'm\n` +
          `🧾 Xizmat haqi (5%): ${fee.toLocaleString()} so'm (balansdan)\n\n` +
          `📞 Egasi:\n👤 ${rental.owner_name}\n📱 +998 ${rental.owner_phone}\n\nUlashuv uchun egasi bilan bog'laning.`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
      }

      res.status(201).json({
        message: "Arenda muvaffaqiyatli band qilindi!",
        booking: fmtBooking({ ...booking, renter_name: req.user.name, renter_phone: req.user.phone, rental_name: rental.name, owner_name: rental.owner_name }),
        feeCharged: fee,
      });
    } finally {
      await query("DELETE FROM payment_locks WHERE offer_id=$1", [lockKey]).catch(() => {});
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DELETE /api/rentals/bookings/:id — zakazni bekor qilish ────
router.delete("/bookings/:id", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE rental_bookings SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND renter_id=$2 AND start_date > CURRENT_DATE RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Bron topilmadi yoki o'tkazib bo'lmaydi" });

    // Xizmat haqini qaytarish (to'liq qaytariladi)
    const fee = Number(rows[0].fee || 0);
    if (fee > 0) {
      await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [fee, req.user.id]);
    }

    res.json({ message: "Bron bekor qilindi. Xizmat haqi qaytarildi.", refunded: fee });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
