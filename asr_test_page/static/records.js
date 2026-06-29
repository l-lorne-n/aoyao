const TARGET_SAMPLE_RATE = 16000;
const MAX_SECONDS = 60;

const visitMetricFields = [
  { key: "bloodPressure", label: "血压", placeholder: "", format: "bloodPressure" },
  { key: "heartRate", label: "心率", placeholder: "" },
  { key: "bloodSugar", label: "血糖", placeholder: "" },
  { key: "uricAcid", label: "尿酸", placeholder: "" },
  { key: "nightUrineCount", label: "夜尿", placeholder: "" },
];

const addressOptions = [
  "浑南区",
  "和平区",
  "大东区",
  "铁西区",
  "中海",
  "鹿特丹",
  "沈河区",
  "长白岛",
  "龙湖",
  "沈北新区",
  "苏家屯",
  "于洪区",
  "金沙湾",
  "外阜",
  "新加坡城",
  "皇姑区",
];

const addressAliases = new Map([
  ["浑南", "浑南区"],
  ["混南", "浑南区"],
  ["湖南", "浑南区"],
  ["南区", "浑南区"],
  ["南", "浑南区"],
  ["nanqu", "浑南区"],
  ["nan", "浑南区"],
  ["和平", "和平区"],
  ["平区", "和平区"],
  ["平", "和平区"],
  ["pingqu", "和平区"],
  ["ping", "和平区"],
  ["大东", "大东区"],
  ["大冬", "大东区"],
  ["东区", "大东区"],
  ["东", "大东区"],
  ["dongqu", "大东区"],
  ["dong", "大东区"],
  ["铁西", "铁西区"],
  ["铁锡", "铁西区"],
  ["西区", "铁西区"],
  ["西", "铁西区"],
  ["xiqu", "铁西区"],
  ["xi", "铁西区"],
  ["中海", "中海"],
  ["海", "中海"],
  ["hai", "中海"],
  ["鹿特丹", "鹿特丹"],
  ["路特丹", "鹿特丹"],
  ["特丹", "鹿特丹"],
  ["特单", "鹿特丹"],
  ["丹", "鹿特丹"],
  ["tedan", "鹿特丹"],
  ["沈河", "沈河区"],
  ["沈和", "沈河区"],
  ["沈合", "沈河区"],
  ["神河", "沈河区"],
  ["审河", "沈河区"],
  ["审核", "沈河区"],
  ["申河", "沈河区"],
  ["深河", "沈河区"],
  ["河区", "沈河区"],
  ["和区", "沈河区"],
  ["合区", "沈河区"],
  ["河", "沈河区"],
  ["hequ", "沈河区"],
  ["he", "沈河区"],
  ["长白岛", "长白岛"],
  ["长白", "长白岛"],
  ["白岛", "长白岛"],
  ["百岛", "长白岛"],
  ["白", "长白岛"],
  ["baidao", "长白岛"],
  ["bai", "长白岛"],
  ["龙湖", "龙湖"],
  ["湖", "龙湖"],
  ["hu", "龙湖"],
  ["沈北新区", "沈北新区"],
  ["沈北", "沈北新区"],
  ["北新区", "沈北新区"],
  ["北新", "沈北新区"],
  ["beixinqu", "沈北新区"],
  ["beixin", "沈北新区"],
  ["苏家屯", "苏家屯"],
  ["家屯", "苏家屯"],
  ["屯", "苏家屯"],
  ["jiatun", "苏家屯"],
  ["tun", "苏家屯"],
  ["于洪", "于洪区"],
  ["于红", "于洪区"],
  ["于宏", "于洪区"],
  ["宇洪", "于洪区"],
  ["余洪", "于洪区"],
  ["雨洪", "于洪区"],
  ["子红", "于洪区"],
  ["子洪", "于洪区"],
  ["洪区", "于洪区"],
  ["红区", "于洪区"],
  ["洪", "于洪区"],
  ["红", "于洪区"],
  ["hongqu", "于洪区"],
  ["hong", "于洪区"],
  ["金沙湾", "金沙湾"],
  ["沙湾", "金沙湾"],
  ["湾", "金沙湾"],
  ["shawan", "金沙湾"],
  ["wan", "金沙湾"],
  ["外阜", "外阜"],
  ["外埠", "外阜"],
  ["外服", "外阜"],
  ["外付", "外阜"],
  ["外富", "外阜"],
  ["外府", "外阜"],
  ["外父", "外阜"],
  ["外福", "外阜"],
  ["外夫", "外阜"],
  ["外复", "外阜"],
  ["外副", "外阜"],
  ["外部", "外阜"],
  ["阜", "外阜"],
  ["埠", "外阜"],
  ["fu", "外阜"],
  ["新加坡城", "新加坡城"],
  ["新加坡", "新加坡城"],
  ["加坡城", "新加坡城"],
  ["加坡", "新加坡城"],
  ["坡城", "新加坡城"],
  ["jiapocheng", "新加坡城"],
  ["jiapo", "新加坡城"],
  ["pocheng", "新加坡城"],
  ["皇姑", "皇姑区"],
  ["姑区", "皇姑区"],
  ["姑", "皇姑区"],
  ["guqu", "皇姑区"],
  ["gu", "皇姑区"],
]);

const addressPinyinMap = {
  浑: "hun",
  混: "hun",
  湖: "hun",
  南: "nan",
  和: "he",
  河: "he",
  合: "he",
  平: "ping",
  大: "da",
  东: "dong",
  冬: "dong",
  铁: "tie",
  西: "xi",
  锡: "xi",
  系: "xi",
  中: "zhong",
  海: "hai",
  鹿: "lu",
  路: "lu",
  陆: "lu",
  特: "te",
  丹: "dan",
  单: "dan",
  沈: "shen",
  神: "shen",
  深: "shen",
  审: "shen",
  申: "shen",
  身: "shen",
  核: "he",
  长: "chang",
  常: "chang",
  白: "bai",
  百: "bai",
  岛: "dao",
  龙: "long",
  隆: "long",
  湖: "hu",
  北: "bei",
  新: "xin",
  区: "qu",
  苏: "su",
  家: "jia",
  加: "jia",
  屯: "tun",
  于: "yu",
  宇: "yu",
  玉: "yu",
  鱼: "yu",
  洪: "hong",
  红: "hong",
  宏: "hong",
  虹: "hong",
  金: "jin",
  今: "jin",
  沙: "sha",
  湾: "wan",
  外: "wai",
  阜: "fu",
  埠: "fu",
  服: "fu",
  付: "fu",
  富: "fu",
  府: "fu",
  父: "fu",
  福: "fu",
  夫: "fu",
  复: "fu",
  副: "fu",
  甫: "fu",
  符: "fu",
  扶: "fu",
  部: "fu",
  坡: "po",
  城: "cheng",
  皇: "huang",
  黄: "huang",
  姑: "gu",
};

const INITIAL_VISIT_COUNT = 4;
const chineseNumbers = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
];

