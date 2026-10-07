Page({
  data: {
    title: "",
    exp: 20,
  },

  onLoad(options) {
    this.setData({
      title: options && options.title ? decodeURIComponent(options.title) : "",
      exp: options && options.exp ? Number(options.exp) : 20,
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/index" });
  },
});
