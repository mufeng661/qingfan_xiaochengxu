const crypto = require("crypto");

function secret() {
  return process.env.AUTH_SECRET || "qingfan-study-room-auth-secret";
}

function signToken(userId) {
  const payload = Buffer.from(String(userId), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return payload + "." + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return "";
  const parts = token.split(".");
  if (parts.length !== 2) return "";
  const payload = parts[0];
  const sig = parts[1];
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "";
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch (error) {
    return "";
  }
}

module.exports = { signToken, verifyToken };