const dbStatus = document.querySelector("#dbStatus");
const saveStatus = document.querySelector("#saveStatus");
const backupStatus = document.querySelector("#backupStatus");
const formTitle = document.querySelector("#formTitle");
const recordList = document.querySelector("#recordList");
const addressRecordSearchInput = document.querySelector("#addressRecordSearchInput");
const searchInput = document.querySelector("#searchInput");
const saveButton = document.querySelector("#saveButton");
const deleteButton = document.querySelector("#deleteButton");
const newRecordButton = document.querySelector("#newRecordButton");
const addVisitButton = document.querySelector("#addVisitButton");
const formToolbar = document.querySelector(".form-toolbar");
const exportButton = document.querySelector("#exportButton");
const exportOverlay = document.querySelector("#exportOverlay");
const exportSearchInput = document.querySelector("#exportSearchInput");
const exportRecordList = document.querySelector("#exportRecordList");
const exportStatus = document.querySelector("#exportStatus");
const exportCloseButton = document.querySelector("#exportCloseButton");
const exportCancelButton = document.querySelector("#exportCancelButton");
const exportPdfButton = document.querySelector("#exportPdfButton");
const trashButton = document.querySelector("#trashButton");
const trashOverlay = document.querySelector("#trashOverlay");
const trashRecordList = document.querySelector("#trashRecordList");
const trashStatus = document.querySelector("#trashStatus");
const trashCloseButton = document.querySelector("#trashCloseButton");
const trashCancelButton = document.querySelector("#trashCancelButton");
const unsavedOverlay = document.querySelector("#unsavedOverlay");
const unsavedStatus = document.querySelector("#unsavedStatus");
const unsavedCloseButton = document.querySelector("#unsavedCloseButton");
const unsavedDiscardButton = document.querySelector("#unsavedDiscardButton");
const unsavedCancelButton = document.querySelector("#unsavedCancelButton");
const unsavedSaveButton = document.querySelector("#unsavedSaveButton");
const voicePanel = document.querySelector("#voicePanel");
const voiceTitle = document.querySelector("#voiceTitle");
const voiceMeta = document.querySelector("#voiceMeta");
const voiceResult = document.querySelector("#voiceResult");
const voiceAppendButton = document.querySelector("#voiceAppendButton");
const voiceReplaceButton = document.querySelector("#voiceReplaceButton");
const voiceCancelButton = document.querySelector("#voiceCancelButton");

let currentRecordId = null;
let visitCount = INITIAL_VISIT_COUNT;
let isDirty = false;
let isHydrating = false;
let currentVoiceTarget = null;
let activeVoiceButton = null;
let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let processorNode = null;
let audioChunks = [];
let currentSampleRate = 0;
let recording = false;
let startedAt = 0;
let timerId = 0;
let exportSelectedIds = new Set();
let pendingUnsavedAction = null;
let allowUnloadWithoutPrompt = false;
let pendingGamepadSaveFocusTarget = "";
let backupStatusTimer = 0;
let lastBackupStatusKey = "";

init();

async function init() {
  renderAddressOptions();
  renderVisits();
  bindEvents();
  setTodayIfEmpty();
  await refreshDbInfo();
  refreshBackupStatus();
  window.setInterval(refreshBackupStatus, 15000);
  const records = await loadRecordList();
  await loadInitialRecordFromUrl(records);
}

function bindEvents() {
  saveButton.addEventListener("click", saveRecord);
  deleteButton.addEventListener("click", deleteCurrentRecord);
  newRecordButton.addEventListener("click", () => runWithUnsavedGuard(resetForm, "新建病历前，当前病历有未保存修改。"));
  addVisitButton.addEventListener("click", addVisit);
  addressRecordSearchInput.addEventListener("input", debounce(loadRecordList, 250));
  searchInput.addEventListener("input", debounce(loadRecordList, 250));
  exportButton.addEventListener("click", openExportPanel);
  exportCloseButton.addEventListener("click", closeExportPanel);
  exportCancelButton.addEventListener("click", closeExportPanel);
  exportPdfButton.addEventListener("click", exportPdf);
  exportSearchInput.addEventListener("input", debounce(loadExportRecordList, 250));
  exportOverlay.addEventListener("click", (event) => {
    if (event.target === exportOverlay) closeExportPanel();
  });
  trashButton.addEventListener("click", openTrashPanel);
  trashCloseButton.addEventListener("click", closeTrashPanel);
  trashCancelButton.addEventListener("click", closeTrashPanel);
  trashOverlay.addEventListener("click", (event) => {
    if (event.target === trashOverlay) closeTrashPanel();
  });
  unsavedCloseButton.addEventListener("click", closeUnsavedPanel);
  unsavedCancelButton.addEventListener("click", closeUnsavedPanel);
  unsavedOverlay.addEventListener("click", (event) => {
    if (event.target === unsavedOverlay) closeUnsavedPanel();
  });
  unsavedDiscardButton.addEventListener("click", continueWithoutSaving);
  unsavedSaveButton.addEventListener("click", saveAndContinue);
  voiceAppendButton.addEventListener("click", () => applyVoiceResult("append"));
  voiceReplaceButton.addEventListener("click", () => applyVoiceResult("replace"));
  voiceCancelButton.addEventListener("click", () => closeVoicePanel());
  window.addEventListener("aoyao:save-via-gamepad", rememberGamepadSaveFocus);
  window.addEventListener("beforeunload", warnBeforeUnload);
  document.addEventListener("click", handleLinkNavigation);
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".voice-button");
    if (!button) return;
    handleVoiceButton(button);
  });
  document.querySelector("#recordForm").addEventListener("input", (event) => {
    handleFormDateSync(event);
    markDirty();
  });
  document.querySelector("#recordForm").addEventListener("change", (event) => {
    handleFormDateSync(event);
    markDirty();
  });
}

function rememberGamepadSaveFocus(event) {
  const targetId = event.detail && event.detail.target;
  const target = targetId ? document.getElementById(targetId) : null;
  const form = document.querySelector("#recordForm");
  pendingGamepadSaveFocusTarget = target instanceof HTMLElement && form && form.contains(target) ? target.id : "";
}

function consumeGamepadSaveFocusTarget() {
  const targetId = pendingGamepadSaveFocusTarget;
  pendingGamepadSaveFocusTarget = "";
  return targetId;
}

function currentFormFocusTargetId() {
  const form = document.querySelector("#recordForm");
  if (!form) return "";
  const active = document.activeElement;
  const marked = form.querySelector(".gamepad-focus");
  const target = active instanceof HTMLElement && active.id && form.contains(active) ? active : marked;
  return target instanceof HTMLElement && target.id ? target.id : "";
}

