const { db } = require("./cloudbase");
const { hashPassword, verifyPassword } = require("./password");
const { verifyToken } = require("./token");
const auth = require("./auth");
const data = require("./data");
const ai = require("./ai");
const { now, ok, fail, toPositiveInt, isValidRoomId, resolveRole, roleAdmin } = require("./utils");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_CONTENT_LENGTH = 1000;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function dbError(error) {
  const message = error && (error.message || error.error_description || error.error || error.details);
  return new Error(typeof message === "string" ? message : "数据库访问失败");
}

async function run(builder) {
  const result = await builder;
  if (result && result.error) throw dbError(result.error);
  return result;
}

async function selectRows(builder) {
  const { data } = await run(builder);
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

async function selectOne(builder) {
  const rows = await selectRows(builder);
  return rows.length ? rows[0] : null;
}

function toArray(value) {
  if (Array.isArray(value)) return value.slice();
  if (typeof value === "string" && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function publicRoom(row, extra) {
  return Object.assign(
    {
      id: row.room_no || row.id,
      name: row.name,
      owner_id: row.owner_id,
      need_password: Boolean(row.password_hash),
      join_code: row.join_code || "",
      daily_min: row.daily_min != null ? row.daily_min : 30,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    extra || {}
  );
}

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function dateKeyOf(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function parseFocusDays(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const obj = JSON.parse(value);
      return obj && typeof obj === "object" ? obj : {};
    } catch (error) {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
}

function statsFromFocusDays(fd) {
  const keys = Object.keys(fd);
  let total = 0;
  keys.forEach((k) => {
    total += Number(fd[k]) || 0;
  });
  const today = dateKeyOf(now());
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const k = dateKeyOf(Date.now() - i * 86400000);
    if ((Number(fd[k]) || 0) > 0) {
      streak += 1;
    } else if (i === 0) {
      continue;
    } else {
      break;
    }
  }
  return {
    today_minutes: Number(fd[today] || 0),
    focus_minutes: total,
    total_days: keys.length,
    streak_days: streak,
  };
}

function memberView(m) {
  const st = statsFromFocusDays(parseFocusDays(m.focus_days));
  return {
    user_id: m.user_id,
    role: m.role,
    nickname: m.nickname || "",
    joined_at: m.joined_at,
    last_active_at: m.last_active_at,
    focusing: m.focusing ? 1 : 0,
    today_minutes: st.today_minutes,
    focus_minutes: st.focus_minutes,
    total_days: st.total_days,
    streak_days: st.streak_days,
  };
}

function decorateComment(row, userId, isAdmin) {
  const likedBy = toArray(row.liked_by);
  const isOwner = Boolean(userId) && row.user_id === userId;
  const copy = Object.assign({}, row);
  delete copy.liked_by;
  copy.liked = Boolean(userId) && likedBy.indexOf(userId) > -1;
  copy.is_owner = isOwner;
  copy.can_delete = isOwner || isAdmin;
  return copy;
}

async function fetchRoomRow(roomId) {
  return selectOne(
    db
      .from("rooms_self")
      .select("room_no,join_code,daily_min,name,owner_id,password_hash,password_salt,is_deleted,created_at,updated_at")
      .eq("room_no", roomId)
      .eq("is_deleted", 0)
      .limit(1)
  );
}

async function isMember(roomId, userId) {
  if (!userId) return false;
  const rows = await selectRows(
    db
      .from("room_members_self")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .limit(1)
  );
  return rows.length > 0;
}

async function touchActive(roomId, userId) {
  if (!roomId || !userId) return;
  await run(
    db
      .from("room_members_self")
      .update({ last_active_at: now() })
      .eq("room_id", roomId)
      .eq("user_id", userId)
  );
}

async function generateRoomId() {
  for (let i = 0; i < 20; i++) {
    const roomNo = String(Math.floor(100000 + Math.random() * 900000));
    const exist = await selectRows(db.from("rooms_self").select("room_no").eq("room_no", roomNo).limit(1));
    if (!exist.length) return roomNo;
  }
  throw new Error("房间号生成失败，请重试");
}

async function generateJoinCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 20; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) code += chars[Math.floor(Math.random() * chars.length)];
    const exist = await selectRows(db.from("rooms_self").select("room_no").eq("join_code", code).limit(1));
    if (!exist.length) return code;
  }
  throw new Error("加入码生成失败，请重试");
}

async function roomCreate(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("未获取到用户身份，请稍后重试", "NO_USER");

  const name = String(params.name || "").trim();
  if (!name) return fail("请输入房间名称", "EMPTY_NAME");
  if (name.length > 60) return fail("房间名称不能超过 60 个字", "NAME_TOO_LONG");

  const password = params.password ? String(params.password) : "";
  if (password.length > 32) return fail("房间密码不能超过 32 位", "PASSWORD_TOO_LONG");

  const dailyParsed = parseInt(params.dailyMin, 10);
  const dailyMin = Number.isFinite(dailyParsed) && dailyParsed >= 0 ? dailyParsed : 30;
  const nickname = String(params.nickname || "").slice(0, 50);

  const roomId = await generateRoomId();
  const joinCode = await generateJoinCode();
  const timestamp = now();
  let hash = null;
  let salt = null;
  if (password) {
    const hashed = hashPassword(password);
    hash = hashed.hash;
    salt = hashed.salt;
  }

  await run(
    db.from("rooms_self").insert([
      {
        room_no: roomId,
        join_code: joinCode,
        daily_min: dailyMin,
        name,
        owner_id: userId,
        password_hash: hash,
        password_salt: salt,
        is_deleted: 0,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ])
  );

  await run(
    db.from("room_members_self").insert([
      {
        room_id: roomId,
        user_id: userId,
        role: "owner",
        nickname,
        joined_at: timestamp,
        last_active_at: timestamp,
        focus_days: "{}",
        focusing: 0,
      },
    ])
  );

  return ok(
    publicRoom(
      {
        room_no: roomId,
        join_code: joinCode,
        daily_min: dailyMin,
        name,
        owner_id: userId,
        password_hash: hash,
        created_at: timestamp,
        updated_at: timestamp,
      },
      { role: "owner", member_count: 1, my_focus_minutes: 0 }
    )
  );
}

async function roomJoin(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("未获取到用户身份，请稍后重试", "NO_USER");

  const code = String(params.roomId || "").trim();
  if (!code) return fail("请输入房间号或加入码", "MISSING_ROOM_ID");

  let room = null;
  if (isValidRoomId(code)) {
    room = await fetchRoomRow(code);
  }
  if (!room) {
    room = await selectOne(
      db
        .from("rooms_self")
        .select("room_no,join_code,daily_min,name,owner_id,password_hash,password_salt,is_deleted,created_at,updated_at")
        .eq("join_code", code.toUpperCase())
        .eq("is_deleted", 0)
        .limit(1)
    );
  }
  if (!room) return fail("房间不存在或已解散", "ROOM_NOT_FOUND");

  if (room.password_hash) {
    const passed = verifyPassword(params.password || "", room.password_salt, room.password_hash);
    if (!passed) return fail("房间密码不正确", "WRONG_PASSWORD");
  }

  const roomNo = room.room_no;
  const nickname = String(params.nickname || "").slice(0, 50);
  const existing = await selectRows(
    db.from("room_members_self").select("role").eq("room_id", roomNo).eq("user_id", userId).limit(1)
  );

  if (!existing.length) {
    await run(
      db.from("room_members_self").insert([
        {
          room_id: roomNo,
          user_id: userId,
          role: "member",
          nickname,
          joined_at: now(),
          last_active_at: now(),
          focus_days: "{}",
          focusing: 0,
        },
      ])
    );
  } else if (nickname) {
    await run(
      db.from("room_members_self").update({ nickname, last_active_at: now() }).eq("room_id", roomNo).eq("user_id", userId)
    );
  } else {
    await touchActive(roomNo, userId);
  }

  const role = existing.length ? existing[0].role : "member";
  return ok(publicRoom(room, { role }));
}

async function roomListMine(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return ok({ list: [] });

  const memberships = await selectRows(
    db
      .from("room_members_self")
      .select("room_id,role,joined_at,focus_days")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
  );
  if (!memberships.length) return ok({ list: [] });

  const roomIds = memberships.map((item) => item.room_id);
  const rooms = await selectRows(
    db
      .from("rooms_self")
      .select("room_no,join_code,daily_min,name,owner_id,password_hash,is_deleted,created_at,updated_at")
      .in("room_no", roomIds)
      .eq("is_deleted", 0)
  );
  const memberRows = await selectRows(
    db.from("room_members_self").select("room_id,last_active_at").in("room_id", roomIds)
  );

  const threshold = now() - ONLINE_WINDOW_MS;
  const counts = {};
  const online = {};
  memberRows.forEach((row) => {
    counts[row.room_id] = (counts[row.room_id] || 0) + 1;
    if (row.last_active_at && Number(row.last_active_at) >= threshold) {
      online[row.room_id] = (online[row.room_id] || 0) + 1;
    }
  });
  const roleByRoom = {};
  const myFocus = {};
  memberships.forEach((item) => {
    roleByRoom[item.room_id] = item.role;
    myFocus[item.room_id] = statsFromFocusDays(parseFocusDays(item.focus_days)).focus_minutes;
  });
  const roomById = {};
  rooms.forEach((room) => {
    roomById[room.room_no] = room;
  });

  const list = roomIds
    .map((id) => {
      const room = roomById[id];
      if (!room) return null;
      return publicRoom(room, {
        role: roleByRoom[id] || "member",
        member_count: counts[id] || 0,
        online_count: online[id] || 0,
        my_focus_minutes: myFocus[id] || 0,
      });
    })
    .filter(Boolean);

  return ok({ list });
}

async function roomGet(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!roomId) return fail("缺少房间号", "MISSING_ROOM_ID");
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");

  const room = await fetchRoomRow(roomId);
  if (!room) return fail("房间不存在或已解散", "ROOM_NOT_FOUND");

  const membersRaw = await selectRows(
    db
      .from("room_members_self")
      .select("user_id,role,nickname,joined_at,last_active_at,focus_days,focusing")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true })
  );
  const mine = membersRaw.find((item) => item.user_id === userId);
  if (!mine) return fail("你不是该房间成员", "NOT_MEMBER");

  await touchActive(roomId, userId);

  const members = membersRaw
    .map(memberView)
    .sort((a, b) => b.focus_minutes - a.focus_minutes || a.joined_at - b.joined_at);
  const focusingCount = members.filter((m) => m.focusing === 1).length;
  const myRank = members.findIndex((m) => m.user_id === userId) + 1;
  const me = members.find((m) => m.user_id === userId);

  return ok(
    publicRoom(room, {
      role: mine.role,
      member_count: members.length,
      focusing_count: focusingCount,
      my_rank: myRank,
      my_focus_minutes: me ? me.focus_minutes : 0,
      members,
    })
  );
}

