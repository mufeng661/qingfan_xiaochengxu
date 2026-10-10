Page({
  data: {
    theme: "green",
    version: "v1.0.0",
    supportEmail: "support@qingfan.app",
  },

  onLoad() {
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk });
    require("../../utils/theme").apply(tk);
  },

  openFeedback() {
    wx.navigateTo({ url: "/pages/feedback/index" });
  },
  openAgreement() {
    wx.navigateTo({ url: "/pages/agreement/index?type=user" });
  },
  openPrivacy() {
    wx.navigateTo({ url: "/pages/agreement/index?type=privacy" });
  },
  copyEmail() {
    wx.setClipboardData({ data: this.data.supportEmail });
  },
  copyVersion() {
    wx.setClipboardData({ data: this.data.version });
  },
  goBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: "/pages/me/index" }),
    });
  },
});
