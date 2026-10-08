const state = require("../../utils/state");
const store = require("../../utils/store");
const { call } = require("../../utils/api");

const BACKGROUNDS = [
  { key: "sky", name: "天空", from: "#3E7BB5", to: "#86BCE4" },
  { key: "mist", name: "晨雾", from: "#A9C79E", to: "#DCEBD2" },
  { key: "dusk", name: "夕阳", from: "#E8A98D", to: "#C9604F" },
];

const NOISES = [
  { key: "forest", name: "森林", icon: "🍃" },
  { key: "rain", name: "雨声", icon: "🌧" },
  { key: "wave", name: "海浪", icon: "🌊" },
  { key: "mute", name: "静音", icon: "🔇" },
];

Page({
  data: {
    taskId: "",
    taskTitle: "专注中",
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    timeText: "25:00",
    running: false,
    statusText: "准备开始",
    bgKey: "sky",
    bgFrom: "#3E7BB5",
    bgTo: "#86BCE4",
    isDark: true,
    ink: "#FFFFFF",
    dim: "rgba(255,255,255,0.72)",
    durations: [25, 15, 5, 1],
    lockDuration: false,
    durationMin: 25,
    backgrounds: BACKGROUNDS,
    noises: NOISES,
    noiseKey: "mute",
    showQuit: false,
    quitReason: "临时有事",
    reasons: ["临时有事", "手机打断", "失去状态", "饿了/累了", "其它"],
    pomodoroNo: 1,
  },

  onLoad(options) {
    const taskId = (options && options.taskId) || "";
    const task = state.getTasks().find((t) => t.id === taskId);
    const durationMin = task ? task.durationMin : 25;
    const durationSec = durationMin * 60;
    this.elapsedSec = 0;
    this.startTs = 0;
    this.timerId = null;
    this.ctx = null;

    const stats = state.getStats();
    const today = stats[store.todayKey()];

    this.setData({
      taskId,
      taskTitle: task ? task.title : "专注中",
      durationSec,
      remainingSec: durationSec,
      timeText: store.formatMMSS(durationSec),
      lockDuration: Boolean(taskId),
      durationMin,
      pomodoroNo: (today ? today.pomodoroCount : 0) + 1,
    });
  },

  onReady() {
    wx.createSelectorQuery()
      .in(this)
      .select("#ring")
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext("2d");
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        this.canvasSize = res[0].width;
        this.ctx = ctx;
        this.drawRing();
      });
  },

  onUnload() {
    this.pauseTimer();
  },

  noop() {},

  demoFinish() {
    if (this.data.running) this.pauseTimer();
    this.elapsedSec = this.data.durationSec;
    this.finishFocus(true, "");
  },

  ringTrack() {
    return this.data.isDark ? "rgba(255,255,255,0.22)" : "rgba(58,51,40,0.16)";
  },

  ringColor() {
    return this.data.isDark ? "#FFFFFF" : "#4C7A3E";
  },

  drawRing() {
    const ctx = this.ctx;
    if (!ctx || !this.canvasSize) return;
    const size = this.canvasSize;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 16;
    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 11;
    ctx.strokeStyle = this.ringTrack();
    ctx.stroke();

    const frac = this.data.durationSec > 0 ? Math.min(1, this.elapsedSec / this.data.durationSec) : 0;
    if (frac > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.lineWidth = 11;
      ctx.strokeStyle = this.ringColor();
      ctx.lineCap = "round";
      ctx.stroke();
    }
  },

  applyDuration(e) {
    if (this.data.running) return;
    if (this.data.lockDuration) return;
    const min = Number(e.currentTarget.dataset.d);
    const durationSec = min * 60;
    this.elapsedSec = 0;
    this.setData({
      durationSec,
      remainingSec: durationSec,
      timeText: store.formatMMSS(durationSec),
      statusText: "准备开始",
    });
    this.drawRing();
  },

  toggleTimer() {
    if (this.data.running) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  },

  startTimer() {
    if (this.data.running) return;
    this.setData({ running: true, statusText: "专注进行中" });
    this.reportRoomStart();
    this.startTs = Date.now() - this.elapsedSec * 1000;
    this.timerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTs) / 1000);
      this.elapsedSec = Math.min(this.data.durationSec, elapsed);
      const remaining = Math.max(0, this.data.durationSec - elapsed);
      this.setData({ remainingSec: remaining, timeText: store.formatMMSS(remaining) });
      this.drawRing();
      if (remaining <= 0) {
        this.finishFocus(true, "");
      }
    }, 250);
  },

  pauseTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.data.running) {
      this.setData({ running: false, statusText: this.elapsedSec > 0 ? "已暂停" : "准备开始" });
    }
  },

  reportRoomStart() {
    call("room.listMine")
      .then((data) => {
        const list = data.list || [];
        if (!list.length) return null;
        this._roomId = list[0].id;
        return call("focus.start", { roomId: this._roomId });
      })
      .catch(() => {});
  },

  reportRoomFocus(minutes) {
    const doRecord = (roomId) => call("focus.record", { roomId, minutes }).catch(() => {});
    if (this._roomId) {
      doRecord(this._roomId);
      return;
    }
    call("room.listMine")
      .then((data) => {
        const list = data.list || [];
        if (list.length) {
          this._roomId = list[0].id;
          doRecord(this._roomId);
        }
      })
      .catch(() => {});
  },

  pickBg(e) {
    const key = e.currentTarget.dataset.key;
    const bg = BACKGROUNDS.find((b) => b.key === key) || BACKGROUNDS[0];
    const isDark = key === "sky" || key === "dusk";
    this.setData({
      bgKey: key,
      bgFrom: bg.from,
      bgTo: bg.to,
      isDark,
      ink: isDark ? "#FFFFFF" : "#3A3328",
      dim: isDark ? "rgba(255,255,255,0.72)" : "rgba(58,51,40,0.72)",
    });
    this.drawRing();
  },

  pickNoise(e) {
    this.setData({ noiseKey: e.currentTarget.dataset.key });
  },

  requestExit() {
    if (this.elapsedSec === 0 && !this.data.running) {
      wx.navigateBack();
      return;
    }
    this.setData({ showQuit: true });
  },
  closeQuit() {
    this.setData({ showQuit: false });
  },
  pickReason(e) {
    this.setData({ quitReason: e.currentTarget.dataset.r });
  },
  confirmExit() {
    this.setData({ showQuit: false });
    this.finishFocus(false, this.data.quitReason);
    wx.showToast({ title: "已提前退出，本次不计入番茄", icon: "none" });
  },

  finishFocus(success, reason) {
    this.pauseTimer();
    const elapsedMin = Math.floor(this.elapsedSec / 60);
    this.reportRoomFocus(elapsedMin);
    const today = store.todayKey();

    const stats = state.getStats();
    const s = stats[today] || { date: today, focusMinutes: 0, pomodoroCount: 0, doneTaskCount: 0, interruptCounts: {} };
    s.focusMinutes += elapsedMin;
    if (success) {
      s.pomodoroCount += 1;
    } else if (reason) {
      s.interruptCounts = s.interruptCounts || {};
      s.interruptCounts[reason] = (s.interruptCounts[reason] || 0) + 1;
    }
    stats[today] = s;
    state.saveStats(stats);

    const records = state.getRecords();
    records.push({
      id: store.genId("f"),
      taskId: this.data.taskId,
      taskTitle: this.data.taskTitle,
      startAt: this.startTs,
      endAt: Date.now(),
      durationSec: this.elapsedSec,
      finished: success,
      interruptReason: reason || "",
      backgroundKey: this.data.bgKey,
      whiteNoise: this.data.noiseKey,
    });
    state.saveRecords(records);

    if (success) {
      const tasks = state.getTasks();
      const idx = tasks.findIndex((t) => t.id === this.data.taskId);
      if (idx >= 0) {
        tasks[idx].status = "done";
        state.saveTasks(tasks);
      }
      state.addExp(20);
      state.recomputeStreak();
      wx.redirectTo({
        url: "/pages/complete/index?title=" + encodeURIComponent(this.data.taskTitle) + "&exp=20",
      });
    } else {
      state.recomputeStreak();
      wx.navigateBack();
    }
  },
});
