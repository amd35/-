"use strict";

import { getDB, saveProfile } from "../store.js";
import { escapeHtml, toast } from "../ui.js";

export default {
  title: "الملف الشخصي",
  subtitle: "بياناتك الشخصية وتفضيلاتك",

  render(root) {
    const { profile } = getDB();
    const initial = (profile.name || "؟").trim().charAt(0) || "؟";

    root.innerHTML =
      '<section class="card">' +
        '<form id="profile-form">' +
          '<div class="avatar-preview" id="avatar-preview">' + escapeHtml(initial) + "</div>" +
          '<div class="field"><label for="p-name">الاسم</label>' +
            '<input id="p-name" class="input" value="' + escapeHtml(profile.name) + '" /></div>' +
          '<div class="field"><label for="p-email">البريد الإلكتروني</label>' +
            '<input id="p-email" class="input" type="email" value="' + escapeHtml(profile.email) + '" placeholder="name@example.com" /></div>' +
          '<div class="field"><label for="p-bio">نبذة</label>' +
            '<textarea id="p-bio" class="input">' + escapeHtml(profile.bio) + "</textarea></div>" +
          '<label class="switch"><span>إشعارات البريد الإلكتروني</span>' +
            '<input type="checkbox" id="p-notify-email"' + (profile.notifyEmail ? " checked" : "") + " /></label>" +
          '<label class="switch"><span>تذكير المهام</span>' +
            '<input type="checkbox" id="p-notify-tasks"' + (profile.notifyTasks ? " checked" : "") + " /></label>" +
          '<div class="form-actions" style="margin-top:14px">' +
            '<button type="submit" class="btn btn-gold">حفظ الملف</button>' +
          "</div>" +
        "</form>" +
      "</section>";

    const nameInput = root.querySelector("#p-name");
    const preview = root.querySelector("#avatar-preview");

    nameInput.addEventListener("input", () => {
      const value = nameInput.value.trim();
      preview.textContent = value.charAt(0) || "؟";
    });

    root.querySelector("#profile-form").addEventListener("submit", (event) => {
      event.preventDefault();
      saveProfile({
        name: nameInput.value.trim() || "أنت",
        email: root.querySelector("#p-email").value.trim(),
        bio: root.querySelector("#p-bio").value.trim(),
        notifyEmail: root.querySelector("#p-notify-email").checked,
        notifyTasks: root.querySelector("#p-notify-tasks").checked,
      });
      toast("تم حفظ الملف");
    });
  },
};
