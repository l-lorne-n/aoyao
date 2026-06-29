const historyStatus = document.querySelector("#historyStatus");
const dateInput = document.querySelector("#dateInput");
const searchDateButton = document.querySelector("#searchDateButton");
const clearDateButton = document.querySelector("#clearDateButton");
const timeline = document.querySelector("#timeline");

init();

async function init() {
  const date = new URLSearchParams(window.location.search).get("date") || "";
  if (date) dateInput.value = date;
  searchDateButton.addEventListener("click", loadHistory);
  clearDateButton.addEventListener("click", () => {
    dateInput.value = "";
    updateUrlDate("");
    loadHistory();
  });
  dateInput.addEventListener("change", () => {
    updateUrlDate(dateInput.value);
    loadHistory();
  });
  await loadHistory();
}

async function loadHistory() {
  const date = dateInput.value.trim();
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  historyStatus.textContent = "读取中";
  try {
    const payload = await fetchJson(`/api/history${query}`);
    renderTimeline(payload.events || [], payload.date || date);
  } catch (error) {
    historyStatus.textContent = error.message || "读取失败";
    timeline.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "读取失败")}</div>`;
  }
}

function renderTimeline(events, date) {
  if (!events.length) {
    historyStatus.textContent = date ? `${formatDate(date)} 没有病历记录` : "暂无可按时间展示的病历";
    timeline.innerHTML = `<div class="empty-state">没有匹配的建档或诊断记录</div>`;
    return;
  }

  historyStatus.textContent = date
    ? `${formatDate(date)} 共 ${events.length} 条记录`
    : `按时间从新到旧，共 ${events.length} 条记录`;

  const groups = groupByDate(events);
  timeline.innerHTML = groups
    .map(
      ([eventDate, items]) => `
        <div class="timeline-group">
          <div class="timeline-date">${escapeHtml(formatDate(eventDate))}</div>
          ${items.map(renderCard).join("")}
        </div>
      `
    )
    .join("");
}

function renderCard(event) {
  const recordNo = event.recordNo ? `编号 ${event.recordNo}` : `内部 #${event.recordId}`;
  const name = event.name || "未填写姓名";
  const typeText = event.eventType === "visit"
    ? `诊断 · ${event.eventLabel || ""}`.trim()
    : "首次建档";
  const summary = event.summary || "未填写";
  const summaryLabel = event.summaryLabel || "辨证";
  const metaParts = [
    recordNo,
    name,
    event.gender,
    event.age ? `${event.age}岁` : "",
    `${formatDate(event.eventDate)} · ${typeText}`,
  ].filter(Boolean);

  return `
    <a class="timeline-card" href="/records.html?id=${encodeURIComponent(event.recordId)}">
      <div class="timeline-title">
        <strong>${escapeHtml(recordNo)} · ${escapeHtml(name)}</strong>
        <span class="timeline-badge">${escapeHtml(typeText)}</span>
      </div>
      <div class="timeline-meta">${escapeHtml(metaParts.join(" · "))}</div>
      <div class="timeline-summary">${escapeHtml(summaryLabel)}：${escapeHtml(summary)}</div>
    </a>
  `;
}

function groupByDate(events) {
  const groups = [];
  let currentDate = "";
  let currentItems = [];
  for (const event of events) {
    if (event.eventDate !== currentDate) {
      if (currentItems.length) groups.push([currentDate, currentItems]);
      currentDate = event.eventDate;
      currentItems = [];
    }
    currentItems.push(event);
  }
  if (currentItems.length) groups.push([currentDate, currentItems]);
  return groups;
}

function formatDate(value) {
  const parts = String(value || "").split("-");
  if (parts.length === 3) {
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  return value || "未填写日期";
}

function updateUrlDate(date) {
  const url = new URL(window.location.href);
  if (date) {
    url.searchParams.set("date", date);
  } else {
    url.searchParams.delete("date");
  }
  window.history.replaceState(null, "", url);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `请求失败 ${response.status}`);
  }
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
