import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".open-next");
const assetsDir = path.join(outDir, "assets");
fs.mkdirSync(assetsDir, { recursive: true });

const appJs = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
const seed = JSON.parse(fs.readFileSync(path.join(root, "data", "state.json"), "utf8"));

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>每日日报统计</title>
    <link rel="stylesheet" href="/styles.css?v=worker-1" />
  </head>
  <body>
    <main id="app" class="app"></main>
    <script src="/app.js?v=worker-1"></script>
  </body>
</html>`;

const worker = `const HTML = ${JSON.stringify(html)};
const APP_JS = ${JSON.stringify(appJs)};
const STYLES_CSS = ${JSON.stringify(stylesCss)};
const SEED_STATE = ${JSON.stringify(seed)};

const API_BASE = "https://open.feishu.cn/open-apis";
const ROLE_NAMES = {
  green: "绿色负责人",
  blue: "蓝色负责人",
  purple: "紫色负责人",
  orange: "橙色负责人"
};
const FIELD_NAMES = {
  date: "日期",
  role: "角色",
  roleName: "角色名称",
  data: "数据JSON",
  submitted: "已提交",
  updatedAt: "更新时间"
};
const REQUIRED_FIELDS = [
  FIELD_NAMES.date,
  FIELD_NAMES.role,
  FIELD_NAMES.roleName,
  FIELD_NAMES.data,
  FIELD_NAMES.submitted,
  FIELD_NAMES.updatedAt
];
const TEXT_FIELD_TYPE = 1;
const tokenCache = { value: "", expiresAt: 0 };

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function text(payload, type) {
  return new Response(payload, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store"
    }
  });
}

function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error("Missing env: " + name);
  return value;
}

function feishuConfig(env) {
  return {
    appId: requireEnv(env, "FEISHU_APP_ID"),
    appSecret: requireEnv(env, "FEISHU_APP_SECRET"),
    appToken: requireEnv(env, "FEISHU_BASE_APP_TOKEN"),
    tableId: requireEnv(env, "FEISHU_TABLE_ID")
  };
}

function seedState() {
  return JSON.parse(JSON.stringify(SEED_STATE || { days: {} }));
}

async function feishu(pathname, { method = "GET", body, params, token } = {}) {
  const url = new URL(API_BASE + pathname);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { Authorization: "Bearer " + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || "Feishu API failed: " + method + " " + pathname);
  }
  return payload.data;
}

async function tenantToken(env) {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const { appId, appSecret } = feishuConfig(env);
  const data = await feishu("/auth/v3/tenant_access_token/internal", {
    method: "POST",
    body: {
      app_id: appId,
      app_secret: appSecret
    }
  });
  tokenCache.value = data.tenant_access_token;
  tokenCache.expiresAt = Date.now() + Math.max(60, Number(data.expire || 3600) - 120) * 1000;
  return tokenCache.value;
}

async function listFields(env, token) {
  const { appToken, tableId } = feishuConfig(env);
  const data = await feishu("/bitable/v1/apps/" + appToken + "/tables/" + tableId + "/fields", {
    token,
    params: { page_size: 100 }
  });
  return data.items || [];
}

async function ensureFields(env, token) {
  const { appToken, tableId } = feishuConfig(env);
  const fields = await listFields(env, token);
  const existing = new Set(fields.map(field => field.field_name));
  for (const fieldName of REQUIRED_FIELDS) {
    if (existing.has(fieldName)) continue;
    await feishu("/bitable/v1/apps/" + appToken + "/tables/" + tableId + "/fields", {
      method: "POST",
      token,
      body: {
        field_name: fieldName,
        type: TEXT_FIELD_TYPE
      }
    });
  }
}

async function listRecords(env, token) {
  const { appToken, tableId } = feishuConfig(env);
  const records = [];
  let pageToken = "";
  do {
    const data = await feishu("/bitable/v1/apps/" + appToken + "/tables/" + tableId + "/records", {
      token,
      params: {
        page_size: 500,
        page_token: pageToken
      }
    });
    records.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : "";
  } while (pageToken);
  return records;
}

function textValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === "object" ? item.text || item.name || "" : String(item))).join("");
  }
  if (value && typeof value === "object") return value.text || value.name || "";
  return value == null ? "" : String(value);
}

