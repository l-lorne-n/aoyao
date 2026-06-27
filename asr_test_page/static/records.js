const TARGET_SAMPLE_RATE = 16000;
const MAX_SECONDS = 60;

const symptomOptions = [
  "口干口渴",
  "口淡",
  "口苦",
  "怕冷",
  "怕热",
  "嗜睡",
  "失眠多梦",
  "食欲好",
  "纳呆",
  "大便干硬",
  "大便稀溏",
  "尿急尿频",
  "夜尿",
];

const menstrualOptions = [
  "色淡红",
  "色暗红",
  "量多",
  "量少",
  "淋漓不尽",
  "有血块",
  "提前",
  "拖后",
  "周期不规律",
];

const dietAdviceOptions = [
  "忌生冷寒凉",
  "忌肥甘厚味",
  "忌辛辣煎炸/燥热",
  "忌白萝卜浓茶",
];

const lifestyleAdviceOptions = [
  "作息规律戒熬夜",
  "加强锻炼适度运动",
  "戒房事",
  "戒酒",
];

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
const formTitle = document.querySelector("#formTitle");
const recordList = document.querySelector("#recordList");
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

init();

async function init() {
  renderCheckboxGroup("symptomOptions", symptomOptions, "symptom");
  renderCheckboxGroup("menstrualOptions", menstrualOptions, "menstrual");
  renderCheckboxGroup("dietAdviceOptions", dietAdviceOptions, "dietAdvice");
  renderCheckboxGroup("lifestyleAdviceOptions", lifestyleAdviceOptions, "lifestyleAdvice");
  renderVisits();
  bindEvents();
  setTodayIfEmpty();
  await suggestNextRecordNo();
  await refreshDbInfo();
  await loadRecordList();
}

function bindEvents() {
  saveButton.addEventListener("click", saveRecord);
  deleteButton.addEventListener("click", deleteCurrentRecord);
  newRecordButton.addEventListener("click", resetForm);
  addVisitButton.addEventListener("click", addVisit);
  searchInput.addEventListener("input", debounce(loadRecordList, 250));
  exportButton.addEventListener("click", openExportPanel);
  exportCloseButton.addEventListener("click", closeExportPanel);
  exportCancelButton.addEventListener("click", closeExportPanel);
  exportPdfButton.addEventListener("click", exportPdf);
  exportSearchInput.addEventListener("input", debounce(loadExportRecordList, 250));
  exportOverlay.addEventListener("click", (event) => {
    if (event.target === exportOverlay) closeExportPanel();
  });
  voiceAppendButton.addEventListener("click", () => applyVoiceResult("append"));
  voiceReplaceButton.addEventListener("click", () => applyVoiceResult("replace"));
  voiceCancelButton.addEventListener("click", closeVoicePanel);
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".voice-button");
    if (!button) return;
    handleVoiceButton(button);
  });
  document.querySelector("#recordForm").addEventListener("input", () => {
    markDirty();
  });
  document.querySelector("#recordForm").addEventListener("change", () => {
    markDirty();
  });
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
          <div class="visit-head">
            <div class="visit-title">${label}</div>
            <label>
              <span>时间</span>
              <input id="${prefix}Date" type="date" />
            </label>
            <div></div>
          </div>
          <div class="visit-grid">
            ${textareaWithVoice(`${prefix}Diagnosis`, "辨证")}
            ${textareaWithVoice(`${prefix}Plan`, "内调方案")}
            ${textareaWithVoice(`${prefix}Followup`, "回访情况")}
          </div>
        </div>
      `;
    })
    .join("");
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

function textareaWithVoice(id, label) {
  return `
    <div>
      <div class="field-head">
        <label for="${id}">${label}</label>
        <button type="button" class="voice-button" data-target="${id}">录音</button>
      </div>
      <textarea id="${id}" rows="6"></textarea>
    </div>
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

async function suggestNextRecordNo() {
  if (currentRecordId || valueOf("recordNo")) return;
  try {
    const payload = await fetchJson("/api/next-record-no");
    isHydrating = true;
    setValue("recordNo", payload.recordNo || "");
  } catch (error) {
    // 编号只是辅助录入，接口失败时不阻塞页面使用。
  } finally {
    isHydrating = false;
  }
}