async function roomLeave(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");

  const room = await fetchRoomRow(roomId);
  if (!room) return fail("房间不存在或已解散", "ROOM_NOT_FOUND");
  if (room.owner_id === userId) return fail("房主不能退出，请直接解散房间", "OWNER_CANNOT_LEAVE");

  await run(
    db.from("room_members_self").delete().eq("room_id", roomId).eq("user_id", userId)
  );
  return ok({ roomId });
}

async function roomDelete(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");

  const room = await fetchRoomRow(roomId);
  if (!room) return fail("房间不存在或已解散", "ROOM_NOT_FOUND");
  if (room.owner_id !== userId) return fail("只有房主可以解散房间", "FORBIDDEN");

  const timestamp = now();
  await run(db.from("rooms_self").update({ is_deleted: 1, updated_at: timestamp }).eq("room_no", roomId));
  await run(db.from("room_members_self").delete().eq("room_id", roomId));
  await run(
    db.from("comments_self").update({ is_deleted: 1, updated_at: timestamp }).eq("project_id", roomId)
  );
  return ok({ roomId });
}

async function roomKick(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  const target = String(params.targetUserId || params.userId || "").trim();
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");
  if (!target) return fail("缺少成员", "MISSING_TARGET");

  const room = await fetchRoomRow(roomId);
  if (!room) return fail("房间不存在或已解散", "ROOM_NOT_FOUND");
  if (room.owner_id !== userId) return fail("只有房主可以移出成员", "FORBIDDEN");
  if (target === userId) return fail("不能移出自己", "INVALID_TARGET");

  await run(db.from("room_members_self").delete().eq("room_id", roomId).eq("user_id", target));
  return ok({ roomId, target });
}

