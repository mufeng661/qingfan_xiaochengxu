const auth = require("../../utils/auth");
const state = require("../../utils/state");
const store = require("../../utils/store");

const BADGE_CATALOG = [
  { id: "b1", icon: "🔥", name: "连续 7 天", desc: "连续签到 7 天解锁" },
  { id: "b2", icon: "🌱", name: "森林新芽", desc: "种下第 1 棵树解锁" },
  { id: "b3", icon: "⭐", name: "专注达人", desc: "累计专注 100 小时解锁" },
  { id: "b4", icon: "🏆", name: "月度冠军", desc: "当月排行第 1 名解锁" },
];

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function weekDates() {
  const out = [];
  const d = new Date();
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow - 1));
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    out.push(x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate()));
  }
  return out;
}

Page({
  data: {
    theme: "green",
    themeKey: "green",
    themesList: [
      { key: "green", name: "青番绿", color: "#6E9B57" },
      { key: "dark", name: "薄暮紫", color: "#8E7CC3" },
      { key: "dawn", name: "晨光暖", color: "#C08A4E" },
      { key: "ocean", name: "静谧蓝", color: "#5C8BA6" },
    ],
    loggedIn: false,
    nickname: "同学",
    avatarSeed: "青",
    bio: "把专注，种成一片森林",
    phone: "",
    level: 1,
    exp: 0,
    nextLevelExp: 3000,
    expPct: 0,
    expToNext: 3000,
    streak: 0,
    signedToday: false,
    signGain: 10,
    weekCells: [],
    badges: [],
    badgeIdx: 0,
    currentBadge: null,
    totalFocusHours: 0,
    totalPomodoros: 0,
    persistDays: 0,
    trees: 0,
    withered: 0,
    forestLevel: "小树苗",
    forestHint: "",
    forestCells: [],
    showLogout: false,
    showBadge: false,
    showSettings: false,
    settingsKey: "",
    settingsTitle: "",
    // 设置项
    notifyFocus: true,
    notifySign: true,
    notifyFriend: false,
    privacyTime: true,
    privacyOnline: false,
  },

  onLoad() {
    const s = store.get("qf_settings", {});
    this.setData({
      notifyFocus: s.notifyFocus !== false,
      notifySign: s.notifySign !== false,
      notifyFriend: s.notifyFriend === true,
      privacyTime: s.privacyTime !== false,
      privacyOnline: s.privacyOnline === true,
    });
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4, theme: wx.getStorageSync("qf_theme") || "green" });
    }
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk, themeKey: tk });
    require("../../utils/theme").apply(tk);
    state.pullCloud(true).then(() => this.refresh());
  },

  onPullDownRefresh() {
    state.pullCloud(true).then(() => {
      this.refresh();
      wx.stopPullDownRefresh();
    });
  },

  refresh() {
    const acc = auth.getUser() || {};
    const user = state.getUser();
    const stats = state.getStats();

    let totalMinutes = 0;
    let totalPomodoros = 0;
    let totalInterrupts = 0;
    Object.keys(stats).forEach((k) => {
      totalMinutes += stats[k].focusMinutes || 0;
      totalPomodoros += stats[k].pomodoroCount || 0;
      const ic = stats[k].interruptCounts || {};
      Object.keys(ic).forEach((r) => {
        totalInterrupts += ic[r];
      });
    });

    const trees = Math.floor(totalPomodoros / 10) + (user.bonusTrees || 0);
    const withered = Math.floor(totalInterrupts / 3);
    const persistDays = Object.keys(stats).filter((k) => (stats[k].focusMinutes || 0) > 0).length;

    const badges = BADGE_CATALOG.map((b) => {
      let unlocked = false;
      if (b.id === "b1") unlocked = user.streak >= 7;
      else if (b.id === "b2") unlocked = trees >= 1;
      else if (b.id === "b3") unlocked = totalMinutes >= 100 * 60;
      return Object.assign({}, b, { unlocked });
    });

    const weekCells = this.buildWeek(acc, user);

    this.setData({
      loggedIn: auth.isLoggedIn(),
      nickname: user.nickname,
      avatarSeed: user.avatarSeed || (user.nickname || "青").slice(0, 1),
      bio: acc.bio || "把专注，种成一片森林",
      phone: user.phone || "",
      level: user.level,
      exp: user.exp,
      nextLevelExp: user.nextLevelExp,
      expPct: Math.min(100, Math.round((user.exp / (user.nextLevelExp || 1)) * 100)),
      expToNext: (user.nextLevelExp || 3000) - user.exp,
      streak: user.streak,
      signedToday: state.isSignedToday(),
      signGain: user.streak >= 7 ? 15 : 10,
      weekCells,
      badges,
      totalFocusHours: Math.floor(totalMinutes / 60),
      totalPomodoros,
      persistDays,
      trees,
      withered,
      forestLevel: this.forestLevel(trees),
      forestHint: this.forestHint(trees, withered),
      forestCells: this.forestCells(trees, withered),
    });
  },

  buildWeek(acc, user) {
    const labels = ["一", "二", "三", "四", "五", "六", "日"];
    const dates = weekDates();
    const today = store.todayKey();
    const signed = user.signDates || [];
    const dow = new Date().getDay() === 0 ? 7 : new Date().getDay();
    return labels.map((label, i) => {
      const k = dates[i];
      return {
        label,
        done: (signed.indexOf(k) >= 0 || user.lastSignDate === k) && k <= today,
        isToday: i + 1 === dow,
      };
    });
  },

  forestLevel(trees) {
    if (trees < 5) return "小树苗";
    if (trees < 15) return "青葱密林";
    if (trees < 30) return "古老森林";
    return "梦幻森林";
  },
  forestHint(trees, withered) {
    const next = trees < 5 ? 5 : trees < 15 ? 15 : 30;
    let s;
    if (trees < 30) {
      const name = trees < 5 ? "青葱密林" : trees < 15 ? "古老森林" : "梦幻森林";
      s = "再种 " + (next - trees) + " 棵升级到「" + name + "」";
    } else {
      s = "你的森林已达最高等级，继续种下去吧！";
    }
    if (withered > 0) s += " · 点击枯萎树消耗 50 经验复活";
    return s;
  },
  forestCells(trees, withered) {
    const out = [];
    for (let i = 0; i < trees && out.length < 12; i++) out.push({ type: "tree", idx: "t" + i });
    for (let i = 0; i < withered && out.length < 12; i++) out.push({ type: "withered", idx: "w" + i });
    while (out.length < 8) out.push({ type: "empty", idx: "e" + out.length });
    return out.slice(0, 12);
  },

  doSign() {
    const gain = state.signInToday();
    if (gain < 0) {
      wx.showToast({ title: "今天已签到", icon: "none" });
      return;
    }
    this.refresh();
    wx.showToast({ title: "签到成功 +" + gain + " 经验", icon: "none" });
  },

  revive(e) {
    const cell = this.data.forestCells[e.currentTarget.dataset.index];
    if (!cell || cell.type !== "withered") return;
    const p = state.getProfile();
    if ((p.exp || 0) < 50) {
      wx.showToast({ title: "经验不足，再专注几次来复活它吧", icon: "none" });
      return;
    }
    p.exp -= 50;
    p.bonusTrees = (p.bonusTrees || 0) + 1;
    state.saveProfile(p);
    this.refresh();
    wx.showToast({ title: "成功复活 1 棵树 🌿", icon: "none" });
  },

  onBadge(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ showBadge: true, badgeIdx: idx, currentBadge: this.data.badges[idx] });
  },
  closeBadge() {
    this.setData({ showBadge: false });
  },

  onSetting(e) {
    const key = e.currentTarget.dataset.key;
    const titles = { account: "账号与安全", notify: "消息提醒", privacy: "隐私设置", about: "关于青番" };
    this.setData({ showSettings: true, settingsKey: key, settingsTitle: titles[key] || "" });
  },
  closeSettings() {
    this.setData({ showSettings: false });
  },

  saveSettings() {
    store.set("qf_settings", {
      notifyFocus: this.data.notifyFocus,
      notifySign: this.data.notifySign,
      notifyFriend: this.data.notifyFriend,
      privacyTime: this.data.privacyTime,
      privacyOnline: this.data.privacyOnline,
    });
  },
  toggle(e) {
    const key = e.currentTarget.dataset.key;
    const patch = {};
    patch[key] = e.detail.value;
    this.setData(patch, () => this.saveSettings());
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
  },

  askLogout() {
    this.setData({ showLogout: true });
  },
  closeLogout() {
    this.setData({ showLogout: false });
  },
  doLogout() {
    this.setData({ showLogout: false });
    auth.logout();
    this.refresh();
    wx.showToast({ title: "已退出登录", icon: "none" });
  },

  pickTheme(e) {
    const key = e.currentTarget.dataset.key;
    state.setTheme(key);
    require("../../utils/theme").apply(key);
    this.setData({ theme: key, themeKey: key });
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ theme: key });
    }
    wx.showToast({ title: "已切换主题", icon: "none" });
  },

  goHelp() {
    wx.navigateTo({ url: "/pages/help/index" });
  },

  comingSoon() {
    wx.showToast({ title: "该功能将在后续版本上线", icon: "none" });
  },

  noop() {},
});
