const { call } = require("../../utils/api");
const { isLoggedIn, getUser, logout } = require("../../utils/auth");

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

function formatTime(ts) {
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return "";
  return (
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

Page({
  data: {
    loggedIn: false,
    username: "",
    avatarSeed: "青",
    rooms: [],
    roomError: "",
    loading: false,

    showCreate: false,
    newName: "",
    newPwd: "",
    usePwd: false,
    creating: false,

    showJoin: false,
    joinCode: "",
    joinPwd: "",
    joining: false,

    showBoard: false,
    boardRoomId: "",
    boardRoomName: "",
    messages: [],
    msgInput: "",
    msgSending: false,
    msgError: "",
    replyToId: 0,
    replyToName: "",
    nickname: "",

    showDelete: false,
    pendingDeleteName: "",
    showLeave: false,
    pendingLeaveName: "",
  },

  onShow() {
    const loggedIn = isLoggedIn();
    const user = getUser() || {};
    this.setData({
      loggedIn,
      username: user.username || "",
      avatarSeed: user.avatarSeed || (user.username ? String(user.username).slice(0, 1) : "青"),
    });
    if (loggedIn) {
      this.loadRooms();
    } else {
      this.setData({ rooms: [], roomError: "", loading: false });
    }
  },

  onPullDownRefresh() {
    this.loadRooms().then(() => wx.stopPullDownRefresh());
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
  },

  onUserTap() {
    wx.showActionSheet({
      itemList: ["退出登录"],
      success: (res) => {
        if (res.tapIndex === 0) {
          logout();
          this.setData({ loggedIn: false, username: "", avatarSeed: "青", rooms: [] });
          wx.showToast({ title: "已退出登录", icon: "none" });
        }
      },
    });
  },

  noop() {},

  loadRooms() {
    this.setData({ loading: true });
    return call("room.listMine")
      .then((data) => {
        const rooms = (data.list || []).map((r) =>
          Object.assign({}, r, {
            isOwner: r.role === "owner",
            timeText: formatTime(r.created_at),
          })
        );
        this.setData({ rooms, roomError: "", loading: false });
      })
      .catch(() => {
        this.setData({ loading: false, roomError: "自习室加载失败，请检查网络后重试" });
      });
  },

  openCreate() {
    this.setData({ showCreate: true, newName: "", newPwd: "", usePwd: false });
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
    this.setData({ creating: true });
    call("room.create", { name, password: this.data.usePwd ? this.data.newPwd : "" })
      .then(() => {
        this.setData({ showCreate: false, newName: "", newPwd: "", usePwd: false, creating: false });
        return this.loadRooms();
      })
      .then(() => wx.showToast({ title: "自习室已创建" }))
      .catch((err) => {
        this.setData({ creating: false });
        wx.showToast({ title: err.message || "创建失败", icon: "none" });
      });
  },

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
  joinByCode() {
    const code = (this.data.joinCode || "").trim();
    if (!code) {
      wx.showToast({ title: "请输入房间号", icon: "none" });
      return;
    }
    if (this.data.joining) return;
    this.setData({ joining: true });
    call("room.join", { roomId: code, password: this.data.joinPwd })
      .then(() => {
        this.setData({ showJoin: false, joinCode: "", joinPwd: "", joining: false });
        return this.loadRooms();
      })
      .then(() => wx.showToast({ title: "已加入房间" }))
      .catch((err) => {
        this.setData({ joining: false });
        wx.showToast({ title: err.message || "加入失败", icon: "none" });
      });
  },

  askDelete(e) {
    const r = this.data.rooms[e.currentTarget.dataset.index];
    if (!r) return;
    this.setData({ showDelete: true, pendingDeleteId: r.id, pendingDeleteName: r.name });
  },
  closeDelete() {
    this.setData({ showDelete: false });
  },
  confirmDelete() {
    const id = this.data.pendingDeleteId;
    this.setData({ showDelete: false });
    if (!id) return;
    call("room.delete", { roomId: id })
      .then(() => this.loadRooms())
      .then(() => wx.showToast({ title: "已解散自习室" }))
      .catch((err) => wx.showToast({ title: err.message || "操作失败", icon: "none" }));
  },

  askLeave(e) {
    const r = this.data.rooms[e.currentTarget.dataset.index];
    if (!r) return;
    this.setData({ showLeave: true, pendingLeaveId: r.id, pendingLeaveName: r.name });
  },
  closeLeave() {
    this.setData({ showLeave: false });
  },
  confirmLeave() {
    const id = this.data.pendingLeaveId;
    this.setData({ showLeave: false });
    if (!id) return;
    call("room.leave", { roomId: id })
      .then(() => this.loadRooms())
      .then(() => wx.showToast({ title: "已退出自习室" }))
      .catch((err) => wx.showToast({ title: err.message || "退出失败", icon: "none" }));
  },

  copyRoomId(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.setClipboardData({ data: String(id) });
  },

  openBoard(e) {
    const id = e.currentTarget.dataset.id;
    const room = this.data.rooms.find((r) => String(r.id) === String(id));
    this.setData({
      showBoard: true,
      boardRoomId: id,
      boardRoomName: room ? room.name : "",
      messages: [],
      msgError: "",
      replyToId: 0,
      replyToName: "",
      nickname: this.data.username || wx.getStorageSync("commentNickname") || "",
    });
    this.loadMessages();
  },
  closeBoard() {
    this.setData({ showBoard: false });
  },
  loadMessages() {
    if (!this.data.boardRoomId) return Promise.resolve();
    return call("comment.list", { roomId: this.data.boardRoomId, page: 1, pageSize: 50 })
      .then((data) => {
        this.setData({ messages: this.buildTree(data.list || []), msgError: "" });
      })
      .catch(() => this.setData({ msgError: "留言加载失败，请检查网络后重试" }));
  },

  buildTree(rows) {
    const map = {};
    rows.forEach((row) => {
      map[String(row.id)] = Object.assign({}, row, {
        children: [],
        depth: 0,
        avatarText: row.nickname ? String(row.nickname).slice(0, 1) : "客",
        timeText: formatTime(row.created_at),
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
    Object.keys(map).forEach((key) => {
      map[key].children.sort((a, b) => Number(a.created_at) - Number(b.created_at));
    });

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
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
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
    const nickname = (this.data.nickname || "").trim() || "匿名";
    wx.setStorageSync("commentNickname", nickname);

    this.setData({ msgSending: true });
    const payload = { roomId: this.data.boardRoomId, content: text, nickname, platform: "wechat" };
    if (this.data.replyToId) payload.parentId = this.data.replyToId;

    call("comment.add", payload)
      .then(() => {
        this.setData({ msgInput: "", msgSending: false });
        this.cancelReply();
        return this.loadMessages();
      })
      .then(() => wx.showToast({ title: "留言成功" }))
      .catch(() => {
        this.setData({ msgSending: false, msgError: "留言发送失败，请稍后重试" });
      });
  },
  likeMsg(e) {
    const m = this.data.messages[e.currentTarget.dataset.index];
    if (!m) return;
    const action = m.liked ? "unlike" : "like";
    call("comment.like", { roomId: this.data.boardRoomId, id: m.id, action })
      .then((data) => {
        const messages = this.data.messages.slice();
        const i = messages.findIndex((x) => String(x.id) === String(m.id));
        if (i > -1) {
          messages[i] = Object.assign({}, messages[i], { likes: data.likes, liked: data.liked });
          this.setData({ messages });
        }
      })
      .catch((err) => wx.showToast({ title: err.message || "操作失败", icon: "none" }));
  },
  deleteMsg(e) {
    const m = this.data.messages[e.currentTarget.dataset.index];
    if (!m) return;
    wx.showModal({
      title: "删除留言",
      content: "确定要删除这条留言吗？",
      success: (res) => {
        if (!res.confirm) return;
        call("comment.delete", { roomId: this.data.boardRoomId, id: m.id })
          .then(() => this.loadMessages())
          .catch((err) => wx.showToast({ title: err.message || "删除失败", icon: "none" }));
      },
    });
  },
});
