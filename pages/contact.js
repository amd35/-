"use strict";

import { sendMessage, isRemote } from "../store.js";
import { toast } from "../ui.js";

export default {
  title: "اتصل بنا",
  subtitle: "أرسل ملاحظة أو طلب دعم لفريق المساحة",

  render(root) {
    root.innerHTML =
      '<section class="card">' +
        '<div class="card-head"><h2>نموذج التواصل</h2>' +
        '<span class="chip' + (isRemote() ? " live" : "") + '">' +
        (isRemote() ? "يُحفظ في قاعدة البيانات" : "يُحفظ محلياً") + "</span></div>" +
        '<form id="contact-form" novalidate>' +
          '<div class="field"><label for="c-name">الاسم *</label>' +
            '<input id="c-name" class="input" placeholder="اسمك" /></div>' +
          '<div class="field"><label for="c-email">البريد الإلكتروني</label>' +
            '<input id="c-email" class="input" dir="ltr" type="email" placeholder="you@example.com" /></div>' +
          '<div class="field"><label for="c-message">الرسالة *</label>' +
            '<textarea id="c-message" class="input" placeholder="اكتب ملاحظتك أو المشكلة التي تواجهها…"></textarea></div>' +
          '<p class="hint" id="c-error" hidden></p>' +
          '<div class="form-actions"><button type="submit" class="btn btn-gold">إرسال الرسالة</button></div>' +
        "</form>" +
        '<div id="c-sent" hidden>' +
          '<p class="hint" id="c-sent-text"></p>' +
          '<button type="button" class="btn" id="c-again">إرسال رسالة أخرى</button>' +
        "</div>" +
      "</section>";

    const form = root.querySelector("#contact-form");
    const sent = root.querySelector("#c-sent");
    const error = root.querySelector("#c-error");

    root.querySelector("#c-again").addEventListener("click", () => {
      form.reset();
      form.hidden = false;
      sent.hidden = true;
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = root.querySelector("#c-name").value.trim();
      const message = root.querySelector("#c-message").value.trim();
      if (!name || !message) {
        error.hidden = false;
        error.textContent = "الاسم والرسالة مطلوبان.";
        return;
      }
      error.hidden = true;
      sendMessage({ name, email: root.querySelector("#c-email").value.trim(), message });
      form.hidden = true;
      sent.hidden = false;
      root.querySelector("#c-sent-text").textContent =
        isRemote() ? "وصلت رسالتك إلى قاعدة البيانات، وسنرد عليك في أقرب وقت." : "تم حفظ رسالتك محلياً — اربط قاعدة البيانات من الإعدادات لإرسالها للفريق.";
      toast("شكراً لك — تم إرسال الرسالة");
    });
  },
};
