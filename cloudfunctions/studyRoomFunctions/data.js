const { db } = require("./cloudbase");
const { now, ok, fail } = require("./utils");

const TABLE = "user_data_self";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) {
    try {
      const obj = JSON.parse(value);
      return Array.isArray(obj) ? obj : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function asObj(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value) {
    try {
      const obj = JSON.parse(value);
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

async function fetchRow(userId) {
  const res = await db.from(TABLE).select("*").eq("user_id", userId).limit(1);
  if (res.error) throw new Error(res.error.message || "数据库访问失败");
  return res.data && res.data[0] ? res.data[0] : null;
}

function serializePatch(patch) {
  const out = Object.assign({}, patch);
  const jsonKeys = ["tasks", "records", "stats", "profile"];
  jsonKeys.forEach((k) => {
    if (out[k] !== undefined && typeof out[k] !== "string") out[k] = JSON.stringify(out[k]);
  });
  return out;
}

async function upsert(userId, patch) {
  const row = await fetchRow(userId);
  const ts = now();
  const ser = serializePatch(patch);
  if (!row) {
    const data = Object.assign(
      { user_id: userId, tasks: "[]", records: "[]", stats: "{}", profile: "{}", updated_at: ts },
      ser
    );
    const res = await db.from(TABLE).insert([data]);
    if (res.error) throw new Error(res.error.message || "保存失败");
  } else {
    const res = await db.from(TABLE).update(Object.assign({ updated_at: ts }, ser)).eq("user_id", userId);
    if (res.error) throw new Error(res.error.message || "保存失败");
  }
}

async function pull(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录", "NOT_LOGGED_IN");
  const row = await fetchRow(userId);
  return ok({
    tasks: asArray(row && row.tasks),
    records: asArray(row && row.records),
    stats: asObj(row && row.stats),
    profile: asObj(row && row.profile),
  });
}

async function saveTasks(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录", "NOT_LOGGED_IN");
  await upsert(userId, { tasks: Array.isArray(params.tasks) ? params.tasks : [] });
  return ok({});
}

async function saveStats(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录", "NOT_LOGGED_IN");
  await upsert(userId, { stats: asObj(params.stats) });
  return ok({});
}

async function saveProfile(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录", "NOT_LOGGED_IN");
  await upsert(userId, { profile: asObj(params.profile) });
  return ok({});
}

async function saveRecords(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录", "NOT_LOGGED_IN");
  await upsert(userId, { records: Array.isArray(params.records) ? params.records : [] });
  return ok({});
}

async function addRecord(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录", "NOT_LOGGED_IN");
  if (!params.record) return fail("缺少记录", "MISSING_RECORD");
  const row = await fetchRow(userId);
  const records = asArray(row && row.records);
  records.push(params.record);
  await upsert(userId, { records });
  return ok({ count: records.length });
}

module.exports = { pull, saveTasks, saveStats, saveProfile, saveRecords, addRecord };
