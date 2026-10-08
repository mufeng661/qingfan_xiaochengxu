const store = require("./store");
const auth = require("./auth");
const { call } = require("./api");

const DEFAULT_NEXT = 3000;

function uid() {
  const u = auth.getUser();
  return u && u.phone ? u.phone : "guest";
}

function loggedIn() {
  return auth.isLoggedIn();
}

function key(base) {
  return "qf_" + base + "_" + uid();
}

const DEFAULT_PROFILE = {
  level: 1,
  exp: 0,
  nextLevelExp: DEFAULT_NEXT,
  streak: 0,
  lastSignDate: "",
  signDates: [],
  challengeGoal: 4,
};

function getProfile() {
  return Object.assign({}, DEFAULT_PROFILE, store.get("qf_profile_" + uid(), {}));
}

function saveProfile(p) {
  store.set("qf_profile_" + uid(), p);
  if (loggedIn()) call("data.saveProfile", { profile: p }).catch((e) => console.error("[qf cloud]", e));
}

function getUser() {
  const acc = auth.getUser();
  const base = acc
    ? {
        nickname: acc.username || acc.nickname || "同学",
        phone: acc.phone || "",
        avatarSeed: acc.avatarSeed || (acc.username || "青").slice(0, 1),
      }
    : { nickname: "同学", phone: "", avatarSeed: "青" };
  return Object.assign(base, getProfile());
}

function addExp(n) {
  const p = getProfile();
  p.exp += n;
  while (p.exp >= p.nextLevelExp) {
    p.level += 1;
    p.exp -= p.nextLevelExp;
    p.nextLevelExp = Math.floor(p.nextLevelExp * 1.5);
  }
  saveProfile(p);
  return p;
}

function getTasks() {
  return store.get(key("tasks"), []);
}

function saveTasks(list) {
  store.set(key("tasks"), list);
  if (loggedIn()) call("data.saveTasks", { tasks: list }).catch((e) => console.error("[qf cloud]", e));
}

function getStats() {
  return store.get(key("stats"), {});
}

function saveStats(stats) {
  store.set(key("stats"), stats);
  if (loggedIn()) call("data.saveStats", { stats }).catch((e) => console.error("[qf cloud]", e));
}

function getGoal() {
  return getProfile().challengeGoal != null ? getProfile().challengeGoal : 4;
}

function saveGoal(n) {
  const p = getProfile();
  p.challengeGoal = n;
  saveProfile(p);
}

function getRecords() {
  return store.get(key("records"), []);
}

function saveRecords(list) {
  store.set(key("records"), list);
  if (loggedIn()) call("data.saveRecords", { records: list }).catch((e) => console.error("[qf cloud]", e));
}

function focusMinutesOf(k) {
  const stats = getStats();
  const s = stats[k];
  return s ? s.focusMinutes : 0;
}

function computeStreak() {
  const p = getProfile();
  const set = {};
  (p.signDates || []).forEach((d) => {
    set[d] = true;
  });
  const stats = getStats();
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const kk = store.dayKeyOffset(-i);
    const qualified = set[kk] && (stats[kk] ? stats[kk].focusMinutes : 0) >= 10;
    if (qualified) {
      streak += 1;
      continue;
    }
    if (i === 0) continue;
    break;
  }
  return streak;
}

function recomputeStreak() {
  const p = getProfile();
  p.streak = computeStreak();
  saveProfile(p);
  return p.streak;
}

function isSignedToday() {
  return getProfile().lastSignDate === store.todayKey();
}

function signInToday() {
  const p = getProfile();
  const today = store.todayKey();
  if (p.lastSignDate === today) return -1;
  const gain = p.streak >= 7 ? 15 : 10;
  p.exp += gain;
  while (p.exp >= p.nextLevelExp) {
    p.level += 1;
    p.exp -= p.nextLevelExp;
    p.nextLevelExp = Math.floor(p.nextLevelExp * 1.5);
  }
  if ((p.signDates || []).indexOf(today) < 0) {
    p.signDates = (p.signDates || []).concat([today]);
  }
  p.lastSignDate = today;
  saveProfile(p);
  recomputeStreak();
  return gain;
}

function getTheme() {
  return store.get("qf_theme", "green");
}

function setTheme(t) {
  store.set("qf_theme", t);
}

let _lastPull = 0;

// 从云端拉取并覆盖本地（登录后三端数据互通）
function pullCloud(force) {
  if (!loggedIn()) return Promise.resolve();
  const t = Date.now();
  if (!force && t - _lastPull < 5000) return Promise.resolve();
  _lastPull = t;
  return call("data.pull")
    .then((data) => {
      if (Array.isArray(data.tasks)) store.set(key("tasks"), data.tasks);
      if (Array.isArray(data.records)) store.set(key("records"), data.records);
      if (data.stats && typeof data.stats === "object") store.set(key("stats"), data.stats);
      if (data.profile && typeof data.profile === "object" && Object.keys(data.profile).length) {
        store.set("qf_profile_" + uid(), data.profile);
      }
    })
    .catch((e) => console.error("[qf cloud]", e));
}

module.exports = {
  uid,
  getUser,
  getProfile,
  saveProfile,
  addExp,
  getTasks,
  saveTasks,
  getStats,
  saveStats,
  getGoal,
  saveGoal,
  getRecords,
  saveRecords,
  focusMinutesOf,
  computeStreak,
  recomputeStreak,
  isSignedToday,
  signInToday,
  getTheme,
  setTheme,
  pullCloud,
};
