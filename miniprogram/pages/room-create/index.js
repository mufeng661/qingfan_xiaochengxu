const { call } = require("../../utils/api");

Page({
  data: {
    name: "",
    password: "",
    usePassword: false,
    submitting: false,
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  togglePassword(e) {
    this.setData({ usePassword: e.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const name = (this.data.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入房间名称", icon: "none" });
      return;
    }
    if (this.data.usePassword && !this.data.password) {
      wx.showToast({ title: "请输入房间密码或关闭密码", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    call("room.create", {
      name,
      password: this.data.usePassword ? this.data.password : "",
    })
      .then((room) => {
        wx.showToast({ title: "创建成功" });
        wx.redirectTo({ url: "/pages/room/index?id=" + room.id });
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || "创建失败", icon: "none" });
      });
  },
});
