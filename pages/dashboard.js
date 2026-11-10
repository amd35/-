"use strict";

import { getDB, roomsPerDay, isRemote } from "../store.js";
import { barChart } from "../charts.js";
import { escapeHtml, fmtDate, statusChip } from "../ui.js";

export default {
  title: "لوحة التحكم",
  subtitle: "ملخص سريع لأهم مؤشرات مساحتك",

  render(root) {
    const db = getDB();
    const live = db.rooms.filter((room) => room.status === "live").length;
    const members = db.rooms.reduce((sum, room) => sum + Number(room.members || 0), 0);
    const openTasks = db.tasks.filter((task) => !task.done).length;

    const recent =
      db.rooms
        .slice(0, 5)
        .map(
          (room) =>
            '<div class="row">' +
            '<div class="row-main">' +
            '<div class="row-name">' + escapeHtml(room.name) + "</div>" +
            '<div class="row-sub">' + escapeHtml(room.host) + " · " + room.members +
            " مشاركين · " + fmtDate(room.date) + "</div>" +
            "</div>" + statusChip(room.status) + "</div>"
        )
        .join("") || '<p class="empty">لا توجد غرف بعد — ابدأ بإضافة عنصر.</p>';

    root.innerHTML =
      (isRemote()
        ? ""
        : '<section class="card"><div class="card-head"><h2>البيانات محفوظة في هذا المتصفح فقط</h2></div>' +
          '<p class="hint">اربط قاعدة بيانات Supabase لتصبح البيانات دائمة وتظهر على أي جهاز.</p>' +
          '<div class="actions-row"><a class="btn btn-gold" href="/settings/">ربط قاعدة البيانات</a></div>' +
          "</section>") +
      '<div class="kpis">' +
        '<div class="kpi"><div class="kpi-value">' + db.rooms.length + '</div><div class="kpi-label">الغرف</div><div class="kpi-sub">إجمالي المسجّل</div></div>' +
        '<div class="kpi"><div class="kpi-value">' + members + '</div><div class="kpi-label">المشاركون</div><div class="kpi-sub">مجموع الحضور</div></div>' +
        '<div class="kpi"><div class="kpi-value">' + live + '</div><div class="kpi-label">غرف مباشرة</div><div class="kpi-sub">تعمل الآن</div></div>' +
        '<div class="kpi"><div class="kpi-value">' + openTasks + '</div><div class="kpi-label">مهام مفتوحة</div><div class="kpi-sub">بانتظار الإنجاز</div></div>' +
      "</div>" +
      '<div class="grid-2">' +
        '<section class="card">' +
          '<div class="card-head"><h2>الغرف خلال آخر ٧ أيام</h2></div>' +
          '<canvas id="dash-bars" class="chart" style="height:170px"></canvas>' +
        "</section>" +
        '<section class="card">' +
          '<div class="card-head"><h2>أحدث الغرف</h2><a class="link" href="/data-list/">عرض الكل</a></div>' +
          '<div class="rows">' + recent + "</div>" +
        "</section>" +
      "</div>" +
      '<section class="card">' +
        '<div class="card-head"><h2>إجراءات سريعة</h2></div>' +
        '<div class="actions-row">' +
          '<a class="btn btn-gold" href="/add-item/">إضافة عنصر</a>' +
          '<a class="btn" href="/tasks/">إدارة المهام</a>' +
          '<a class="btn" href="/analytics/">التحليلات</a>' +
        "</div>" +
      "</section>";

    barChart(root.querySelector("#dash-bars"), roomsPerDay(db.rooms));
  },
};
