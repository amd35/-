"use strict";

/**
 * اتصال مباشر بقاعدة بيانات Supabase (Postgres) من المتصفح عبر REST.
 * يُحفظ رابط المشروع والمفتاح العام (anon) فقط في localStorage،
 * أما بيانات التطبيق فتُقرأ وتُكتب في القاعدة نفسها.
 */

const CONFIG_KEY = "sawt.supabase.v1";

const cleanUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

export function getConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (!cfg || !cfg.url || !cfg.anonKey) return null;
    return { url: cleanUrl(cfg.url), anonKey: String(cfg.anonKey) };
  } catch (err) {
    return null;
  }
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
  const headers = {
    apikey: cfg.anonKey,
    Authorization: "Bearer " + cfg.anonKey,
    Accept: "application/json",
  };
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
