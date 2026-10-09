const state = require("../../utils/state");

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function hm(ts) {
  const d = new Date(ts);
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

const TITLES = { day: "今日完成时间轴", week: "本周完成时间轴", month: "本月完成时间轴" };
const EMPTY = { day: "今天还没有完成记录", week: "本周还没有完成记录", month: "本月还没有完成记录" };

Page({
  data: {
    theme: "green",
    range: "day",
    rangeTitle: TITLES.day,
    emptyHint: EMPTY.day,
    rows: [],
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2, theme: wx.getStorageSync("qf_theme") || "green" });
    }
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk });
    require("../../utils/theme").apply(tk);
    state.pullCloud(true).then(() => this.refresh());
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  setRange(e) {
    const range = e.currentTarget.dataset.k;
    this.setData({ range });
    this.refresh();
  },

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

  refresh() {
    const range = this.data.range;
    const records = state
      .getRecords()
      .filter((r) => this.inRange(r.startAt, range))
      .sort((a, b) => a.startAt - b.startAt);

    const rows = records.map((r) => {
      const sd = new Date(r.startAt);
      return {
        date: pad2(sd.getMonth() + 1) + "-" + pad2(sd.getDate()),
        start: hm(r.startAt),
        end: hm(r.endAt),
        title: r.taskTitle || "专注",
        mins: Math.floor((r.durationSec || 0) / 60),
        status: r.finished ? "完成" : r.interruptReason ? "中断·" + r.interruptReason : "中断",
        done: Boolean(r.finished),
      };
    });

    this.setData({
      rows,
      rangeTitle: TITLES[range],
      emptyHint: EMPTY[range],
    });
  },
});
