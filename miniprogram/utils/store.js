function get(key, def) {
  const v = wx.getStorageSync(key);
  if (v === "" || v === undefined || v === null) return def;
  return v;
}

function set(key, value) {
  wx.setStorageSync(key, value);
}

function remove(key) {
  wx.removeStorageSync(key);
}

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function dayKeyOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function greet() {
  const h = new Date().getHours();
  if (h < 6) return "深夜好";
  if (h < 11) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

let _seed = 0;
function genId(prefix) {
  _seed += 1;
  return prefix + "_" + Date.now().toString(36) + "_" + _seed.toString(36);
}

function formatMMSS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  return pad2(Math.floor(s / 60)) + ":" + pad2(s % 60);
}

module.exports = {
  get,
  set,
  remove,
  pad2,
  todayKey,
  dayKeyOffset,
  greet,
  genId,
  formatMMSS,
};
