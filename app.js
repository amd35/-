"use strict";

const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
  mic: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0v-6a3 3 0 0 1 3-3Z"/><path d="M5.9 11.5a6.1 6.1 0 0 0 12.2 0"/><path d="M12 17.6V21"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6a3 3 0 0 1 3 3v5"/><path d="M9 9v3.6a3 3 0 0 0 4.6 2.5"/><path d="M5.9 11.5a6.1 6.1 0 0 0 8.9 5.4"/><path d="M12 17.6V21"/><path d="M4.5 4.5l15 15"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  mute: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4.6a3 3 0 0 1 3 3v3"/><path d="M5.9 11.5a6.1 6.1 0 0 0 8.9 5.4"/><path d="M12 17.6V21"/><path d="M4.5 4.5l15 15"/></svg>',
};

const MIC_LABELS = {
  off: { text: "تشغيل الميك", icon: "mic" },
  booting: { text: "جارٍ التشغيل…", icon: "mic" },
  live: { text: "إيقاف الميك", icon: "mic" },
  denied: { text: "الإذن مرفوض", icon: "micOff" },
  nodevice: { text: "لا يوجد ميكروفون", icon: "micOff" },
  unsupported: { text: "غير مدعوم هنا", icon: "micOff" },
  error: { text: "تعذّر التشغيل", icon: "micOff" },
};

const state = {
  participants: [
    { id: "host", name: "سارة", role: "المضيفة", initial: "س", muted: false, main: true },
    { id: "p2", name: "علي", initial: "ع", muted: true },
    { id: "me", name: "أنت", initial: "أ", muted: true, me: true },
    { id: "p4", name: "نور", initial: "ن", muted: false },
    { id: "p5", name: "حسين", initial: "ح", muted: true },
  ],
  messages: [
    { id: "m1", name: "سارة", mine: false, text: "أهلاً بكم في الغرفة ✨", time: "18:02" },
    { id: "m2", name: "علي", mine: false, text: "الصوت واضح عندي", time: "18:03" },
  ],
  mic: { status: "off", stream: null, ctx: null, analyser: null, buf: null, raf: null, deviceId: null, label: "" },
  devices: [],
};

/* ---------- المسرح ---------- */

const myTile = () => $('.tile[data-id="me"]');

function tileHtml(p, size) {
  const muted = p.me ? state.mic.status !== "live" : p.muted;
  return (
    '<div class="tile ' + size + (p.me ? " me" : "") + '" data-id="' + p.id + '">' +
      '<div class="ring"><div class="avatar">' + p.initial + "</div>" +
        (muted ? '<span class="muted-badge">' + ICONS.mute + "</span>" : "") +
      "</div>" +
      '<div class="tile-name">' + p.name + "</div>" +
      (p.role ? '<div class="tile-role">' + p.role + "</div>" : "") +
    "</div>"
  );
}

function renderStage() {
  const main = state.participants.find((p) => p.main);
  const rest = state.participants.filter((p) => p !== main);
  $("#stage-main").innerHTML = tileHtml(main, "main");
  $("#stage-grid").innerHTML = rest.map((p) => tileHtml(p, "small")).join("");
  $("#room-count").textContent = String(state.participants.length);
  $("#details-count").textContent = String(state.participants.length);
}

/* ---------- الدردشة ---------- */

function renderChat() {
  const list = $("#chat-list");
  list.innerHTML = state.messages
    .map(
      (m) =>
        '<div class="msg' + (m.mine ? " mine" : "") + '">' +
        '<div class="meta"><span>' + m.name + "</span><span>" + m.time + "</span></div>" +
        "<div>" + escapeHtml(m.text) + "</div></div>"
    )
    .join("");
  list.scrollTop = list.scrollHeight;
  $("#chat-hint").textContent = state.messages.length + " رسالة";
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function now() {
  return new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
}

function sendMessage(text) {
  const value = text.trim();
  if (!value) return;
  state.messages.push({ id: "m" + Date.now(), name: "أنت", mine: true, text: value, time: now() });
  renderChat();
}

/* ---------- الميكروفون الحقيقي ---------- */

function setMicStatus(status, label) {
  state.mic.status = status;
  const cfg = MIC_LABELS[status] || MIC_LABELS.error;
  const btn = $("#ctl-mic");
  btn.dataset.status = status;
  btn.innerHTML = ICONS[cfg.icon] + "<span>" + cfg.text + "</span>";
  btn.setAttribute("aria-pressed", status === "live" ? "true" : "false");
  if (label !== undefined) state.mic.label = label;
  $("#details-mic").textContent = status === "live" ? state.mic.label || "ميكروفون الجهاز" : "مغلق";
  const me = state.participants.find((p) => p.me);
  const badge = myTile() && $(".ring", myTile());
  if (badge) {
    const has = $(".muted-badge", badge);
    if (status !== "live" && !has) badge.insertAdjacentHTML("beforeend", '<span class="muted-badge">' + ICONS.mute + "</span>");
    if (status === "live" && has) has.remove();
  }
  if (me) me.muted = status !== "live";
  if (status !== "live") paintLevel(0);
  renderDevices();
}

async function startMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setMicStatus("unsupported");
    toast("المتصفح هنا لا يسمح بالوصول إلى الميكروفون");
    return;
  }
  setMicStatus("booting");
  try {
    const audio = state.mic.deviceId ? { deviceId: { exact: state.mic.deviceId } } : true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    attachStream(stream);
    const track = stream.getAudioTracks()[0];
    setMicStatus("live", track && track.label ? track.label : "ميكروفون الجهاز");
    await refreshDevices();
  } catch (err) {
    const name = err && err.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      setMicStatus("denied");
      toast("تم رفض إذن الميكروفون — اسمح بالوصول من إعدادات المتصفح");
    } else if (name === "NotFoundError" || name === "OverconstrainedError") {
      state.mic.deviceId = null;
      setMicStatus("nodevice");
      toast("لم يتم العثور على ميكروفون متاح");
    } else {
      setMicStatus("error");
      toast("تعذّر تشغيل الميكروفون");
    }
  }
}

