"use strict";

import * as api from "/api.js";

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

/* ---------- إعدادات الغرفة ---------- */

const ROOM_KEY = "sawt.room.v1";
const ROOM_LEVELS = [5, 10, 15, 20]; // مقاعد المايك لكل مستوى

function loadRoom() {
  const base = {
    name: "الغرفة",
    topic: "",
    privacy: "خاصة",
    level: 1,
    seats: 5,
    autoMute: false,
    notify: true,
    locked: false,
    hand: false,
  };
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    return raw ? Object.assign(base, JSON.parse(raw)) : base;
  } catch (err) {
    return base;
  }
}

function saveRoom() {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify(state.room));
  } catch (err) {
    // التخزين غير متاح — تبقى الإعدادات لهذه الجلسة
  }
}

const capacity = () => Number(state.room.seats) || 5;

const levelForSeats = (seats) => {
  const index = ROOM_LEVELS.findIndex((value) => value >= seats);
  return index === -1 ? ROOM_LEVELS.length : index + 1;
};

const state = {
  participants: [],
  messages: [],
  mutedAll: false,
  mic: { status: "off", stream: null, ctx: null, analyser: null, buf: null, raf: null, deviceId: null, label: "", smooth: 0 },
  devices: [],
  room: loadRoom(),
};

/* ---------- جلسة الغرفة الحقيقية ---------- */

const session = api.getSession();
const ROOM_ID = new URLSearchParams(location.search).get("room");
const ME_ID = session ? session.user.id : null;

const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }) : "";

function mapMembers(members) {
  return (members || []).map((member) => ({
    id: member.id,
    name: member.name,
    initial: String(member.name || "•").trim().charAt(0),
    muted: member.id === ME_ID ? state.mic.status !== "live" : state.mutedAll,
    main: !!member.host,
    role: member.host ? "المضيف" : "",
    me: member.id === ME_ID,
  }));
}

const mapMessage = (message) => ({
  id: message.id,
  name: message.name,
  mine: !!message.mine,
  text: message.text,
  time: clock(message.created_at),
});

function applyRoom(data) {
  state.room.name = data.room.name;
  state.room.topic = data.room.topic || "";
  state.room.seats = Number(data.room.seats) || 5;
  state.room.level = levelForSeats(state.room.seats);
  state.participants = mapMembers(data.members);
  state.messages = (data.messages || []).map(mapMessage);
}

let roomSignature = "";

async function syncRoom(force) {
  const data = await api.getRoom(ROOM_ID);
  const signature =
    data.members.map((member) => member.id).join(",") +
    "|" +
    data.messages.length +
    "|" +
    data.room.name +
    "|" +
    data.room.seats;
  if (!force && signature === roomSignature) return;
  roomSignature = signature;
  applyRoom(data);
  renderStage();
  renderChat();
  paintRoom();
}

/* ---------- المسرح ---------- */

const myTile = () => $('.tile[data-id="me"]');

function tileHtml(p, size) {
  const muted = p.me ? state.mic.status !== "live" : p.muted;
  return (
    '<div class="tile ' + size + (p.me ? " me" : "") + '" data-id="' + p.id + '">' +
      '<div class="ring">' +
        '<span class="pulse pulse-a" aria-hidden="true"></span>' +
        '<span class="pulse pulse-b" aria-hidden="true"></span>' +
        '<div class="avatar">' + p.initial + "</div>" +
        (muted ? '<span class="muted-badge">' + ICONS.mute + "</span>" : "") +
      "</div>" +
      '<div class="tile-name">' + p.name +
        (p.me && state.room.hand ? ' <span class="hand-badge">✋</span>' : "") +
        "</div>" +
      (p.role ? '<div class="tile-role">' + p.role + "</div>" : "") +
    "</div>"
  );
}

function emptyTile() {
  return (
    '<div class="tile small empty" aria-hidden="true">' +
      '<div class="ring"><div class="avatar">+</div></div>' +
      '<div class="tile-name">مقعد فارغ</div>' +
    "</div>"
  );
}

