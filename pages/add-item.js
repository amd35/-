"use strict";

import { addRoom } from "../store.js";
import { navigate, toast } from "../ui.js";

export default {
  title: "إضافة عنصر",
  subtitle: "سجّل غرفة جديدة في بياناتك",

  render(root) {
    const today = new Date().toISOString().slice(0, 10);

    root.innerHTML =
      '<section class="card">' +
        '<form id="add-form" novalidate>' +
          '<div class="field"><label for="name">اسم الغرفة *</label>' +
            '<input id="name" class="input" placeholder="مثال: جلسة المساء" /></div>' +
          '<div class="field"><label for="host">المضيف</label>' +
            '<input id="host" class="input" placeholder="اسم المضيف" /></div>' +
          '<div class="field"><label for="members">عدد المشاركين</label>' +
            '<input id="members" class="input" type="number" min="0" value="1" /></div>' +
          '<div class="field"><label for="status">الحالة</label>' +
            '<select id="status" class="input">' +
              '<option value="live">مباشر</option>' +
              '<option value="scheduled" selected>مجدول</option>' +
              '<option value="closed">مغلق</option>' +
            "</select></div>" +
          '<div class="field"><label for="date">التاريخ</label>' +
            '<input id="date" class="input" type="date" value="' + today + '" /></div>' +
          '<p class="hint" id="form-error" hidden></p>' +
          '<div class="form-actions">' +
            '<button type="submit" class="btn btn-gold">حفظ العنصر</button>' +
            '<a class="btn" href="/data-list/">إلغاء</a>' +
          "</div>" +
        "</form>" +
      "</section>";

    const form = root.querySelector("#add-form");
    const error = root.querySelector("#form-error");

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = root.querySelector("#name").value.trim();
      if (!name) {
        error.hidden = false;
        error.textContent = "اسم الغرفة مطلوب.";
        return;
      }
      addRoom({
        name,
        host: root.querySelector("#host").value.trim(),
        members: root.querySelector("#members").value,
        status: root.querySelector("#status").value,
        date: root.querySelector("#date").value,
      });
      toast("تم حفظ العنصر");
      navigate("/data-list/");
    });
  },
};
