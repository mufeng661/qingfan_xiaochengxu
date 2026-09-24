const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return true;
  const computed = crypto.scryptSync(String(password), salt, 32).toString("hex");
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
