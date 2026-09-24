function now() {
  return Date.now();
}

function ok(data) {
  return { success: true, data: data === undefined ? null : data };
}

function fail(message, code) {
  return { success: false, error: { code: code || "ERROR", message: message || "请求失败" } };
}

function toPositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isRoomId(value) {
  return /^\d{6}$/.test(String(value || ""));
}

function isValidRoomId(value) {
  return isRoomId(value) || isUuid(value);
}

function adminIds() {
  return String(process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function roleVisitor() {
  return process.env.ROLE_VISITOR || "游客";
}

function roleUser() {
  return process.env.ROLE_USER || "用户";
}

function roleAdmin() {
  return process.env.ROLE_ADMIN || "管理员";
}

function resolveRole(userId) {
  if (!userId) return roleVisitor();
  return adminIds().indexOf(userId) > -1 ? roleAdmin() : roleUser();
}

module.exports = {
  now,
  ok,
  fail,
  toPositiveInt,
  isUuid,
  isRoomId,
  isValidRoomId,
  adminIds,
  resolveRole,
  roleVisitor,
  roleUser,
  roleAdmin,
};
