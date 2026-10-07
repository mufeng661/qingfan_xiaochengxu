const auth = require("../utils/auth");

Component({
  data: {
    selected: 0,
    list: [
      { id: "home", label: "今日", icon: "🌿", url: "/pages/home/index" },
      { id: "study", label: "自习室", icon: "👥", url: "/pages/index/index" },
      { id: "stats", label: "时间轴", icon: "🕒", url: "/pages/stats/index" },
      { id: "data", label: "数据", icon: "📊", url: "/pages/data/index" },
      { id: "me", label: "我的", icon: "👤", url: "/pages/me/index" },
    ],
  },
  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      if (!item) return;
      const gated = item.id === "study" || item.id === "stats" || item.id === "data";
      if (gated && !auth.isLoggedIn()) {
        wx.showToast({ title: "登录后即可使用，请到「我的」登录", icon: "none" });
        wx.switchTab({ url: "/pages/me/index" });
        return;
      }
      wx.switchTab({ url: item.url });
    },
  },
});
