const TARGET_SAMPLE_RATE = 16000;
const MAX_SECONDS = 60;
const WARN_SECONDS = 55;

const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const resetButton = document.querySelector("#resetButton");
const copyButton = document.querySelector("#copyButton");
const timerText = document.querySelector("#timerText");
const levelBar = document.querySelector("#levelBar");
const statusPill = document.querySelector("#statusPill");
const resultText = document.querySelector("#resultText");
const durationText = document.querySelector("#durationText");
const latencyText = document.querySelector("#latencyText");
const sizeText = document.querySelector("#sizeText");
const requestIdText = document.querySelector("#requestIdText");
const historyBody = document.querySelector("#historyBody");
const configText = document.querySelector("#configText");

let audioContext = null;
let sourceNode = null;
let processorNode = null;
let mediaStream = null;
let audioChunks = [];
let startedAt = 0;
let timerId = 0;
let currentSampleRate = 0;
let recording = false;
let historyRows = [];

init();

async function init() {
  bindEvents();
  await loadConfig();
}

function bindEvents() {
  startButton.addEventListener("click", startRecording);
  stopButton.addEventListener("click", () => stopAndRecognize());
  resetButton.addEventListener("click", resetPage);
  copyButton.addEventListener("click", copyResult);
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const payload = await response.json();
    const config = payload.config || {};
    const credentialText =
      config.hasCredentials === "true" ? "密钥已配置" : "密钥未配置";
    const hotwordText = config.hotwordId ? "，热词已配置" : "";
    const transportText = config.transport ? `，调用方式 ${config.transport}` : "";
    configText.textContent = `${credentialText}，引擎 ${config.engine || "-"}，区域 ${
      config.region || "-"
    }${transportText}${hotwordText}`;
  } catch (error) {
    configText.textContent = "配置读取失败";
  }
}

async function startRecording() {
  try {
    resultText.value = "";
    setMeta("-", "-", "-", "-");
    setStatus("准备录音", "busy");

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
      if (!recording) return;
      const input = event.inputBuffer.getChannelData(0);
      audioChunks.push(new Float32Array(input));
      updateLevel(input);
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    recording = true;
    startedAt = Date.now();
    startTimer();
    startButton.disabled = true;
    stopButton.disabled = false;
    resetButton.disabled = true;
    copyButton.disabled = true;
    setStatus("录音中", "recording");
  } catch (error) {
    cleanupAudio();
    setStatus("录音失败", "error");
    resultText.value = microphoneError(error);
  }
}

async function stopAndRecognize() {
  if (!recording) return;
  const elapsedSeconds = elapsed();
  const wavBlob = buildWavBlob();
  cleanupAudio();
  stopTimer();
  timerText.textContent = formatSeconds(elapsedSeconds);
  levelBar.style.width = "0%";

  startButton.disabled = false;
  stopButton.disabled = true;
  resetButton.disabled = false;
  setStatus("识别中", "busy");

  try {
    const audioBase64 = await blobToBase64(wavBlob);
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64,
        durationSeconds: elapsedSeconds,
      }),
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "识别失败。");
    }

    resultText.value = payload.text || "";
    const duration = payload.audioDuration || elapsedSeconds;
    setMeta(
      `${Number(duration).toFixed(1)} 秒`,
      `${payload.latencyMs || "-"} ms`,
      formatBytes(payload.audioBytes || wavBlob.size),
      payload.requestId || "-"
    );
    addHistory({
      time: new Date(),
      duration: `${Number(duration).toFixed(1)} 秒`,
      latency: `${payload.latencyMs || "-"} ms`,
      text: payload.text || "",
    });
    copyButton.disabled = !payload.text;
    setStatus("识别完成", "");
  } catch (error) {
    resultText.value = error.message || String(error);
    setMeta(`${elapsedSeconds.toFixed(1)} 秒`, "-", formatBytes(wavBlob.size), "-");
    setStatus("识别失败", "error");
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
  if (outSampleRate === sampleRate) return buffer;
  if (outSampleRate > sampleRate) {
    throw new Error("目标采样率不能高于原始采样率。");
  }

  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function cleanupAudio() {
  recording = false;
  if (processorNode) {
    processorNode.disconnect();
    processorNode.onaudioprocess = null;
  }
  if (sourceNode) sourceNode.disconnect();
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) track.stop();
  }
  if (audioContext) audioContext.close();
  audioContext = null;
  sourceNode = null;
  processorNode = null;
  mediaStream = null;
}

function startTimer() {
  stopTimer();
  timerId = window.setInterval(() => {
    const seconds = elapsed();
    timerText.textContent = formatSeconds(seconds);
    if (seconds >= WARN_SECONDS && seconds < MAX_SECONDS) {
      setStatus("接近上限", "recording");
    }
    if (seconds >= MAX_SECONDS) {
      stopAndRecognize();
    }
  }, 200);
}

function stopTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = 0;
  }
}

function elapsed() {
  return startedAt ? (Date.now() - startedAt) / 1000 : 0;
}

function updateLevel(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    sum += input[i] * input[i];
  }
  const rms = Math.sqrt(sum / input.length);
  const level = Math.min(100, Math.round(rms * 460));
  levelBar.style.width = `${level}%`;
}

function resetPage() {
  stopTimer();
  cleanupAudio();
  audioChunks = [];
  timerText.textContent = "00:00";
  levelBar.style.width = "0%";
  resultText.value = "";
  setMeta("-", "-", "-", "-");
  setStatus("待录音", "");
  startButton.disabled = false;
  stopButton.disabled = true;
  resetButton.disabled = true;
  copyButton.disabled = true;
}

async function copyResult() {
  if (!resultText.value) return;
  await navigator.clipboard.writeText(resultText.value);
  setStatus("已复制", "");
}

function addHistory(row) {
  historyRows.unshift(row);
  historyRows = historyRows.slice(0, 20);
  historyBody.innerHTML = "";
  for (const item of historyRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.time.toLocaleTimeString("zh-CN", { hour12: false })}</td>
      <td>${escapeHtml(item.duration)}</td>
      <td>${escapeHtml(item.latency)}</td>
      <td>${escapeHtml(item.text || "(空)")}</td>
    `;
    historyBody.appendChild(tr);
  }
}

function setStatus(text, className) {
  statusPill.textContent = text;
  statusPill.className = className ? `status-pill ${className}` : "status-pill";
}

function setMeta(duration, latency, size, requestId) {
  durationText.textContent = duration;
  latencyText.textContent = latency;
  sizeText.textContent = size;
  requestIdText.textContent = requestId;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function formatSeconds(seconds) {
  const total = Math.floor(seconds);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const remainder = String(total % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
