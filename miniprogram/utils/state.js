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

// ===== 月度冠军（存于 profile，随 data.saveProfile / data.pull 跨设备同步）=====

// 一次性迁移：把旧版本地缓存（qf_champion_count / qf_champion_年-月）并入 profile
let _championMigrated = false;
function migrateChampion() {
  if (_championMigrated) return;
  _championMigrated = true;
  const p = getProfile();
  if (p.championCount != null || (Array.isArray(p.championMonths) && p.championMonths.length)) return;
  const legacyCount = Number(store.get("qf_champion_count", 0)) || 0;
  const months = [];
  try {
    const info = wx.getStorageInfoSync();
    (info.keys || []).forEach((k) => {
      const m = /^qf_champion_(\d{4})-(\d{1,2})$/.exec(k);
      if (m) months.push(m[1] + "-" + m[2]);
    });
  } catch (e) {
    // ignore
  }
  if (legacyCount || months.length) {
    p.championCount = Math.max(legacyCount, months.length);
    p.championMonths = months;
    saveProfile(p);
  }
}

function getChampion() {
  migrateChampion();
  const p = getProfile();
  const months = Array.isArray(p.championMonths) ? p.championMonths : [];
  return { count: Math.max(Number(p.championCount) || 0, months.length), months };
}

// 当月自习室排名第 1 记一次（每月只计 1 次，幂等）
function recordChampion() {
  migrateChampion();
  const d = new Date();
  const month = d.getFullYear() + "-" + (d.getMonth() + 1);
  const p = getProfile();
  const months = Array.isArray(p.championMonths) ? p.championMonths.slice() : [];
  if (months.indexOf(month) > -1) {
    return { recorded: false, count: Math.max(Number(p.championCount) || 0, months.length) };
  }
  months.push(month);
  p.championMonths = months;
  p.championCount = Math.max(Number(p.championCount) || 0, months.length - 1) + 1;
  saveProfile(p);
  return { recorded: true, count: p.championCount };
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

// 记录用户出现过的待办，作为"记忆"用于推荐新待办
function recordTaskHistory(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return;
  const hkey = "qf_task_history_" + uid();
  const hist = store.get(hkey, []);
  const seen = {};
  hist.forEach((h) => {
    if (h && h.title) seen[h.title] = true;
  });
  let changed = false;
  tasks.forEach((t) => {
    if (t && t.title && !seen[t.title]) {
      hist.push({ title: t.title, durationMin: t.durationMin || 25, difficulty: t.difficulty || "medium" });
      seen[t.title] = true;
      changed = true;
    }
  });
  if (changed) store.set(hkey, hist.slice(-100));
}

function getTaskHistory() {
  return store.get("qf_task_history_" + uid(), []);
}

function saveTasks(list) {
  store.set(key("tasks"), list);
  recordTaskHistory(list);
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
        const local = getProfile();
        const remote = data.profile;
        // 月度冠军跨设备合并：月份取并集，次数取较大值，避免并发/离线时丢失
        const localMonths = Array.isArray(local.championMonths) ? local.championMonths : [];
        const remoteMonths = Array.isArray(remote.championMonths) ? remote.championMonths : [];
        const mergedMonths = Array.from(new Set(localMonths.concat(remoteMonths)));
        const mergedCount = Math.max(
          Number(remote.championCount) || 0,
          Number(local.championCount) || 0,
          mergedMonths.length
        );
        const next = Object.assign({}, remote, {
          championMonths: mergedMonths,
          championCount: mergedCount,
        });
        store.set("qf_profile_" + uid(), next);
        if (
          mergedCount !== (Number(remote.championCount) || 0) ||
          mergedMonths.length !== remoteMonths.length
        ) {
          call("data.saveProfile", { profile: next }).catch((e) => console.error("[qf cloud]", e));
        }
      }
    })
    .catch((e) => console.error("[qf cloud]", e));
}

module.exports = {
  uid,
  getUser,
  getProfile,
  saveProfile,
  getChampion,
  recordChampion,
  addExp,
  getTasks,
  saveTasks,
  getTaskHistory,
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