async function roomFocusStart(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!userId || !isValidRoomId(roomId)) return ok({});
  await run(
    db
      .from("room_members_self")
      .update({ focusing: 1, last_active_at: now() })
      .eq("room_id", roomId)
      .eq("user_id", userId)
  );
  return ok({ roomId });
}

async function roomRecordFocus(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  const minutes = Math.max(0, Math.floor(Number(params.minutes || 0)));
  if (!userId || !isValidRoomId(roomId)) return ok({ roomId, minutes: 0 });

  const m = await selectOne(
    db.from("room_members_self").select("focus_days").eq("room_id", roomId).eq("user_id", userId).limit(1)
  );
  if (!m) return fail("你不是该房间成员", "NOT_MEMBER");

  const fd = parseFocusDays(m.focus_days);
  if (minutes > 0) {
    const today = dateKeyOf(now());
    fd[today] = (Number(fd[today]) || 0) + minutes;
  }

  await run(
    db
      .from("room_members_self")
      .update({ focus_days: JSON.stringify(fd), focusing: 0, last_active_at: now() })
      .eq("room_id", roomId)
      .eq("user_id", userId)
  );
  return ok({ roomId, minutes });
}

async function commentList(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");
  if (!(await isMember(roomId, userId))) return fail("你不是该房间成员", "NOT_MEMBER");
  await touchActive(roomId, userId);

  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, toPositiveInt(params.pageSize, DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const rootsResult = await run(
    db
      .from("comments_self")
      .select("*", { count: "exact" })
      .eq("project_id", roomId)
      .eq("is_deleted", 0)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1)
  );
  const roots = Array.isArray(rootsResult.data) ? rootsResult.data : [];
  const total = typeof rootsResult.count === "number" ? rootsResult.count : roots.length;

  const rootIds = roots.map((row) => row.id);
  let replies = [];
  if (rootIds.length) {
    replies = await selectRows(
      db
        .from("comments_self")
        .select("*")
        .eq("project_id", roomId)
        .eq("is_deleted", 0)
        .in("root_id", rootIds)
        .order("created_at", { ascending: true })
    );
  }

  const isAdmin = resolveRole(userId) === roleAdmin();
  const list = roots.concat(replies).map((row) => decorateComment(row, userId, isAdmin));

  return ok({
    list,
    total,
    page,
    pageSize,
    hasMore: offset + roots.length < total,
  });
}