async function loadRecordList() {
  const query = searchInput.value.trim();
  try {
    const payload = await fetchJson(`/api/records?query=${encodeURIComponent(query)}`);
    const records = payload.records || [];
    if (!records.length) {
      recordList.innerHTML = `<div class="record-item"><span>暂无病历</span></div>`;
      return;
    }
    recordList.innerHTML = records
      .map(
        (record) => `
          <button class="record-item ${
            Number(record.id) === Number(currentRecordId) ? "active" : ""
          }" data-record-id="${record.id}">
            <strong><span class="record-no">${escapeHtml(displayRecordNo(record))}</span> ${escapeHtml(record.name || "未填写姓名")}</strong>
            <span>${escapeHtml([record.gender, record.age, record.recordDate].filter(Boolean).join(" · "))}</span>
            <span>${escapeHtml(record.chiefComplaint || "未填写主诉")}</span>
          </button>
        `
      )
      .join("");
    recordList.querySelectorAll("[data-record-id]").forEach((button) => {
      button.addEventListener("click", () => loadRecord(button.dataset.recordId));
    });
  } catch (error) {
    recordList.innerHTML = `<div class="record-item"><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function displayRecordNo(record) {
  return record.recordNo ? `编号 ${record.recordNo}` : `内部 #${record.id}`;
}

function formatFormTitle(record) {
  if (!currentRecordId) return "新建病历";
  const patient = record.patient || {};
  const name = patient.name || "未填写姓名";
  const recordNo = patient.recordNo || record.recordNo || `内部 #${currentRecordId}`;
  return `病历 ${name} · 编号 ${recordNo}`;
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
            <span>${escapeHtml([record.gender, record.age, record.recordDate, record.chiefComplaint].filter(Boolean).join(" · "))}</span>
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

async function loadRecord(id) {
  const payload = await fetchJson(`/api/records/${id}`);
  fillForm(payload.record);
  await loadRecordList();
}

async function saveRecord() {
  saveButton.disabled = true;
  saveStatus.textContent = "保存中";
  try {
    const payload = collectForm();
    const response = await fetchJson("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    fillForm(response.record);
    markClean(response.record.updatedAt ? `已保存 ${response.record.updatedAt}` : "已保存");
    await refreshDbInfo();
    await loadRecordList();
  } catch (error) {
    saveStatus.textContent = error.message || "保存失败";
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteCurrentRecord() {
  if (!currentRecordId) return;
  if (!confirm("确认删除当前病历？")) return;
  deleteButton.disabled = true;
  try {
    await fetchJson(`/api/records/${currentRecordId}`, { method: "DELETE" });
    resetForm();
    await refreshDbInfo();
    await loadRecordList();
  } catch (error) {
    saveStatus.textContent = error.message || "删除失败";
  } finally {
    deleteButton.disabled = !currentRecordId;
  }
}

function collectForm() {
  return {
    id: currentRecordId,
    patient: {
      recordNo: valueOf("recordNo"),
      name: valueOf("patientName"),
      gender: valueOf("patientGender"),
      age: valueOf("patientAge"),
      phone: valueOf("patientPhone"),
      recordDate: valueOf("recordDate"),
    },
    chiefComplaint: valueOf("chiefComplaint"),
    pastHistory: valueOf("pastHistory"),
    allergyHistory: valueOf("allergyHistory"),
    symptoms: checkedValues("symptom"),
    vitals: {
      bloodPressure: valueOf("bloodPressure"),
      heartRate: valueOf("heartRate"),
      bloodSugar: valueOf("bloodSugar"),
      uricAcid: valueOf("uricAcid"),
      nightUrineCount: valueOf("nightUrineCount"),
    },
    menstrual: {
      selected: checkedValues("menstrual"),
    },
    tonguePulse: valueOf("tonguePulse"),
    advice: {
      diet: checkedValues("dietAdvice"),
      lifestyle: checkedValues("lifestyleAdvice"),
    },
    visits: collectVisits(),
    notes: valueOf("notes"),
  };
}

function collectVisits() {
  return Array.from({ length: visitCount }).map((_, index) => ({
    label: visitLabel(index),
    date: valueOf(`visit${index}Date`),
    diagnosis: valueOf(`visit${index}Diagnosis`),
    plan: valueOf(`visit${index}Plan`),
    followup: valueOf(`visit${index}Followup`),
  }));
}

function fillForm(record) {
  isHydrating = true;
  currentRecordId = record.id || null;
  const patient = record.patient || {};
  setValue("recordNo", patient.recordNo || record.recordNo || "");
  setValue("patientName", patient.name || "");
  setValue("patientGender", patient.gender || "");
  setValue("patientAge", patient.age || "");
  setValue("patientPhone", patient.phone || "");
  setValue("recordDate", patient.recordDate || "");
  setValue("chiefComplaint", record.chiefComplaint || "");
  setValue("pastHistory", record.pastHistory || "");
  setValue("allergyHistory", record.allergyHistory || "");
  setValue("tonguePulse", record.tonguePulse || "");
  setValue("notes", record.notes || "");
  setCheckedValues("symptom", record.symptoms || []);
  setCheckedValues("menstrual", (record.menstrual && record.menstrual.selected) || []);
  setCheckedValues("dietAdvice", (record.advice && record.advice.diet) || []);
  setCheckedValues("lifestyleAdvice", (record.advice && record.advice.lifestyle) || []);

  const vitals = record.vitals || {};
  setValue("bloodPressure", vitals.bloodPressure || "");
  setValue("heartRate", vitals.heartRate || "");
  setValue("bloodSugar", vitals.bloodSugar || "");
  setValue("uricAcid", vitals.uricAcid || "");
  setValue("nightUrineCount", vitals.nightUrineCount || "");

  const visits = Array.isArray(record.visits) ? record.visits : [];
  visitCount = Math.max(INITIAL_VISIT_COUNT, visits.length || INITIAL_VISIT_COUNT);
  renderVisits();
  fillVisits(visits);

  formTitle.textContent = formatFormTitle(record);
  deleteButton.disabled = !currentRecordId;
  markClean(record.updatedAt ? `已保存 ${record.updatedAt}` : "未保存");
  isHydrating = false;
}

function fillVisits(visits) {
  Array.from({ length: visitCount }).forEach((_, index) => {
    const visit = visits[index] || {};
    setValue(`visit${index}Date`, visit.date || "");
    setValue(`visit${index}Diagnosis`, visit.diagnosis || "");
    setValue(`visit${index}Plan`, visit.plan || "");
    setValue(`visit${index}Followup`, visit.followup || "");
  });
}

function resetForm() {
  isHydrating = true;
  currentRecordId = null;
  document.querySelector("#recordForm").reset();
  visitCount = INITIAL_VISIT_COUNT;
  renderVisits();
  setCheckedValues("symptom", []);
  setCheckedValues("menstrual", []);
  setCheckedValues("dietAdvice", []);
  setCheckedValues("lifestyleAdvice", []);
  setTodayIfEmpty();
  formTitle.textContent = "新建病历";
  deleteButton.disabled = true;
  closeVoicePanel();
  markClean("未保存");
  isHydrating = false;
  suggestNextRecordNo();
  loadRecordList();
}

function setTodayIfEmpty() {
  if (!valueOf("recordDate")) {
    setValue("recordDate", new Date().toISOString().slice(0, 10));
  }
}

async function handleVoiceButton(button) {
  if (recording && activeVoiceButton === button) {
    await stopAndRecognize();
    return;
  }
  if (recording) return;
  await startRecording(button);
}

async function startRecording(button) {
  try {
    closeVoicePanel();
    currentVoiceTarget = button.dataset.target;
    activeVoiceButton = button;
    setVoiceButtonsDisabled(true);
    button.disabled = false;
    button.classList.add("recording");
    button.textContent = "停止";

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
      button.textContent = `${Math.floor(seconds)}秒`;
      if (seconds >= MAX_SECONDS) stopAndRecognize();
    }, 500);
  } catch (error) {
    cleanupAudio();
    setVoiceButtonsDisabled(false);
    showVoicePanel(currentVoiceTarget, microphoneError(error), "录音失败");
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
  button.textContent = "识别中";

  try {
    const audioBase64 = await blobToBase64(wavBlob);
    const payload = await fetchJson("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64, durationSeconds: seconds }),
    });
    showVoicePanel(target, payload.text || "", `${Number(payload.audioDuration || seconds).toFixed(1)} 秒 · ${payload.latencyMs || "-"} ms`);
  } catch (error) {
    showVoicePanel(target, error.message || "识别失败", "识别失败");
  } finally {
    button.classList.remove("busy");
    button.textContent = "录音";
    setVoiceButtonsDisabled(false);
    activeVoiceButton = null;
  }
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
}

function applyVoiceResult(mode) {
  const target = document.querySelector(`#${currentVoiceTarget}`);
  if (!target) return;
  const text = voiceResult.value.trim();
  if (mode === "replace") {
    target.value = text;
  } else if (text) {
    target.value = target.value.trim() ? `${target.value.trim()}\n${text}` : text;
  }
  markDirty();
  closeVoicePanel();
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

function closeVoicePanel() {
  voicePanel.hidden = true;
  voiceResult.value = "";
  currentVoiceTarget = null;
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
  return document.querySelector(`#${id}`).value.trim();
}

function setValue(id, value) {
  document.querySelector(`#${id}`).value = value || "";
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

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
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
