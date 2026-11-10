"use strict";

import * as remote from "./db.js";
import { toast } from "./ui.js";

const KEY = "sawt.db.v1";
const ACTIVITY_LIMIT = 60;

export const STATUS = {
  live: { label: "مباشر", tone: "live" },
  scheduled: { label: "مجدول", tone: "sched" },
  closed: { label: "مغلق", tone: "closed" },
};

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
const iso = (date) => date.toISOString().slice(0, 10);

export const newId = uid;

function dayBack(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

function seedRooms() {
  return [
    { id: uid(), name: "غرفة الأصدقاء", host: "سارة", members: 5, status: "live", date: dayBack(0) },
    { id: uid(), name: "جلسة الصباح", host: "علي", members: 4, status: "closed", date: dayBack(1) },
    { id: uid(), name: "نقاش المشروع", host: "نور", members: 7, status: "scheduled", date: dayBack(2) },
    { id: uid(), name: "استراحة قهوة", host: "حسين", members: 3, status: "closed", date: dayBack(3) },
    { id: uid(), name: "أسئلة وأجوبة", host: "سارة", members: 9, status: "live", date: dayBack(4) },
    { id: uid(), name: "ورشة تصميم", host: "نور", members: 6, status: "closed", date: dayBack(5) },
    { id: uid(), name: "ليل هادئ", host: "علي", members: 2, status: "closed", date: dayBack(6) },
  ];
}

function seedTasks() {
  return [
    { id: uid(), text: "تجهيز أسئلة الجلسة", done: false },
    { id: uid(), text: "إرسال دعوات المشاركين", done: false },
    { id: uid(), text: "شراء مايك احتياطي", done: true },
  ];
}

function defaults() {
  return {
    rooms: seedRooms(),
    tasks: seedTasks(),
    profile: { name: "أنت", email: "", bio: "", notifyEmail: true, notifyTasks: true },
    settings: { spaceName: "غرفة الأصدقاء", notifyRooms: true, notifyChat: true, autoMute: false },
    activity: [],
    messages: [],
    systems: {},
  };
}

/* ---------- تحويل الصفوف بين القاعدة والواجهة ---------- */

const toRoom = (row) => ({
  id: row.id,
  name: row.name,
  host: row.host || "بدون مضيف",
  members: Number(row.members) || 0,
  status: STATUS[row.status] ? row.status : "scheduled",
  date: row.date || iso(new Date()),
});

const fromRoom = (room) => ({
  name: room.name,
  host: room.host || "بدون مضيف",
  members: Number(room.members) || 0,
  status: STATUS[room.status] ? room.status : "scheduled",
  date: room.date || iso(new Date()),
});

const toTask = (row) => ({ id: row.id, text: row.text, done: !!row.done });

const toActivity = (row) => ({ id: row.id, kind: row.kind || "info", text: row.text, at: row.created_at });

const fromProfile = (row) => ({
  name: row.name || "أنت",
  email: row.email || "",
  bio: row.bio || "",
  notifyEmail: row.notify_email !== false,
  notifyTasks: row.notify_tasks !== false,
});

const toProfileRow = (profile) => ({
  id: "default",
  name: profile.name || "أنت",
  email: profile.email || "",
  bio: profile.bio || "",
  notify_email: !!profile.notifyEmail,
  notify_tasks: !!profile.notifyTasks,
});

const fromSettings = (row) => ({
  spaceName: row.space_name || "غرفة الأصدقاء",
  notifyRooms: row.notify_rooms !== false,
  notifyChat: row.notify_chat !== false,
  autoMute: row.auto_mute === true,
});

const toSettingsRow = (settings) => ({
  id: "default",
  space_name: settings.spaceName || "غرفة الأصدقاء",
  notify_rooms: !!settings.notifyRooms,
  notify_chat: !!settings.notifyChat,
  auto_mute: !!settings.autoMute,
});

/* ---------- الذاكرة المحلية (نسخة للعرض والعمل بدون اتصال) ---------- */

let cache = null;
let lastError = "";
let remoteReady = false;

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(defaults(), JSON.parse(raw));
  } catch (err) {
    // تجاهل البيانات التالفة والعودة للافتراضي
  }
  return defaults();
}

