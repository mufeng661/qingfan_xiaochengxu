const https = require("https");
const { URL } = require("url");
const { db } = require("./cloudbase");
const { ok, fail } = require("./utils");

// 第三方大模型接入（B 方案）：OpenAI 兼容 /chat/completions。
// 密钥只存云函数环境变量，客户端不持有任何密钥。
//   AI_BASE_URL  例如 https://api.deepseek.com/v1
//   AI_API_KEY   服务商 API Key
//   AI_MODEL     例如 deepseek-chat
//   AI_TIMEOUT_MS 可选，默认 45000
const DEFAULT_TIMEOUT_MS = 45000;
const MAX_HISTORY = 12;
const MAX_CONTENT = 2000;

function aiConfig() {
  return {
    baseUrl: String(process.env.AI_BASE_URL || "").replace(/\/+$/, ""),
    apiKey: String(process.env.AI_API_KEY || ""),
    model: String(process.env.AI_MODEL || "deepseek-chat"),
    timeout: Number(process.env.AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

function aiReady() {
  const cfg = aiConfig();
  return Boolean(cfg.baseUrl && cfg.apiKey && cfg.model);
}

function requestChat(payload, cfg) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(cfg.baseUrl + "/chat/completions");
    } catch (error) {
      reject(new Error("AI_BASE_URL 配置无效"));
      return;
    }
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + cfg.apiKey,
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: cfg.timeout,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => resolve({ statusCode: res.statusCode, body: raw }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("AI 请求超时")));
    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

async function chat(messages) {
  const cfg = aiConfig();
  const res = await requestChat(
    { model: cfg.model, messages, temperature: 0.7, stream: false },
    cfg
  );
  let data = null;
  try {
    data = JSON.parse(res.body);
  } catch (error) {
    data = null;
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg =
      data && data.error && data.error.message
        ? data.error.message
        : "HTTP " + res.statusCode;
    throw new Error(msg);
  }
  const text =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  if (!text) throw new Error("AI 返回内容为空");
  return String(text).trim();
}

const SYSTEM_PROMPT = [
  "你是「青番」番茄钟 App 的 AI 助手，专注帮助用户做时间管理、番茄工作法、待办规划与专注复盘。",
  "回答要求：中文；简洁友好，可用短列表；只给可执行建议；不要编造用户没有提供的数据。",
  "当用户数据不足时，明确说明并给出通用的番茄工作法建议。",
].join("");

const PLAN_INSTRUCTION = [
  "\n\n【重要】用户正在请求制定计划/安排待办。请在正常回复的最后，追加一个 JSON 代码块（用 ```json 包裹），格式：",
  '{"todos":[{"title":"任务标题","durationMin":25,"difficulty":"easy|medium|hard"}]}',
  "要求：2-6 条、具体可执行的小任务；durationMin 取 15/25/45/60 之一。除该代码块外不要再输出其它 JSON。",
].join("");

function contextText(context) {
  if (!context) return "";
  let obj = context;
  if (typeof context === "string") {
    try {
      obj = JSON.parse(context);
    } catch (error) {
      return "";
    }
  }
  if (!obj || typeof obj !== "object") return "";
  const parts = [];
  const push = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    parts.push(label + "：" + value);
  };
  push("昵称", obj.nickname);
  push("今日专注分钟", obj.todayFocusMinutes);
  push("今日番茄数", obj.pomodoro);
  push("连续天数", obj.streak);
  push("本周专注分钟", obj.weekFocusMinutes);
  push("常见打断原因", Array.isArray(obj.interruptReasons) ? obj.interruptReasons.join("、") : "");
  if (Array.isArray(obj.tasks) && obj.tasks.length) {
    const tasks = obj.tasks.slice(0, 20).map((t) => {
      const status = t && t.status === "done" ? "已完成" : "待办";
      const title = t && t.title ? String(t.title).slice(0, 40) : "";
      return title ? title + "(" + status + ")" : "";
    });
    const text = tasks.filter(Boolean).join("，");
    if (text) parts.push("待办列表：" + text);
  }
  return parts.length ? "\n\n[用户当前数据]\n" + parts.join("\n") : "";
}

function buildMessages(params) {
  const plan = params.wantPlan === true || params.wantPlan === "true";
  const system = SYSTEM_PROMPT + (plan ? PLAN_INSTRUCTION : "") + contextText(params.context);
  const messages = [{ role: "system", content: system }];
  const history = Array.isArray(params.messages) ? params.messages : [];
  history.slice(-MAX_HISTORY).forEach((m) => {
    if (!m || typeof m.content !== "string") return;
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "";
    const content = m.content.trim();
    if (role && content) messages.push({ role, content: content.slice(0, MAX_CONTENT) });
  });
  if (messages.length < 2) {
    const prompt = String(params.prompt || "").trim();
    if (prompt) messages.push({ role: "user", content: prompt.slice(0, MAX_CONTENT) });
  }
  return messages;
}

