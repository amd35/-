"use strict";

/**
 * اتصال مباشر بقاعدة بيانات Postgres من المتصفح عبر واجهة REST متوافقة مع Supabase.
 * يُستخدم الاتصال الافتراضي من db-config.js، ويمكن ربط مشروع Supabase خاص
 * من صفحة الإعدادات فيُحفظ في localStorage ويحل محل الافتراضي.
 */

import { defaultDb } from "./db-config.js";

const CONFIG_KEY = "sawt.supabase.v1";

const cleanUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

export function getConfig() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
  } catch (err) {
    saved = null;
  }
  if (saved && saved.off) return null;
  if (saved && saved.url && saved.anonKey) {
    return { url: cleanUrl(saved.url), anonKey: String(saved.anonKey).trim() };
  }
  return defaultDb();
}

export function saveConfig(url, anonKey) {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ url: cleanUrl(url), anonKey: String(anonKey || "").trim() })
  );
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

/** يوقف الاتصال الافتراضي حتى يربط المستخدم قاعدة بيانات خاصة به. */
export function disconnect() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ off: true }));
}

export const isConnected = () => !!getConfig();

async function errorText(res) {
  if (res.status === 401 || res.status === 403) {
    return "المفتاح العام غير صحيح أو صلاحيات الجداول غير مفعّلة (" + res.status + ").";
  }
  if (res.status === 404) {
    return "لم يتم العثور على الجداول — تحقّق من رابط المشروع ومن تنفيذ supabase/schema.sql.";
  }
  let detail = "";
  try {
    const body = await res.json();
    detail = body.message || body.hint || body.details || "";
  } catch (err) {
    // لا تفاصيل إضافية
  }
  return detail || "تعذّر تنفيذ الطلب على قاعدة البيانات (" + res.status + ").";
}

async function request(table, params, init) {
  const cfg = getConfig();
  if (!cfg) throw new Error("لا يوجد اتصال بقاعدة بيانات.");

  const options = init || {};
  const headers = { Accept: "application/json" };
  if (cfg.anonKey) {
    headers.apikey = cfg.anonKey;
    headers.Authorization = "Bearer " + cfg.anonKey;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }
  if (options.prefer) headers.Prefer = options.prefer;

  let res;
  try {
    res = await fetch(cfg.url + "/rest/v1/" + table + (params ? "?" + params : ""), {
      method: options.method || "GET",
      headers,
      body: options.body,
    });
  } catch (err) {
    throw new Error("تعذّر الوصول إلى Supabase — تحقّق من الرابط ومن اتصال الإنترنت.");
  }

  if (!res.ok) throw new Error(await errorText(res));
  if (res.status === 204) return [];
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export const select = (table, params) => request(table, params);

export const insert = (table, rows) =>
  request(table, "", { method: "POST", body: JSON.stringify(rows) });

export const patch = (table, filter, values) =>
  request(table, filter, { method: "PATCH", body: JSON.stringify(values) });

export const remove = (table, filter) => request(table, filter, { method: "DELETE" });

export const upsert = (table, rows) =>
  request(table, "", {
    method: "POST",
    body: JSON.stringify(rows),
    prefer: "resolution=merge-duplicates,return=representation",
  });

export async function ping() {
  await select("app_settings", "select=id&limit=1");
}
