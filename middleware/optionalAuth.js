const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id) || null;
    next();
  } catch {
    req.user = null;
    next();
  }
};
