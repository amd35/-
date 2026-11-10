"use strict";

/** قسم الأصدقاء: بحث عن حسابات حقيقية، إرسال دعوة، قبول، وإزالة. */

import * as api from "../api.js";
import { esc, initial, METHOD_LABELS, dateShort, toast } from "./common.js";

const STATE_TEXT = {
  friend: "صديق",
  outgoing: "دعوة مرسلة",
  incoming: "دعوة لك",
};

function searchRow(person) {
  let action;
  if (person.state === "none") {
    action = '<button type="button" class="btn-mini gold" data-add="' + esc(person.id) + '">إضافة</button>';
  } else {
    action = '<button type="button" class="btn-mini" disabled>' + STATE_TEXT[person.state] + "</button>";
  }
  return (
    '<article class="card">' +
      '<span class="avatar sm">' + esc(initial(person.name)) + "</span>" +
      '<div class="card-body"><div class="card-title"><h4>' + esc(person.name) + "</h4>" +
        '<span class="tag">' + esc(METHOD_LABELS[person.method] || "حساب") + "</span></div>" +
      "</div>" +
      '<div class="card-actions">' + action + "</div>" +
    "</article>"
  );
}

function friendRow(person) {
  return (
    '<article class="card">' +
      '<span class="avatar sm">' + esc(initial(person.name)) + "</span>" +
      '<div class="card-body"><div class="card-title"><h4>' + esc(person.name) + "</h4></div>" +
        '<p class="card-sub">صديق منذ ' + esc(dateShort(person.since)) + "</p></div>" +
      '<div class="card-actions">' +
        '<button type="button" class="btn-mini danger" data-remove="' + esc(person.id) + '">إزالة</button>' +
      "</div>" +
    "</article>"
  );
}

function requestRow(person) {
  return (
    '<article class="card">' +
      '<span class="avatar sm">' + esc(initial(person.name)) + "</span>" +
      '<div class="card-body"><div class="card-title"><h4>' + esc(person.name) + "</h4>" +
        '<span class="tag">' + esc(METHOD_LABELS[person.method] || "حساب") + "</span></div>" +
      "</div>" +
      '<div class="card-actions">' +
        '<button type="button" class="btn-mini gold" data-accept="' + esc(person.friendship) + '">قبول</button>' +
        '<button type="button" class="btn-mini" data-decline="' + esc(person.friendship) + '">رفض</button>' +
      "</div>" +
    "</article>"
  );
}

function waitingRow(person) {
  return (
    '<article class="card">' +
      '<span class="avatar sm">' + esc(initial(person.name)) + "</span>" +
      '<div class="card-body"><div class="card-title"><h4>' + esc(person.name) + "</h4>" +
        '<span class="tag">بانتظار الموافقة</span></div></div>' +
      '<div class="card-actions">' +
        '<button type="button" class="btn-mini danger" data-remove="' + esc(person.id) + '">إلغاء</button>' +
      "</div>" +
    "</article>"
  );
}

export default {
  title: "الأصدقاء",

  async render(root, ctx) {
    const data = await api.friends();
    const friends = data.friends || [];
    const incoming = data.incoming || [];
    const outgoing = data.outgoing || [];

    const requestsHtml = incoming.length || outgoing.length
      ? incoming.map(requestRow).join("") + outgoing.map(waitingRow).join("")
      : '<div class="empty"><span class="glyph">◇</span><p>لا توجد دعوات معلّقة.</p></div>';

    root.innerHTML =
      '<section class="block">' +
        '<div class="block-head">' +
          "<div><h3>أصدقاؤك</h3><p>ابحث بالاسم أو البريد أو رقم الهاتف</p></div>" +
          '<span class="chip">' + friends.length + " صديق</span>" +
        "</div>" +
        '<form class="search-row" id="search-form">' +
          '<input id="search-input" type="text" placeholder="من تبحث عنه؟" aria-label="بحث" />' +
          '<button type="submit" class="btn-ghost">بحث</button>' +
        "</form>" +
        '<div class="list" id="search-results"></div>' +
      "</section>" +
      '<section class="block">' +
        '<div class="block-head"><div><h3>الطلبات</h3><p>' +
          (incoming.length ? incoming.length + " دعوة بانتظارك" : "لا شيء بانتظارك") +
        "</p></div></div>" +
        '<div class="list">' + requestsHtml + "</div>" +
      "</section>" +
      '<section class="block">' +
        '<div class="block-head"><div><h3>القائمة</h3><p>من تستطيع دعوتهم لغرفة</p></div></div>' +
        '<div class="list">' +
          (friends.length
            ? friends.map(friendRow).join("")
            : '<div class="empty"><span class="glyph">◇</span><p><strong>قائمتك فارغة</strong>' +
              "ابحث عن حساب باسمه أو بريده وأرسل له دعوة صداقة.</p></div>") +
        "</div>" +
      "</section>";

    const results = root.querySelector("#search-results");
    const form = root.querySelector("#search-form");
    const input = root.querySelector("#search-input");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (query.length < 2) {
        results.innerHTML = '<div class="empty"><p>اكتب حرفين على الأقل للبحث.</p></div>';
        return;
      }
      results.innerHTML = '<div class="skeleton" style="height:60px"></div>';
      try {
        const people = await api.searchPeople(query);
        results.innerHTML = people.length
          ? people.map(searchRow).join("")
          : '<div class="empty"><p>لا يوجد حساب مطابق. جرّب بريداً أو رقماً كاملاً.</p></div>';
      } catch (err) {
        results.innerHTML = '<div class="empty"><p>' + esc(err.message || "تعذّر البحث") + "</p></div>";
      }
    });

    async function run(work, message) {
      try {
        await work();
        toast(message);
        ctx.refresh();
      } catch (err) {
        toast(err.message || "تعذّر إتمام الطلب");
      }
    }

    root.addEventListener("click", (event) => {
      const add = event.target.closest("[data-add]");
      if (add) {
        add.disabled = true;
        return run(() => api.addFriend(add.dataset.add), "أُرسلت دعوة الصداقة");
      }
      const accept = event.target.closest("[data-accept]");
      if (accept) {
        return run(() => api.respondFriend(accept.dataset.accept, true), "تم قبول الصداقة");
      }
      const decline = event.target.closest("[data-decline]");
      if (decline) {
        return run(() => api.respondFriend(decline.dataset.decline, false), "تم رفض الدعوة");
      }
      const remove = event.target.closest("[data-remove]");
      if (remove) {
        return run(() => api.removeFriend(remove.dataset.remove), "تم الحذف من القائمة");
      }
    });
  },
};
