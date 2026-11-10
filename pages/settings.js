"use strict";

import {
  getDB,
  saveSettings,
  resetData,
  isRemote,
  connectSupabase,
  disconnectSupabase,
} from "../store.js";
import { escapeHtml, toast } from "../ui.js";

function dbCardHtml(connected) {
  const head =
    '<div class="card-head"><h2>قاعدة البيانات</h2>' +
    '<span class="chip ' + (connected ? "live" : "sched") + '">' +
    (connected ? "متصل · Supabase" : "محلي فقط") +
    "</span></div>";

  if (connected) {
    return (
      head +
      '<p class="hint">كل الغرف والمهام والإعدادات تُحفظ الآن في قاعدة بيانات Supabase.</p>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn btn-danger" id="db-disconnect">قطع الاتصال</button>' +
      "</div>"
    );
  }

  return (
    head +
    '<p class="hint">البيانات حالياً داخل هذا المتصفح فقط. اربط مشروع Supabase لتُحفظ في قاعدة بيانات حقيقية.</p>' +
    '<div class="field"><label for="db-url">رابط المشروع (Project URL)</label>' +
    '<input id="db-url" class="input" dir="ltr" placeholder="https://xxxx.supabase.co" /></div>' +
    '<div class="field"><label for="db-key">المفتاح العام (anon key)</label>' +
    '<input id="db-key" class="input" dir="ltr" placeholder="eyJhbGciOi..." /></div>' +
    '<p class="hint" id="db-error" hidden></p>' +
    '<div class="form-actions">' +
    '<button type="button" class="btn btn-gold" id="db-connect">ربط القاعدة</button>' +
    '<a class="btn" href="/supabase/schema.sql" download="schema.sql">تنزيل ملف الجداول</a>' +
    "</div>" +
    '<details class="db-setup"><summary>خطوات الإنشاء (مرة واحدة)</summary>' +
    "<ol class=\"db-steps\">" +
    "<li>أنشئ مشروعاً جديداً على supabase.com.</li>" +
    "<li>من SQL Editor نفّذ محتوى الملف supabase/schema.sql.</li>" +
    "<li>من Project Settings ← API انسخ Project URL و anon key والصقهما هنا.</li>" +
    "</ol></details>"
  );
}

export default {
  title: "الإعدادات",
  subtitle: "خصّص مساحتك وتحكّم في تفضيلاتها",

  render(root) {
    const { settings } = getDB();
    const connected = isRemote();
    const refresh = () => document.dispatchEvent(new CustomEvent("spa:refresh-nav"));

    root.innerHTML =
      '<section class="card" id="db-card">' + dbCardHtml(connected) + "</section>" +
      '<section class="card">' +
        '<form id="settings-form">' +
          '<div class="field"><label for="space-name">اسم المساحة</label>' +
            '<input id="space-name" class="input" value="' + escapeHtml(settings.spaceName) + '" /></div>' +
          '<label class="switch"><span>إشعارات الغرف الجديدة</span>' +
            '<input type="checkbox" id="notify-rooms"' + (settings.notifyRooms ? " checked" : "") + " /></label>" +
          '<label class="switch"><span>إشعارات الدردشة</span>' +
            '<input type="checkbox" id="notify-chat"' + (settings.notifyChat ? " checked" : "") + " /></label>" +
          '<label class="switch"><span>كتم الميكروفون تلقائياً عند الدخول</span>' +
            '<input type="checkbox" id="auto-mute"' + (settings.autoMute ? " checked" : "") + " /></label>" +
          '<div class="form-actions" style="margin-top:14px">' +
            '<button type="submit" class="btn btn-gold">حفظ الإعدادات</button>' +
            '<button type="button" class="btn btn-danger" id="reset-data">إعادة تعيين البيانات</button>' +
          "</div>" +
        "</form>" +
      "</section>";

    if (connected) {
      root.querySelector("#db-disconnect").addEventListener("click", () => {
        disconnectSupabase();
        toast("تم قطع الاتصال — البيانات عادت للتخزين المحلي");
        refresh();
      });
    } else {
      root.querySelector("#db-connect").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const error = root.querySelector("#db-error");
        const url = root.querySelector("#db-url").value.trim();
        const anonKey = root.querySelector("#db-key").value.trim();
        if (!url || !anonKey) {
          error.hidden = false;
          error.textContent = "أدخل رابط المشروع والمفتاح العام.";
          return;
        }
        button.disabled = true;
        button.textContent = "جارٍ الربط…";
        try {
          await connectSupabase(url, anonKey);
          toast("تم الربط بقاعدة البيانات");
          refresh();
        } catch (err) {
          button.disabled = false;
          button.textContent = "ربط القاعدة";
          error.hidden = false;
          error.textContent = err.message || "تعذّر الربط بقاعدة البيانات.";
        }
      });
    }

    root.querySelector("#settings-form").addEventListener("submit", (event) => {
      event.preventDefault();
      saveSettings({
        spaceName: root.querySelector("#space-name").value.trim() || "غرفة الأصدقاء",
        notifyRooms: root.querySelector("#notify-rooms").checked,
        notifyChat: root.querySelector("#notify-chat").checked,
        autoMute: root.querySelector("#auto-mute").checked,
      });
      toast("تم حفظ الإعدادات");
      refresh();
    });

    root.querySelector("#reset-data").addEventListener("click", () => {
      resetData();
      toast("تمت إعادة تعيين البيانات");
      refresh();
    });
  },
};
