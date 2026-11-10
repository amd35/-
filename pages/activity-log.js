"use strict";

import { listActivity, isRemote, syncError } from "../store.js";
import { escapeHtml, fmtDateTime } from "../ui.js";

const ICONS = {
  room: "🎙️",
  "room-del": "🗑️",
  task: "✅",
  profile: "👤",
  settings: "⚙️",
  db: "🔗",
  support: "💬",
  reset: "♻️",
  system: "🧩",
};

export default {
  title: "سجل النشاط",
  subtitle: "كل ما جرى في مساحتك بالترتيب الزمني",

  render(root) {
    const items = listActivity();
    const error = syncError();
    const hint = error
      ? "تعذّر الوصول إلى قاعدة البيانات (" + escapeHtml(error) + ") — المعروض من هذا المتصفح."
      : isRemote()
        ? "يُسجَّل النشاط في قاعدة البيانات ويظهر على كل الأجهزة."
        : "يُسجَّل النشاط محلياً في هذا المتصفح حتى تربط قاعدة البيانات.";

    root.innerHTML =
      '<section class="card">' +
        '<div class="card-head"><h2>النشاط الأخير</h2>' +
        '<span class="chip">' + items.length + " حركة</span></div>" +
        '<p class="hint">' + hint + "</p>" +
        '<div class="rows">' +
        (items
          .map(
            (item) =>
              '<div class="row">' +
                '<span class="sys-icon">' + (ICONS[item.kind] || "•") + "</span>" +
                '<div class="row-main">' +
                  '<div class="row-name">' + escapeHtml(item.text) + "</div>" +
                  '<div class="row-sub">' + fmtDateTime(item.at) + "</div>" +
                "</div>" +
              "</div>"
          )
          .join("") || '<p class="empty">لا نشاط بعد — أي إضافة أو تعديل سيظهر هنا.</p>') +
        "</div>" +
      "</section>";
  },
};