function restoreGamepadSaveFocus(targetId) {
  if (!targetId) return;
  const focusTarget = () => {
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLElement)) return false;
    document.body.classList.add("gamepad-nav-active");
    document
      .querySelectorAll(".gamepad-focus")
      .forEach((element) => element.classList.remove("gamepad-focus"));
    target.classList.add("gamepad-focus");
    target.focus({ preventScroll: true });
    return true;
  };
  const dispatchRestore = () => {
    focusTarget();
    window.dispatchEvent(new CustomEvent("aoyao:restore-gamepad-focus", {
      detail: { target: targetId },
    }));
  };
  focusTarget();
  window.requestAnimationFrame(() => window.requestAnimationFrame(dispatchRestore));
  window.setTimeout(dispatchRestore, 80);
  window.setTimeout(dispatchRestore, 180);
}

function runWithUnsavedGuard(action, message) {
  if (!isDirty) return action();
  pendingUnsavedAction = action;
  unsavedStatus.textContent = message || "当前病历有未保存修改。";
  unsavedSaveButton.disabled = false;
  unsavedDiscardButton.disabled = false;
  unsavedCancelButton.disabled = false;
  unsavedCloseButton.disabled = false;
  unsavedOverlay.hidden = false;
  window.requestAnimationFrame(() => unsavedSaveButton.focus());
}

function closeUnsavedPanel() {
  unsavedOverlay.hidden = true;
  pendingUnsavedAction = null;
}

async function continueWithoutSaving() {
  const action = pendingUnsavedAction;
  closeUnsavedPanel();
  if (action) await executeUnsavedAction(action);
}

async function saveAndContinue() {
  const action = pendingUnsavedAction;
  if (!action) {
    closeUnsavedPanel();
    return;
  }

  unsavedSaveButton.disabled = true;
  unsavedDiscardButton.disabled = true;
  unsavedCancelButton.disabled = true;
  unsavedCloseButton.disabled = true;
  unsavedStatus.textContent = "正在保存当前病历";

  const saved = await saveRecord();
  if (!saved || isDirty) {
    unsavedSaveButton.disabled = false;
    unsavedDiscardButton.disabled = false;
    unsavedCancelButton.disabled = false;
    unsavedCloseButton.disabled = false;
    unsavedStatus.textContent = "保存失败或仍有未保存修改，请处理后再继续。";
    return;
  }

  closeUnsavedPanel();
  await executeUnsavedAction(action);
}

async function executeUnsavedAction(action) {
  try {
    await action();
  } catch (error) {
    saveStatus.textContent = error.message || "操作失败";
  }
}

function warnBeforeUnload(event) {
  if (!isDirty || allowUnloadWithoutPrompt) return;
  event.preventDefault();
  event.returnValue = "";
}

function handleLinkNavigation(event) {
  const link = event.target.closest("a[href]");
  if (!link || event.defaultPrevented || !isDirty) return;
  if (link.target && link.target !== "_self") return;
  if (link.hasAttribute("download")) return;

  const rawHref = link.getAttribute("href") || "";
  if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) return;

  event.preventDefault();
  runWithUnsavedGuard(() => {
    allowUnloadWithoutPrompt = true;
    window.location.href = link.href;
  }, "离开当前页面前，当前病历有未保存修改。");
}

function renderAddressOptions() {
  const select = document.querySelector("#patientAddress");
  select.innerHTML = [`<option value=""></option>`, ...addressOptions.map((address) => `<option>${escapeHtml(address)}</option>`)].join("");
}

function renderCheckboxGroup(containerId, options, name) {
  const container = document.querySelector(`#${containerId}`);
  container.innerHTML = options
    .map(
      (option) => `
        <label>
          <input type="checkbox" name="${name}" value="${escapeHtml(option)}" />
          <span>${escapeHtml(option)}</span>
        </label>
      `
    )
    .join("");
}

