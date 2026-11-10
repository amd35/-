"use strict";

/**
 * اتصال قاعدة البيانات الافتراضي.
 * التطبيق يخاطب واجهة REST متوافقة مع Supabase على منفذ مستقل من نفس المضيف:
 * محلياً http://localhost:3001 وفي المعاينة https://3001-<نفس المضيف>.
 * ربط مشروع Supabase خاص من صفحة الإعدادات يحل محل هذا الافتراضي.
 */

const DB_PORT = "3001";

export function defaultDb() {
  const host = String(location.hostname || "");
  const preview = host.match(/^3000-(.+)$/);
  if (preview) return { url: location.protocol + "//" + DB_PORT + "-" + preview[1], anonKey: "" };
  if (host === "localhost" || host === "127.0.0.1") {
    return { url: location.protocol + "//" + host + ":" + DB_PORT, anonKey: "" };
  }
  return null;
}
