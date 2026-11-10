"use strict";

/* أدوات مشتركة لأقسام الواجهة */

export function esc(text) {
  return String(text === null || text === undefined ? "" : text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function initial(name) {
  const clean = String(name || "").trim();
  return clean ? clean[0] : "•";
}

export function timeShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
}

export function dateShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" });
}

export function toast(text) {
  window.dispatchEvent(new CustomEvent("app:toast", { detail: text }));
}

/** ينفّذ طلباً ويُظهر خطأه في شريط التنبيه إن فشل. */
export async function attempt(work, fallback) {
  try {
    return await work();
  } catch (err) {
    toast((err && err.message) || fallback || "تعذّر إتمام الطلب");
    return null;
  }
}

export const METHOD_LABELS = { email: "بالبريد", phone: "بالهاتف", guest: "ضيف" };

export function peopleCount(n) {
  const value = Number(n) || 0;
  if (value === 1) return "شخص واحد";
  if (value === 2) return "شخصان";
  if (value <= 10) return value + " أشخاص";
  return value + " شخصاً";
}