function renderVisits() {
  const container = document.querySelector("#visitBlocks");
  container.innerHTML = Array.from({ length: visitCount })
    .map((_, index) => {
      const label = visitLabel(index);
      const prefix = `visit${index}`;
      return `
        <div class="visit-block">
          <div class="visit-row">
            <div class="visit-title">${label}</div>
            <div class="visit-diagnosis-field">
              ${textareaWithVoice(`${prefix}Diagnosis`, "辨证")}
            </div>
            ${textareaWithVoice(`${prefix}Plan`, "内调方案")}
            <label class="visit-date-field">
              <span>时间</span>
              <input id="${prefix}Date" type="date" />
            </label>
            <div class="visit-metrics-wrap">
              ${visitMetricsMarkup(prefix)}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
  syncFirstVisitDateFromRecordDate({ forceIfEmpty: true });
}

function addVisit() {
  const existingVisits = collectVisits();
  visitCount += 1;
  renderVisits();
  fillVisits(existingVisits);
  markDirty();
  const latest = document.querySelector(`#visit${visitCount - 1}Date`);
  if (latest) latest.scrollIntoView({ behavior: "smooth", block: "center" });
}

function visitLabel(index) {
  return `第${chineseNumbers[index] || index + 1}次`;
}

function textareaWithVoice(id, label, rows = 6) {
  return `
    <div>
      <div class="field-head">
        <label for="${id}">${label}</label>
      </div>
      <div class="voice-textarea">
        <textarea id="${id}" rows="${rows}"></textarea>
        ${voiceButtonMarkup(id, label)}
      </div>
    </div>
  `;
}

function visitMetricsMarkup(prefix) {
  return `
    <div class="visit-metrics-grid">
      ${visitMetricFields.map((field) => visitMetricMarkup(prefix, field)).join("")}
    </div>
  `;
}

function visitMetricMarkup(prefix, field) {
  const id = `${prefix}${capitalize(field.key)}`;
  const label = escapeHtml(field.label);
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  const pattern = field.format === "bloodPressure" ? "[0-9/]*" : "[0-9]*";
  return `
    <label for="${id}" class="visit-metric-field">
      <span>${label}</span>
      <div class="visit-metric-input">
        <input id="${id}" class="metric-number-input" inputmode="numeric" pattern="${pattern}" data-metric-key="${field.key}"${placeholder} />
        ${inlineVoiceButtonMarkup(id, field.label)}
      </div>
    </label>
  `;
}

function inlineVoiceButtonMarkup(id, label) {
  const safeLabel = escapeHtml(label);
  return `
    <button
      type="button"
      class="voice-button voice-icon-button voice-inline-button"
      data-target="${id}"
      data-voice-mode="number"
      data-voice-label="${safeLabel}"
      data-gamepad-skip="true"
      tabindex="-1"
      aria-label="录制${safeLabel}"
      title="录制${safeLabel}"
    ></button>
  `;
}

function voiceButtonMarkup(id, label) {
  const safeLabel = escapeHtml(label);
  return `
    <button
      type="button"
      class="voice-button voice-icon-button"
      data-target="${id}"
      data-gamepad-skip="true"
      tabindex="-1"
      aria-label="录制${safeLabel}"
      title="录制${safeLabel}"
    ></button>
  `;
}

async function refreshDbInfo() {
  try {
    const payload = await fetchJson("/api/db-info");
    dbStatus.textContent = `本地库 ${payload.recordCount || 0} 条`;
  } catch (error) {
    dbStatus.textContent = "数据库不可用";
  }
}

async function refreshBackupStatus() {
  if (!backupStatus) return;
  try {
    const payload = await fetchJson("/api/backup-status");
    updateBackupStatus(payload.backup || {});
  } catch (error) {
    updateBackupStatus({
      state: "error",
      message: "云备份状态不可用",
    });
  }
}

function backupStatusText(backup) {
  const state = backup.state || "idle";
  if (state === "success") return backup.message || "今日云备份已保存";
  if (state === "running") return backup.message || "云备份中";
  if (state === "error") return backup.message || "云备份失败，稍后自动重试";
  if (state === "disabled") return backup.message || "云备份未配置";
  return backup.message || "云备份检查中";
}

function updateBackupStatus(backup) {
  if (!backupStatus) return;
  const state = backup.state || "idle";
  const message = backupStatusText(backup);
  const statusKey = [
    state,
    message,
    backup.lastSuccessAt || "",
    backup.nextRetryAt || "",
  ].join("|");
  if (statusKey === lastBackupStatusKey) return;
  lastBackupStatusKey = statusKey;

  backupStatus.classList.remove("backup-idle", "backup-running", "backup-success", "backup-error", "compact");
  backupStatus.classList.add(`backup-${["running", "success", "error"].includes(state) ? state : "idle"}`);
  const text = backupStatus.querySelector("span");
  if (text) text.textContent = message;
  const titleParts = [message];
  if (backup.lastSuccessAt) titleParts.push(`上次成功 ${backup.lastSuccessAt}`);
  if (backup.nextRetryAt) titleParts.push(`下次重试 ${backup.nextRetryAt}`);
  backupStatus.title = titleParts.join("；");

  window.clearTimeout(backupStatusTimer);
  if (state === "success" || state === "error" || state === "disabled") {
    backupStatusTimer = window.setTimeout(() => {
      backupStatus.classList.add("compact");
    }, 5000);
  }
}

async function loadRecordList() {
  const params = recordListSearchParams();
  try {
    const payload = await fetchJson(`/api/records?${params.toString()}`);
    const records = payload.records || [];
    if (!records.length) {
      recordList.innerHTML = `<div class="record-item"><span>暂无病历</span></div>`;
      return records;
    }
    recordList.innerHTML = records
      .map(
        (record) => `
          <button class="record-item ${
            Number(record.id) === Number(currentRecordId) ? "active" : ""
          }" data-record-id="${record.id}">
            <strong><span class="record-no">${escapeHtml(displayRecordNo(record))}</span> ${escapeHtml(record.name || "未填写姓名")}</strong>
            <span>${escapeHtml([record.gender, record.age, record.recordDate].filter(Boolean).join(" · "))}</span>
            <span>${escapeHtml(record.summary || record.chiefComplaint || "未填写诊断")}</span>
          </button>
        `
      )
      .join("");
    recordList.querySelectorAll("[data-record-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextId = button.dataset.recordId;
        if (String(nextId) === String(currentRecordId)) return;
        runWithUnsavedGuard(
          () => loadRecord(nextId),
          "打开另一份病历前，当前病历有未保存修改。"
        );
      });
    });
    return records;
  } catch (error) {
    recordList.innerHTML = `<div class="record-item"><span>${escapeHtml(error.message)}</span></div>`;
    return [];
  }
}

function recordListSearchParams() {
  const params = new URLSearchParams();
  const identityQuery = addressRecordSearchInput.value.trim();
  const textQuery = searchInput.value.trim();
  const parsed = parseAddressRecordText(identityQuery);
  if (parsed.address) params.set("addressQuery", parsed.address);
  if (parsed.recordNo) params.set("recordNoQuery", parsed.recordNo);
  if (identityQuery && !parsed.address && !parsed.recordNo) params.set("identityQuery", identityQuery);
  if (textQuery) params.set("textQuery", textQuery);
  return params;
}

function displayRecordNo(record) {
  const no = record.recordNo ? `编号 ${record.recordNo}` : `内部 #${record.id}`;
  return record.address ? `${record.address} · ${no}` : no;
}

function displayAddressBucket(record) {
  return record && record.address ? record.address : "无地址";
}

function formatFormTitle(record) {
  if (!currentRecordId) return "新建病历";
  const patient = record.patient || {};
  const name = patient.name || "未填写姓名";
  const address = patient.address || record.address || "";
  const recordNo = patient.recordNo || record.recordNo || `内部 #${currentRecordId}`;
  return `病历 ${name} · ${[address, `编号 ${recordNo}`].filter(Boolean).join(" · ")}`;
}

async function openExportPanel() {
  exportOverlay.hidden = false;
  exportSearchInput.value = "";
  exportSelectedIds = new Set();
  if (currentRecordId) {
    exportSelectedIds.add(String(currentRecordId));
    exportStatus.textContent = isDirty
      ? "已默认选择当前病历；当前有未保存修改，导出的是上次保存版本。"
      : "已默认选择当前病历。";
  } else {
    exportStatus.textContent = "当前病历还未保存，保存后才能导出。";
  }
  await loadExportRecordList();
  exportSearchInput.focus();
}

function closeExportPanel() {
  exportOverlay.hidden = true;
}

async function loadExportRecordList() {
  const query = exportSearchInput.value.trim();
  try {
    const payload = await fetchJson(`/api/records?query=${encodeURIComponent(query)}`);
    renderExportRecordList(payload.records || []);
  } catch (error) {
    exportRecordList.innerHTML = `<div class="empty-export">${escapeHtml(error.message)}</div>`;
  }
}

function renderExportRecordList(records) {
  if (!records.length) {
    exportRecordList.innerHTML = `<div class="empty-export">没有匹配的已保存病历</div>`;
    updateExportStatus();
    return;
  }
  exportRecordList.innerHTML = records
    .map((record) => {
      const checked = exportSelectedIds.has(String(record.id)) ? "checked" : "";
      return `
        <label class="export-item">
          <input type="checkbox" data-export-record-id="${record.id}" ${checked} />
          <span>
            <strong>${escapeHtml(displayRecordNo(record))} · ${escapeHtml(record.name || "未填写姓名")}</strong>
            <span>${escapeHtml([record.gender, record.age, record.recordDate, record.summary || record.chiefComplaint].filter(Boolean).join(" · "))}</span>
          </span>
        </label>
      `;
    })
    .join("");
  exportRecordList.querySelectorAll("[data-export-record-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const id = String(checkbox.dataset.exportRecordId);
      if (checkbox.checked) {
        exportSelectedIds.add(id);
      } else {
        exportSelectedIds.delete(id);
      }
      updateExportStatus();
    });
  });
  updateExportStatus();
}