async function commentAdd(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");
  if (!(await isMember(roomId, userId))) return fail("你不是该房间成员", "NOT_MEMBER");
  await touchActive(roomId, userId);

  const content = String(params.content || "").trim();
  if (!content) return fail("留言内容不能为空", "EMPTY_CONTENT");
  if (content.length > MAX_CONTENT_LENGTH) {
    return fail(`留言内容不能超过 ${MAX_CONTENT_LENGTH} 个字`, "CONTENT_TOO_LONG");
  }

  const role = resolveRole(userId);
  const nickname = String(params.nickname || "").trim().slice(0, 50) || "匿名";
  const avatar = params.avatar ? String(params.avatar).slice(0, 500) : null;
  const platform = String(params.platform || ctx.platform || "wechat").slice(0, 20);
  const parentId =
    params.parentId === undefined || params.parentId === null || params.parentId === ""
      ? null
      : params.parentId;

  let rootId = null;
  let replyToName = null;
  if (parentId !== null) {
    const parent = await selectOne(
      db
        .from("comments_self")
        .select("id,root_id,nickname")
        .eq("id", parentId)
        .eq("project_id", roomId)
        .eq("is_deleted", 0)
        .limit(1)
    );
    if (!parent) return fail("被回复的留言不存在或已删除", "PARENT_NOT_FOUND");
    rootId = parent.root_id === null ? parent.id : parent.root_id;
    replyToName = parent.nickname;
  }

  const timestamp = now();
  const inserted = await selectRows(
    db
      .from("comments_self")
      .insert([
        {
          project_id: roomId,
          parent_id: parentId,
          root_id: rootId,
          reply_to_name: replyToName,
          nickname,
          avatar,
          content,
          user_id: userId,
          role,
          platform,
          likes: 0,
          liked_by: "[]",
          is_deleted: 0,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ])
      .select()
  );

  const row =
    inserted[0] ||
    {
      project_id: roomId,
      parent_id: parentId,
      root_id: rootId,
      reply_to_name: replyToName,
      nickname,
      avatar,
      content,
      user_id: userId,
      role,
      platform,
      likes: 0,
      created_at: timestamp,
    };

  const decorated = decorateComment(row, userId, resolveRole(userId) === roleAdmin());
  decorated.is_owner = true;
  decorated.can_delete = true;
  return ok(decorated);
}

async function commentDelete(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");
  if (!(await isMember(roomId, userId))) return fail("你不是该房间成员", "NOT_MEMBER");

  const id = params.id;
  if (id === undefined || id === null || id === "") return fail("缺少留言 id", "MISSING_ID");

  const found = await selectOne(
    db.from("comments_self").select("id,user_id").eq("id", id).eq("project_id", roomId).limit(1)
  );
  if (!found) return fail("留言不存在", "NOT_FOUND");

  const isAdmin = resolveRole(userId) === roleAdmin();
  if (!isAdmin && (!userId || String(found.user_id || "") !== userId)) {
    return fail("只能删除自己的留言", "FORBIDDEN");
  }

  const timestamp = now();
  await run(
    db.from("comments_self").update({ is_deleted: 1, updated_at: timestamp }).eq("id", id).eq("project_id", roomId)
  );
  await run(
    db.from("comments_self").update({ is_deleted: 1, updated_at: timestamp }).eq("root_id", id).eq("project_id", roomId)
  );
  return ok({ id });
}

async function commentLike(params, ctx) {
  const userId = ctx.userId || "";
  const roomId = String(params.roomId || "").trim();
  if (!isValidRoomId(roomId)) return fail("房间号不正确", "INVALID_ROOM_ID");
  if (!(await isMember(roomId, userId))) return fail("你不是该房间成员", "NOT_MEMBER");

  const id = params.id;
  if (id === undefined || id === null || id === "") return fail("缺少留言 id", "MISSING_ID");
  if (!userId) return fail("缺少用户标识，无法点赞", "MISSING_USER");

  const row = await selectOne(
    db
      .from("comments_self")
      .select("id,likes,liked_by")
      .eq("id", id)
      .eq("project_id", roomId)
      .eq("is_deleted", 0)
      .limit(1)
  );
  if (!row) return fail("留言不存在或已删除", "NOT_FOUND");

  const likedBy = toArray(row.liked_by);
  const has = likedBy.indexOf(userId) > -1;
  const action = params.action === "unlike" ? "unlike" : "like";
  let likes = row.likes || 0;
  let liked = has;

  if (action === "like" && !has) {
    likedBy.push(userId);
    likes += 1;
    liked = true;
  } else if (action === "unlike" && has) {
    likedBy.splice(likedBy.indexOf(userId), 1);
    likes = Math.max(likes - 1, 0);
    liked = false;
  }

  await run(
    db
      .from("comments_self")
      .update({ likes, liked_by: JSON.stringify(likedBy), updated_at: now() })
      .eq("id", id)
      .eq("project_id", roomId)
  );

  return ok({ id, likes, liked });
}

const handlers = {
  "auth.register": auth.register,
  "auth.login": auth.login,
  "auth.profile": auth.profile,
  "data.pull": data.pull,
  "data.saveTasks": data.saveTasks,
  "data.saveStats": data.saveStats,
  "data.saveProfile": data.saveProfile,
  "data.saveRecords": data.saveRecords,
  "data.addRecord": data.addRecord,
  "room.create": roomCreate,
  "room.join": roomJoin,
  "room.listMine": roomListMine,
  "room.get": roomGet,
  "room.leave": roomLeave,
  "room.delete": roomDelete,
  "room.kick": roomKick,
  "room.focusStart": roomFocusStart,
  "room.recordFocus": roomRecordFocus,
  "focus.start": roomFocusStart,
  "focus.record": roomRecordFocus,
  "comment.list": commentList,
  "comment.add": commentAdd,
  "comment.delete": commentDelete,
  "comment.like": commentLike,
  "ai.chat": ai.aiChat,
  "ai.insight": ai.aiInsight,
};

function parseHttpEvent(event) {
  let body = event.body;
  if (event.isBase64Encoded && body) {
    body = Buffer.from(body, "base64").toString("utf8");
  }
  let data = {};
  if (body) {
    try {
      data = typeof body === "string" ? JSON.parse(body) : body;
    } catch (error) {
      data = {};
    }
  }
  // 若 HTTP 事件没有 body（例如经网关调用，参数直接放在事件根上），回退到事件本身
  if (!body && (event.action || event.type)) data = event;
  return Object.assign({}, event.queryStringParameters || {}, data);
}

function buildContext(event, params, isHttp) {
  // 身份来源：登录签发的 token（请求体 token 或请求头 x-user-token）→ 手机号
  const headers = (event && event.headers) || {};
  const lower = {};
  Object.keys(headers).forEach((key) => {
    lower[String(key).toLowerCase()] = headers[key];
  });

  const token = String((params && params.token) || lower["x-user-token"] || "").trim();
  const phone = verifyToken(token);

  const platform = isHttp
    ? String(lower["x-user-platform"] || (params && params.platform) || "web").slice(0, 20) || "web"
    : "wechat";

  if (phone) return { platform, userId: phone };

  if (isHttp) {
    // 兼容未接登录的 Web / 鸿蒙调用（显式传身份，仅过渡用）
    const headerUserId = String(lower["x-user-id"] || "").trim();
    const bodyUserId = String((params && params.userId) || "").trim();
    return { platform, userId: headerUserId || bodyUserId };
  }

  return { platform, userId: "" };
}

function httpResponse(result) {
  return {
    statusCode: result.success ? 200 : 400,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,x-user-id,x-user-platform,x-user-token",
    },
    body: JSON.stringify(result),
  };
}

exports.main = async (event = {}, context) => {
  const isHttp = Boolean(event.httpMethod || event.requestContext || event.headers);

  if (isHttp && event.httpMethod === "OPTIONS") {
    return httpResponse(ok(null));
  }

  const params = isHttp ? parseHttpEvent(event) : event;
  const ctx = buildContext(event, params, isHttp);

  let result;
  try {
    const handler = handlers[params.action || params.type];
    if (!handler) {
      result = fail("未知操作: " + (params.action || params.type || "空"), "UNKNOWN_ACTION");
    } else {
      result = await handler(params, ctx);
    }
  } catch (error) {
    console.error("[studyRoomFunctions] error:", error);
    result = fail(error.message || "服务器内部错误", "INTERNAL_ERROR");
  }

  return isHttp ? httpResponse(result) : result;
};
