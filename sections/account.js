"use strict";

/** قسم الحساب: بيانات المستخدم كما هي في قاعدة البيانات، تعديل الاسم والنبذة، وخروج. */

import * as api from "../api.js";
import { esc, initial, METHOD_LABELS, dateShort, toast } from "./common.js";

export default {
  title: "حسابي",

  async render(root, ctx) {
    const user = ctx.user;
    const [friends, rooms] = await Promise.all([api.friends(), api.rooms()]);
    const mine = rooms.filter((room) => room.host_id === user.id);

    root.innerHTML =
      '<section class="block">' +
        '<article class="card">' +
          '<span class="avatar">' + esc(initial(user.name)) + "</span>" +
          '<div class="card-body">' +
            '<div class="card-title"><h4>' + esc(user.name) + "</h4>" +
              '<span class="tag">' + esc(METHOD_LABELS[user.method] || "حساب") + "</span></div>" +
            '<p class="card-sub">' + esc(user.email || user.phone || "حساب ضيف") +
              '<span class="sep">·</span>منذ ' + esc(dateShort(user.created_at)) +
            "</p>" +
          "</div>" +
        "</article>" +
        '<div class="stat-row">' +
          '<div class="stat"><b>' + friends.friends.length + "</b><span>أصدقاء</span></div>" +
          '<div class="stat"><b>' + mine.length + "</b><span>طاولاتي</span></div>" +
          '<div class="stat"><b>' + rooms.length + "</b><span>مفتوحة الآن</span></div>" +
        "</div>" +
      "</section>" +
      '<section class="block">' +
        '<div class="block-head"><div><h3>بياناتك</h3><p>تظهر للأصدقاء داخل التطبيق</p></div></div>' +
        '<div class="form-card">' +
          '<label class="field-row"><span class="label">الاسم</span>' +
            '<input id="acc-name" type="text" value="' + esc(user.name) + '" /></label>' +
          '<label class="field-row"><span class="label">نبذة</span>' +
            '<textarea id="acc-bio" placeholder="سطر عنك…">' + esc(user.bio || "") + "</textarea></label>" +
          '<div class="form-actions">' +
            '<button type="button" class="btn-primary" id="save-profile">حفظ التعديلات</button>' +
          "</div>" +
        "</div>" +
      "</section>" +
      '<section class="block">' +
        '<div class="block-head"><div><h3>الإدارة</h3><p>الصفحات التفصيلية لحسابك</p></div></div>' +
        '<div class="link-list">' +
          '<a class="link-row" href="/profile/"><span>الملف الشخصي</span><span>›</span></a>' +
          '<a class="link-row" href="/dashboard/"><span>لوحة التحكم</span><span>›</span></a>' +
          '<a class="link-row" href="/settings/"><span>الإعدادات</span><span>›</span></a>' +
        "</div>" +
      "</section>" +
      '<section class="block">' +
        '<button type="button" class="btn-mini danger btn-block" id="signout">تسجيل الخروج</button>' +
      "</section>";

    root.querySelector("#save-profile").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const updated = await api.saveProfile(
          root.querySelector("#acc-name").value.trim(),
          root.querySelector("#acc-bio").value.trim()
        );
        ctx.setUser(updated);
        toast("حُفظت بياناتك");
        ctx.refresh();
      } catch (err) {
        button.disabled = false;
        toast(err.message || "تعذّر الحفظ");
      }
    });

    root.querySelector("#signout").addEventListener("click", () => ctx.signOut());
  },
};
