const state = require("../../utils/state");
const store = require("../../utils/store");

Page({
  data: {
    title: "",
    exp: 20,
    justHarvested: false,
    tomatoProgress: 0,
  },

  onLoad(options) {
    const today = store.todayKey();
    const s = state.getStats()[today] || {};
    const pom = s.pomodoroCount || 0;
    const rem = pom % 10;
    this.setData({
      title: options && options.title ? decodeURIComponent(options.title) : "",
      exp: options && options.exp ? Number(options.exp) : 20,
      justHarvested: pom > 0 && rem === 0,
      tomatoProgress: rem,
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/index" });
  },
});
