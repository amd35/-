"use strict";

import { getDB, roomsPerDay } from "../store.js";
import { barChart, donutChart } from "../charts.js";

const STATUS_SEGMENTS = [
  { key: "live", label: "مباشر", color: "#69c98a" },
  { key: "scheduled", label: "مجدول", color: "#d4af37" },
  { key: "closed", label: "مغلق", color: "#5a564b" },
];

export default {
  title: "التحليلات",
  subtitle: "اتجاهات وأرقام مساحتك خلال آخر ٧ أيام",

  render(root) {
    const db = getDB();
    const rooms = db.rooms;
    const members = rooms.reduce((sum, room) => sum + Number(room.members || 0), 0);
    const average = rooms.length ? Math.round(members / rooms.length) : 0;
    const done = db.tasks.filter((task) => task.done).length;
    const completion = db.tasks.length ? Math.round((done / db.tasks.length) * 100) : 0;

    const segments = STATUS_SEGMENTS.map((segment) => ({
      label: segment.label,
      color: segment.color,
      value: rooms.filter((room) => room.status === segment.key).length,
    }));

    root.innerHTML =
      '<div class="kpis">' +
        '<div class="kpi"><div class="kpi-value">' + rooms.length + '</div><div class="kpi-label">إجمالي الغرف</div><div class="kpi-sub">كل الفترات</div></div>' +
        '<div class="kpi"><div class="kpi-value">' + average + '</div><div class="kpi-label">متوسط المشاركين</div><div class="kpi-sub">لكل غرفة</div></div>' +
        '<div class="kpi"><div class="kpi-value">' + completion + '%</div><div class="kpi-label">إنجاز المهام</div><div class="kpi-sub">' + done + " من " + db.tasks.length + '</div></div>' +
        '<div class="kpi"><div class="kpi-value">' + members + '</div><div class="kpi-label">مجموع الحضور</div><div class="kpi-sub">كل الغرف</div></div>' +
      "</div>" +
      '<div class="grid-2">' +
        '<section class="card">' +
          '<div class="card-head"><h2>الغرف الجديدة يومياً</h2></div>' +
          '<canvas id="analytics-bars" class="chart" style="height:200px"></canvas>' +
        "</section>" +
        '<section class="card">' +
          '<div class="card-head"><h2>توزيع الحالات</h2></div>' +
          '<canvas id="analytics-donut" class="chart" style="height:200px"></canvas>' +
          '<div class="rows">' +
            segments
              .map(
                (segment) =>
                  '<div class="row"><div class="row-main"><div class="row-name">' +
                  segment.label + '</div></div><span class="chip">' + segment.value + "</span></div>"
              )
              .join("") +
          "</div>" +
        "</section>" +
      "</div>";

    barChart(root.querySelector("#analytics-bars"), roomsPerDay(rooms));
    donutChart(root.querySelector("#analytics-donut"), segments, "غرف");
  },
};
