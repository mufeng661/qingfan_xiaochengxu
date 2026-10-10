Page({
  data: {
    theme: "green",
    content: "",
    contact: "",
    submitting: false,
    supportEmail: "support@qingfan.app",
  },

  onLoad() {
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk });
    require("../../utils/theme").apply(tk);
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },
  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  submit() {
    const content = (this.data.content || "").trim();
    if (!content) {
      wx.showToast({ title: "请先填写反馈内容", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const contact = (this.data.contact || "").trim();
    const text = "【青番反馈】\n" + content + (contact ? "\n联系方式：" + contact : "");
    wx.setClipboardData({
      data: text,
      success: () => {
        this.setData({ submitting: false, content: "", contact: "" });
        wx.showModal({
          title: "已复制反馈内容",
          content: "请将内容粘贴发送至邮箱：" + this.data.supportEmail + "，感谢你的反馈！",
          showCancel: false,
          confirmText: "知道了",
        });
      },
      fail: () => {
        this.setData({ submitting: false });
        wx.showToast({ title: "复制失败，请重试", icon: "none" });
      },
    });
  },

  copyEmail() {
    wx.setClipboardData({ data: this.data.supportEmail });
  },

  goBack() {
    wx.navigateBack();
  },
});
