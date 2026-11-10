"use strict";

import { getSystemState, saveSystemState, newId, logActivity } from "../store.js";
import { escapeHtml, toast } from "../ui.js";

const ID = "store";

const normalize = (item) => ({
  id: item.id || newId(),
  name: String(item.name || "منتج"),
  price: Number(item.price) || 0,
  stock: Number(item.stock) || 0,
  active: item.active !== false,
});

function load() {
  const state = getSystemState(ID);
  if (state && Array.isArray(state.items) && state.items.length) {
    return state.items.map(normalize);
  }
  return [
    { id: newId(), name: "تاج ذهبي", price: 5, stock: 20, active: true },
    { id: newId(), name: "إطار مميز", price: 2, stock: 50, active: true },
  ];
}

export default {
  title: "إدارة المتجر",
  subtitle: "أضف منتجاتك، حدّد أسعارها وكمياتها، وتحكّم بتوفرها",

  render(root) {
    const items = load();
    const persist = () => saveSystemState(ID, { items: items });

    root.innerHTML =
      '<section class="card">' +
        '<div class="card-head"><h2>ملخص المتجر</h2><span class="chip" id="store-count"></span></div>' +
        '<div class="kpis">' +
          '<div class="kpi"><div class="kpi-value" id="store-items">0</div><div class="kpi-label">المنتجات</div><div class="kpi-sub">إجمالي المسجّل</div></div>' +
          '<div class="kpi"><div class="kpi-value" id="store-active">0</div><div class="kpi-label">متوفر للبيع</div><div class="kpi-sub">مفعّل الآن</div></div>' +
          '<div class="kpi"><div class="kpi-value" id="store-stock">0</div><div class="kpi-label">قطع في المخزون</div><div class="kpi-sub">مجموع الكميات</div></div>' +
          '<div class="kpi"><div class="kpi-value" id="store-value">0</div><div class="kpi-label">قيمة المخزون</div><div class="kpi-sub">سعر × كمية</div></div>' +
        "</div>" +
      "</section>" +
      '<section class="card">' +
        '<div class="card-head"><h2>إضافة منتج</h2></div>' +
        '<div class="toolbar">' +
          '<input id="new-name" class="input" placeholder="اسم المنتج…" aria-label="اسم المنتج" />' +
          '<input id="new-price" class="input store-input" type="number" min="0" step="1" placeholder="السعر" aria-label="السعر" />' +
          '<input id="new-stock" class="input store-input" type="number" min="0" step="1" placeholder="الكمية" aria-label="الكمية" />' +
          '<button type="button" class="btn btn-gold" id="add-product">إضافة</button>' +
        "</div>" +
      "</section>" +
      '<section class="card">' +
        '<div class="card-head"><h2>المنتجات</h2><span class="chip sched" id="store-chip"></span></div>' +
        '<div id="store-list"></div>' +
      "</section>";

    const list = root.querySelector("#store-list");

    const paint = () => {
      const active = items.filter((item) => item.active);
      const stock = items.reduce((sum, item) => sum + item.stock, 0);
      const value = items.reduce((sum, item) => sum + item.price * item.stock, 0);

      root.querySelector("#store-items").textContent = items.length;
      root.querySelector("#store-active").textContent = active.length;
      root.querySelector("#store-stock").textContent = stock;
      root.querySelector("#store-value").textContent = value + "$";
      root.querySelector("#store-count").textContent = items.length + " منتج";
      root.querySelector("#store-chip").textContent = active.length + " متوفر";

      list.innerHTML =
        items
          .map(
            (item) =>
              '<div class="store-row" data-id="' + item.id + '">' +
                '<div class="store-main">' +
                  '<div class="store-name">' + escapeHtml(item.name) + "</div>" +
                  '<div class="store-sub">' + (item.active ? "متوفر للبيع" : "موقوف") + "</div>" +
                "</div>" +
                '<label class="store-field">السعر<input class="input" type="number" min="0" step="1" data-price="' +
                item.id + '" value="' + item.price + '" aria-label="السعر" /></label>' +
                '<label class="store-field">الكمية<input class="input" type="number" min="0" step="1" data-stock="' +
                item.id + '" value="' + item.stock + '" aria-label="الكمية" /></label>' +
                '<button type="button" class="icon-btn' + (item.active ? "" : " on") + '" data-toggle="' + item.id + '">' +
                (item.active ? "إيقاف" : "تفعيل") + "</button>" +
                '<button type="button" class="icon-btn" data-del="' + item.id + '">حذف</button>' +
              "</div>"
          )
          .join("") || '<p class="empty">لا منتجات بعد — أضف أول منتج.</p>';
    };

    const add = () => {
      const name = root.querySelector("#new-name").value.trim();
      if (!name) return;
      items.unshift({
        id: newId(),
        name: name,
        price: Number(root.querySelector("#new-price").value) || 0,
        stock: Number(root.querySelector("#new-stock").value) || 0,
        active: true,
      });
      persist();
      logActivity("store", "أُضيف منتج «" + name + "» إلى المتجر");
      root.querySelector("#new-name").value = "";
      root.querySelector("#new-price").value = "";
      root.querySelector("#new-stock").value = "";
      toast("تمت إضافة المنتج");
      paint();
    };

    root.querySelector("#add-product").addEventListener("click", add);
    root.querySelector("#new-name").addEventListener("keydown", (event) => {
      if (event.key === "Enter") add();
    });

    list.addEventListener("change", (event) => {
      const field = event.target;
      const priceId = field.dataset.price;
      const stockId = field.dataset.stock;
      if (!priceId && !stockId) return;
      const item = items.find((entry) => entry.id === (priceId || stockId));
      if (!item) return;
      const value = Math.max(0, Number(field.value) || 0);
      if (priceId) item.price = value;
      else item.stock = value;
      persist();
      paint();
    });

    list.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-toggle]");
      const del = event.target.closest("[data-del]");

      if (toggle) {
        const item = items.find((entry) => entry.id === toggle.dataset.toggle);
        if (!item) return;
        item.active = !item.active;
        persist();
        toast(item.active ? "المنتج متوفر الآن" : "تم إيقاف المنتج");
        paint();
        return;
      }

      if (del) {
        const index = items.findIndex((entry) => entry.id === del.dataset.del);
        if (index === -1) return;
        const name = items[index].name;
        items.splice(index, 1);
        persist();
        logActivity("store", "حُذف منتج «" + name + "» من المتجر");
        toast("تم حذف المنتج");
        paint();
      }
    });

    paint();
  },
};
