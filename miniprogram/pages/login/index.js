const { call } = require("../../utils/api");
const { setSession } = require("../../utils/auth");

Page({
  data: {
    mode: "login",
    phone: "",
    password: "",
    username: "",
    confirmPwd: "",
    code: "",
    sending: false,
    countdown: 0,
    loading: false,
  },

  onUnload() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onPhone(e) {
    this.setData({ phone: e.detail.value });
  },
  onPassword(e) {
    this.setData({ password: e.detail.value });
  },
  onUsername(e) {
    this.setData({ username: e.detail.value });
  },
  onConfirm(e) {
    this.setData({ confirmPwd: e.detail.value });
  },
  onCode(e) {
    this.setData({ code: e.detail.value });
  },

  isPhoneValid(phone) {
    return /^1[3-9]\d{9}$/.test(String(phone || "").replace(/\D/g, ""));
  },

  sendCode() {
    if (this.data.sending) return;
    if (!this.isPhoneValid(this.data.phone)) {
      wx.showToast({ title: "请输入正确的手机号", icon: "none" });
      return;
    }
    this.setData({ sending: true, countdown: 60 });
    this.timerId = setInterval(() => {
      const next = this.data.countdown - 1;
      if (next <= 0) {
        clearInterval(this.timerId);
        this.timerId = null;
        this.setData({ sending: false, countdown: 0 });
      } else {
        this.setData({ countdown: next });
      }
    }, 1000);
    wx.showToast({ title: "验证码已发送（演示码 1234）", icon: "none" });
  },

  backAfterLogin() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: "/pages/index/index" });
    }
  },

  doLogin() {
    if (this.data.loading) return;
    if (!this.isPhoneValid(this.data.phone)) {
      wx.showToast({ title: "请输入正确的手机号", icon: "none" });
      return;
    }
    if (!this.data.password) {
      wx.showToast({ title: "请输入密码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    call("auth.login", { phone: this.data.phone, password: this.data.password })
      .then((data) => {
        setSession(data.token, data.user);
        this.setData({ loading: false });
        wx.showToast({ title: "登录成功" });
        setTimeout(() => this.backAfterLogin(), 600);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "登录失败", icon: "none" });
      });
  },

  doRegister() {
    if (this.data.loading) return;
    const name = (this.data.username || "").trim();
    if (name.length < 2) {
      wx.showToast({ title: "请输入用户名（至少 2 个字符）", icon: "none" });
      return;
    }
    if (!this.isPhoneValid(this.data.phone)) {
      wx.showToast({ title: "请输入正确的手机号", icon: "none" });
      return;
    }
    if ((this.data.password || "").length < 6) {
      wx.showToast({ title: "密码至少 6 位", icon: "none" });
      return;
    }
    if (this.data.password !== this.data.confirmPwd) {
      wx.showToast({ title: "两次输入的密码不一致", icon: "none" });
      return;
    }
    if (this.data.code !== "1234") {
      wx.showToast({ title: "验证码错误，演示码为 1234", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    call("auth.register", {
      username: name,
      phone: this.data.phone,
      password: this.data.password,
    })
      .then((data) => {
        setSession(data.token, data.user);
        this.setData({ loading: false });
        wx.showToast({ title: "注册成功" });
        setTimeout(() => this.backAfterLogin(), 700);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "注册失败", icon: "none" });
      });
  },
});