function updateExportStatus(message) {
  if (message) {
    exportStatus.textContent = message;
    return;
  }
  const count = exportSelectedIds.size;
  exportStatus.textContent = count ? `已选择 ${count} 条病历` : "请选择至少一条已保存病历";
}

async function exportPdf() {
  if (!exportSelectedIds.size) {
    updateExportStatus("请选择至少一条已保存病历。");
    return;
  }
  exportPdfButton.disabled = true;
  updateExportStatus("正在生成 PDF");
  try {
    const payload = await fetchJson("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(exportSelectedIds) }),
    });
    updateExportStatus(`已生成 ${payload.fileName || "PDF"}`);
    if (payload.downloadUrl) {
      window.location.href = payload.downloadUrl;
    }
  } catch (error) {
    updateExportStatus(error.message || "导出失败");
  } finally {
    exportPdfButton.disabled = false;
  }
}

async function openTrashPanel() {
  trashOverlay.hidden = false;
  trashStatus.textContent = "读取中";
  await loadTrashRecords();
}

function closeTrashPanel() {
  trashOverlay.hidden = true;
}

async function loadTrashRecords() {
  trashStatus.textContent = "读取中";
  try {
    const payload = await fetchJson("/api/trash");
    renderTrashRecordList(payload.records || []);
  } catch (error) {
    trashStatus.textContent = error.message || "读取垃圾桶失败";
    trashRecordList.innerHTML = `<div class="empty-export">读取失败</div>`;
  }
}

function renderTrashRecordList(records) {
  if (!records.length) {
    trashStatus.textContent = "垃圾桶为空";
    trashRecordList.innerHTML = `<div class="empty-export">没有已删除病历</div>`;
    return;
  }

  trashStatus.textContent = `共 ${records.length} 条已删除病历`;
  trashRecordList.innerHTML = records.map(trashRecordMarkup).join("");
  trashRecordList.querySelectorAll("[data-trash-action-id]").forEach((select) => {
    select.addEventListener("change", () => handleTrashAction(select));
  });
}

