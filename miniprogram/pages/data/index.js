const state = require("../../utils/state");
const store = require("../../utils/store");
const auth = require("../../utils/auth");

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

const PALETTE = ["#6E9B57", "#E07A5F", "#D9A441", "#4C7A3E", "#84917D", "#F6E1D6", "#F4E8CE"];

Page({
  data: {
    theme: "green",
    pieRange: "week",
    monthOffset: 0,
    showHeat: false,
    loggedIn: false,

    // 累计
    totalSessions: 0,
    totalHoursText: "0 分",
    avgDailyMinutes: 0,
    // 当日
    todayLabel: "",
    todaySessions: 0,
    todayMinutes: 0,
    // 饼图
    slices: [],
    sliceTotal: 0,
    // 月度
    monthTitle: "",
    yLabels: [],
    xLabels: [],
    chartW: 1364,
    monthMax: 0,
    canNext: false,
    // 打断
    interrupts: [],
    // 热力图
    weekdayLabels: ["一", "二", "三", "四", "五", "六", "日"],
    heatWeeks: [],
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3, theme: wx.getStorageSync("qf_theme") || "green" });
    }
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk });
    require("../../utils/theme").apply(tk);
    state.pullCloud(true).then(() => this.refresh());
  },

  onReady() {
    this.setupPie();
    this.setupChart();
  },

  noop() {},

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  dpr() {
    try {
      return wx.getWindowInfo().pixelRatio || 2;
    } catch (e) {
      return (wx.getSystemInfoSync().pixelRatio) || 2;
    }
  },

  setupPie() {
    wx.createSelectorQuery()
      .in(this)
      .select("#pie")
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext("2d");
        const ratio = this.dpr();
        canvas.width = res[0].width * ratio;
        canvas.height = res[0].height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.pieSize = res[0].width;
        this.pieCtx = ctx;
        this.drawPie();
      });
  },

  setupChart(cb) {
    wx.createSelectorQuery()
      .in(this)
      .select("#chart")
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          if (cb) cb();
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext("2d");
        const ratio = this.dpr();
        canvas.width = res[0].width * ratio;
        canvas.height = res[0].height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.chartSize = { w: res[0].width, h: res[0].height };
        this.chartCtx = ctx;
        this.drawMonthChart();
        if (cb) cb();
      });
  },

  refresh() {
    const records = state.getRecords();
    const stats = state.getStats();
    const loggedIn = auth.isLoggedIn();

    // 累计
    let totalSessions = 0;
    let totalMinutes = 0;
    let activeDays = 0;
    Object.keys(stats).forEach((k) => {
      totalSessions += stats[k].pomodoroCount || 0;
      const min = stats[k].focusMinutes || 0;
      totalMinutes += min;
      if (min > 0) activeDays += 1;
    });
    const avgDailyMinutes = activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0;

    // 当日
    const todayK = store.todayKey();
    const todayStat = stats[todayK] || { pomodoroCount: 0, focusMinutes: 0 };

    // 饼图
    const slices = this.taskSlices(records, this.data.pieRange);
    let sliceTotal = 0;
    slices.forEach((s) => {
      sliceTotal += s.minutes;
    });
    const slicesView = slices.map((s, i) => ({
      name: s.name,
      minutes: s.minutes,
      color: PALETTE[i % PALETTE.length],
      percent: sliceTotal > 0 ? Math.round((s.minutes / sliceTotal) * 100) + "%" : "0%",
    }));

    // 月度
    const monthData = this.monthMeta();

    // 打断
    const interrupts = this.monthInterrupts();
    let maxCount = 1;
    interrupts.forEach((b) => {
      if (b.count > maxCount) maxCount = b.count;
    });
    const interruptsView = interrupts.map((b) => ({
      name: b.name,
      count: b.count,
      pct: Math.round((b.count / maxCount) * 100) + "%",
    }));

    this.setData(
      {
        loggedIn,
        totalSessions,
        totalHoursText: this.hoursText(totalMinutes),
        avgDailyMinutes,
        todayLabel: todayK,
        todaySessions: todayStat.pomodoroCount || 0,
        todayMinutes: todayStat.focusMinutes || 0,
        slices: slicesView,
        sliceTotal,
        monthTitle: monthData.title,
        yLabels: monthData.yLabels,
        xLabels: monthData.xLabels,
        chartW: monthData.chartW,
        monthMax: monthData.max,
        canNext: this.data.monthOffset < 0,
        interrupts: interruptsView,
        heatWeeks: this.heatWeeks(),
      },
      () => {
        this.setupPie();
        this.setupChart();
      }
    );
  },

  hoursText(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return h + "h" + pad2(m) + "m";
    return m + " 分";
  },

  // ===== 饼图数据 =====
  inRange(ts, range) {
    const d = new Date(ts);
    const now = new Date();
    if (range === "day") {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }
    if (range === "week") {
      const dow = (now.getDay() + 6) % 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0, 0);
      const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7, 0, 0, 0, 0);
      return ts >= monday.getTime() && ts < next.getTime();
    }
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  },

  taskSlices(records, range) {
    const agg = {};
    records.forEach((r) => {
      if (!this.inRange(r.startAt, range)) return;
      const name = r.taskTitle && r.taskTitle.trim() ? r.taskTitle.trim() : "其他";
      agg[name] = (agg[name] || 0) + Math.floor((r.durationSec || 0) / 60);
    });
    const list = Object.keys(agg)
      .filter((name) => agg[name] > 0)
      .map((name) => ({ name, minutes: agg[name] }))
      .sort((a, b) => b.minutes - a.minutes);
    if (list.length <= 6) return list;
    const top = list.slice(0, 5);
    let rest = 0;
    for (let i = 5; i < list.length; i++) rest += list[i].minutes;
    if (rest > 0) top.push({ name: "其他", minutes: rest });
    return top;
  },

  setPieRange(e) {
    this.setData({ pieRange: e.currentTarget.dataset.k }, () => this.refresh());
  },

  // ===== 月度 =====
  monthDate(offset) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  },
  daysInMonth(offset) {
    const d = this.monthDate(offset);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  },
  dayMinutes(offset, day) {
    const d = this.monthDate(offset);
    const k = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(day);
    const st = state.getStats()[k];
    return st ? st.focusMinutes || 0 : 0;
  },
  monthMax(offset) {
    const n = this.daysInMonth(offset);
    let max = 0;
    for (let d = 1; d <= n; d++) {
      const v = this.dayMinutes(offset, d);
      if (v > max) max = v;
    }
    return max;
  },
  monthStep(offset) {
    const max = this.monthMax(offset);
    const base = max > 0 ? max : 25;
    const raw = base / 5;
    const nice = [1, 2, 5, 10, 15, 20, 25, 30, 50, 60, 100, 120, 180, 240, 300, 600];
    for (let i = 0; i < nice.length; i++) {
      if (raw <= nice[i]) return nice[i];
    }
    return Math.ceil(raw / 60) * 60;
  },
  monthNiceMax(offset) {
    const max = this.monthMax(offset);
    const base = max > 0 ? max : 25;
    const step = this.monthStep(offset);
    let nice = Math.max(step, Math.ceil(base / step) * step);
    while (nice / step < 4) nice += step;
    return nice;
  },
  monthMeta() {
    const offset = this.data.monthOffset;
    const d = this.monthDate(offset);
    const step = this.monthStep(offset);
    const niceMax = this.monthNiceMax(offset);
    const lines = Math.round(niceMax / step);
    const yLabels = [];
    for (let r = 0; r <= lines; r++) yLabels.push(niceMax - r * step + "分");

    const n = this.daysInMonth(offset);
    const mo = d.getMonth() + 1;
    const xLabels = [];
    for (let day = 1; day <= n; day++) xLabels.push(mo + "-" + day);

    return {
      title: d.getFullYear() + "年" + (d.getMonth() + 1) + "月",
      yLabels,
      xLabels,
      chartW: n * 44,
      max: niceMax,
    };
  },

  prevMonth() {
    this.setData({ monthOffset: this.data.monthOffset - 1 }, () => this.refresh());
  },
  nextMonth() {
    if (this.data.monthOffset >= 0) return;
    this.setData({ monthOffset: this.data.monthOffset + 1 }, () => this.refresh());
  },

  // ===== 热力图 =====
  heatWeeks() {
    const offset = this.data.monthOffset;
    const d = this.monthDate(offset);
    const n = this.daysInMonth(offset);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ day: 0, minutes: 0, opacity: 1, text: "" });
    for (let day = 1; day <= n; day++) {
      const minutes = this.dayMinutes(offset, day);
      cells.push({
        day,
        minutes,
        opacity: this.heatOpacity(minutes),
        text: minutes > 0 ? this.durText(minutes) : "",
      });
    }
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      const w = cells.slice(i, i + 7);
      while (w.length < 7) w.push({ day: 0, minutes: 0, opacity: 1, text: "" });
      weeks.push(w);
    }
    return weeks;
  },
  heatOpacity(minutes) {
    if (minutes <= 0) return 1;
    if (minutes < 60) return 0.25;
    if (minutes < 120) return 0.6;
    return 1.0;
  },
  durText(minutes) {
    if (minutes < 60) return "<1h";
    return Math.round(minutes / 6) / 10 + "h";
  },
  openHeat() {
    this.setData({ showHeat: true });
  },
  closeHeat() {
    this.setData({ showHeat: false });
  },

  // ===== 打断 =====
  monthInterrupts() {
    const d = this.monthDate(this.data.monthOffset);
    const prefix = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
    const stats = state.getStats();
    const agg = {};
    Object.keys(stats).forEach((k) => {
      if (k.indexOf(prefix) !== 0) return;
      const ic = stats[k].interruptCounts || {};
      Object.keys(ic).forEach((rk) => {
        agg[rk] = (agg[rk] || 0) + ic[rk];
      });
    });
    return Object.keys(agg)
      .map((name) => ({ name, count: agg[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  },

  // ===== Canvas =====
  drawPie() {
    const ctx = this.pieCtx;
    if (!ctx || !this.pieSize) return;
    const size = this.pieSize;
    const slices = this.taskSlices(state.getRecords(), this.data.pieRange);
    let total = 0;
    slices.forEach((s) => {
      total += s.minutes;
    });
    ctx.clearRect(0, 0, size, size);
    if (!slices.length || total <= 0) return;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;
    let start = -Math.PI / 2;
    for (let i = 0; i < slices.length; i++) {
      const end = start + (slices[i].minutes / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      start = end;
    }
  },

  drawMonthChart() {
    const ctx = this.chartCtx;
    if (!ctx || !this.chartSize) return;
    const w = this.chartSize.w;
    const h = this.chartSize.h;
    const offset = this.data.monthOffset;
    const n = this.daysInMonth(offset);
    ctx.clearRect(0, 0, w, h);
    if (n === 0) return;
    const step = this.monthStep(offset);
    const niceMax = this.monthNiceMax(offset);
    const padT = 10;
    const padB = 10;
    const ch = h - padT - padB;
    const baseY = padT + ch;
    const dx = 44;
    const padX = dx / 2;
    const x0 = padX;
    const x1 = padX + (n - 1) * dx;

    ctx.lineWidth = 1;
    const lines = Math.round(niceMax / step);
    for (let r = 0; r <= lines; r++) {
      const y = padT + (ch * r) / lines;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.strokeStyle = "#E3E9DB";
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x0, baseY);
    ctx.lineTo(x1, baseY);
    ctx.strokeStyle = "#B4BFAE";
    ctx.stroke();

    const xs = [];
    const ys = [];
    for (let i = 0; i < n; i++) {
      xs.push(x0 + i * dx);
      ys.push(baseY - (ch * this.dayMinutes(offset, i + 1)) / niceMax);
    }

    ctx.beginPath();
    ctx.moveTo(xs[0], baseY);
    for (let i = 0; i < n; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.lineTo(xs[n - 1], baseY);
    ctx.closePath();
    ctx.fillStyle = "#F6E1D6";
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(xs[i], ys[i]);
      else ctx.lineTo(xs[i], ys[i]);
    }
    ctx.strokeStyle = "#E07A5F";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(xs[i], ys[i], 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#E07A5F";
      ctx.fill();
    }
  },
});
