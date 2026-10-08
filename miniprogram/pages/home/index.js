const state = require("../../utils/state");
const store = require("../../utils/store");

Page({
  data: {
    greeting: "",
    dateStr: "",
    nickname: "",
    signedToday: false,
    signGain: 10,
    streakDays: 0,
    todayFocusedMin: 0,
    todayFinished: 0,
    goal: 4,
    progressWidth: "0%",

    tasks: [],

    showAdd: false,
    newTitle: "",
    newDurationMin: 25,
    useCustomDuration: false,
    customDuration: "",
    durationPresets: [15, 25, 45, 60],

    showGoal: false,
    goals: [2, 4, 6, 8],
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    state.pullCloud().then(() => this.refresh());
  },

  noop() {},

  refresh() {
    const user = state.getUser();
    const key = store.todayKey();
    const stats = state.getStats();
    const s = stats[key] || { focusMinutes: 0, pomodoroCount: 0 };
    const streak = state.recomputeStreak();
    const goal = state.getGoal();
    const todayFinished = s.pomodoroCount || 0;

    const tasks = state.getTasks().map((t) =>
      Object.assign({}, t, {
        pomodoros: Math.max(1, Math.round(t.durationMin / 25)),
        diffText: t.difficulty === "easy" ? "简单" : t.difficulty === "hard" ? "困难" : "中等",
        done: t.status === "done",
      })
    );

    const d = new Date();
    const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];

    this.setData({
      greeting: store.greet(),
      nickname: user.nickname,
      dateStr: (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 · 周" + week,
      signedToday: state.isSignedToday(),
      signGain: streak >= 7 ? 15 : 10,
      streakDays: streak,
      todayFocusedMin: s.focusMinutes || 0,
      todayFinished,
      goal,
      progressWidth: Math.min(100, Math.round((todayFinished / (goal || 1)) * 100)) + "%",
      tasks,
    });
  },

  signIn() {
    const auth = require("../../utils/auth");
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: "登录后即可签到，请到「我的」登录", icon: "none" });
      return;
    }
    const gain = state.signInToday();
    if (gain < 0) {
      wx.showToast({ title: "今天已经签过啦，明天再来哦", icon: "none" });
      return;
    }
    this.refresh();
    wx.showToast({ title: "签到成功 +" + gain + " 经验", icon: "none" });
  },

  openAdd() {
    this.setData({ showAdd: true, newTitle: "", newDurationMin: 25, useCustomDuration: false, customDuration: "" });
  },
  closeAdd() {
    this.setData({ showAdd: false });
  },
  onNewTitle(e) {
    this.setData({ newTitle: e.detail.value });
  },
  pickDuration(e) {
    this.setData({ newDurationMin: Number(e.currentTarget.dataset.d), useCustomDuration: false });
  },
  pickCustom() {
    this.setData({ useCustomDuration: true });
  },
  onCustomDuration(e) {
    this.setData({ customDuration: e.detail.value });
  },
  effectiveDuration() {
    if (this.data.useCustomDuration) {
      const n = parseInt(this.data.customDuration, 10);
      if (!isNaN(n) && n > 0) return Math.min(n, 600);
      return 25;
    }
    return this.data.newDurationMin;
  },
  addTask() {
    const title = (this.data.newTitle || "").trim();
    if (!title) {
      wx.showToast({ title: "请输入待办内容", icon: "none" });
      return;
    }
    const list = state.getTasks();
    list.push({
      id: store.genId("t"),
      title,
      durationMin: this.effectiveDuration(),
      status: "todo",
      difficulty: "medium",
      order: list.length,
      createdAt: Date.now(),
      bgSeed: "sky",
    });
    state.saveTasks(list);
    this.setData({ showAdd: false });
    this.refresh();
    wx.showToast({ title: "已添加待办", icon: "none" });
  },

  toggleTask(e) {
    const id = e.currentTarget.dataset.id;
    const list = state.getTasks();
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const t = list[idx];
    t.status = t.status === "done" ? "todo" : "done";
    state.saveTasks(list);
    if (t.status === "done") {
      state.addExp(20);
      wx.showToast({ title: "完成「" + t.title + "」+20 经验", icon: "none" });
    }
    this.refresh();
  },

  deleteTask(e) {
    const id = e.currentTarget.dataset.id;
    const t = state.getTasks().find((x) => x.id === id);
    if (!t) return;
    wx.showModal({
      title: "删除待办？",
      content: "「" + t.title + "」将被删除，此操作不可恢复。",
      confirmColor: "#E07A5F",
      success: (res) => {
        if (!res.confirm) return;
        const list = state.getTasks().filter((x) => x.id !== id);
        list.forEach((x, i) => {
          x.order = i;
        });
        state.saveTasks(list);
        this.refresh();
      },
    });
  },

  startFocus(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/focus/index?taskId=" + id });
  },

  openGoal() {
    this.setData({ showGoal: true });
  },
  closeGoal() {
    this.setData({ showGoal: false });
  },
  pickGoal(e) {
    state.saveGoal(Number(e.currentTarget.dataset.g));
    this.setData({ showGoal: false });
    this.refresh();
  },
});
