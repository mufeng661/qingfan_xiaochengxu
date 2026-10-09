const { call } = require("../../utils/api");
const auth = require("../../utils/auth");

function fmt(ts) {
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return "";
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

Page({
  data: {
    theme: "green",
    loggedIn: false,
    loading: false,
    roomError: "",

    room: null,
    members: [],
    myName: "",

    // 创建
    showCreate: false,
    newName: "",
    newPwd: "",
    usePwd: false,
    newDailyMin: "30",
    creating: false,
    // 加入
    showJoin: false,
    joinCode: "",
    joinPwd: "",
    joining: false,
    // 留言
    showBoard: false,
    boardRoomId: "",
    boardRoomName: "",
    messages: [],
    msgInput: "",
    msgSending: false,
    msgError: "",
    replyToId: 0,
    replyToName: "",
    // 解散
    showDelete: false,
    pendingDeleteName: "",
    dissolveLeft: 0,
    // 退出
    showLeave: false,
    pendingLeaveName: "",
    // 移出成员
    showKick: false,
    kickMemberId: "",
    kickMemberName: "",
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1, theme: wx.getStorageSync("qf_theme") || "green" });
    }
    const tk = wx.getStorageSync("qf_theme") || "green";
    this.setData({ theme: tk });
    require("../../utils/theme").apply(tk);
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh());
  },

  onUnload() {
    this.stopDissolveCountdown();
  },

  noop() {},

  userNickname() {
    const u = auth.getUser();
    return (u && (u.username || u.nickname)) || "";
  },

  refresh() {
    const loggedIn = auth.isLoggedIn();
    this.setData({ loggedIn, myName: this.userNickname() || "我" });
    if (!loggedIn) {
      this.setData({ room: null, members: [], loading: false });
      return Promise.resolve();
    }
    this.setData({ loading: true });
    return call("room.listMine")
      .then((data) => {
        const list = data.list || [];
        if (!list.length) {
          this.setData({ room: null, members: [], roomError: "", loading: false });
          return null;
        }
        const room = list[0];
        this.setData({ roomError: "" });
        return call("room.get", { roomId: room.id }).then((detail) => {
          const raw = (detail.members || [])
            .slice()
            .sort((a, b) => (Number(b.focus_minutes) || 0) - (Number(a.focus_minutes) || 0));
          const members = raw.map((m, i) =>
            Object.assign({}, m, {
              rank: i + 1,
              displayName:
                m.user_id === this._userId
                  ? this.data.myName
                  : m.nickname || "用户 …" + String(m.user_id).slice(-6),
              rankClass: i === 0 ? "r0" : i === 1 ? "r1" : i === 2 ? "r2" : "r3",
              isMe: m.user_id === this._userId,
            })
          );
          const focusingCount = members.filter((m) => m.focusing === 1).length;
          const myIdx = members.findIndex((m) => m.isMe);
          const merged = Object.assign({}, room, detail, {
            timeText: fmt(room.created_at),
            joinCode: detail.join_code || room.join_code || room.id,
            dailyMin: detail.daily_min != null ? detail.daily_min : 30,
            member_count: detail.member_count != null ? detail.member_count : members.length,
            focusing_count: detail.focusing_count != null ? detail.focusing_count : focusingCount,
            my_rank: detail.my_rank != null ? detail.my_rank : myIdx >= 0 ? myIdx + 1 : 1,
          });
          this.setData({ room: merged, members, loading: false });
        });
      })
      .catch(() => {
        this.setData({ loading: false, roomError: "自习室加载失败，请检查网络后重试" });
      });
  },

  // 记录当前用户手机号用于成员高亮
  onLoad() {
    this._userId = (auth.getUser() && auth.getUser().phone) || "";
  },

  // ===== 创建 =====
  openCreate() {
    this.setData({ showCreate: true, newName: "", newPwd: "", usePwd: false, newDailyMin: "30" });
  },
  closeCreate() {
    this.setData({ showCreate: false });
  },
  onNewName(e) {
    this.setData({ newName: e.detail.value });
  },
  onNewPwd(e) {
    this.setData({ newPwd: e.detail.value });
  },
  onUsePwd(e) {
    this.setData({ usePwd: e.detail.value });
  },
  onNewDaily(e) {
    this.setData({ newDailyMin: e.detail.value.replace(/[^0-9]/g, "") });
  },
  createRoom() {
    const name = (this.data.newName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入房间名称", icon: "none" });
      return;
    }
    if (this.data.usePwd && !this.data.newPwd) {
      wx.showToast({ title: "请输入房间密码或关闭密码", icon: "none" });
      return;
    }
    if (this.data.creating) return;
    const dm = parseInt(this.data.newDailyMin, 10);
    const dailyMin = Number.isFinite(dm) && dm >= 0 ? dm : 30;
    this.setData({ creating: true });
    call("room.create", {
      name,
      password: this.data.usePwd ? this.data.newPwd : "",
      dailyMin,
      nickname: this.userNickname(),
    })
      .then((room) => {
        this.setData({ showCreate: false, creating: false });
        wx.setClipboardData({ data: String(room.id) });
        wx.showToast({ title: "自习室已创建，房间号已复制", icon: "none" });
        return this.refresh();
      })
      .catch((err) => {
        this.setData({ creating: false });
        wx.showToast({ title: err.message || "创建失败", icon: "none" });
      });
  },

  // ===== 加入 =====
  openJoin() {
    this.setData({ showJoin: true, joinCode: "", joinPwd: "" });
  },
  closeJoin() {
    this.setData({ showJoin: false });
  },
  onJoinCode(e) {
    this.setData({ joinCode: e.detail.value });
  },
  onJoinPwd(e) {
    this.setData({ joinPwd: e.detail.value });
  },
  joinRoom() {
    const code = (this.data.joinCode || "").trim();
    if (!code) {
      wx.showToast({ title: "请输入房间号或加入码", icon: "none" });
      return;
    }
    if (this.data.joining) return;
    this.setData({ joining: true });
    call("room.join", { roomId: code, password: this.data.joinPwd, nickname: this.userNickname() })
      .then(() => {
        this.setData({ showJoin: false, joining: false });
        wx.showToast({ title: "已加入房间", icon: "none" });
        return this.refresh();
      })
      .catch((err) => {
        this.setData({ joining: false });
        wx.showToast({ title: err.message || "加入失败", icon: "none" });
      });
  },

  // ===== 分享 / 复制 =====
  copyText(text) {
    if (!text) return;
    wx.setClipboardData({ data: String(text) });
  },
  copyJoinCode() {
    this.copyText(this.data.room && this.data.room.joinCode);
  },
  shareRoom() {
    const room = this.data.room;
    if (!room) return;
    const me = this.data.myName;
    const text =
      "青番自习室邀请：" + me + " 邀请你进入「" + room.name + "」自习室，房间号 " + room.id + "，一起专注吧！";
    wx.setClipboardData({ data: text });
  },

  // ===== 留言 =====
  openBoard() {
    const room = this.data.room;
    if (!room) return;
    this.setData({
      showBoard: true,
      boardRoomId: room.id,
      boardRoomName: room.name,
      messages: [],
      msgError: "",
      replyToId: 0,
      replyToName: "",
    });
    this.loadMessages();
  },
  closeBoard() {
    this.setData({ showBoard: false });
  },
  loadMessages() {
    if (!this.data.boardRoomId) return Promise.resolve();
    return call("comment.list", { roomId: this.data.boardRoomId, page: 1, pageSize: 50 })
      .then((data) => this.setData({ messages: this.buildTree(data.list || []), msgError: "" }))
      .catch(() => this.setData({ msgError: "留言加载失败，请检查网络后重试" }));
  },
  buildTree(rows) {
    const map = {};
    rows.forEach((row) => {
      map[String(row.id)] = Object.assign({}, row, {
        children: [],
        depth: 0,
        avatarText: row.nickname ? String(row.nickname).slice(0, 1) : "客",
        timeText: fmt(row.created_at),
        replyToName: row.reply_to_name || "",
      });
    });
    const roots = [];
    rows.forEach((row) => {
      const node = map[String(row.id)];
      if (row.parent_id !== null && row.parent_id !== undefined && map[String(row.parent_id)]) {
        map[String(row.parent_id)].children.push(node);
      } else if (row.parent_id === null || row.parent_id === undefined) {
        roots.push(node);
      }
    });
    roots.sort((a, b) => Number(b.created_at) - Number(a.created_at));
    Object.keys(map).forEach((k) => map[k].children.sort((a, b) => Number(a.created_at) - Number(b.created_at)));
    const flat = [];
    const walk = (nodes, depth) => {
      nodes.forEach((node) => {
        node.depth = depth;
        flat.push(node);
        walk(node.children, depth + 1);
      });
    };
    walk(roots, 0);
    return flat;
  },
  onMsgInput(e) {
    this.setData({ msgInput: e.detail.value });
  },
  setReply(e) {
    const m = this.data.messages[e.currentTarget.dataset.index];
    if (!m) return;
    this.setData({ replyToId: m.id, replyToName: m.nickname });
  },
  cancelReply() {
    this.setData({ replyToId: 0, replyToName: "" });
  },
  sendMessage() {
    const text = (this.data.msgInput || "").trim();
    if (!text) {
      wx.showToast({ title: "请输入留言内容", icon: "none" });
      return;
    }
    if (this.data.msgSending) return;
    this.setData({ msgSending: true });
    const payload = { roomId: this.data.boardRoomId, content: text, nickname: this.data.myName, platform: "wechat" };
    if (this.data.replyToId) payload.parentId = this.data.replyToId;
    call("comment.add", payload)
      .then(() => {
        this.setData({ msgInput: "", msgSending: false });
        this.cancelReply();
        return this.loadMessages();
      })
      .then(() => wx.showToast({ title: "已发送", icon: "none" }))
      .catch((err) => {
        this.setData({ msgSending: false, msgError: err.message || "发送失败" });
      });
  },

  // ===== 移出成员 =====
  askKick(e) {
    const m = this.data.members[e.currentTarget.dataset.index];
    if (!m) return;
    if (m.role === "owner" || m.isMe) return;
    this.setData({ showKick: true, kickMemberId: m.user_id, kickMemberName: m.displayName });
  },
  closeKick() {
    this.setData({ showKick: false });
  },
  confirmKick() {
    const target = this.data.kickMemberId;
    const room = this.data.room;
    this.setData({ showKick: false });
    if (!target || !room) return;
    call("room.kick", { roomId: room.id, userId: target, targetUserId: target })
      .then(() => {
        wx.showToast({ title: "已移出该成员", icon: "none" });
        return this.refresh();
      })
      .catch((err) => wx.showToast({ title: err.message || "移出失败", icon: "none" }));
  },

  // ===== 解散（10s） =====
  onDangerTap() {
    const room = this.data.room;
    if (!room) return;
    if (room.role === "owner") {
      this.askDelete();
    } else {
      this.askLeave();
    }
  },

  askDelete() {
    const room = this.data.room;
    if (!room) return;
    this.setData({ showDelete: true, pendingDeleteName: room.name, dissolveLeft: 10 });
    this.stopDissolveCountdown();
    this._dissolveTimer = setInterval(() => {
      const left = this.data.dissolveLeft - 1;
      if (left <= 0) {
        this.stopDissolveCountdown();
        this.setData({ dissolveLeft: 0 });
      } else {
        this.setData({ dissolveLeft: left });
      }
    }, 1000);
  },
  stopDissolveCountdown() {
    if (this._dissolveTimer) {
      clearInterval(this._dissolveTimer);
      this._dissolveTimer = null;
    }
  },
  cancelDelete() {
    this.stopDissolveCountdown();
    this.setData({ showDelete: false, dissolveLeft: 0 });
  },
  confirmDelete() {
    if (this.data.dissolveLeft > 0) return;
    const room = this.data.room;
    this.cancelDelete();
    if (!room) return;
    call("room.delete", { roomId: room.id })
      .then(() => {
        wx.showToast({ title: "已解散自习室", icon: "none" });
        return this.refresh();
      })
      .catch((err) => wx.showToast({ title: err.message || "操作失败", icon: "none" }));
  },

  // ===== 退出 =====
  askLeave() {
    const room = this.data.room;
    if (!room) return;
    this.setData({ showLeave: true, pendingLeaveName: room.name });
  },
  closeLeave() {
    this.setData({ showLeave: false });
  },
  confirmLeave() {
    const room = this.data.room;
    this.setData({ showLeave: false });
    if (!room) return;
    call("room.leave", { roomId: room.id })
      .then(() => {
        wx.showToast({ title: "已退出自习室", icon: "none" });
        return this.refresh();
      })
      .catch((err) => wx.showToast({ title: err.message || "退出失败", icon: "none" }));
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
});