function recordsToState(records, seed) {
  const state = { days: { ...(seed.days || {}) } };
  for (const record of records) {
    const fields = record.fields || {};
    const date = textValue(fields[FIELD_NAMES.date]);
    const role = textValue(fields[FIELD_NAMES.role]);
    if (!date || !role || !ROLE_NAMES[role]) continue;
    let data = {};
    try {
      data = JSON.parse(textValue(fields[FIELD_NAMES.data]) || "{}");
    } catch {
      data = {};
    }
    state.days[date] ||= { roles: {}, submitted: {} };
    state.days[date].roles ||= {};
    state.days[date].submitted ||= {};
    state.days[date].roles[role] = data;
    state.days[date].submitted[role] = textValue(fields[FIELD_NAMES.submitted]) === "是";
  }
  return state;
}

function indexRecords(records) {
  const map = new Map();
  for (const record of records) {
    const fields = record.fields || {};
    const date = textValue(fields[FIELD_NAMES.date]);
    const role = textValue(fields[FIELD_NAMES.role]);
    if (date && role) map.set(date + "::" + role, record.record_id);
  }
  return map;
}

function recordFields(date, role, data, submitted = true) {
  return {
    [FIELD_NAMES.date]: date,
    [FIELD_NAMES.role]: role,
    [FIELD_NAMES.roleName]: ROLE_NAMES[role] || role,
    [FIELD_NAMES.data]: JSON.stringify(data || {}),
    [FIELD_NAMES.submitted]: submitted ? "是" : "否",
    [FIELD_NAMES.updatedAt]: new Date().toISOString()
  };
}

function submittedRoles(day) {
  const roles = [];
  for (const role of Object.keys(ROLE_NAMES)) {
    if (day?.submitted?.[role] || day?.roles?.[role]) roles.push(role);
  }
  return roles;
}

async function upsertSubmittedRows(env, token, incomingState, currentRecords) {
  const { appToken, tableId } = feishuConfig(env);
  const byKey = indexRecords(currentRecords);
  const creates = [];
  const updates = [];
  for (const [date, day] of Object.entries(incomingState.days || {})) {
    for (const role of submittedRoles(day)) {
      const fields = recordFields(date, role, day.roles?.[role] || {}, Boolean(day.submitted?.[role]));
      const recordId = byKey.get(date + "::" + role);
      if (recordId) updates.push({ record_id: recordId, fields });
      else creates.push({ fields });
    }
  }
  if (creates.length) {
    await feishu("/bitable/v1/apps/" + appToken + "/tables/" + tableId + "/records/batch_create", {
      method: "POST",
      token,
      body: { records: creates }
    });
  }
  if (updates.length) {
    await feishu("/bitable/v1/apps/" + appToken + "/tables/" + tableId + "/records/batch_update", {
      method: "POST",
      token,
      body: { records: updates }
    });
  }
}

async function getState(env) {
  const seed = seedState();
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET || !env.FEISHU_BASE_APP_TOKEN || !env.FEISHU_TABLE_ID) {
    return seed;
  }
  const token = await tenantToken(env);
  await ensureFields(env, token);
  const records = await listRecords(env, token);
  return recordsToState(records, seed);
}

async function mergeState(env, incomingState) {
  if (!incomingState || typeof incomingState !== "object" || !incomingState.days) {
    throw new Error("invalid state shape");
  }
  const token = await tenantToken(env);
  await ensureFields(env, token);
  const records = await listRecords(env, token);
  await upsertSubmittedRows(env, token, incomingState, records);
  return getState(env);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return text(HTML, "text/html; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        return text(APP_JS, "application/javascript; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/styles.css") {
        return text(STYLES_CSS, "text/css; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/data/state.json") {
        return json(seedState());
      }
      if (url.pathname === "/api/state" && request.method === "GET") {
        return json(await getState(env));
      }
      if (url.pathname === "/api/state" && request.method === "POST") {
        return json(await mergeState(env, await request.json()));
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return json({ ok: false, error: error.message || String(error) }, { status: 500 });
    }
  }
};
`;

fs.writeFileSync(path.join(outDir, "worker.js"), worker, "utf8");
fs.writeFileSync(path.join(assetsDir, ".keep"), "", "utf8");
console.log("Built manual worker:", path.join(outDir, "worker.js"));