function renderStage() {
  const main = state.participants.find((p) => p.main) || state.participants[0];
  const rest = state.participants.filter((p) => p !== main);
  const seats = capacity();
  const empty = Math.max(0, seats - 1 - rest.length);
  $("#stage-main").innerHTML = main ? tileHtml(main, "main") : "";
  $("#stage-grid").innerHTML =
    rest.map((p) => tileHtml(p, "small")).join("") + Array.from({ length: empty }, emptyTile).join("");
  if (main && main.me) myTile();
  $("#room-count").textContent = String(state.participants.length);
  paintRoom();
}

/* ---------- عرض حالة الغرفة وإعداداتها ---------- */

function paintRoom() {
  const level = state.room.level;
  const seats = capacity();
  const free = Math.max(0, seats - state.participants.length);
  const set = (id, text) => {
    const el = $("#" + id);
    if (el) el.textContent = text;
  };

  set("room-name", state.room.name);
  set("room-level", "المستوى " + level + " · " + seats + " مايكات");
  document.title = state.room.name + " — صوت مباشر";

  set("details-name", state.room.name);
  set("details-state", state.room.locked ? "مقفلة · مباشر" : "مباشر الآن");
  set("details-count", String(state.participants.length));
  set("details-capacity", String(seats));
  set("details-level", "المستوى " + level);
  set("details-privacy", state.room.privacy + (state.room.locked ? " · مقفلة" : " · بالدعوة"));

  set("set-level", "المستوى " + level);
  set("set-capacity", String(seats));
  set("set-free", String(free));
  set("set-privacy", state.room.privacy);

  const toggle = (id, on, onText, offText) => {
    const btn = $("#" + id);
    if (!btn) return;
    btn.textContent = on ? onText : offText;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("on", on);
  };
  toggle("set-automute", state.room.autoMute, "تشغيل", "إيقاف");
  toggle("set-notify", state.room.notify, "تشغيل", "إيقاف");
  toggle("set-lock", state.room.locked, "مقفلة", "مفتوحة");

  const nameInput = $("#room-name-input");
  if (nameInput && document.activeElement !== nameInput) nameInput.value = state.room.name;

  const hand = $("#ctl-hand");
  if (hand) {
    hand.setAttribute("aria-pressed", state.room.hand ? "true" : "false");
    hand.classList.toggle("raised", state.room.hand);
  }
}

/* ---------- الدردشة ---------- */