function trashRecordMarkup(record) {
  const title = [
    displayAddressBucket(record),
    record.recordNo ? `编号 ${record.recordNo}` : `内部 #${record.id}`,
    record.name || "未填写姓名",
  ].join(" · ");
  const detail = [
    record.gender,
    record.age,
    record.recordDate,
    record.deletedAt ? `删除于 ${record.deletedAt}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `
    <article class="trash-item">
      <div class="trash-card-body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail || "未填写基本信息")}</span>
        <p>${escapeHtml(record.summary || record.chiefComplaint || "未填写诊断")}</p>
      </div>
      <label class="trash-action-label">
        <span>操作</span>
        <select data-trash-action-id="${record.id}">
          <option value="">选择操作</option>
          <option value="restore">复原该病历</option>
          <option value="purge">彻底删除该病历</option>
        </select>
      </label>
    </article>
  `;
}

async function handleTrashAction(select) {
  const recordId = select.dataset.trashActionId;
  const action = select.value;
  select.value = "";
  if (!recordId || !action) return;

  if (action === "restore") {
    await restoreTrashRecord(recordId, select);
    return;
  }
  if (action === "purge") await purgeTrashRecord(recordId, select);
}

async function restoreTrashRecord(recordId, control) {
  control.disabled = true;
  trashStatus.textContent = "正在复原";
  try {
    await fetchJson(`/api/records/${recordId}/restore`, { method: "POST" });
    trashStatus.textContent = "已复原，可在左侧列表查看";
    await refreshDbInfo();
    await loadRecordList();
    await loadTrashRecords();
  } catch (error) {
    trashStatus.textContent = error.message || "复原失败";
  } finally {
    control.disabled = false;
  }
}

async function purgeTrashRecord(recordId, control) {
  if (!confirm("彻底删除该病历后无法恢复，确定要继续吗？")) return;
  control.disabled = true;
  trashStatus.textContent = "正在彻底删除";
  try {
    await fetchJson(`/api/records/${recordId}/purge`, { method: "DELETE" });
    trashStatus.textContent = "已彻底删除";
    await loadTrashRecords();
  } catch (error) {
    trashStatus.textContent = error.message || "彻底删除失败";
  } finally {
    control.disabled = false;
  }
}

async function loadRecord(id) {
  const payload = await fetchJson(`/api/records/${id}`);
  fillForm(payload.record);
  await loadRecordList();
}

async function loadInitialRecordFromUrl(records = []) {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    const latestRecord = records[0];
    if (latestRecord && latestRecord.id) {
      try {
        await loadRecord(latestRecord.id);
      } catch (error) {
        saveStatus.textContent = error.message || "无法打开最近编辑病历";
      }
    }
    return;
  }
  try {
    await loadRecord(id);
  } catch (error) {
    saveStatus.textContent = error.message || "无法打开指定病历";
  }
}

async function saveRecord() {
  const restoreFocusTarget = consumeGamepadSaveFocusTarget() || currentFormFocusTargetId();
  saveButton.disabled = true;
  saveStatus.textContent = "保存中";
  try {
    const payload = collectForm();
    const response = await fetchJson("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    fillForm(recordWithSubmittedFallback(response.record, payload));
    restoreGamepadSaveFocus(restoreFocusTarget);
    markClean(response.record.updatedAt ? `已保存 ${response.record.updatedAt}` : "已保存");
    await refreshDbInfo();
    await loadRecordList();
    return true;
  } catch (error) {
    saveStatus.textContent = error.message || "保存失败";
    return false;
  } finally {
    saveButton.disabled = false;
    restoreGamepadSaveFocus(restoreFocusTarget);
  }
}

function recordWithSubmittedFallback(record, submitted) {
  const nextRecord = record || {};
  const submittedPatient = submitted && submitted.patient ? submitted.patient : {};
  const patient = nextRecord.patient && typeof nextRecord.patient === "object" ? nextRecord.patient : {};
  if (!patient.address && submittedPatient.address) {
    patient.address = submittedPatient.address;
  }
  if (!nextRecord.address && patient.address) {
    nextRecord.address = patient.address;
  }
  nextRecord.patient = patient;
  return nextRecord;
}

async function deleteCurrentRecord() {
  if (!currentRecordId) return;
  if (!confirm("确认要删除当前病历吗？")) return;
  deleteButton.disabled = true;
  try {
    await fetchJson(`/api/records/${currentRecordId}`, { method: "DELETE" });
    resetForm();
    saveStatus.textContent = "已移入垃圾桶";
    await refreshDbInfo();
    await loadRecordList();
  } catch (error) {
    saveStatus.textContent = error.message || "删除失败";
  } finally {
    deleteButton.disabled = !currentRecordId;
  }
}

function collectForm() {
  const visits = collectVisits();
  return {
    id: currentRecordId,
    patient: {
      address: valueOf("patientAddress"),
      recordNo: valueOf("recordNo"),
      name: valueOf("patientName"),
      gender: valueOf("patientGender"),
      age: valueOf("patientAge"),
      phone: valueOf("patientPhone"),
      recordDate: valueOf("recordDate"),
    },
    chiefComplaint: firstDiagnosisSummary(visits),
    pastHistory: valueOf("pastHistory"),
    allergyHistory: valueOf("allergyHistory"),
    symptoms: [],
    vitals: {},
    menstrual: { selected: [] },
    tonguePulse: "",
    advice: { diet: [], lifestyle: [] },
    visits,
    notes: valueOf("notes"),
  };
}

function collectVisits() {
  return Array.from({ length: visitCount }).map((_, index) => ({
    label: visitLabel(index),
    date: valueOf(`visit${index}Date`),
    diagnosis: valueOf(`visit${index}Diagnosis`),
    plan: valueOf(`visit${index}Plan`),
    vitals: collectVisitVitals(index),
  }));
}

function collectVisitVitals(index) {
  const prefix = `visit${index}`;
  return Object.fromEntries(
    visitMetricFields.map((field) => [field.key, metricValueForField(field.key, valueOf(`${prefix}${capitalize(field.key)}`))])
  );
}

function firstDiagnosisSummary(visits) {
  const firstFilled = visits.find((visit) => String(visit.diagnosis || "").trim());
  return firstFilled ? firstFilled.diagnosis.trim() : "";
}

function fillForm(record) {
  isHydrating = true;
  currentRecordId = record.id || null;
  const patient = record.patient || {};
  setValue("patientAddress", patient.address || record.address || "");
  setValue("recordNo", patient.recordNo || record.recordNo || "");
  setValue("patientName", patient.name || "");
  setValue("patientGender", patient.gender || "");
  setValue("patientAge", patient.age || "");
  setValue("patientPhone", patient.phone || "");
  setValue("recordDate", patient.recordDate || "");
  setValue("pastHistory", record.pastHistory || "");
  setValue("allergyHistory", record.allergyHistory || "");
  setValue("notes", record.notes || "");

  const visits = Array.isArray(record.visits) ? record.visits : [];
  visitCount = Math.max(INITIAL_VISIT_COUNT, visits.length || INITIAL_VISIT_COUNT);
  renderVisits();
  fillVisits(visits, record.vitals || {});
  syncFirstVisitDateFromRecordDate({ forceIfEmpty: true });

  formTitle.textContent = formatFormTitle(record);
  deleteButton.disabled = !currentRecordId;
  markClean(record.updatedAt ? `已保存 ${record.updatedAt}` : "未保存");
  isHydrating = false;
}

function fillVisits(visits, legacyVitals = {}) {
  Array.from({ length: visitCount }).forEach((_, index) => {
    const visit = visits[index] || {};
    setValue(`visit${index}Date`, visit.date || "");
    setValue(`visit${index}Diagnosis`, visit.diagnosis || "");
    setValue(`visit${index}Plan`, visit.plan || "");
    fillVisitVitals(index, visit.vitals || (index === 0 ? legacyVitals : {}));
  });
}

function fillVisitVitals(index, vitals = {}) {
  const prefix = `visit${index}`;
  visitMetricFields.forEach((field) => {
    const id = `${prefix}${capitalize(field.key)}`;
    setValue(id, metricValueForField(field.key, vitals[field.key] || ""));
  });
}

function resetForm() {
  isHydrating = true;
  currentRecordId = null;
  document.querySelector("#recordForm").reset();
  visitCount = INITIAL_VISIT_COUNT;
  renderVisits();
  setTodayIfEmpty();
  formTitle.textContent = "新建病历";
  deleteButton.disabled = true;
  closeVoicePanel({ restoreFocus: false });
  markClean("未保存");
  isHydrating = false;
  loadRecordList();
}

function setTodayIfEmpty() {
  if (!valueOf("recordDate")) {
    setValue("recordDate", new Date().toISOString().slice(0, 10));
  }
  syncFirstVisitDateFromRecordDate({ forceIfEmpty: true });
}

function handleFormDateSync(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  sanitizeMetricInput(target);
  if (target.id === "recordDate") {
    syncFirstVisitDateFromRecordDate();
  } else if (target.id === "visit0Date") {
    updateFirstVisitDateAutoFlag();
  }
}

function syncFirstVisitDateFromRecordDate(options = {}) {
  const recordDate = document.querySelector("#recordDate");
  const firstVisitDate = document.querySelector("#visit0Date");
  if (!recordDate || !firstVisitDate || !recordDate.value) return;

  const shouldSync =
    options.force ||
    (options.forceIfEmpty && !firstVisitDate.value) ||
    firstVisitDate.dataset.autoFromRecordDate === "true" ||
    firstVisitDate.value === firstVisitDate.dataset.lastRecordDate;

  if (!shouldSync) return;
  firstVisitDate.value = recordDate.value;
  firstVisitDate.dataset.autoFromRecordDate = "true";
  firstVisitDate.dataset.lastRecordDate = recordDate.value;
}

function updateFirstVisitDateAutoFlag() {
  const recordDate = document.querySelector("#recordDate");
  const firstVisitDate = document.querySelector("#visit0Date");
  if (!recordDate || !firstVisitDate) return;
  firstVisitDate.dataset.autoFromRecordDate =
    firstVisitDate.value && firstVisitDate.value === recordDate.value ? "true" : "false";
  firstVisitDate.dataset.lastRecordDate = recordDate.value || "";
}

async function handleVoiceButton(button) {
  if (recording && activeVoiceButton === button) {
    await stopAndRecognize();
    return;
  }
  if (recording || activeVoiceButton || button.classList.contains("busy")) return;
  await startRecording(button);
}

async function startRecording(button) {
  try {
    closeVoicePanel({ restoreFocus: false });
    currentVoiceTarget = button.dataset.target;
    activeVoiceButton = button;
    setVoiceButtonsDisabled(true);
    button.disabled = false;
    button.classList.add("recording");
    setVoiceButtonState(button, "recording");

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    audioContext = new AudioContext();
    currentSampleRate = audioContext.sampleRate;
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    audioChunks = [];
    processorNode.onaudioprocess = (event) => {
      if (recording) {
        audioChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      }
    };
    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    startedAt = Date.now();
    recording = true;
    timerId = window.setInterval(() => {
      const seconds = elapsedSeconds();
      setVoiceButtonState(button, "recording", seconds);
      if (seconds >= MAX_SECONDS) stopAndRecognize();
    }, 500);
  } catch (error) {
    cleanupAudio();
    button.classList.remove("recording");
    setVoiceButtonState(button, "idle");
    setVoiceButtonsDisabled(false);
    activeVoiceButton = null;
    if (isDirectVoiceButton(button)) {
      showDirectVoiceStatus(microphoneError(error));
    } else {
      showVoicePanel(currentVoiceTarget, microphoneError(error), "录音失败");
    }
  }
}

async function stopAndRecognize() {
  if (!recording || !activeVoiceButton) return;
  const target = currentVoiceTarget;
  const button = activeVoiceButton;
  const seconds = elapsedSeconds();
  const wavBlob = buildWavBlob();
  cleanupAudio();
  button.classList.remove("recording");
  button.classList.add("busy");
  setVoiceButtonState(button, "busy");

  try {
    const audioBase64 = await blobToBase64(wavBlob);
    const payload = await fetchJson("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64, durationSeconds: seconds }),
    });
    if (isDirectVoiceButton(button)) {
      applyDirectVoiceResult(button, payload.text || "");
    } else {
      showVoicePanel(target, payload.text || "", `${Number(payload.audioDuration || seconds).toFixed(1)} 秒 · ${payload.latencyMs || "-"} ms`);
    }
  } catch (error) {
    if (isDirectVoiceButton(button)) {
      showDirectVoiceStatus(error.message || "识别失败");
    } else {
      showVoicePanel(target, error.message || "识别失败", "识别失败");
    }
  } finally {
    button.classList.remove("busy");
    setVoiceButtonState(button, "idle");
    setVoiceButtonsDisabled(false);
    activeVoiceButton = null;
  }
}

function setVoiceButtonState(button, state, seconds) {
  const target = button.dataset.target || "";
  const label = button.dataset.voiceLabel || document.querySelector(`label[for="${target}"]`)?.textContent.trim() || "当前文本框";
  const elapsed = Number.isFinite(seconds) ? ` ${Math.floor(seconds)} 秒` : "";
  const messages = {
    idle: `录制${label}`,
    recording: `停止录制${label}${elapsed}`,
    busy: `正在识别${label}`,
  };
  const message = messages[state] || messages.idle;
  button.dataset.voiceState = state;
  button.textContent = "";
  button.setAttribute("aria-label", message);
  button.title = message;
}

function buildWavBlob() {
  const merged = mergeChunks(audioChunks);
  const downsampled = downsampleBuffer(merged, currentSampleRate, TARGET_SAMPLE_RATE);
  const wavBuffer = encodeWav(downsampled, TARGET_SAMPLE_RATE);
  return new Blob([wavBuffer], { type: "audio/wav" });
}

function mergeChunks(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (sampleRate === outSampleRate) return buffer;
  const ratio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetBuffer = 0;
  for (let i = 0; i < newLength; i += 1) {
    const nextOffsetBuffer = Math.round((i + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let j = offsetBuffer; j < nextOffsetBuffer && j < buffer.length; j += 1) {
      accum += buffer[j];
      count += 1;
    }
    result[i] = count ? accum / count : 0;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function cleanupAudio() {
  recording = false;
  if (timerId) window.clearInterval(timerId);
  timerId = 0;
  if (processorNode) {
    processorNode.disconnect();
    processorNode.onaudioprocess = null;
  }
  if (sourceNode) sourceNode.disconnect();
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  if (audioContext) audioContext.close();
  processorNode = null;
  sourceNode = null;
  mediaStream = null;
  audioContext = null;
}

function showVoicePanel(target, text, meta) {
  currentVoiceTarget = target;
  voiceTitle.textContent = labelForTarget(target);
  voiceMeta.textContent = meta || "待确认";
  voiceResult.value = text || "";
  voicePanel.hidden = false;
  document.body.classList.add("voice-panel-open");
  window.dispatchEvent(new CustomEvent("aoyao:voice-panel-open"));
}

function applyVoiceResult(mode) {
  const target = document.getElementById(currentVoiceTarget);
  if (!target) return;
  const text = voiceResult.value.trim();
  if (mode === "replace") {
    target.value = text;
  } else if (text) {
    const separator = target instanceof HTMLTextAreaElement ? "\n" : " ";
    target.value = target.value.trim() ? `${target.value.trim()}${separator}${text}` : text;
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  markDirty();
  closeVoicePanel();
}

function isDirectAddressRecordVoice(button) {
  return button && button.dataset.voiceMode === "address-record";
}

function isDirectNumberVoice(button) {
  return button && button.dataset.voiceMode === "number";
}

function isDirectVoiceButton(button) {
  return isDirectAddressRecordVoice(button) || isDirectNumberVoice(button);
}

function applyDirectVoiceResult(button, rawText) {
  if (isDirectAddressRecordVoice(button)) {
    applyAddressRecordVoice(button, rawText);
    return;
  }
  if (isDirectNumberVoice(button)) applyNumberVoice(button, rawText);
}

function applyAddressRecordVoice(button, rawText) {
  const parsed = parseAddressRecordText(rawText);
  if (!parsed.address && !parsed.recordNo) {
    showDirectVoiceStatus(`未识别到地址或编号：${rawText || "空"}`);
    return;
  }

  if (button.dataset.voiceScope === "search") {
    addressRecordSearchInput.value = [parsed.address, parsed.recordNo].filter(Boolean).join(" ");
    showDirectVoiceStatus(`已按 ${addressRecordSearchInput.value} 搜索`);
    loadRecordList();
    return;
  }

  const changed = [];
  if (parsed.address) {
    setValue("patientAddress", parsed.address);
    changed.push(parsed.address);
  }
  if (parsed.recordNo) {
    setValue("recordNo", parsed.recordNo);
    changed.push(`编号 ${parsed.recordNo}`);
  }
  markDirty();
  showDirectVoiceStatus(`已填入${changed.join(" · ")}，有未保存修改`);
}

function applyNumberVoice(button, rawText) {
  const targetId = button.dataset.target;
  const target = targetId ? document.querySelector(`#${targetId}`) : null;
  const number =
    target instanceof HTMLInputElement && target.classList.contains("metric-number-input")
      ? metricValueForField(target.dataset.metricKey, rawText)
      : extractRecordNo(rawText);
  if (!target || !number) {
    showDirectVoiceStatus(`未识别到数字：${rawText || "空"}`);
    return;
  }

  setValue(targetId, number);
  markDirty();
  showDirectVoiceStatus(`已填入${button.dataset.voiceLabel || "数字"} ${number}，有未保存修改`);
}

function showDirectVoiceStatus(message) {
  saveStatus.textContent = message || "语音识别完成";
}

function parseAddressRecordText(value) {
  const text = String(value || "").trim();
  const normalized = normalizeAddressText(text);
  return {
    address: matchAddress(normalized, text),
    recordNo: extractRecordNo(text),
  };
}

function normalizeAddressText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[，,。.;；:：、\s]/g, "")
    .replace(/病历编号|病历号|编号|地址/g, "");
}