function extractPlan(text) {
  const src = String(text || "");
  const m = src.match(/```json\s*([\s\S]*?)```/i);
  if (!m) return { reply: src.trim(), todos: [] };
  let parsed = null;
  try {
    parsed = JSON.parse(m[1]);
  } catch (error) {
    parsed = null;
  }
  const reply = src.replace(m[0], "").trim();
  const todos = [];
  if (parsed && Array.isArray(parsed.todos)) {
    parsed.todos.slice(0, 8).forEach((t) => {
      if (!t) return;
      const title = String(t.title || "").trim().slice(0, 60);
      if (!title) return;
      let dur = parseInt(t.durationMin, 10);
      if (!Number.isFinite(dur) || dur < 1 || dur > 600) dur = 25;
      const diff = t.difficulty === "easy" || t.difficulty === "hard" ? t.difficulty : "medium";
      todos.push({ title, durationMin: dur, difficulty: diff });
    });
  }
  return { reply: reply || src.trim(), todos };
}

function limits() {
  return {
    daily: Number(process.env.AI_DAILY_LIMIT || 50) || 50,
    interval: Number(process.env.AI_MIN_INTERVAL_MS || 8000) || 8000,
  };
}

function dateKey() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

async function readUsage(userId, day) {
  const res = await db
    .from("ai_usage_self")
    .select("id,used,last_at")
    .eq("user_id", userId)
    .eq("usage_date", day)
    .limit(1);
  if (res && res.error) {
    const e = res.error;
    throw new Error("readUsage: " + (e.message || e.error_description || e.error || JSON.stringify(e)));
  }
  const data = res && res.data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.length ? rows[0] : null;
}

async function checkAndCount(userId) {
  const { daily, interval } = limits();
  const day = dateKey();
  const nowTs = Date.now();
  try {
    const row = await readUsage(userId, day);
    if (row) {
      if ((row.used || 0) >= daily) {
        return {
          ok: false,
          code: "AI_QUOTA_EXCEEDED",
          message: "今日 AI 次数已用完（" + daily + " 次），明天再来吧",
        };
      }
      if (row.last_at && nowTs - row.last_at < interval) {
        const wait = Math.max(1, Math.ceil((interval - (nowTs - row.last_at)) / 1000));
        return { ok: false, code: "AI_RATE_LIMIT", message: "操作太快啦，请 " + wait + " 秒后再试" };
      }
      await db
        .from("ai_usage_self")
        .update({ used: (row.used || 0) + 1, last_at: nowTs, updated_at: nowTs })
        .eq("id", row.id);
    } else {
      await db.from("ai_usage_self").insert([
        {
          user_id: userId,
          usage_date: day,
          used: 1,
          last_at: nowTs,
          created_at: nowTs,
          updated_at: nowTs,
        },
      ]);
    }
    return { ok: true };
  } catch (error) {
    console.error("[studyRoomFunctions] ai usage check error:", error && error.message);
    return { ok: true };
  }
}

async function aiChat(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录后再使用 AI 助手", "NO_USER");
  if (!aiReady()) return fail("AI 服务尚未配置", "AI_NOT_CONFIGURED");
  const messages = buildMessages(params);
  if (messages.length < 2) return fail("请输入你想问的内容", "EMPTY_PROMPT");
  const gate = await checkAndCount(userId);
  if (!gate.ok) return fail(gate.message, gate.code);
  try {
    const reply = await chat(messages);
    const parsed = extractPlan(reply);
    return ok({ reply: parsed.reply, todos: parsed.todos });
  } catch (error) {
    console.error("[studyRoomFunctions] ai.chat error:", error.message);
    return fail("AI 暂时不可用：" + (error.message || "请稍后重试"), "AI_ERROR");
  }
}

const INSIGHT_PROMPT =
  "请根据下方用户数据，生成一段 80 字以内的专注分析报告：先给一句结论，再给 1-2 条具体可执行的改进建议。语气鼓励、不啰嗦。";

async function aiInsight(params, ctx) {
  const userId = ctx.userId || "";
  if (!userId) return fail("请先登录后再使用 AI 助手", "NO_USER");
  if (!aiReady()) return fail("AI 服务尚未配置", "AI_NOT_CONFIGURED");
  const gate = await checkAndCount(userId);
  if (!gate.ok) return fail(gate.message, gate.code);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT + contextText(params.context) },
    { role: "user", content: String(params.prompt || INSIGHT_PROMPT).slice(0, MAX_CONTENT) },
  ];
  try {
    const reply = await chat(messages);
    return ok({ reply });
  } catch (error) {
    console.error("[studyRoomFunctions] ai.insight error:", error.message);
    return fail("AI 暂时不可用：" + (error.message || "请稍后重试"), "AI_ERROR");
  }
}

module.exports = { aiChat, aiInsight, aiReady };
