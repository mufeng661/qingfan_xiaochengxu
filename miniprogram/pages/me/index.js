const auth = require("../../utils/auth");
const state = require("../../utils/state");
const store = require("../../utils/store");

const BADGE_CATALOG = [
  { id: "b1", icon: "🔥", name: "连续 7 天", desc: "连续签到越久，徽章等级越高", levels: [7, 14, 30, 60], unit: "天", progressKey: "streak" },
  { id: "b2", icon: "🍅", name: "番茄丰收", desc: "收获的番茄越多，徽章等级越高", levels: [10, 50, 100, 300], unit: "个", progressKey: "tomatoes" },
  { id: "b3", icon: "⭐", name: "专注达人", desc: "专注越久，徽章等级越高", levels: [10, 50, 100, 200], unit: "小时", progressKey: "hours" },
  { id: "b4", icon: "🏆", name: "月度冠军", desc: "夺冠次数越多，徽章等级越高", levels: [1, 2, 3, 5], unit: "次", progressKey: "champion" },
];

// 等级 → 材质与名称（0=未解锁石质，1-4=铜/银/金/钻石）
const BADGE_LEVEL_MATERIALS = ["stone", "bronze", "silver", "gold", "diamond"];
const BADGE_LEVEL_NAMES = ["未解锁", "铜徽章", "银徽章", "金徽章", "钻石徽章"];

// 番茄园等级（累计收获番茄数）
const TOMATO_LEVELS = [
  { at: 0, name: "番茄幼苗" },
  { at: 10, name: "小番茄园" },
  { at: 50, name: "茂盛番茄园" },
  { at: 150, name: "番茄农场" },
];

// 每完成多少个番茄（番茄钟）种植 1 棵番茄
const POMODOROS_PER_TOMATO = 10;

// 材质色板：face 端面渐变 / side 侧壁渐变 / ink 图案与刻字色 / sheen 高光强度
const BADGE_MATERIALS = {
  stone: {
    face: ["#f0f1ee", "#d8dbd5", "#b4bfae", "#7e8a7a"],
    side: [[228, 230, 226], [168, 176, 166], [96, 104, 94]],
    ink: "#5c665a",
    edge: "rgba(80,90,78,0.5)",
    sheen: 0.4,
  },
  bronze: {
    face: ["#ffe6cf", "#e8b48a", "#b5793f", "#6e4418"],
    side: [[232, 180, 138], [168, 112, 58], [84, 52, 20]],
    ink: "#5a3312",
    edge: "rgba(90,51,18,0.55)",
    sheen: 0.45,
  },
  silver: {
    face: ["#ffffff", "#e8edf2", "#b9c2cc", "#6e7a86"],
    side: [[235, 240, 245], [165, 175, 188], [84, 94, 106]],
    ink: "#45505c",
    edge: "rgba(70,80,92,0.5)",
    sheen: 0.6,
  },
  gold: {
    face: ["#fff8e0", "#f3d271", "#d9a441", "#8a5c12"],
    side: [[244, 216, 142], [190, 140, 34], [96, 62, 14]],
    ink: "#5a3d0e",
    edge: "rgba(130,90,20,0.55)",
    sheen: 0.5,
  },
  diamond: {
    face: ["#f4feff", "#bfeef7", "#7fd4e8", "#3a8fb0"],
    side: [[200, 240, 250], [120, 196, 220], [52, 120, 148]],
    ink: "#1f5a70",
    edge: "rgba(31,90,112,0.5)",
    sheen: 0.75,
  },
};

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function weekDates() {
  const out = [];
  const d = new Date();
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow - 1));
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    out.push(x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate()));
  }
  return out;
}

