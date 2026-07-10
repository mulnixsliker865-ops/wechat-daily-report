const STORAGE_KEY = "daily-report-html-v1";

const ROLES = {
  green: {
    name: "绿色负责人",
    colorName: "绿色",
    desc: "广播、官网及其他、大众点评",
    note: "百度、大众点评、其他这几项会自动合并到最终播报的「官网及其他」里；月累计由系统自动相加。",
    fields: [
      ["broadcastLeads", "当日广播有效进线", "number"],
      ["broadcastSpend", "当日广播投放金额", "number"],
      ["baiduLeads", "当日百度有效进线", "number"],
      ["baiduSpend", "当日百度投放金额", "number"],
      ["dianpingLeads", "当日大众点评有效进线", "number"],
      ["dianpingDailySpend", "当日大众点评投放金额", "number"],
      ["otherLeads", "当日其他有效进线", "number"],
      ["otherSpend", "当日其他有效投放金额", "number"]
    ]
  },
  blue: {
    name: "蓝色负责人",
    colorName: "蓝色",
    desc: "抖音、本地推、腾讯朋友圈",
    note: "只填当日数据；本月本地推和腾讯朋友圈的累计投放、累计进线、获客成本会自动计算。",
    fields: [
      ["douyinLeads", "当日抖音有效进线", "number"],
      ["douyinSpend", "当日本地推抖音投放金额", "number"],
      ["momentsDailyLeads", "当日腾讯朋友圈有效进线", "number"],
      ["momentsDailySpend", "当日腾讯朋友圈投放金额", "number"]
    ]
  },
  purple: {
    name: "紫色负责人",
    colorName: "紫色",
    desc: "线上渠道派单、月度派单签单、明日预计派单",
    note: "只填当日派单、当日签单和明日预计；本月派单总数、签单总数会自动累计。",
    fields: [
      ["dispatchToday", "当日线上渠道派单", "number"],
      ["ordersToday", "当日签单数", "number"],
      ["dispatchTomorrow", "明日预计派单数", "number"],
      ["dispatchTomorrowNote", "明日派单说明", "text"]
    ]
  },
  orange: {
    name: "橙色负责人",
    colorName: "橙色",
    desc: "如果自然进店/自然签单由单独的人负责，就只填这一块",
    note: "只填当日自然进店和当日自然签单；本月自然进店总数、累计自然签单会自动累计。",
    fields: [
      ["naturalVisitsToday", "当日自然进店数", "number"],
      ["naturalOrdersToday", "当日自然签单数", "number"]
    ]
  }
};

const FIELD_LABELS = Object.values(ROLES)
  .flatMap(role => role.fields)
  .reduce((map, [key, label]) => ({ ...map, [key]: label }), {});

const PREVIOUS_FIELD_FALLBACKS = {
  baiduLeads: ["officialLeads"],
  baiduSpend: ["officialSpend"]
};

const MONTH_BASE_FIELDS = {
  broadcastLeadsMonth: ["broadcastLeadsMonthManual"],
  broadcastSpendMonth: ["broadcastSpendMonthManual"],
  officialLeadsMonth: ["officialLeadsMonthManual"],
  officialSpendMonth: ["officialSpendMonthManual"],
  dianpingSpendMonth: ["dianpingSpend"],
  localPushSpendMonth: ["localPushSpend"],
  localPushLeadsMonth: ["localPushLeads"],
  momentsSpendMonth: ["momentsSpend"],
  momentsLeadsMonth: ["momentsLeads"],
  dispatchMonth: ["dispatchMonth"],
  ordersMonth: ["ordersMonth"],
  naturalVisitsMonth: ["naturalVisits"],
  naturalOrdersMonth: ["naturalOrders"]
};

const app = document.querySelector("#app");

function loadState() {
  const remote = requestState("./api/state");
  if (remote) return remote;
  const seed = requestState("./data/state.json") || { days: {} };
  const local = readLocalState();
  return mergeStates(seed, local);
}

function readLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { days: {} };
  } catch {
    return { days: {} };
  }
}

function mergeStates(base, overlay) {
  const merged = { days: { ...(base?.days || {}) } };
  for (const [date, day] of Object.entries(overlay?.days || {})) {
    merged.days[date] = {
      roles: {
        ...(merged.days[date]?.roles || {}),
        ...(day.roles || {})
      },
      submitted: {
        ...(merged.days[date]?.submitted || {}),
        ...(day.submitted || {})
      }
    };
  }
  return merged;
}

