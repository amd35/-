"use strict";

import { getDB, saveSettings, resetData } from "../store.js";
import { escapeHtml, toast } from "../ui.js";

export default {
  title: "الإعدادات",
  subtitle: "خصّص مساحتك وتحكّم في تفضيلاتها",

  render(root) {
    const { settings } = getDB();

    root.innerHTML =
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

    root.querySelector("#settings-form").addEventListener("submit", (event) => {
      event.preventDefault();
      saveSettings({
        spaceName: root.querySelector("#space-name").value.trim() || "غرفة الأصدقاء",
        notifyRooms: root.querySelector("#notify-rooms").checked,
        notifyChat: root.querySelector("#notify-chat").checked,
        autoMute: root.querySelector("#auto-mute").checked,
      });
      toast("تم حفظ الإعدادات");
      document.dispatchEvent(new CustomEvent("spa:refresh-nav"));
    });

    root.querySelector("#reset-data").addEventListener("click", () => {
      resetData();
      toast("تمت إعادة تعيين البيانات");
      document.dispatchEvent(new CustomEvent("spa:refresh-nav"));
    });
  },
};
