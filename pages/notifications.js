"use strict";

import { getDB, isRemote, syncError, listActivity } from "../store.js";
import { escapeHtml, fmtDateTime } from "../ui.js";

const today = () => new Date().toISOString().slice(0, 10);

export default {
  title: "التنبيهات",
  subtitle: "التنبيهات المعلّقة وما فاتك من أحداث",

  render(root) {
    const db = getDB();
    const pending = [];

    if (!isRemote()) {
      pending.push({ tone: "sched", text: "قاعدة البيانات غير مرتبطة — البيانات محفوظة في هذا المتصفح فقط.", href: "/settings/" });
    }
    const error = syncError();
    if (error) pending.push({ tone: "closed", text: "تعذّر الحفظ في قاعدة البيانات: " + error });

    const live = db.rooms.filter((room) => room.status === "live").length;
    if (live) pending.push({ tone: "live", text: live + " غرفة مباشرة الآن.", href: "/data-list/" });

    const scheduledToday = db.rooms.filter((room) => room.status === "scheduled" && room.date === today()).length;
    if (scheduledToday) pending.push({ tone: "sched", text: scheduledToday + " غرفة مجدولة اليوم.", href: "/data-list/" });

    const openTasks = db.tasks.filter((task) => !task.done).length;
    if (openTasks) pending.push({ tone: "sched", text: openTasks + " مهمة مفتوحة بانتظار الإنجاز.", href: "/tasks/" });

    const history = listActivity().slice(0, 15);

    root.innerHTML =
      '<section class="card">' +
        '<div class="card-head"><h2>تنبيهات معلّقة</h2>' +
        '<span class="chip ' + (pending.length ? "sched" : "") + '">' + pending.length + " تنبيه</span></div>" +
        '<div class="rows">' +
        (pending
          .map(
            (item) =>
              '<div class="row">' +
                '<div class="row-main"><div class="row-name">' + escapeHtml(item.text) + "</div></div>" +
                (item.href ? '<a class="link" href="' + item.href + '">عرض</a>' : "") +
              "</div>"
          )
          .join("") || '<p class="empty">لا تنبيهات معلّقة — كل شيء على ما يرام.</p>') +
        "</div>" +
      "</section>" +
      '<section class="card">' +
        '<div class="card-head"><h2>تنبيهات سابقة</h2>' +
        '<a class="link" href="/activity-log/">السجل الكامل</a></div>' +
        '<div class="rows">' +
        (history
          .map(
            (item) =>
              '<div class="row">' +
                '<div class="row-main">' +
                  '<div class="row-name">' + escapeHtml(item.text) + "</div>" +
                  '<div class="row-sub">' + fmtDateTime(item.at) + "</div>" +
                "</div>" +
              "</div>"
          )
          .join("") || '<p class="empty">لا تنبيهات سابقة بعد.</p>') +
        "</div>" +
      "</section>";
  },
};
