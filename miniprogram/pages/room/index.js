const { call, formatTime } = require("../../utils/api");

const ROLE_CLASS = {
  管理员: "role-admin",
  用户: "role-user",
  游客: "role-visitor",
};

Page({
  data: {
    roomId: "",
    room: null,
    members: [],
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,
    submitting: false,
    nickname: "",
    content: "",
    replyTo: null,
    isOwner: false,
    showMembers: false,
  },

  onLoad(options) {
    const roomId = (options && options.id) || "";
    this.setData({
      roomId,
      nickname: wx.getStorageSync("commentNickname") || "",
    });
    if (!roomId) {
      wx.showToast({ title: "缺少房间号", icon: "none" });
      return;
    }
    this.loadRoom();
    this.loadComments(true);
  },

  onPullDownRefresh() {
    Promise.all([this.loadRoom(), this.loadComments(true)]).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadComments(false);
    }
  },

  onShareAppMessage() {
    const room = this.data.room || {};
    return {
      title: room.name ? `邀请你加入「${room.name}」一起自习` : "邀请你加入自习室",
      path: "/pages/room-join/index?roomId=" + this.data.roomId,
    };
  },

  loadRoom() {
    if (!this.data.roomId) return Promise.resolve();
    return call("room.get", { roomId: this.data.roomId })
      .then((room) => {
        const members = (room.members || []).map((m) =>
          Object.assign({}, m, {
            roleText: m.role === "owner" ? "房主" : "成员",
            shortId: String(m.user_id || "").slice(-6),
          })
        );
        this.setData({
          room,
          members,
          isOwner: room.role === "owner",
        });
        wx.setNavigationBarTitle({ title: room.name || "自习室" });
      })
      .catch((err) => wx.showToast({ title: err.message || "房间加载失败", icon: "none" }));
  },

  loadComments(reset) {
    if (this.data.loading || !this.data.roomId) return Promise.resolve();
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    return call("comment.list", { roomId: this.data.roomId, page, pageSize: this.data.pageSize })
      .then((data) => {
        const rows = (data.list || []).map((item) =>
          Object.assign({}, item, {
            timeText: formatTime(item.created_at),
            roleClass: ROLE_CLASS[item.role] || "role-visitor",
          })
        );
        const tree = this.buildTree(rows);
        this.setData({
          list: reset ? tree : this.data.list.concat(tree),
          total: data.total || 0,
          page,
          hasMore: Boolean(data.hasMore),
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "加载失败", icon: "none" });
      });
  },

  buildTree(rows) {
    const map = {};
    rows.forEach((row) => {
      map[String(row.id)] = Object.assign({}, row, { children: [], depth: 0 });
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

  toggleMembers() {
    this.setData({ showMembers: !this.data.showMembers });
  },

  copyRoomId() {
    wx.setClipboardData({ data: this.data.roomId });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onReply(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item) return;
    this.setData({ replyTo: { id: item.id, nickname: item.nickname } });
  },

  cancelReply() {
    this.setData({ replyTo: null });
  },

  submit() {
    if (this.data.submitting) return;
    const content = (this.data.content || "").trim();
    if (!content) {
      wx.showToast({ title: "请输入内容", icon: "none" });
      return;
    }
    const nickname = (this.data.nickname || "").trim() || "匿名";
    wx.setStorageSync("commentNickname", nickname);

    const payload = { roomId: this.data.roomId, content, nickname, platform: "wechat" };
    if (this.data.replyTo) {
      payload.parentId = this.data.replyTo.id;
    }

    this.setData({ submitting: true });
    call("comment.add", payload)
      .then(() => {
        this.setData({ content: "", replyTo: null, submitting: false });
        wx.showToast({ title: "已发送" });
        return this.loadComments(true);
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || "发送失败", icon: "none" });
      });
  },

  onLike(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item) return;
    const action = item.liked ? "unlike" : "like";
    call("comment.like", { roomId: this.data.roomId, id: item.id, action })
      .then((data) => {
        const list = this.data.list.slice();
        const index = list.findIndex((x) => String(x.id) === String(item.id));
        if (index > -1) {
          list[index] = Object.assign({}, list[index], { likes: data.likes, liked: data.liked });
          this.setData({ list });
        }
      })
      .catch((err) => wx.showToast({ title: err.message || "操作失败", icon: "none" }));
  },

  onDelete(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item) return;
    wx.showModal({
      title: "删除留言",
      content: "确定要删除这条留言吗？",
      success: (res) => {
        if (!res.confirm) return;
        call("comment.delete", { roomId: this.data.roomId, id: item.id })
          .then(() => {
            wx.showToast({ title: "已删除" });
            return this.loadComments(true);
          })
          .catch((err) => wx.showToast({ title: err.message || "删除失败", icon: "none" }));
      },
    });
  },

  leaveRoom() {
    wx.showModal({
      title: "退出房间",
      content: "退出后将无法查看房间内交流，确定退出吗？",
      success: (res) => {
        if (!res.confirm) return;
        call("room.leave", { roomId: this.data.roomId })
          .then(() => {
            wx.showToast({ title: "已退出" });
            setTimeout(() => wx.navigateBack(), 600);
          })
          .catch((err) => wx.showToast({ title: err.message || "退出失败", icon: "none" }));
      },
    });
  },

  deleteRoom() {
    wx.showModal({
      title: "解散房间",
      content: "解散后房间和所有交流记录将不可见，确定解散吗？",
      success: (res) => {
        if (!res.confirm) return;
        call("room.delete", { roomId: this.data.roomId })
          .then(() => {
            wx.showToast({ title: "已解散" });
            setTimeout(() => wx.navigateBack(), 600);
          })
          .catch((err) => wx.showToast({ title: err.message || "解散失败", icon: "none" }));
      },
    });
  },
});