function attachStream(stream) {
  stopStream();
  state.mic.stream = stream;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  state.mic.ctx = ctx;
  state.mic.analyser = analyser;
  state.mic.buf = new Uint8Array(analyser.fftSize);
  loopLevel();
}

function loopLevel() {
  const { analyser, buf } = state.mic;
  if (!analyser || !buf) return;
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buf.length);
  paintLevel(Math.min(1, rms * 4.5));
  state.mic.raf = requestAnimationFrame(loopLevel);
}

function paintLevel(level) {
  const fill = $("#level-fill");
  if (fill) fill.style.width = Math.round(level * 100) + "%";
  const tile = myTile();
  if (!tile) return;
  tile.style.setProperty("--level", level.toFixed(3));
  tile.classList.toggle("speaking", level > 0.06);
}

function stopStream() {
  if (state.mic.raf) cancelAnimationFrame(state.mic.raf);
  state.mic.raf = null;
  if (state.mic.stream) state.mic.stream.getTracks().forEach((t) => t.stop());
  if (state.mic.ctx && state.mic.ctx.close) state.mic.ctx.close();
  state.mic.stream = null;
  state.mic.ctx = null;
  state.mic.analyser = null;
  state.mic.buf = null;
  paintLevel(0);
}

function toggleMic() {
  if (state.mic.status === "live" || state.mic.status === "booting") {
    stopStream();
    setMicStatus("off");
    return;
  }
  startMic();
}

/* ---------- الأجهزة ---------- */

async function refreshDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    state.devices = all.filter((d) => d.kind === "audioinput");
  } catch (err) {
    state.devices = [];
  }
  renderDevices();
}

function renderDevices() {
  const box = $("#device-list");
  if (!box) return;
  if (!state.devices.length) {
    box.innerHTML = '<p class="sheet-note">لا توجد أجهزة معروضة بعد. شغّل الميكروفون أولاً لتظهر الأسماء.</p>';
  } else {
    box.innerHTML = state.devices
      .map(
        (d, i) =>
          '<button type="button" class="device' + (d.deviceId === state.mic.deviceId ? " active" : "") +
          '" data-device="' + d.deviceId + '">' +
          escapeHtml(d.label || "ميكروفون " + (i + 1)) +
          "</button>"
      )
      .join("");
  }
  $("#mic-note").textContent =
    state.mic.status === "live"
      ? "الميكروفون يعمل الآن: " + (state.mic.label || "ميكروفون الجهاز")
      : "الميكروفون مغلق. شغّله من زر الميك في الغرفة.";
}

function pickDevice(deviceId) {
  state.mic.deviceId = deviceId;
  renderDevices();
  if (state.mic.status === "live") startMic();
}

/* ---------- الأوراق السفلية ---------- */

let openSheetEl = null;

function openSheet(id) {
  closeSheet();
  const sheet = $("#" + id);
  if (!sheet) return;
  openSheetEl = sheet;
  $("#backdrop").hidden = false;
  sheet.hidden = false;
}

function closeSheet() {
  if (openSheetEl) openSheetEl.hidden = true;
  openSheetEl = null;
  $("#backdrop").hidden = true;
}

let toastTimer = null;

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

/* ---------- الربط ---------- */

function wire() {
  $("#ctl-more").innerHTML = ICONS.more;
  $("#ctl-more").addEventListener("click", () => openSheet("sheet-more"));
  $("#ctl-mic").addEventListener("click", toggleMic);
  $("#backdrop").addEventListener("click", closeSheet);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));

  $("#btn-details").addEventListener("click", () => openSheet("sheet-details"));
  $("#btn-pick-mic").addEventListener("click", () => {
    openSheet("sheet-mic");
    refreshDevices();
  });
  $("#btn-refresh-devices").addEventListener("click", refreshDevices);
  $("#device-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".device");
    if (btn) pickDevice(btn.dataset.device);
  });

  $("#btn-invite").addEventListener("click", async () => {
    const link = location.origin + "/?room=main";
    try {
      await navigator.clipboard.writeText(link);
      toast("تم نسخ رابط الدعوة");
    } catch (err) {
      toast("تعذّر النسخ — الرابط: " + link);
    }
    closeSheet();
  });

  $("#btn-leave").addEventListener("click", () => {
    stopStream();
    setMicStatus("off");
    closeSheet();
    toast("غادرت الغرفة");
  });

  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chat-input");
    sendMessage(input.value);
    input.value = "";
  });
}

renderStage();
renderChat();
wire();
setMicStatus("off");
refreshDevices();
