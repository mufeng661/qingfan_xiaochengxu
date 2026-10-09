const { call } = require("../../utils/api");
const auth = require("../../utils/auth");
const state = require("../../utils/state");
const store = require("../../utils/store");

function buildContext() {
  const acc = auth.getUser() || {};
  const stats = state.getStats();
  const today = store.todayKey();
  const st = stats[today] || { focusMinutes: 0, pomodoroCount: 0, interruptCounts: {} };
  const ic = st.interruptCounts || {};
  const reasons = Object.keys(ic).map((k) => k + "×" + ic[k]);
  const tasks = state.getTasks()
    .slice(0, 10)
    .map((t) => ({ title: t.title, status: t.status, durationMin: t.durationMin }));
  const profile = state.getProfile();
  return JSON.stringify({
    nickname: acc.username || acc.nickname || "",
    todayFocusMinutes: st.focusMinutes || 0,
    pomodoro: st.pomodoroCount || 0,
    streak: profile.streak || 0,
    interruptReasons: reasons,
    tasks,
  });
}

Page({
  data: {
    theme: "green",
    messages: [],
    input: "",
    aiBusy: false,
    toView: "",
    suggestions: [
      { icon: "✨", title: "给待办排个序", desc: "按难易程度自动安排优先级" },
      { icon: "📝", title: "制定今日计划", desc: "AI 生成计划并自动加入待办" },
      { icon: "⏰", title: "最佳专注时段", desc: "看看我什么时间效率最高" },
      { icon: "📈", title: "本周专注洞察", desc: "生成我的专注报告" },
      { icon: "🔥", title: "给我点改进建议", desc: "针对我的习惯个性化建议" },
    ],
  },

  onLoad() {
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk });
    require("../../utils/theme").apply(tk);
    this.loadChat();
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: "/pages/home/index" }),
    });
  },

  chatKey() {
    return "qf_ai_chat_" + state.uid();
  },

  shortName() {
    const u = auth.getUser();
    const n = (u && (u.username || u.nickname)) || "同学";
    return n.length > 2 ? n.slice(1) : n;
  },

  greeting() {
    return {
      role: "ai",
      text: "嗨，" + this.shortName() + "。我是青番 AI，可以帮你排待办、看专注规律，还能给改进建议。想先试哪个？",
      action: "",
    };
  },

  loadChat() {
    const saved = store.get(this.chatKey(), []);
    this.setData({ messages: saved.length ? saved : [this.greeting()] }, () => this.scrollBottom());
  },

  saveChat() {
    const list = this.data.messages;
    const keep = list.length > 200 ? list.slice(list.length - 200) : list;
    store.set(this.chatKey(), keep);
  },

  scrollBottom() {
    const list = this.data.messages;
    if (!list.length) return;
    this.setData({ toView: "msg-" + (list.length - 1) });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  clearHistory() {
    wx.showModal({
      title: "清空聊天记录",
      content: "删除后无法恢复，确定要清空吗？",
      confirmColor: "#E07A5F",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ messages: [this.greeting()] }, () => this.scrollBottom());
        this.saveChat();
        wx.showToast({ title: "已清空", icon: "none" });
      },
    });
  },

  aiSort() {
    const order = { hard: 0, medium: 1, easy: 2 };
    const tasks = state.getTasks().slice();
    tasks.sort((a, b) => {
      if (a.status !== b.status) return a.status === "todo" ? -1 : 1;
      const oa = order[a.difficulty] != null ? order[a.difficulty] : 3;
      const ob = order[b.difficulty] != null ? order[b.difficulty] : 3;
      return oa - ob;
    });
    tasks.forEach((t, i) => {
      t.order = i;
    });
    state.saveTasks(tasks);
  },

  addPlanTodos(todos) {
    if (!todos || !todos.length) return 0;
    const list = state.getTasks();
    const base = list.length;
    todos.forEach((t, i) => {
      list.push({
        id: store.genId("t"),
        title: String(t.title || "").slice(0, 60),
        durationMin: t.durationMin || 25,
        status: "todo",
        difficulty: t.difficulty === "easy" || t.difficulty === "hard" ? t.difficulty : "medium",
        order: base + i,
        createdAt: Date.now(),
        bgSeed: "sky",
      });
    });
    state.saveTasks(list);
    return todos.length;
  },

  looksLikePlan(text) {
    if (text.indexOf("排序") >= 0 || text.indexOf("排个序") >= 0) return false;
    const keys = ["计划", "规划", "安排", "清单", "制定", "排期"];
    return keys.some((k) => text.indexOf(k) >= 0);
  },

  genericReply(q) {
    if (q.indexOf("安排") >= 0 || q.indexOf("排") >= 0) {
      return "已按「困难 → 中等 → 简单」帮你重新排序，把最费脑的放在精力最旺的时候先完成。";
    }
    if (q.indexOf("时段") >= 0 || q.indexOf("高效") >= 0) {
      return "你的高效时段是 14:00–16:00 和 20:00–21:30。建议把「写周报」这类硬骨头排在下午，晚上留给轻量阅读。";
    }
    if (q.indexOf("洞察") >= 0 || q.indexOf("报告") >= 0 || q.indexOf("规律") >= 0) {
      return "本周专注 12 小时 05 分，较上周 +18%。深度专注占比 64%，被打断 3 次，主要原因是「消息通知」。";
    }
    if (q.indexOf("建议") >= 0) {
      return "建议 1：专注时开启免打扰，减少打断；建议 2：连续 4 个番茄后安排 15 分钟长休息；建议 3：把背单词挪到早晨 08:30，那时打断率最低。";
    }
    return "我已收到：「" + q + "」。你可以点下方建议卡片，或在「数据」页查看 AI 洞察报告。";
  },

  onSuggestion(e) {
    const s = this.data.suggestions[e.currentTarget.dataset.index];
    if (!s) return;
    if (s.title === "给待办排个序") {
      this.aiSort();
      this.ask("帮我给待办排个序，并说明这样排的理由", "已执行排序", false);
    } else if (s.title === "最佳专注时段") {
      this.ask("我今天几点专注最高效？", "", false);
    } else if (s.title === "本周专注洞察") {
      this.ask("看看我这周的专注洞察", "", false);
    } else if (s.title === "制定今日计划") {
      this.ask("帮我制定今天的专注计划", "", true);
    } else {
      this.ask("给我点改进建议", "", false);
    }
  },

  send() {
    const t = (this.data.input || "").trim();
    if (!t) return;
    this.ask(t, "", this.looksLikePlan(t));
  },

  ask(userText, action, wantPlan) {
    const t = (userText || "").trim();
    if (!t || this.data.aiBusy) return;
    const withMe = this.data.messages.concat([{ role: "me", text: t, action: "" }]);
    this.setData({ messages: withMe, input: "", aiBusy: true }, () => this.scrollBottom());
    this.saveChat();

    const history = withMe.map((m) => ({ role: m.role === "me" ? "user" : "assistant", content: m.text }));
    const done = (reply, added) => {
      let finalAction = action;
      if (added > 0) finalAction = "已添加 " + added + " 个待办";
      const msgs = this.data.messages.concat([{ role: "ai", text: reply, action: finalAction }]);
      this.setData({ messages: msgs, aiBusy: false }, () => this.scrollBottom());
      this.saveChat();
      if (added > 0) wx.showToast({ title: "已添加 " + added + " 个待办", icon: "none" });
    };

    if (!auth.isLoggedIn()) {
      done(this.genericReply(t), 0);
      return;
    }

    call("ai.chat", {
      messages: history,
      prompt: t,
      wantPlan: wantPlan ? "true" : "false",
      context: buildContext(),
    })
      .then((data) => {
        let reply = (data && data.reply) || "";
        let added = 0;
        if (reply && data.todos && data.todos.length) added = this.addPlanTodos(data.todos);
        if (!reply) reply = this.genericReply(t);
        done(reply, added);
      })
      .catch((err) => {
        const msg = (err && err.message) || "";
        const reply = /AI|配额|次数|太快/.test(msg) ? msg : this.genericReply(t);
        done(reply, 0);
      });
  },
});
