const store = require("./store");
const auth = require("./auth");

const DEFAULT_NEXT = 3000;

function uid() {
  const u = auth.getUser();
  return u && u.phone ? u.phone : "guest";
}

function key(base) {
  return "qf_" + base + "_" + uid();
}

function getProfile() {
  return store.get("qf_profile_" + uid(), {
    level: 1,
    exp: 0,
    nextLevelExp: DEFAULT_NEXT,
    streak: 0,
    lastSignDate: "",
    signDates: [],
  });
}

function saveProfile(p) {
  store.set("qf_profile_" + uid(), p);
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
}

function getStats() {
  return store.get(key("stats"), {});
}

function saveStats(stats) {
  store.set(key("stats"), stats);
}

function getGoal() {
  return store.get(key("goal"), 4);
}

function saveGoal(n) {
  store.set(key("goal"), n);
}

function getRecords() {
  return store.get(key("records"), []);
}

function saveRecords(list) {
  store.set(key("records"), list);
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
};