function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (err) {
    // التخزين المؤقت غير متاح — لا يعطّل التطبيق
  }
}

/** يُنفَّذ مرة عند الإقلاع: يجلب البيانات من قاعدة البيانات إن كانت متصلة. */
export async function hydrate() {
  if (!remote.isConnected()) {
    cache = readLocal();
    writeLocal();
    lastError = "";
    remoteReady = false;
    return cache;
  }
  try {
    const [rooms, tasks, profile, settings, activity, systems] = await Promise.all([
      remote.select("rooms", "select=*&order=created_at.desc"),
      remote.select("tasks", "select=*&order=created_at.desc"),
      remote.select("app_profile", "select=*&id=eq.default&limit=1"),
      remote.select("app_settings", "select=*&id=eq.default&limit=1"),
      remote.select("activity_log", "select=*&order=created_at.desc&limit=" + ACTIVITY_LIMIT),
      remote.select("app_systems", "select=*"),
    ]);
    const empty = !rooms.length && !tasks.length && !activity.length && !systems.length;
    if (empty) {
      // قاعدة بيانات جديدة: تُزرع ببيانات البداية مرة واحدة لتبدأ المساحة بعناصر حقيقية.
      const seed = defaults();
      const first = { id: uid(), kind: "db", text: "تم ربط قاعدة البيانات وتجهيز المساحة", at: new Date().toISOString() };
      await Promise.all([
        remote.insert("rooms", seed.rooms),
        remote.insert("tasks", seed.tasks),
        remote.insert("activity_log", [{ id: first.id, kind: first.kind, text: first.text, created_at: first.at }]),
      ]);
      cache = Object.assign({}, seed, {
        profile: fromProfile(profile[0] || {}),
        settings: fromSettings(settings[0] || {}),
        activity: [first],
      });
    } else {
      cache = {
        rooms: rooms.map(toRoom),
        tasks: tasks.map(toTask),
        profile: fromProfile(profile[0] || {}),
        settings: fromSettings(settings[0] || {}),
        activity: activity.map(toActivity),
        messages: [],
        systems: systems.reduce((map, row) => Object.assign(map, { [row.id]: row.state }), {}),
      };
    }
    lastError = "";
    remoteReady = true;
    writeLocal();
  } catch (err) {
    cache = readLocal();
    lastError = err.message || String(err);
    remoteReady = false;
  }
  return cache;
}

export const getDB = () => cache || (cache = readLocal());

/** متصل فعلياً بقاعدة البيانات (لا يكفي وجود رابط محفوظ). */
export const isRemote = () => remoteReady;

export const syncError = () => lastError;

/* ---------- ربط/فصل قاعدة البيانات ---------- */

export async function connectSupabase(url, anonKey) {
  remote.saveConfig(url, anonKey);
  try {
    await remote.ping();
  } catch (err) {
    remote.clearConfig();
    throw err;
  }
  await hydrate();
  if (lastError) throw new Error(lastError);
  logActivity("db", "تم ربط قاعدة البيانات");
  return cache;
}

export function disconnectSupabase() {
  remote.disconnect();
  remoteReady = false;
  cache = readLocal();
  lastError = "";
  logActivity("db", "تم قطع الاتصال بقاعدة البيانات");
  return cache;
}

/* ---------- قراءة وكتابة ---------- */

function sync(run) {
  if (!remote.isConnected()) return;
  run().catch((err) => {
    lastError = err.message || String(err);
    toast("تعذّر الحفظ في قاعدة البيانات: " + lastError);
  });
}

function update(mutator) {
  const db = getDB();
  mutator(db);
  writeLocal();
  return db;
}

function pushActivity(db, kind, text) {
  const item = { id: uid(), kind, text, at: new Date().toISOString() };
  db.activity = [item].concat(db.activity || []).slice(0, ACTIVITY_LIMIT);
  sync(() => remote.insert("activity_log", [{ id: item.id, kind: kind, text: text, created_at: item.at }]));
  return item;
}

export function logActivity(kind, text) {
  return update((db) => pushActivity(db, kind, text));
}

export const listActivity = () => getDB().activity || [];

export const listMessages = () => getDB().messages || [];