function renderChat() {
  const list = $("#chat-list");
  list.innerHTML = state.messages.length
    ? state.messages
        .map(
          (m) =>
            '<div class="msg' + (m.mine ? " mine" : "") + '">' +
            '<div class="meta"><span>' + escapeHtml(m.name) + "</span><span>" + m.time + "</span></div>" +
            "<div>" + escapeHtml(m.text) + "</div></div>"
        )
        .join("")
    : '<p class="chat-empty">لا رسائل بعد — ابدأ الحديث.</p>';
  list.scrollTop = list.scrollHeight;
  $("#chat-hint").textContent = state.messages.length + " رسالة";
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendMessage(text) {
  const value = text.trim();
  if (!value) return;
  try {
    const saved = await api.say(ROOM_ID, value);
    state.messages.push(mapMessage(saved));
    renderChat();
  } catch (err) {
    toast(err.message || "تعذّر إرسال الرسالة");
  }
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
  if (status !== "live") {
    state.mic.smooth = 0;
    paintLevel(0);
  }
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
  // تنعيم القيمة: صعود سريع مع الصوت وهبوط هادئ حتى يبدو النبض طبيعياً
  const prev = state.mic.smooth;
  const next = level > prev ? prev + (level - prev) * 0.6 : prev * 0.8 + level * 0.2;
  const smooth = next < 0.005 ? 0 : next;
  state.mic.smooth = smooth;

  const fill = $("#level-fill");
  if (fill) fill.style.width = Math.round(smooth * 100) + "%";

  const tile = myTile();
  if (!tile) return;
  const value = smooth.toFixed(3);
  if (tile.dataset.level !== value) {
    tile.dataset.level = value;
    tile.style.setProperty("--level", value);
    tile.style.setProperty("--pulse", value);
  }
  const speaking = smooth > 0.05;
  if (tile.classList.contains("speaking") !== speaking) tile.classList.toggle("speaking", speaking);
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

  /* إعدادات الغرفة */
  const openRoomSettings = () => {
    openSheet("sheet-room");
    paintRoom();
  };
  $("#btn-room-settings").addEventListener("click", openRoomSettings);
  $("#btn-settings-more").addEventListener("click", openRoomSettings);

  $("#ctl-hand").addEventListener("click", () => {
    state.room.hand = !state.room.hand;
    saveRoom();
    renderStage();
    toast(state.room.hand ? "تم رفع يدك — بانتظار الدور" : "تم إنزال يدك");
  });

  $("#btn-privacy").addEventListener("click", () => {
    state.room.privacy = state.room.privacy === "خاصة" ? "عامة" : "خاصة";
    saveRoom();
    paintRoom();
    toast("الخصوصية الآن: " + state.room.privacy);
  });

  $("#set-automute").addEventListener("click", () => {
    state.room.autoMute = !state.room.autoMute;
    saveRoom();
    paintRoom();
    toast(state.room.autoMute ? "سيُكتم الداخلون الجدد تلقائياً" : "أُلغي الكتم التلقائي");
  });

  $("#set-notify").addEventListener("click", () => {
    state.room.notify = !state.room.notify;
    saveRoom();
    paintRoom();
  });

  $("#set-lock").addEventListener("click", () => {
    state.room.locked = !state.room.locked;
    saveRoom();
    paintRoom();
    toast(state.room.locked ? "الغرفة مقفلة أمام الداخلين الجدد" : "الغرفة مفتوحة الآن");
  });

  $("#btn-upgrade").addEventListener("click", async () => {
    const next = ROOM_LEVELS.find((value) => value > capacity());
    if (!next) {
      toast("الغرفة بأعلى مستوى: " + ROOM_LEVELS[ROOM_LEVELS.length - 1] + " مايك");
      return;
    }
    try {
      await api.updateRoom(ROOM_ID, { seats: next });
      state.room.seats = next;
      state.room.level = levelForSeats(next);
      saveRoom();
      renderStage();
      renderChat();
      toast("ترقّى المستوى — " + next + " مايك");
    } catch (err) {
      toast(err.message || "تعذّر ترقية الغرفة");
    }
  });

  $("#btn-rename").addEventListener("click", async () => {
    const value = $("#room-name-input").value.trim();
    if (!value) return;
    try {
      await api.updateRoom(ROOM_ID, { name: value });
      state.room.name = value;
      saveRoom();
      paintRoom();
      toast("تم تحديث اسم الغرفة");
    } catch (err) {
      toast(err.message || "تعذّر تحديث اسم الغرفة");
    }
  });

  $("#btn-mute-all").addEventListener("click", () => {
    stopStream();
    setMicStatus("off");
    state.mutedAll = true;
    renderStage();
    closeSheet();
    toast("تم كتم الأصوات الواردة في هذه الجلسة");
  });

  $("#btn-clear-chat").addEventListener("click", async () => {
    try {
      await api.clearChat(ROOM_ID);
      state.messages = [];
      renderChat();
      closeSheet();
      toast("تم مسح الدردشة");
    } catch (err) {
      toast(err.message || "مسح الدردشة متاح للمضيف فقط");
    }
  });

  $("#btn-invite").addEventListener("click", async () => {
    const link = location.origin + "/room/?room=" + encodeURIComponent(ROOM_ID);
    try {
      await navigator.clipboard.writeText(link);
      toast("تم نسخ رابط الدعوة");
    } catch (err) {
      toast("تعذّر النسخ — الرابط: " + link);
    }
    closeSheet();
  });

  $("#btn-leave").addEventListener("click", async () => {
    stopStream();
    setMicStatus("off");
    try {
      await api.leaveRoom(ROOM_ID);
    } catch (err) {
      // الغرفة قد تكون أُغلقت — المتابعة إلى الرئيسية في كل الأحوال
    }
    closeSheet();
    location.href = "/";
  });

  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chat-input");
    sendMessage(input.value);
    input.value = "";
  });
}

/* ---------- الإقلاع ---------- */

async function boot() {
  if (!session || !ROOM_ID) {
    location.replace("/");
    return;
  }

  try {
    await syncRoom(true);
  } catch (err) {
    location.replace("/");
    return;
  }

  wire();
  setMicStatus("off");
  refreshDevices();

  setInterval(() => {
    if (document.hidden) return;
    syncRoom(false).catch(() => {});
  }, 5000);
}

boot();
