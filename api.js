"use strict";

/**
 * عميل دوال قاعدة البيانات (RPC) وجلسة المستخدم.
 * كل الحسابات الحقيقية تُنفَّذ داخل Postgres، ولمفتاح الواجهة لا يصل إلى جدول الحسابات.
 */

import { getConfig } from "./db.js";

const SESSION_KEY = "sawt.session.v1";

/* ---------- الجلسة ---------- */

export function getSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return raw && raw.token && raw.user ? raw : null;
  } catch (err) {
    return null;
  }
}

export function saveSession(data) {
  const session = { token: data.token, user: data.user, at: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function updateUser(user) {
  const current = getSession();
  if (!current) return null;
  return saveSession({ token: current.token, user: user });
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export const token = () => (getSession() || {}).token || null;

export const isSignedIn = () => !!getSession();

/* ---------- نداء الدوال ---------- */

async function call(fn, args) {
  const cfg = getConfig();
  if (!cfg) throw new Error("لا يوجد اتصال بقاعدة البيانات.");

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (cfg.anonKey) {
    headers.apikey = cfg.anonKey;
    headers.Authorization = "Bearer " + cfg.anonKey;
  }

  let res;
  try {
    res = await fetch(cfg.url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(args || {}),
    });
  } catch (err) {
    throw new Error("تعذّر الوصول إلى قاعدة البيانات — تحقّق من الاتصال.");
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = null;
  }

  if (!res.ok) {
    const message = (data && (data.message || data.details || data.hint)) || "تعذّر تنفيذ الطلب (" + res.status + ").";
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

const withToken = (fn, args) => call(fn, Object.assign({ p_token: token() }, args || {}));

/* ---------- الحساب ---------- */

export const signupEmail = (name, email, password) =>
  call("app_signup", { p_name: name, p_email: email, p_password: password });

export const signupPhone = (name, phone, password) =>
  call("app_signup", { p_name: name, p_phone: phone, p_password: password });

export const loginWith = (identifier, password) =>
  call("app_login", { p_identifier: identifier, p_password: password });

export const enterAsGuest = (name) => call("app_guest", { p_name: name });

export const checkSession = () => withToken("app_session");
export const logout = () => withToken("app_logout");
export const saveProfile = (name, bio) => withToken("app_profile_save", { p_name: name, p_bio: bio });

/* ---------- الأصدقاء ---------- */

export const friends = () => withToken("app_friends");
export const searchPeople = (q) => withToken("app_friend_search", { p_q: q });
export const addFriend = (userId) => withToken("app_friend_request", { p_user: userId });
export const respondFriend = (friendship, accept) =>
  withToken("app_friend_respond", { p_friendship: friendship, p_accept: accept });
export const removeFriend = (userId) => withToken("app_friend_remove", { p_user: userId });

/* ---------- الغرف ---------- */

export const rooms = (game) => withToken("app_rooms", game ? { p_game: game } : {});
export const createRoom = (name, game, seats, topic) =>
  withToken("app_room_create", { p_name: name, p_game: game || "voice", p_seats: seats || 5, p_topic: topic || "" });
export const joinRoom = (roomId) => withToken("app_room_join", { p_room: roomId });
export const getRoom = (roomId) => withToken("app_room_get", { p_room: roomId });
export const say = (roomId, text) => withToken("app_room_say", { p_room: roomId, p_text: text });
export const leaveRoom = (roomId) => withToken("app_room_leave", { p_room: roomId });
export const clearChat = (roomId) => withToken("app_room_clear", { p_room: roomId });
export const updateRoom = (roomId, values) =>
  withToken("app_room_update", {
    p_room: roomId,
    p_name: values.name === undefined ? null : values.name,
    p_seats: values.seats === undefined ? null : values.seats,
    p_topic: values.topic === undefined ? null : values.topic,
  });

/* ---------- الألعاب ---------- */

export const games = () => withToken("app_games_list");
