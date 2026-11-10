"use strict";

import * as remote from "./db.js";
import { toast } from "./ui.js";

const KEY = "sawt.db.v1";

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

/** يُنفَّذ مرة عند الإقلاع: يجلب البيانات من Supabase إن كان متصلاً. */
export async function hydrate() {
  if (!remote.isConnected()) {
    cache = readLocal();
    writeLocal();
    lastError = "";
    return cache;
  }
  try {
    const [rooms, tasks, profile, settings] = await Promise.all([
      remote.select("rooms", "select=*&order=created_at.desc"),
      remote.select("tasks", "select=*&order=created_at.desc"),
      remote.select("app_profile", "select=*&id=eq.default&limit=1"),
      remote.select("app_settings", "select=*&id=eq.default&limit=1"),
    ]);
    cache = {
      rooms: rooms.map(toRoom),
      tasks: tasks.map(toTask),
      profile: fromProfile(profile[0] || {}),
      settings: fromSettings(settings[0] || {}),
    };
    lastError = "";
    writeLocal();
  } catch (err) {
    cache = readLocal();
    lastError = err.message || String(err);
  }
  return cache;
}

export const getDB = () => cache || (cache = readLocal());

export const isRemote = () => remote.isConnected();

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
  return cache;
}

export function disconnectSupabase() {
  remote.clearConfig();
  cache = readLocal();
  lastError = "";
  return cache;
}

/* ---------- قراءة وكتابة ---------- */

function sync(promise) {
  if (!remote.isConnected()) return;
  promise.catch((err) => {
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

export const listRooms = () => getDB().rooms;

export function addRoom(room) {
  const row = Object.assign({ id: uid() }, fromRoom(room));
  return update((db) => {
    db.rooms.unshift(row);
    sync(remote.insert("rooms", [row]));
  });
}

export function deleteRoom(id) {
  return update((db) => {
    db.rooms = db.rooms.filter((room) => room.id !== id);
    sync(remote.remove("rooms", "id=eq." + id));
  });
}

export function addTask(text) {
  const value = String(text || "").trim();
  if (!value) return getDB();
  const row = { id: uid(), text: value, done: false };
  return update((db) => {
    db.tasks.unshift(row);
    sync(remote.insert("tasks", [row]));
  });
}

export function toggleTask(id) {
  return update((db) => {
    const task = db.tasks.find((item) => item.id === id);
    if (!task) return;
    task.done = !task.done;
    sync(remote.patch("tasks", "id=eq." + id, { done: task.done }));
  });
}

export function deleteTask(id) {
  return update((db) => {
    db.tasks = db.tasks.filter((task) => task.id !== id);
    sync(remote.remove("tasks", "id=eq." + id));
  });
}

export function saveProfile(profile) {
  return update((db) => {
    db.profile = Object.assign({}, db.profile, profile);
    sync(remote.upsert("app_profile", [toProfileRow(db.profile)]));
  });
}

export function saveSettings(settings) {
  return update((db) => {
    db.settings = Object.assign({}, db.settings, settings);
    sync(remote.upsert("app_settings", [toSettingsRow(db.settings)]));
  });
}

export function resetData() {
  cache = defaults();
  writeLocal();
  if (remote.isConnected()) {
    sync(
      (async () => {
        await remote.remove("rooms", "id=not.is.null");
        await remote.remove("tasks", "id=not.is.null");
        await remote.insert("rooms", cache.rooms);
        await remote.insert("tasks", cache.tasks);
        await remote.upsert("app_profile", [toProfileRow(cache.profile)]);
        await remote.upsert("app_settings", [toSettingsRow(cache.settings)]);
      })()
    );
  }
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
