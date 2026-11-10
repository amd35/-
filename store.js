"use strict";

const KEY = "sawt.db.v1";

export const STATUS = {
  live: { label: "مباشر", tone: "live" },
  scheduled: { label: "مجدول", tone: "sched" },
  closed: { label: "مغلق", tone: "closed" },
};

const uid = () => Math.random().toString(36).slice(2, 9);
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

export function getDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw);
      return Object.assign(defaults(), db);
    }
  } catch (err) {
    // تجاهل البيانات التالفة والعودة للافتراضي
  }
  const db = defaults();
  setDB(db);
  return db;
}

export function setDB(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function update(mutator) {
  const db = getDB();
  mutator(db);
  setDB(db);
  return db;
}

export const listRooms = () => getDB().rooms;

export function addRoom(room) {
  return update((db) => {
    db.rooms.unshift({
      id: uid(),
      name: room.name,
      host: room.host || "بدون مضيف",
      members: Number(room.members) || 0,
      status: STATUS[room.status] ? room.status : "scheduled",
      date: room.date || iso(new Date()),
    });
  });
}

export function deleteRoom(id) {
  return update((db) => {
    db.rooms = db.rooms.filter((room) => room.id !== id);
  });
}

export function addTask(text) {
  const value = String(text || "").trim();
  if (!value) return getDB();
  return update((db) => {
    db.tasks.unshift({ id: uid(), text: value, done: false });
  });
}

export function toggleTask(id) {
  return update((db) => {
    const task = db.tasks.find((item) => item.id === id);
    if (task) task.done = !task.done;
  });
}

export function deleteTask(id) {
  return update((db) => {
    db.tasks = db.tasks.filter((task) => task.id !== id);
  });
}

export function saveProfile(profile) {
  return update((db) => {
    db.profile = Object.assign({}, db.profile, profile);
  });
}

export function saveSettings(settings) {
  return update((db) => {
    db.settings = Object.assign({}, db.settings, settings);
  });
}

export function resetData() {
  const db = defaults();
  setDB(db);
  return db;
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
