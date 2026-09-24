const { call } = require("../../utils/api");

Page({
  data: {
    roomId: "",
    password: "",
    submitting: false,
  },

  onLoad(options) {
    if (options && options.roomId) {
      this.setData({ roomId: decodeURIComponent(options.roomId) });
    }
  },

  onRoomIdInput(e) {
    this.setData({ roomId: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const roomId = (this.data.roomId || "").trim();
    if (!roomId) {
      wx.showToast({ title: "请输入房间号", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    call("room.join", { roomId, password: this.data.password })
      .then((room) => {
        wx.showToast({ title: "加入成功" });
        wx.redirectTo({ url: "/pages/room/index?id=" + room.id });
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || "加入失败", icon: "none" });
      });
  },
});