Page({
  data: {
    theme: "green",
    themeKey: "green",
    themesList: [
      { key: "green", name: "青番绿", color: "#6E9B57" },
      { key: "dark", name: "薄暮紫", color: "#8E7CC3" },
      { key: "dawn", name: "晨光暖", color: "#C08A4E" },
      { key: "ocean", name: "静谧蓝", color: "#5C8BA6" },
    ],
    loggedIn: false,
    nickname: "同学",
    avatarSeed: "青",
    bio: "把专注，种成一片番茄园",
    phone: "",
    level: 1,
    exp: 0,
    nextLevelExp: 3000,
    expPct: 0,
    expToNext: 3000,
    streak: 0,
    signedToday: false,
    signGain: 10,
    weekCells: [],
    badges: [],
    badgeIdx: 0,
    currentBadge: null,
    badgeSpin: false,
    badgeAngle: 0,
    totalFocusHours: 0,
    totalPomodoros: 0,
    persistDays: 0,
    harvested: 0,
    aliveTomatoes: 0,
    deadTomatoes: 0,
    tomatoLevel: "番茄幼苗",
    tomatoHint: "",
    tomatoPct: 0,
    tomatoCells: [],
    todayPlanted: 0,
    todayProgress: 0,
    tomatoPer: 10,
    focusAvailable: 0,
    showLogout: false,
    showBadge: false,
    showSettings: false,
    settingsKey: "",
    settingsTitle: "",
    // 设置项
    notifyFocus: true,
    notifySign: true,
    notifyFriend: false,
    privacyTime: true,
    privacyOnline: false,
  },

  onLoad() {
    const s = store.get("qf_settings", {});
    this.setData({
      notifyFocus: s.notifyFocus !== false,
      notifySign: s.notifySign !== false,
      notifyFriend: s.notifyFriend === true,
      privacyTime: s.privacyTime !== false,
      privacyOnline: s.privacyOnline === true,
    });
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4, theme: wx.getStorageSync("qf_theme") || "green" });
    }
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk, themeKey: tk });
    require("../../utils/theme").apply(tk);
    state.pullCloud(true).then(() => this.refresh());
  },

  onPullDownRefresh() {
    state.pullCloud(true).then(() => {
      this.refresh();
      wx.stopPullDownRefresh();
    });
  },

  refresh() {
    const acc = auth.getUser() || {};
    const user = state.getUser();
    const stats = state.getStats();

    let totalMinutes = 0;
    let totalPomodoros = 0;
    let totalInterrupts = 0;
    Object.keys(stats).forEach((k) => {
      totalMinutes += stats[k].focusMinutes || 0;
      totalPomodoros += stats[k].pomodoroCount || 0;
      const ic = stats[k].interruptCounts || {};
      Object.keys(ic).forEach((r) => {
        totalInterrupts += ic[r];
      });
    });

    // 番茄园：每完成 10 个番茄种植 1 棵；枯萎 = 每 3 次中断 1 棵
    // 花园里已种植的番茄只增不减；清除 1 棵枯萎消耗 2 个「专注获得的番茄」（消耗的是剩余专注番茄，不影响已种植）
    const profile = state.getProfile();
    const bonus = profile.bonusTrees || 0;
    const deadTotal = Math.floor(totalInterrupts / 3);
    const cleared = Math.min(Number(profile.tomatoCleared) || 0, deadTotal);
    const deadTomatoes = deadTotal - cleared;
    const harvested = Math.floor(totalPomodoros / POMODOROS_PER_TOMATO) + bonus;
    const aliveTomatoes = harvested;
    const focusAvailable = Math.max(0, totalPomodoros - cleared * 2);
    const persistDays = Object.keys(stats).filter((k) => (stats[k].focusMinutes || 0) > 0).length;

    // 每日种植反馈：今日收获 + 距下一棵的进度
    const todayKey = store.todayKey();
    const todayPom = (stats[todayKey] && stats[todayKey].pomodoroCount) || 0;
    const todayPlanted = Math.floor(todayPom / POMODOROS_PER_TOMATO);
    const todayProgress = todayPom % POMODOROS_PER_TOMATO;
    const seenKey = "qf_tomato_seen_" + state.uid();
    let seenPom = store.get(seenKey, null);
    const firstRun = seenPom === null || seenPom === undefined;
    if (firstRun) seenPom = todayPom;
    const todayNew = Math.max(0, todayPlanted - Math.floor(Number(seenPom || 0) / POMODOROS_PER_TOMATO));
    store.set(seenKey, todayPom);

    const badges = BADGE_CATALOG.map((b) => {
      // 各徽章进度值：streak 连续天数 / tomatoes 番茄数 / hours 专注小时 / champion 冠军次数
      let progress = 0;
      if (b.progressKey === "streak") progress = user.streak || 0;
      else if (b.progressKey === "tomatoes") progress = harvested;
      else if (b.progressKey === "hours") progress = Math.floor(totalMinutes / 60);
      else if (b.progressKey === "champion") progress = state.getChampion().count;
      let level = 0;
      for (let i = 0; i < b.levels.length; i++) {
        if (progress >= b.levels[i]) level = i + 1;
      }
      const nextAt = level < b.levels.length ? b.levels[level] : null;
      let desc;
      if (level === 0) {
        desc = "达到 " + b.levels[0] + " " + b.unit + "解锁铜徽章 · " + b.desc;
      } else if (nextAt != null) {
        desc = "当前 " + progress + " " + b.unit + " · 达到 " + nextAt + " " + b.unit + "升级" + BADGE_LEVEL_NAMES[level + 1];
      } else {
        desc = "已达最高等级 · " + b.desc;
      }
      return Object.assign({}, b, {
        progress,
        level,
        unlocked: level > 0,
        rarity: BADGE_LEVEL_MATERIALS[level],
        rarityName: BADGE_LEVEL_NAMES[level],
        desc,
      });
    });

    const weekCells = this.buildWeek(acc, user);

    this.setData({
      loggedIn: auth.isLoggedIn(),
      nickname: user.nickname,
      avatarSeed: user.avatarSeed || (user.nickname || "青").slice(0, 1),
      bio: acc.bio || "把专注，种成一片番茄园",
      phone: user.phone || "",
      level: user.level,
      exp: user.exp,
      nextLevelExp: user.nextLevelExp,
      expPct: Math.min(100, Math.round((user.exp / (user.nextLevelExp || 1)) * 100)),
      expToNext: (user.nextLevelExp || 3000) - user.exp,
      streak: user.streak,
      signedToday: state.isSignedToday(),
      signGain: user.streak >= 7 ? 15 : 10,
      weekCells,
      badges,
      totalFocusHours: Math.floor(totalMinutes / 60),
      totalPomodoros,
      persistDays,
      harvested,
      aliveTomatoes,
      deadTomatoes,
      tomatoLevel: this.tomatoLevelOf(harvested),
      tomatoHint: this.tomatoHintOf(harvested),
      tomatoPct: this.tomatoPctOf(harvested),
      tomatoCells: this.tomatoCells(aliveTomatoes, deadTomatoes, todayNew),
      todayPlanted,
      todayProgress,
      tomatoPer: POMODOROS_PER_TOMATO,
      focusAvailable,
    });

    if (!firstRun && todayNew > 0) {
      wx.showToast({ title: "🍅 今日收获 +" + todayNew, icon: "none" });
    }
  },

  buildWeek(acc, user) {
    const labels = ["一", "二", "三", "四", "五", "六", "日"];
    const dates = weekDates();
    const today = store.todayKey();
    const signed = user.signDates || [];
    const dow = new Date().getDay() === 0 ? 7 : new Date().getDay();
    return labels.map((label, i) => {
      const k = dates[i];
      return {
        label,
        done: (signed.indexOf(k) >= 0 || user.lastSignDate === k) && k <= today,
        isToday: i + 1 === dow,
      };
    });
  },

  tomatoLevelOf(harvested) {
    let name = TOMATO_LEVELS[0].name;
    for (let i = 0; i < TOMATO_LEVELS.length; i++) {
      if (harvested >= TOMATO_LEVELS[i].at) name = TOMATO_LEVELS[i].name;
    }
    return name;
  },
  tomatoNextAt(harvested) {
    for (let i = 1; i < TOMATO_LEVELS.length; i++) {
      if (harvested < TOMATO_LEVELS[i].at) return TOMATO_LEVELS[i];
    }
    return null;
  },
  tomatoHintOf(harvested) {
    const next = this.tomatoNextAt(harvested);
    if (!next) return "你的番茄园已满级，继续收获吧！";
    return "再收获 " + (next.at - harvested) + " 个番茄，升级到「" + next.name + "」";
  },
  tomatoPctOf(harvested) {
    const next = this.tomatoNextAt(harvested);
    if (!next) return 100;
    let start = 0;
    for (let i = 0; i < TOMATO_LEVELS.length; i++) {
      if (harvested >= TOMATO_LEVELS[i].at) start = TOMATO_LEVELS[i].at;
    }
    return Math.min(100, Math.round(((harvested - start) / (next.at - start)) * 100));
  },
  // 生成番茄园格子：存活番茄 + 枯萎番茄，超出上限显示 +N，不足补空位
  tomatoCells(alive, dead, todayNew) {
    const MIN = 8;
    const MAX = 12;
    const total = alive + dead;
    const out = [];
    if (total > MAX) {
      const showAlive = Math.min(alive, MAX - 1);
      const showDead = Math.min(dead, MAX - 1 - showAlive);
      for (let i = 0; i < showAlive; i++) {
        out.push({ type: "tomato", idx: "t" + i, fresh: i >= alive - todayNew });
      }
      for (let i = 0; i < showDead; i++) out.push({ type: "dead", idx: "d" + i });
      out.push({ type: "more", idx: "more", more: total - out.length });
      return out;
    }
    for (let i = 0; i < alive; i++) {
      out.push({ type: "tomato", idx: "t" + i, fresh: i >= alive - todayNew });
    }
    for (let i = 0; i < dead; i++) out.push({ type: "dead", idx: "d" + i });
    const target = Math.max(MIN, total);
    while (out.length < target) out.push({ type: "empty", idx: "e" + out.length });
    return out;
  },

  doSign() {
    const gain = state.signInToday();
    if (gain < 0) {
      wx.showToast({ title: "今天已签到", icon: "none" });
      return;
    }
    this.refresh();
    wx.showToast({ title: "签到成功 +" + gain + " 经验", icon: "none" });
  },

  // 清除枯萎番茄：消耗 2 个「专注获得的番茄」清除 1 棵
  clearDead(e) {
    const cell = this.data.tomatoCells[e.currentTarget.dataset.index];
    if (!cell || cell.type !== "dead") return;
    if (this.data.deadTomatoes <= 0) return;
    if (this.data.focusAvailable < 2) {
      wx.showToast({ title: "专注番茄不足，需要 2 个才能清除", icon: "none" });
      return;
    }
    wx.showModal({
      title: "清除枯萎番茄",
      content: "消耗 2 个专注番茄，清除 1 棵枯萎番茄？",
      confirmText: "清除",
      success: (res) => {
        if (!res.confirm) return;
        const p = state.getProfile();
        p.tomatoCleared = (Number(p.tomatoCleared) || 0) + 1;
        state.saveProfile(p);
        this.refresh();
        wx.showToast({ title: "已清除 1 棵枯萎番茄 🥀", icon: "none" });
      },
    });
  },

  onBadge(e) {
    const idx = e.currentTarget.dataset.index;
    this._badgeAngle = 0;
    this.setData(
      { showBadge: true, badgeIdx: idx, currentBadge: this.data.badges[idx] },
      () => {
        setTimeout(() => this.initBadgeCanvas(), 50);
      }
    );
  },
  closeBadge() {
    this.setData({ showBadge: false });
  },

  initBadgeCanvas() {
    if (!this.data.showBadge) return;
    wx.createSelectorQuery()
      .select("#badgeCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext("2d");
        let dpr = 2;
        try {
          dpr = wx.getSystemInfoSync().pixelRatio || 2;
        } catch (err) {
          // ignore
        }
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._badgeCtx = ctx;
        this._badgeSize = res[0].width;
        this._badgeNode = canvas;
        this._badgeAngle = 0;
        this._bVel = 0;
        this.drawCoin();
      });
  },

  ellipsePath(ctx, cx, cy, rx, ry) {
    if (typeof ctx.ellipse === "function") {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.closePath();
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.closePath();
      ctx.restore();
    }
  },

  // 3D 硬币徽章：随左右滑动绕纵轴旋转（金属质感 + 惯性回弹）
  drawCoin() {
    const ctx = this._badgeCtx;
    const size = this._badgeSize;
    if (!ctx || !size) return;
    const badge = this.data.currentBadge || {};
    const mat = BADGE_MATERIALS[badge.rarity] || BADGE_MATERIALS.gold;
    const rad = ((this._badgeAngle || 0) * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const cx = size / 2;
    const cy = size / 2;
    const ry = size / 2 - size * 0.08;
    const faceRx = Math.max(1, ry * Math.abs(c));
    const thickness = ry * 0.3;
    const off = thickness * (0.25 + 0.75 * Math.abs(s));
    const nearX = cx - off / 2;
    const farX = cx + off / 2;

    ctx.clearRect(0, 0, size, size);

    // 地面阴影
    this.ellipsePath(ctx, cx, cy + ry * 0.16, faceRx + off / 2, ry * 0.9);
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    ctx.fill();

    // 侧壁（厚度）：从远到近扫椭圆堆出柱面
    const steps = 14;
    for (let i = steps; i >= 1; i--) {
      const k = i / steps;
      const x = nearX + off * k;
      const shade = 0.7 + 0.3 * (1 - k);
      this.ellipsePath(ctx, x, cy, faceRx, ry);
      const g = ctx.createLinearGradient(x - faceRx, cy - ry, x + faceRx, cy + ry);
      g.addColorStop(0, "rgb(" + Math.round(mat.side[0][0] * shade) + "," + Math.round(mat.side[0][1] * shade) + "," + Math.round(mat.side[0][2] * shade) + ")");
      g.addColorStop(0.5, "rgb(" + Math.round(mat.side[1][0] * shade) + "," + Math.round(mat.side[1][1] * shade) + "," + Math.round(mat.side[1][2] * shade) + ")");
      g.addColorStop(1, "rgb(" + Math.round(mat.side[2][0] * shade) + "," + Math.round(mat.side[2][1] * shade) + "," + Math.round(mat.side[2][2] * shade) + ")");
      ctx.fillStyle = g;
      ctx.fill();
    }
    // 远侧缘描边
    this.ellipsePath(ctx, farX, cy, faceRx, ry);
    ctx.lineWidth = Math.max(1, ry * 0.02);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.stroke();

    // 近端面
    const hx = nearX - faceRx * 0.4;
    const hy = cy - ry * 0.45;
    this.ellipsePath(ctx, nearX, cy, faceRx, ry);
    const face = ctx.createRadialGradient(hx, hy, faceRx * 0.05, nearX, cy, Math.max(faceRx, ry));
    face.addColorStop(0, mat.face[0]);
    face.addColorStop(0.35, mat.face[1]);
    face.addColorStop(0.78, mat.face[2]);
    face.addColorStop(1, mat.face[3]);
    ctx.fillStyle = face;
    ctx.fill();

    // --- 以下细节全部裁剪在端面内 ---
    ctx.save();
    this.ellipsePath(ctx, nearX, cy, faceRx, ry);
    ctx.clip();

    // 珠边齿纹：沿币缘一圈小凸点
    const beads = 36;
    for (let i = 0; i < beads; i++) {
      const a = (i / beads) * Math.PI * 2;
      const bx = nearX + Math.cos(a) * faceRx * 0.945;
      const by = cy + Math.sin(a) * ry * 0.945;
      ctx.beginPath();
      ctx.arc(bx, by, ry * 0.022, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by + ry * 0.008, ry * 0.018, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fill();
    }

    // 双圈浮雕：外圈凸起（上暗下亮）+ 内圈凹陷（上亮下暗）
    ctx.lineWidth = Math.max(1, ry * 0.018);
    this.ellipsePath(ctx, nearX, cy + ry * 0.012, faceRx * 0.86, ry * 0.86);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.stroke();
    this.ellipsePath(ctx, nearX, cy - ry * 0.012, faceRx * 0.86, ry * 0.86);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.stroke();
    this.ellipsePath(ctx, nearX, cy - ry * 0.01, faceRx * 0.76, ry * 0.76);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.stroke();
    this.ellipsePath(ctx, nearX, cy + ry * 0.01, faceRx * 0.76, ry * 0.76);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.stroke();

    // 镜面高光带：随旋转角度扫过币面
    const bandX = nearX - faceRx + ((this._badgeAngle || 0) + 30) / 60 * faceRx * 2;
    ctx.save();
    ctx.translate(bandX, cy);
    ctx.rotate(-0.35);
    const sheen = ctx.createLinearGradient(-faceRx * 0.28, 0, faceRx * 0.28, 0);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.5, "rgba(255,255,255," + mat.sheen + ")");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-faceRx * 0.3, -ry * 1.4, faceRx * 0.6, ry * 2.8);
    ctx.restore();

    ctx.restore(); // 结束端面裁剪

    // 币边描边
    this.ellipsePath(ctx, nearX, cy, faceRx, ry);
    ctx.lineWidth = Math.max(1.5, ry * 0.05);
    ctx.strokeStyle = mat.edge;
    ctx.stroke();

    // 图案与刻字：只被币面椭圆裁剪，不做横向压缩，旋转全程保持可见
    ctx.save();
    this.ellipsePath(ctx, nearX, cy, faceRx * 0.92, ry * 0.92);
    ctx.clip();
    ctx.translate(nearX, cy);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = mat.ink;
    ctx.font = Math.round(ry * 0.62) + "px sans-serif";
    ctx.fillText(badge.icon || "★", 0, -ry * 0.06);
    ctx.font = Math.round(ry * 0.13) + "px sans-serif";
    ctx.fillText(badge.name || "", 0, ry * 0.42);
    ctx.restore();
  },

  onBadgeTouchStart(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this._bStartX = touch.clientX;
    this._bStartAngle = this._badgeAngle || 0;
    this._bVel = 0;
    this._bLastX = touch.clientX;
    this._bLastT = Date.now();
  },
  onBadgeTouchMove(e) {
    const touch = e.touches && e.touches[0];
    if (!touch || this._bStartX == null) return;
    const dx = touch.clientX - this._bStartX;
    const raw = this._bStartAngle + dx * 0.8;
    const now = Date.now();
    const dt = Math.max(1, now - (this._bLastT || now));
    // 记录角速度（度/帧，按 60fps 折算）
    this._bVel = ((raw - (this._badgeAngle || 0)) / dt) * 16.7;
    this._bLastX = touch.clientX;
    this._bLastT = now;
    this._badgeAngle = Math.max(-30, Math.min(30, raw));
    this.drawCoin();
  },
  onBadgeTouchEnd() {
    this._bStartX = null;
    this.startInertia();
  },

  // 松手惯性：阻尼减速 + 边界回弹
  startInertia() {
    if (!this._bVel || Math.abs(this._bVel) < 0.3) {
      this._bVel = 0;
      return;
    }
    const canvas = this._badgeNode;
    if (!canvas || !canvas.requestAnimationFrame) return;
    this._bInertia = true;
    const tick = () => {
      if (!this.data.showBadge || !this._bInertia) return;
      this._bVel *= 0.93;
      let a = (this._badgeAngle || 0) + this._bVel;
      if (a > 30) { a = 30; this._bVel = -this._bVel * 0.38; }
      if (a < -30) { a = -30; this._bVel = -this._bVel * 0.38; }
      this._badgeAngle = a;
      this.drawCoin();
      if (Math.abs(this._bVel) > 0.05) {
        canvas.requestAnimationFrame(tick);
      } else {
        this._bVel = 0;
        this._bInertia = false;
      }
    };
    canvas.requestAnimationFrame(tick);
  },

  onSetting(e) {
    const key = e.currentTarget.dataset.key;
    const titles = { account: "账号与安全", notify: "消息提醒", privacy: "隐私设置", about: "关于青番" };
    this.setData({ showSettings: true, settingsKey: key, settingsTitle: titles[key] || "" });
  },
  closeSettings() {
    this.setData({ showSettings: false });
  },

  saveSettings() {
    store.set("qf_settings", {
      notifyFocus: this.data.notifyFocus,
      notifySign: this.data.notifySign,
      notifyFriend: this.data.notifyFriend,
      privacyTime: this.data.privacyTime,
      privacyOnline: this.data.privacyOnline,
    });
  },
  toggle(e) {
    const key = e.currentTarget.dataset.key;
    const patch = {};
    patch[key] = e.detail.value;
    this.setData(patch, () => this.saveSettings());
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
  },

  askLogout() {
    this.setData({ showLogout: true });
  },
  closeLogout() {
    this.setData({ showLogout: false });
  },
  doLogout() {
    this.setData({ showLogout: false });
    auth.logout();
    this.refresh();
    wx.showToast({ title: "已退出登录", icon: "none" });
  },

  pickTheme(e) {
    const key = e.currentTarget.dataset.key;
    state.setTheme(key);
    require("../../utils/theme").apply(key);
    this.setData({ theme: key, themeKey: key });
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ theme: key });
    }
    wx.showToast({ title: "已切换主题", icon: "none" });
  },

  goHelp() {
    wx.navigateTo({ url: "/pages/help/index" });
  },

  goAbout() {
    wx.navigateTo({ url: "/pages/about/index" });
  },

  comingSoon() {
    wx.showToast({ title: "该功能将在后续版本上线", icon: "none" });
  },

  noop() {},
});
