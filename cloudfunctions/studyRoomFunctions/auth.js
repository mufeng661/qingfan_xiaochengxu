const { db } = require("./cloudbase");
const { hashPassword, verifyPassword } = require("./password");
const { signToken } = require("./token");
const { now, ok, fail } = require("./utils");

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function isPhone(value) {
  return /^1[3-9]\d{9}$/.test(value);
}

function publicUser(row) {
  const username = row.username || "";
  return {
    id: row.id,
    phone: row.phone,
    username,
    nickname: username,
    avatarSeed: row.avatar_seed || username.slice(0, 1) || "青",
    bio: row.bio || "",
    created_at: row.created_at,
  };
}

async function findUser(phone) {
  const result = await db.from("users_self").select("*").eq("phone", phone).limit(1);
  if (result.error) throw new Error(result.error.message || "数据库访问失败");
  return result.data && result.data[0] ? result.data[0] : null;
}

async function register(params) {
  const phone = normalizePhone(params.phone);
  const username = String(params.username || "").trim();
  const password = String(params.password || "");

  if (username.length < 2) return fail("请输入用户名（至少 2 个字符）", "BAD_USERNAME");
  if (!isPhone(phone)) return fail("请输入正确的手机号", "BAD_PHONE");
  if (password.length < 6) return fail("密码至少 6 位", "BAD_PASSWORD");

  const exist = await findUser(phone);
  if (exist) return fail("该手机号已注册，请直接登录", "PHONE_EXISTS");

  const hashed = hashPassword(password);
  const timestamp = now();
  const insert = await db
    .from("users_self")
    .insert([
      {
        phone,
        username,
        password_hash: hashed.hash,
        password_salt: hashed.salt,
        avatar_seed: username.slice(0, 1),
        bio: "把专注，种成一片森林",
        created_at: timestamp,
        updated_at: timestamp,
      },
    ])
    .select();
  if (insert.error) throw new Error(insert.error.message || "注册失败");

  const row =
    insert.data && insert.data[0]
      ? insert.data[0]
      : { id: 0, phone, username, avatar_seed: username.slice(0, 1), bio: "把专注，种成一片森林", created_at: timestamp };

  return ok({ token: signToken(phone), user: publicUser(row) });
}

async function login(params) {
  const phone = normalizePhone(params.phone);
  const password = String(params.password || "");
  if (!isPhone(phone)) return fail("请输入正确的手机号", "BAD_PHONE");

  const row = await findUser(phone);
  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    return fail("手机号或密码错误", "BAD_CREDENTIALS");
  }
  return ok({ token: signToken(phone), user: publicUser(row) });
}

async function profile(params, ctx) {
  if (!ctx.userId) return fail("请先登录", "NOT_LOGGED_IN");
  const row = await findUser(ctx.userId);
  if (!row) return fail("账号不存在", "NOT_FOUND");
  return ok(publicUser(row));
}

module.exports = { register, login, profile };