function saveState(state) {
  if (sendState(state)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function requestState(url = "./api/state") {
  if (!location.protocol.startsWith("http")) return null;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send();
    if (xhr.status === 200) return JSON.parse(xhr.responseText);
  } catch {
    return null;
  }
  return null;
}

function sendState(state) {
  if (!location.protocol.startsWith("http")) return false;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "./api/state", false);
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.send(JSON.stringify(state));
    return xhr.status >= 200 && xhr.status < 300;
  } catch {
    return false;
  }
}

function todayKey() {
  const now = new Date();
  return formatDateInput(now);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cnDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function stateForDate(dateKey) {
  const state = loadState();
  state.days[dateKey] ||= { roles: {}, submitted: {} };
  saveState(state);
  return state.days[dateKey];
}

function setDate(dateKey) {
  localStorage.setItem(`${STORAGE_KEY}:current-date`, dateKey);
}

function getDate() {
  return localStorage.getItem(`${STORAGE_KEY}:current-date`) || todayKey();
}

function findPreviousData(roleId, dateKey) {
  const state = loadState();
  const dates = Object.keys(state.days)
    .filter(item => item < dateKey)
    .sort()
    .reverse();
  for (const item of dates) {
    const data = state.days[item]?.roles?.[roleId];
    if (data && Object.keys(data).length) {
      return { date: item, data };
    }
  }
  return null;
}

function previousFieldValue(previous, key) {
  if (!previous?.data) return undefined;
  if (previous.data[key] !== undefined && previous.data[key] !== "") return previous.data[key];
  for (const fallback of PREVIOUS_FIELD_FALLBACKS[key] || []) {
    if (previous.data[fallback] !== undefined && previous.data[fallback] !== "") return previous.data[fallback];
  }
  return undefined;
}

function getMergedValues(dateKey) {
  const day = stateForDate(dateKey);
  const values = {};
  for (const roleId of Object.keys(ROLES)) {
    Object.assign(values, day.roles[roleId] || {});
  }
  return computeValues(values, dateKey);
}

function num(value) {
  if (value === "" || value == null) return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value) {
  if (typeof value === "string") return value || "0";
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function div(a, b) {
  const denominator = num(b);
  if (!denominator) return 0;
  return Math.round((num(a) / denominator) * 100) / 100;
}

function computeValues(raw, dateKey) {
  const state = loadState();
  const month = dateKey.slice(0, 7);
  const monthDays = Object.keys(state.days)
    .filter(day => day.startsWith(month) && day <= dateKey)
    .sort();
  const valuesForDay = day => Object.assign({}, ...Object.values(state.days[day]?.roles || {}));
  const sumMonth = (keys, afterDate = "") =>
    monthDays.reduce((total, day) => {
      if (afterDate && day <= afterDate) return total;
      const dayValues = valuesForDay(day);
      return total + keys.reduce((sum, key) => sum + num(dayValues[key]), 0);
    }, 0);
  const latestBase = target => {
    const keys = MONTH_BASE_FIELDS[target] || [];
    for (const day of [...monthDays].reverse()) {
      const dayValues = valuesForDay(day);
      const key = keys.find(item => dayValues[item] !== undefined && dayValues[item] !== "");
      if (key) return { date: day, value: num(dayValues[key]) };
    }
    return { date: "", value: 0 };
  };
  const cumulative = (target, dailyKeys) => {
    const base = latestBase(target);
    return base.value + sumMonth(dailyKeys, base.date);
  };

  const out = { ...raw };
  out.baiduLeads = num(out.baiduLeads) || num(out.officialLeads);
  out.baiduSpend = num(out.baiduSpend) || num(out.officialSpend);
  out.dianpingDailySpend = num(out.dianpingDailySpend);
  out.dianpingLeads = num(out.dianpingLeads);
  out.otherLeads = num(out.otherLeads);
  out.otherSpend = num(out.otherSpend);
  out.officialLeadsToday = num(out.baiduLeads) + num(out.dianpingLeads) + num(out.otherLeads);
  out.officialSpendToday = num(out.baiduSpend) + num(out.dianpingDailySpend) + num(out.otherSpend);
  out.broadcastCost = div(out.broadcastSpend, out.broadcastLeads);
  out.officialCost = div(out.officialSpendToday, out.officialLeadsToday);
  out.douyinCost = div(out.douyinSpend, out.douyinLeads);
  out.totalLeadsToday = num(out.broadcastLeads) + num(out.officialLeadsToday) + num(out.douyinLeads);

  out.broadcastLeadsMonth = cumulative("broadcastLeadsMonth", ["broadcastLeads"]);
  out.broadcastSpendMonth = cumulative("broadcastSpendMonth", ["broadcastSpend"]);
  out.broadcastCostMonth = div(out.broadcastSpendMonth, out.broadcastLeadsMonth);
  out.officialLeadsMonth = cumulative("officialLeadsMonth", ["baiduLeads", "officialLeads", "dianpingLeads", "otherLeads"]);
  out.officialSpendMonth = cumulative("officialSpendMonth", ["baiduSpend", "officialSpend", "otherSpend"]);
  out.officialCostMonth = div(out.officialSpendMonth, out.officialLeadsMonth);
  out.dianpingSpendMonth = cumulative("dianpingSpendMonth", ["dianpingDailySpend"]);

  out.localPushSpendMonth = cumulative("localPushSpendMonth", ["douyinSpend"]);
  out.localPushLeadsMonth = cumulative("localPushLeadsMonth", ["douyinLeads"]);
  out.momentsSpendMonth = cumulative("momentsSpendMonth", ["momentsDailySpend"]);
  out.momentsLeadsMonth = cumulative("momentsLeadsMonth", ["momentsDailyLeads"]);
  out.localPushCost = div(out.localPushSpendMonth, out.localPushLeadsMonth);
  out.momentsCost = div(out.momentsSpendMonth, out.momentsLeadsMonth);
  out.douyinMonthCost = div(
    num(out.localPushSpendMonth) + num(out.momentsSpendMonth),
    num(out.localPushLeadsMonth) + num(out.momentsLeadsMonth)
  );
  out.dispatchMonthComputed = cumulative("dispatchMonth", ["dispatchToday"]);
  out.ordersMonthComputed = cumulative("ordersMonth", ["ordersToday"]);
  out.naturalVisitsMonthComputed = cumulative("naturalVisitsMonth", ["naturalVisitsToday"]);
  out.naturalOrdersMonthComputed = cumulative("naturalOrdersMonth", ["naturalOrdersToday"]);
  out.allSpendMonth =
    num(out.broadcastSpendMonth) +
    num(out.officialSpendMonth) +
    num(out.dianpingSpendMonth) +
    num(out.localPushSpendMonth) +
    num(out.momentsSpendMonth);
  out.allLeadsMonth =
    num(out.broadcastLeadsMonth) +
    num(out.officialLeadsMonth) +
    num(out.localPushLeadsMonth) +
    num(out.momentsLeadsMonth);
  out.allCostMonth = div(out.allSpendMonth, out.allLeadsMonth);
  return out;
}

function submittedCount(dateKey) {
  const day = stateForDate(dateKey);
  return Object.values(day.submitted || {}).filter(Boolean).length;
}

function roleStatus(dateKey) {
  const day = stateForDate(dateKey);
  return Object.keys(ROLES).map(id => ({ id, done: Boolean(day.submitted?.[id]) }));
}

function shell(title, subtitle, inner, actions = "") {
  app.innerHTML = `
    <section class="phone-shell">
      <header class="topbar">
        <div>
          <h1>${title}</h1>
          ${subtitle ? `<p>${subtitle}</p>` : ""}
        </div>
        <div class="nav-actions">${actions}</div>
      </header>
      <div class="content">${inner}</div>
    </section>
    <div id="toast" class="toast"></div>
  `;
}

function go(route) {
  location.hash = route;
}

function renderHome() {
  const dateKey = getDate();
  const cards = Object.entries(ROLES)
    .map(([id, role]) => `
      <button class="role-card ${id}" data-role="${id}">
        <span class="stripe"></span>
        <span>
          <h2>${role.name}</h2>
          <p>${role.desc}</p>
        </span>
      </button>
    `)
    .join("");

  shell(
    "每日日报统计",
    "选择身份进入填写",
    `
      <div class="date-row">
        <div class="field">
          <label>填报日期</label>
          <input id="report-date" type="date" value="${dateKey}" />
        </div>
        <button id="status-btn" class="ghost-btn">填写进度</button>
      </div>
      <div class="role-grid">${cards}</div>
      <p class="helper">每个颜色只看到自己需要填的内容；提交后可以查看填写人数和最终复制预览。</p>
    `,
    `<button id="preview-btn" class="primary-btn">复制预览</button>`
  );

  document.querySelector("#report-date").addEventListener("change", event => {
    setDate(event.target.value);
  });
  document.querySelectorAll("[data-role]").forEach(button => {
    button.addEventListener("click", () => go(`form/${button.dataset.role}`));
  });
  document.querySelector("#status-btn").addEventListener("click", () => go("status"));
  document.querySelector("#preview-btn").addEventListener("click", () => go("preview"));
}

function renderForm(roleId) {
  const role = ROLES[roleId];
  if (!role) return renderHome();
  const dateKey = getDate();
  const day = stateForDate(dateKey);
  const current = day.roles[roleId] || {};
  const previous = findPreviousData(roleId, dateKey);
  const previousLabel = previous ? `${cnDate(previous.date)}数据` : "暂无昨日数据";

  const fields = role.fields
    .map(([key, label, type]) => {
      const yesterday = previousFieldValue(previous, key);
      const input =
        type === "text"
          ? `<textarea data-field="${key}" placeholder="填写说明">${current[key] || ""}</textarea>`
          : `<input data-field="${key}" inputmode="decimal" type="number" step="0.01" value="${current[key] || ""}" />`;
      return `
        <div class="input-block ${type === "text" ? "wide" : ""}">
          <label>${label}</label>
          ${input}
          <div class="yesterday">${previousLabel}：${yesterday === undefined || yesterday === "" ? "无" : yesterday}</div>
        </div>
      `;
    })
    .join("");

  shell(
    role.name,
    `${cnDate(dateKey)} · ${role.colorName}`,
    `
      ${role.note ? `<div class="role-note">${role.note}</div>` : ""}
      <div class="form-grid">${fields}</div>
      <p class="helper">下面灰字是上一次填写的数据，只作参考，不会自动覆盖今日数据。</p>
    `,
    `
      <button id="back-btn" class="ghost-btn">返回</button>
      <button id="submit-btn" class="primary-btn">确认提交</button>
    `
  );

  document.querySelector("#back-btn").addEventListener("click", () => go(""));
  document.querySelector("#submit-btn").addEventListener("click", () => {
    const state = loadState();
    state.days[dateKey] ||= { roles: {}, submitted: {} };
    state.days[dateKey].roles[roleId] = {};
    document.querySelectorAll("[data-field]").forEach(input => {
      state.days[dateKey].roles[roleId][input.dataset.field] = input.value.trim();
    });
    state.days[dateKey].submitted[roleId] = true;
    saveState(state);
    go("status");
  });
}

function renderStatus() {
  const dateKey = getDate();
  const items = roleStatus(dateKey)
    .map(({ id, done }) => `
      <div class="progress-item ${done ? "done" : ""}">
        <span>${ROLES[id].name}</span>
        <strong>${done ? "已提交" : "未提交"}</strong>
      </div>
    `)
    .join("");

  shell(
    "填写进度",
    cnDate(dateKey),
    `
      <div class="status-card">
        <div>当前已填写人数</div>
        <div class="status-number">${submittedCount(dateKey)}</div>
        <button id="preview-entry" class="primary-btn">进入复制预览</button>
      </div>
      <div class="progress-list">${items}</div>
    `,
    `<button id="home-btn" class="ghost-btn">首页</button>`
  );

  document.querySelector("#home-btn").addEventListener("click", () => go(""));
  document.querySelector("#preview-entry").addEventListener("click", () => go("preview"));
}

function line(color, text) {
  return `<span class="mark ${color}">${text}</span>`;
}

function reportParts(dateKey, values) {
  const rows = [
    { type: "title", text: "每日日报统计" },
    { type: "subtitle", text: `${cnDate(dateKey)}引流摘要（线上）` },
    { color: "green", text: `当日广播有效进线：${fmt(num(values.broadcastLeads))}` },
    { color: "green", text: `当日广播投放金额：${fmt(num(values.broadcastSpend))}` },
    { color: "green", text: `当日广播获客成本：${fmt(values.broadcastCost)}` },
    { color: "green", text: `当日官网及其他有效进线：${fmt(values.officialLeadsToday)}` },
    { color: "green", text: `当日官网及其他投放金额：${fmt(values.officialSpendToday)}` },
    { color: "green", text: `当日官网及其他获客成本：${fmt(values.officialCost)}` },
    { color: "blue", text: `当日抖音有效进线：${fmt(num(values.douyinLeads))}` },
    { color: "blue", text: `当日本地推抖音投放金额:${fmt(num(values.douyinSpend))}` },
    { color: "blue", text: `当日抖音获客成本：${fmt(values.douyinCost)}` },
    { color: "green", text: `当日全渠道获客合计：${fmt(values.totalLeadsToday)}` },
    { color: "purple", text: `当日线上渠道派单：${fmt(num(values.dispatchToday))}` },
    { type: "sep" },
    { color: "green", text: `本月广播累计进线：${fmt(values.broadcastLeadsMonth)}` },
    { color: "green", text: `本月广播累计投放金额：${fmt(values.broadcastSpendMonth)}` },
    { color: "green", text: `本月广播累计获客成本：${fmt(values.broadcastCostMonth)}` },
    { color: "green", text: `本月官网及其他有效进线：${fmt(values.officialLeadsMonth)}` },
    { color: "green", text: `本月官网及其他累计投放金额：${fmt(values.officialSpendMonth)}` },
    { color: "green", text: `本月官网及其他获客成本：${fmt(values.officialCostMonth)}` },
    { color: "green", text: `本月大众点评累计投放：${fmt(values.dianpingSpendMonth)}` },
    { color: "blue", text: `本月本地推投放金额:${fmt(values.localPushSpendMonth)}` },
    { color: "blue", text: `本月本地推有效进线：${fmt(values.localPushLeadsMonth)}` },
    { color: "blue", text: `本月本地推获客成本：${fmt(values.localPushCost)}` },
    { color: "blue", text: `本月腾讯朋友圈投放金额：${fmt(values.momentsSpendMonth)}` },
    { color: "blue", text: `本月腾讯朋友圈有效进线：${fmt(values.momentsLeadsMonth)}` },
    { color: "blue", text: `本月腾讯朋友圈获客成本：${fmt(values.momentsCost)}` },
    { color: "blue", text: `合计抖音渠道月度总成本:${fmt(values.douyinMonthCost)}` },
    { type: "sep" },
    { color: "green", text: `本月全渠道累计投放金额：${fmt(values.allSpendMonth)}` },
    { color: "green", text: `本月全渠道累计获客成本：${fmt(values.allCostMonth)}` },
    { color: "green", text: `本月全渠道累计获客数：${fmt(values.allLeadsMonth)}` },
    { color: "purple", text: `本月派单总数：${fmt(values.dispatchMonthComputed)}` },
    { color: "purple", text: `本月签单总数:${fmt(values.ordersMonthComputed)}` },
    { color: "orange", text: `本月自然进店总数：${fmt(values.naturalVisitsMonthComputed)}` },
    { color: "orange", text: `本月累计自然签单：${fmt(values.naturalOrdersMonthComputed)}` },
    { type: "sep" },
    { color: "purple", text: `明日预计派单数：${fmt(num(values.dispatchTomorrow))}` },
    { color: "purple", text: `（${values.dispatchTomorrowNote || "0"}）` }
  ];
  return rows;
}

function plainReport(dateKey, values) {
  return reportParts(dateKey, values)
    .map(row => {
      if (row.type === "sep") return "————————————";
      return row.text;
    })
    .join("\n\n")
    .replace(/\n\n(当日|本月|合计|明日|（)/g, "\n$1")
    .replace(/\n\n————————/g, "\n\n————————");
}

function htmlReport(dateKey, values) {
  return reportParts(dateKey, values)
    .map(row => {
      if (row.type === "title") return `<span class="title">${row.text}</span>`;
      if (row.type === "subtitle") return `<span class="subtitle">${row.text}</span>`;
      if (row.type === "sep") return "————————————";
      return line(row.color, row.text);
    })
    .join("\n");
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  showToast("已复制，可以发微信群了");
}

function showToast(text) {
  const toast = document.querySelector("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1600);
}

function renderPreview() {
  const dateKey = getDate();
  const values = getMergedValues(dateKey);
  const text = plainReport(dateKey, values);
  shell(
    "复制预览",
    `${submittedCount(dateKey)} / ${Object.keys(ROLES).length} 人已提交`,
    `
      <div class="preview-wrap">
        <div class="preview-meta">
          <span>${cnDate(dateKey)}</span>
          <span>固定模板</span>
        </div>
        <article class="report-preview">${htmlReport(dateKey, values)}</article>
      </div>
    `,
    `
      <button id="home-btn" class="ghost-btn">首页</button>
      <button id="copy-btn" class="copy-btn">复制</button>
    `
  );

  document.querySelector("#home-btn").addEventListener("click", () => go(""));
  document.querySelector("#copy-btn").addEventListener("click", () => copyText(text));
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash) return renderHome();
  if (hash.startsWith("form/")) return renderForm(hash.split("/")[1]);
  if (hash === "status") return renderStatus();
  if (hash === "preview") return renderPreview();
  return renderHome();
}

window.addEventListener("hashchange", route);
route();
