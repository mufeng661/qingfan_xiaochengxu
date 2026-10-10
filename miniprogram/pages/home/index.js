const state = require("../../utils/state");
const store = require("../../utils/store");
const auth = require("../../utils/auth");
const { call } = require("../../utils/api");

Page({
  data: {
    theme: "green",
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

    rowH: 75,
    cardH: 67,
    gap: 8,
    dragging: false,
    dragId: "",
    dragDy: 0,
    insertIndex: -1,
    scrollTop: 0,
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

  onLoad() {
    try {
      const w = wx.getSystemInfoSync().windowWidth;
      const cardH = Math.round((w / 750) * 134);
      const gap = Math.round((w / 750) * 16);
      this.setData({ cardH, gap, rowH: cardH + gap });
    } catch (e) {
      // ignore
    }
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0, theme: wx.getStorageSync("qf_theme") || "green" });
    }
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk });
    require("../../utils/theme").apply(tk);
    state.pullCloud(true).then(() => {
      this.refresh();
      this.maybePromptRefresh();
    });
  },

  onPullDownRefresh() {
    state.pullCloud(true).then(() => {
      this.refresh();
      wx.stopPullDownRefresh();
    });
  },

  noop() {},

  goAi() {
    wx.navigateTo({ url: "/pages/ai/index" });
  },

  refresh() {
    const user = state.getUser();
    const key = store.todayKey();
    const stats = state.getStats();
    const s = stats[key] || { focusMinutes: 0, pomodoroCount: 0 };
    const streak = state.recomputeStreak();
    const goal = state.getGoal();
    const todayFinished = s.pomodoroCount || 0;

    const tasks = state
      .getTasks()
      .slice()
      .sort((a, b) => {
        const da = a.status === "done" ? 1 : 0;
        const db = b.status === "done" ? 1 : 0;
        if (da !== db) return da - db;
        return (a.order || 0) - (b.order || 0);
      })
      .map((t) =>
        Object.assign({}, t, {
          pomodoros: Math.max(1, Math.round(t.durationMin / 25)),
          diffText: t.difficulty === "easy" ? "简单" : t.difficulty === "hard" ? "困难" : "中等",
          done: t.status === "done",
          _style: "",
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

  // 待办全部完成时，再次进入界面根据记忆提示是否更换待办
  allTasksDone() {
    const tasks = state.getTasks();
    return tasks.length > 0 && tasks.every((t) => t.status === "done");
  },

  maybePromptRefresh() {
    if (!auth.isLoggedIn()) return; // 未登录用户无法使用此功能
    if (!this.allTasksDone()) return;
    const askedKey = "qf_todo_refresh_asked_" + state.uid();
    const today = store.todayKey();
    if (store.get(askedKey, "") === today) return; // 今天已经问过，不再打扰
    store.set(askedKey, today);
    wx.showModal({
      title: "今日待办已完成 🎉",
      content: "待办都完成啦，根据你的习惯换一批新的待办？",
      confirmText: "换一批",
      cancelText: "先不用",
      success: (res) => {
        if (res.confirm) this.regenerateTodos();
      },
    });
  },

  // 组装 AI 上下文（用户当前数据）
  buildAiContext() {
    const acc = auth.getUser() || {};
    const stats = state.getStats();
    const today = store.todayKey();
    const st = stats[today] || { focusMinutes: 0, pomodoroCount: 0 };
    const tasks = state
      .getTasks()
      .slice(0, 10)
      .map((t) => ({ title: t.title, status: t.status, durationMin: t.durationMin }));
    return JSON.stringify({
      nickname: acc.username || acc.nickname || "",
      todayFocusMinutes: st.focusMinutes || 0,
      pomodoro: st.pomodoroCount || 0,
      streak: state.getProfile().streak || 0,
      tasks,
    });
  },

  // 提取 AI 聊天记忆，作为对话历史喂给 AI
  aiMemoryMessages() {
    const saved = store.get("qf_ai_chat_" + state.uid(), []);
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((m) => m && typeof m.text === "string" && m.text)
      .slice(-10)
      .map((m) => ({ role: m.role === "me" ? "user" : "assistant", content: m.text }));
  },

  regenerateTodos() {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: "登录后可自动创建待办", icon: "none" });
      return;
    }
    wx.showLoading({ title: "正在生成…", mask: true });
    const finish = (todos) => {
      wx.hideLoading();
      const valid = Array.isArray(todos) ? todos.filter((t) => t && t.title) : [];
      if (!valid.length) {
        wx.showToast({ title: "暂时没有合适的待办", icon: "none" });
        return;
      }
      this.replaceTasks(valid);
      wx.showToast({ title: "已更新 " + valid.length + " 个待办", icon: "none" });
    };
    // 提取 AI 记忆 + 当前数据，请 AI 生成新一批待办
    const messages = this.aiMemoryMessages();
    messages.push({ role: "user", content: "我的待办都完成了，帮我制定一批新的今日待办（尽量和之前不重复），2-6 条即可。" });
    call("ai.chat", {
      messages,
      prompt: "帮我制定一批新的今日待办（尽量和之前的待办不重复），2-6 条即可",
      wantPlan: "true",
      context: this.buildAiContext(),
    })
      .then((data) => {
        const todos = (data && data.todos) || [];
        finish(todos.length ? todos : this.fallbackTodos());
      })
      .catch(() => finish(this.fallbackTodos()));
  },

  // 清空原待办，写入新一批（优先取与当前不重复的）
  replaceTasks(todos) {
    const cur = {};
    state.getTasks().forEach((t) => {
      cur[t.title] = true;
    });
    const fresh = todos.filter((t) => !cur[t.title]);
    const use = fresh.length ? fresh : todos;
    const created = use.map((t, i) => ({
      id: store.genId("t"),
      title: String(t.title).slice(0, 60),
      durationMin: t.durationMin || 25,
      status: "todo",
      difficulty: t.difficulty === "easy" || t.difficulty === "hard" ? t.difficulty : "medium",
      order: i,
      createdAt: Date.now(),
      bgSeed: "sky",
    }));
    state.saveTasks(created);
    this.refresh();
  },

  // 离线/未登录时的本地推荐：优先复用历史（记忆）里未使用的待办，再补通用池
  fallbackTodos() {
    const GENERIC = [
      { title: "整理今日笔记", durationMin: 25, difficulty: "easy" },
      { title: "复习昨天学的内容", durationMin: 25, difficulty: "medium" },
      { title: "阅读 30 页书", durationMin: 45, difficulty: "medium" },
      { title: "背 50 个单词", durationMin: 25, difficulty: "easy" },
      { title: "完成一套练习题", durationMin: 60, difficulty: "hard" },
      { title: "写一份学习小结", durationMin: 25, difficulty: "medium" },
      { title: "梳理一个知识框架", durationMin: 45, difficulty: "medium" },
    ];
    const cur = {};
    state.getTasks().forEach((t) => {
      cur[t.title] = true;
    });
    const seen = {};
    const candidates = state
      .getTaskHistory()
      .concat(GENERIC)
      .filter((t) => {
        if (!t || !t.title || cur[t.title] || seen[t.title]) return false;
        seen[t.title] = true;
        return true;
      });
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    return candidates.slice(0, 3).map((t) => ({
      title: t.title,
      durationMin: t.durationMin || 25,
      difficulty: t.difficulty || "medium",
    }));
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

  onTaskLongPress(e) {
    const index = e.currentTarget.dataset.index;
    const id = e.currentTarget.dataset.id;
    const touch = e.touches && e.touches[0];
    const clientY = touch ? touch.clientY : 0;
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: "light" });
    } catch (err) {
      // ignore
    }
    wx.createSelectorQuery()
      .select(".todo-scroll")
      .boundingClientRect()
      .select(".todo-scroll")
      .scrollOffset()
      .exec((res) => {
        const view = (res && res[0]) || {};
        const off = (res && res[1]) || {};
        this._viewTop = view.top || 0;
        this._viewBottom = (view.top || 0) + (view.height || 0);
        this._viewHeight = view.height || 0;
        this._contentH = off.scrollHeight || 0;
        this._scrollTop = off.scrollTop || 0;
        this._dragIndex = index;
        const slotTop = this._viewTop - this._scrollTop + index * this.data.rowH;
        this._grabOffset = clientY - slotTop;
        this._lastClientY = clientY;
        const tasks = this.data.tasks.map((t) => Object.assign({}, t, { _style: "" }));
        if (tasks[index]) tasks[index]._style = "position: relative; z-index: 20;";
        this.setData({
          dragging: true,
          dragId: id,
          dragDy: 0,
          insertIndex: index,
          scrollTop: this._scrollTop,
          tasks,
        });
      });
  },

  clampInsert(insert, from) {
    const tasks = this.data.tasks;
    const firstDone = tasks.findIndex((t) => t.done);
    const startDone = firstDone === -1 ? tasks.length : firstDone;
    if (tasks[from].done) {
      return Math.max(startDone, Math.min(tasks.length - 1, insert));
    }
    return Math.max(0, Math.min(startDone - 1, insert));
  },

  applyDrag(clientY) {
    this._lastClientY = clientY;
    const from = this._dragIndex;
    const tasks = this.data.tasks;
    if (from < 0 || from >= tasks.length) return;
    const contentY = clientY - this._viewTop + this._scrollTop;
    let insert = Math.floor(contentY / this.data.rowH);
    insert = Math.max(0, Math.min(tasks.length - 1, insert));
    insert = this.clampInsert(insert, from);
    const slotTop = this._viewTop - this._scrollTop + from * this.data.rowH;
    const dy = Math.round(clientY - this._grabOffset - slotTop);
    const rowH = this.data.rowH;
    const arr = tasks.map((t) => Object.assign({}, t));
    arr.forEach((t, i) => {
      if (i === from) {
        t._style = "transform: translateY(" + dy + "px); position: relative; z-index: 20;";
      } else {
        let off = 0;
        if (from < insert && i > from && i <= insert) off = -rowH;
        else if (from > insert && i >= insert && i < from) off = rowH;
        t._style = off ? "transform: translateY(" + off + "px);" : "";
      }
    });
    this.setData({ tasks: arr, dragDy: dy, insertIndex: insert });
  },

  startAutoScroll(dir) {
    const max = Math.max(0, this._contentH - this._viewHeight);
    if (max <= 0) return;
    if (this._autoDir === dir && this._autoTimer) return;
    this.stopAutoScroll();
    this._autoDir = dir;
    this._autoTimer = setInterval(() => {
      let st = this._scrollTop + dir * 10;
      st = Math.max(0, Math.min(max, st));
      if (st === this._scrollTop) {
        this.stopAutoScroll();
        return;
      }
      this._scrollTop = st;
      this.setData({ scrollTop: st }, () => {
        this.applyDrag(this._lastClientY);
      });
    }, 16);
  },

  stopAutoScroll() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
    this._autoDir = 0;
  },

  onTaskTouchMove(e) {
    if (!this.data.dragging || this._viewTop == null) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const clientY = touch.clientY;
    this.applyDrag(clientY);
    const EDGE = 60;
    if (clientY < this._viewTop + EDGE) {
      this.startAutoScroll(-1);
    } else if (clientY > this._viewBottom - EDGE) {
      this.startAutoScroll(1);
    } else {
      this.stopAutoScroll();
    }
  },

  onTaskTouchEnd() {
    this.stopAutoScroll();
    if (!this.data.dragging) return;
    const from = this._dragIndex;
    const insert = this.data.insertIndex;
    const tasks = this.data.tasks.map((t) => Object.assign({}, t, { _style: "" }));
    const item = tasks[from];
    if (item) {
      tasks.splice(from, 1);
      const to = Math.max(0, Math.min(tasks.length, insert));
      tasks.splice(to, 0, item);
      const map = {};
      tasks.forEach((t, i) => {
        map[t.id] = i;
      });
      const stored = state.getTasks().map((t) =>
        Object.assign({}, t, { order: map[t.id] != null ? map[t.id] : t.order })
      );
      state.saveTasks(stored);
    }
    this._dragIndex = -1;
    this.setData({ dragging: false, dragId: "", dragDy: 0, insertIndex: -1 });
    this.refresh();
  },

  onUnload() {
    this.stopAutoScroll();
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