function matchAddress(normalizedText, rawText = "") {
  if (!normalizedText && !rawText) return "";
  const aliasEntries = addressMatchEntries();
  const directMatch = aliasEntries.find((entry) => entry.key && normalizedText.includes(entry.key));
  if (directMatch) return directMatch.address;

  const phonetic = phoneticAddressText(rawText || normalizedText);
  const phoneticMatch = aliasEntries.find((entry) => entry.phonetic && phonetic.includes(entry.phonetic));
  return phoneticMatch ? phoneticMatch.address : "";
}

function addressMatchEntries() {
  const entries = [];
  addressOptions.forEach((address) => {
    entries.push(addressMatchEntry(address, address));
  });
  addressAliases.forEach((address, alias) => {
    entries.push(addressMatchEntry(alias, address));
  });
  return entries.sort((a, b) => b.key.length - a.key.length || b.phonetic.length - a.phonetic.length);
}

function addressMatchEntry(alias, address) {
  return {
    key: normalizeAddressText(alias),
    phonetic: phoneticAddressText(alias),
    address,
  };
}

function phoneticAddressText(value) {
  return Array.from(normalizeAddressText(value))
    .map((char) => {
      if (/[a-z0-9]/.test(char)) return char;
      return addressPinyinMap[char] || "";
    })
    .join("");
}