export const listRooms = () => getDB().rooms;

export function addRoom(room) {
  const row = Object.assign({ id: uid() }, fromRoom(room));
  return update((db) => {
    db.rooms.unshift(row);
    pushActivity(db, "room", "أُضيفت غرفة «" + row.name + "»");
    sync(() => remote.insert("rooms", [row]));
  });
}

export function deleteRoom(id) {
  return update((db) => {
    const room = db.rooms.find((item) => item.id === id);
    db.rooms = db.rooms.filter((item) => item.id !== id);
    pushActivity(db, "room-del", "حُذفت غرفة" + (room ? " «" + room.name + "»" : ""));
    sync(() => remote.remove("rooms", "id=eq." + id));
  });
}

export function addTask(text) {
  const value = String(text || "").trim();
  if (!value) return getDB();
  const row = { id: uid(), text: value, done: false };
  return update((db) => {
    db.tasks.unshift(row);
    pushActivity(db, "task", "أُضيفت مهمة: " + value);
    sync(() => remote.insert("tasks", [row]));
  });
}

export function toggleTask(id) {
  return update((db) => {
    const task = db.tasks.find((item) => item.id === id);
    if (!task) return;
    task.done = !task.done;
    pushActivity(db, "task", (task.done ? "أُنجزت المهمة: " : "أُعيد فتح المهمة: ") + task.text);
    sync(() => remote.patch("tasks", "id=eq." + id, { done: task.done }));
  });
}

export function deleteTask(id) {
  return update((db) => {
    const task = db.tasks.find((item) => item.id === id);
    db.tasks = db.tasks.filter((item) => item.id !== id);
    pushActivity(db, "task", "حُذفت مهمة" + (task ? ": " + task.text : ""));
    sync(() => remote.remove("tasks", "id=eq." + id));
  });
}

export function saveProfile(profile) {
  return update((db) => {
    db.profile = Object.assign({}, db.profile, profile);
    pushActivity(db, "profile", "حُدّث الملف الشخصي");
    sync(() => remote.upsert("app_profile", [toProfileRow(db.profile)]));
  });
}

export function saveSettings(settings) {
  return update((db) => {
    db.settings = Object.assign({}, db.settings, settings);
    pushActivity(db, "settings", "حُدّثت الإعدادات");
    sync(() => remote.upsert("app_settings", [toSettingsRow(db.settings)]));
  });
}

export function sendMessage(message) {
  const row = {
    id: uid(),
    name: message.name,
    email: message.email || "",
    message: message.message,
    created_at: new Date().toISOString(),
  };
  return update((db) => {
    db.messages = [row].concat(db.messages || []).slice(0, 30);
    pushActivity(db, "support", "أُرسلت رسالة دعم من " + row.name);
    sync(() => remote.insert("contact_messages", [row]));
  });
}

/* ---------- الأنظمة ---------- */

export function getSystemState(id) {
  return (getDB().systems || {})[id] || null;
}

export function saveSystemState(id, state) {
  return update((db) => {
    db.systems = Object.assign({}, db.systems, { [id]: state });
    sync(() => remote.upsert("app_systems", [{ id: id, state: state, updated_at: new Date().toISOString() }]));
  });
}

export function resetData() {
  cache = defaults();
  writeLocal();
  if (remote.isConnected()) {
    sync(
      async () => {
        await remote.remove("rooms", "id=not.is.null");
        await remote.remove("tasks", "id=not.is.null");
        await remote.remove("activity_log", "id=not.is.null");
        await remote.remove("app_systems", "id=not.is.null");
        await remote.insert("rooms", cache.rooms);
        await remote.insert("tasks", cache.tasks);
        await remote.upsert("app_profile", [toProfileRow(cache.profile)]);
        await remote.upsert("app_settings", [toSettingsRow(cache.settings)]);
      }
    );
  }
  logActivity("reset", "تمت إعادة تعيين البيانات");
  return cache;
}

export function roomsPerDay(rooms, days = 7) {
  const labels = ["أحد", "اثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = iso(day);
    out.push({ label: labels[day.getDay()], value: rooms.filter((room) => room.date === key).length });
  }
  return out;
}
