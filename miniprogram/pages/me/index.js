const auth = require("../../utils/auth");
const state = require("../../utils/state");

Page({
  data: {
    loggedIn: false,
    nickname: "同学",
    avatarSeed: "青",
    phone: "",
    level: 1,
    exp: 0,
    nextLevelExp: 3000,
    expPercent: 0,
    streak: 0,
    totalMinutes: 0,
    pomodoroTotal: 0,
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    this.refresh();
  },

  refresh() {
    const loggedIn = auth.isLoggedIn();
    const user = state.getUser();
    const stats = state.getStats();
    let totalMinutes = 0;
    let pomodoroTotal = 0;
    Object.keys(stats).forEach((k) => {
      totalMinutes += stats[k].focusMinutes || 0;
      pomodoroTotal += stats[k].pomodoroCount || 0;
    });
    state.recomputeStreak();
    const fresh = state.getUser();

    this.setData({
      loggedIn,
      nickname: user.nickname,
      avatarSeed: user.avatarSeed,
      phone: user.phone,
      level: fresh.level,
      exp: fresh.exp,
      nextLevelExp: fresh.nextLevelExp,
      expPercent: Math.min(100, Math.round((fresh.exp / (fresh.nextLevelExp || 1)) * 100)),
      streak: fresh.streak,
      totalMinutes,
      pomodoroTotal,
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "确定要退出当前账号吗？",
      success: (res) => {
        if (!res.confirm) return;
        auth.logout();
        this.refresh();
        wx.showToast({ title: "已退出登录", icon: "none" });
      },
    });
  },

  comingSoon() {
    wx.showToast({ title: "该功能将在后续版本上线", icon: "none" });
  },
});