function extractRecordNo(text) {
  const arabic = String(text || "").match(/\d+/);
  if (arabic) return arabic[0];

  const englishNumber = englishNumberToText(text);
  if (englishNumber) return englishNumber;

  const chineseNumberMatches = String(text || "").match(/[零〇一二两三四五六七八九十百千万幺]+/g);
  if (!chineseNumberMatches || !chineseNumberMatches.length) return "";
  return chineseNumberToText(chineseNumberMatches[chineseNumberMatches.length - 1]);
}

function englishNumberToText(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[，,。.;；:：、\s]/g, "");
  const mappings = new Map([
    ["zero", "0"],
    ["oh", "0"],
    ["o", "0"],
    ["one", "1"],
    ["won", "1"],
    ["two", "2"],
    ["too", "2"],
    ["to", "2"],
    ["are", "2"],
    ["r", "2"],
    ["three", "3"],
    ["four", "4"],
    ["for", "4"],
    ["five", "5"],
    ["six", "6"],
    ["seven", "7"],
    ["eight", "8"],
    ["ate", "8"],
    ["nine", "9"],
  ]);
  return mappings.get(normalized) || "";
}

function chineseNumberToText(value) {
  const text = String(value || "");
  if (!/[十百千万]/.test(text)) {
    const digits = {
      零: "0",
      "〇": "0",
      幺: "1",
      一: "1",
      二: "2",
      两: "2",
      三: "3",
      四: "4",
      五: "5",
      六: "6",
      七: "7",
      八: "8",
      九: "9",
    };
    return Array.from(text).map((char) => digits[char] || "").join("");
  }

  const digitValues = { 零: 0, "〇": 0, 幺: 1, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const unitValues = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let section = 0;
  let number = 0;
  Array.from(text).forEach((char) => {
    if (Object.hasOwn(digitValues, char)) {
      number = digitValues[char];
      return;
    }
    if (Object.hasOwn(unitValues, char)) {
      section += (number || 1) * unitValues[char];
      number = 0;
      return;
    }
    if (char === "万") {
      total += (section + number) * 10000;
      section = 0;
      number = 0;
    }
  });
  const result = total + section + number;
  return result ? String(result) : "";
}

function markDirty() {
  if (isHydrating) return;
  isDirty = true;
  formToolbar.classList.add("dirty");
  formToolbar.style.backgroundColor = "#fff3bf";
  formToolbar.style.borderBottomColor = "#e0b84d";
  saveStatus.textContent = "有未保存修改";
}

function markClean(message) {
  isDirty = false;
  formToolbar.classList.remove("dirty");
  formToolbar.style.backgroundColor = "";
  formToolbar.style.borderBottomColor = "";
  saveStatus.textContent = message || "已保存";
}

function closeVoicePanel(options = {}) {
  const shouldRestoreFocus = options.restoreFocus !== false;
  const restoreTarget = shouldRestoreFocus && !voicePanel.hidden ? currentVoiceTarget : "";
  voicePanel.hidden = true;
  voiceResult.value = "";
  currentVoiceTarget = null;
  document.body.classList.remove("voice-panel-open");
  window.dispatchEvent(new CustomEvent("aoyao:voice-panel-close", {
    detail: {
      restoreFocus: Boolean(restoreTarget),
      target: restoreTarget || "",
    },
  }));
}

function labelForTarget(target) {
  const label = document.querySelector(`label[for="${target}"]`);
  return label ? `${label.textContent.trim()}识别结果` : "识别结果";
}

function setVoiceButtonsDisabled(disabled) {
  document.querySelectorAll(".voice-button").forEach((button) => {
    button.disabled = disabled;
  });
}

function elapsedSeconds() {
  return startedAt ? (Date.now() - startedAt) / 1000 : 0;
}

function valueOf(id) {
  const element = document.querySelector(`#${id}`);
  return element ? element.value.trim() : "";
}

function setValue(id, value) {
  const element = document.querySelector(`#${id}`);
  if (!element) return;
  const nextValue = value || "";
  if (
    element instanceof HTMLSelectElement &&
    nextValue &&
    !Array.from(element.options).some((option) => option.value === nextValue)
  ) {
    element.add(new Option(nextValue, nextValue));
  }
  element.value = nextValue;
}

function checkedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(
    (input) => input.value
  );
}

function setCheckedValues(name, values) {
  const set = new Set(values || []);
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = set.has(input.value);
  });
}

function sanitizeMetricInput(element) {
  if (!(element instanceof HTMLInputElement) || !element.classList.contains("metric-number-input")) return;
  const nextValue = metricValueForField(element.dataset.metricKey, element.value);
  if (element.value !== nextValue) {
    element.value = nextValue;
  }
}

function metricValueForField(key, value) {
  if (key === "bloodPressure") return bloodPressureValue(value);
  return metricNumberValue(value);
}

function bloodPressureValue(value) {
  const text = String(value || "");
  const digitGroups = text.match(/\d+/g);
  if (digitGroups && digitGroups.length >= 2) return `${digitGroups[0]}/${digitGroups[1]}`;
  if (digitGroups && digitGroups.length === 1) return digitGroups[0];
  return extractRecordNo(text);
}

function metricNumberValue(value) {
  const text = String(value || "");
  const digitGroups = text.match(/\d+/g);
  if (digitGroups && digitGroups.length) return digitGroups.join("");
  return extractRecordNo(text);
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

async function fetchJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const message = error && error.message ? error.message : "";
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      throw new Error("连接不到本地服务，请确认 server.py 仍在运行；当前修改还在，恢复服务后再点保存。");
    }
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new Error(`接口返回异常 ${response.status}，请看启动服务的终端窗口。`);
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `请求失败 ${response.status}`);
  }
  return payload;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function microphoneError(error) {
  if (error && error.name === "NotAllowedError") {
    return "无法访问麦克风，请在浏览器设置中允许本页面使用麦克风。";
  }
  if (error && error.name === "NotFoundError") {
    return "没有检测到可用麦克风。";
  }
  return error && error.message ? error.message : "录音初始化失败。";
}

function debounce(fn, wait) {
  let id = 0;
  return (...args) => {
    window.clearTimeout(id);
    id = window.setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
