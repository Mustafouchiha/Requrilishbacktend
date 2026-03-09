const { query } = require("../db");

const Product = {
  async find(filter = {}) {
    const conditions = [];
    const values = [];
    let i = 1;

    conditions.push(`p.is_active = TRUE`);

    if (filter.owner_ne) {
      conditions.push(`p.owner_id != $${i++}`);
      values.push(filter.owner_ne);
    }
    if (filter.owner_id) {
      conditions.push(`p.owner_id = $${i++}`);
      values.push(filter.owner_id);
    }
    if (filter.category) {
      conditions.push(`p.category = $${i++}`);
      values.push(filter.category);
    }
    if (filter.viloyat) {
      conditions.push(`p.viloyat = $${i++}`);
      values.push(filter.viloyat);
    }
    if (filter.tuman) {
      conditions.push(`p.tuman = $${i++}`);
      values.push(filter.tuman);
    }
    if (filter.search) {
      conditions.push(
        `(p.name ILIKE $${i} OR p.viloyat ILIKE $${i} OR p.tuman ILIKE $${i})`
      );
      values.push(`%${filter.search}%`);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await query(
      `SELECT p.*,
              u.id   AS owner_uuid,
              u.name AS owner_name,
              u.phone AS owner_phone,
              u.telegram AS owner_telegram,
              u.avatar AS owner_avatar
       FROM products p
       JOIN users u ON u.id = p.owner_id
       ${where}
       ORDER BY p.created_at DESC`,
      values
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT p.*, u.id AS owner_uuid, u.name AS owner_name, u.phone AS owner_phone
       FROM products p JOIN users u ON u.id = p.owner_id
       WHERE p.id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findOne({ id, owner_id }) {
    const { rows } = await query(
      "SELECT * FROM products WHERE id = $1 AND owner_id = $2 LIMIT 1",
      [id, owner_id]
    );
    return rows[0] || null;
  },

  async create(data) {
    const { rows } = await query(
      `INSERT INTO products
         (name, category, price, unit, qty, condition, viloyat, tuman, photo, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        data.name,
        data.category || "boshqa",
        data.price,
        data.unit || "dona",
        data.qty,
        data.condition || "Yaxshi",
        data.viloyat,
        data.tuman || "",
        data.photo || null,
        data.owner_id,
      ]
    );
    return rows[0];
  },

  async update(id, owner_id, fields) {
    const sets = [];
    const values = [];
    let i = 1;
    const allowed = ["name","category","price","unit","qty","condition","viloyat","tuman","photo","is_active"];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = $${i++}`);
        values.push(v);
      }
    }
    sets.push(`updated_at = NOW()`);
    values.push(id, owner_id);
    const { rows } = await query(
      `UPDATE products SET ${sets.join(", ")} WHERE id = $${i++} AND owner_id = $${i} RETURNING *`,
      values
    );
    return rows[0] || null;
  },
};

module.exports = Product;
