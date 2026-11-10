"use strict";

import { listRooms, deleteRoom } from "../store.js";
import { escapeHtml, fmtDate, statusChip, toast } from "../ui.js";

export default {
  title: "البيانات",
  subtitle: "كل العناصر المسجّلة — ابحث، رشّح، واحذف",

  render(root) {
    root.innerHTML =
      '<section class="card">' +
        '<div class="toolbar">' +
          '<input id="q" class="input" type="search" placeholder="ابحث بالاسم أو المضيف…" aria-label="بحث" />' +
          '<select id="status-filter" class="input" aria-label="الحالة">' +
            '<option value="">كل الحالات</option>' +
            '<option value="live">مباشر</option>' +
            '<option value="scheduled">مجدول</option>' +
            '<option value="closed">مغلق</option>' +
          "</select>" +
          '<a class="btn btn-gold" href="/add-item/">+ إضافة</a>' +
        "</div>" +
        '<p class="hint" id="count"></p>' +
        '<div class="rows" id="rows"></div>' +
      "</section>";

    const rows = root.querySelector("#rows");

    const paint = () => {
      const term = root.querySelector("#q").value.trim().toLowerCase();
      const status = root.querySelector("#status-filter").value;
      const items = listRooms().filter((room) => {
        const matchesTerm =
          !term ||
          room.name.toLowerCase().includes(term) ||
          String(room.host || "").toLowerCase().includes(term);
        const matchesStatus = !status || room.status === status;
        return matchesTerm && matchesStatus;
      });

      root.querySelector("#count").textContent = items.length + " من " + listRooms().length + " عنصر";

      rows.innerHTML =
        items
          .map(
            (room) =>
              '<div class="row" data-id="' + room.id + '">' +
                '<div class="row-main">' +
                  '<div class="row-name">' + escapeHtml(room.name) + "</div>" +
                  '<div class="row-sub">' + escapeHtml(room.host) + " · " + room.members +
                  ' مشاركين · <span class="hide-sm">' + fmtDate(room.date) + "</span></div>" +
                "</div>" +
                statusChip(room.status) +
                '<button type="button" class="icon-btn" data-del="' + room.id + '" aria-label="حذف">حذف</button>' +
              "</div>"
          )
          .join("") || '<p class="empty">لا نتائج مطابقة.</p>';
    };

    root.querySelector("#q").addEventListener("input", paint);
    root.querySelector("#status-filter").addEventListener("change", paint);

    rows.addEventListener("click", (event) => {
      const button = event.target.closest("[data-del]");
      if (!button) return;
      deleteRoom(button.dataset.del);
      toast("تم حذف العنصر");
      paint();
    });

    paint();
  },
};
