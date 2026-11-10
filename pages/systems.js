"use strict";

import { SYSTEMS, GROUPS } from "../systems-data.js";
import { getSystemState, saveSystemState, newId, logActivity } from "../store.js";
import { escapeHtml, toast } from "../ui.js";

function defaultState(system) {
  if (system.kind === "list") {
    return { items: (system.seeds || []).map((name) => ({ id: newId(), name: name })) };
  }
  if (system.kind === "switches") {
    const options = {};
    (system.options || []).forEach((name) => {
      options[name] = false;
    });
    return { options: options };
  }
  return { value: Number(system.start) || 0 };
}

const stateOf = (system) => getSystemState(system.id) || defaultState(system);

function hubHtml() {
  return (
    '<section class="card"><div class="card-head"><h2>كل الأنظمة</h2>' +
    '<span class="chip sched">' + SYSTEMS.length + " نظاماً</span></div>" +
    '<p class="hint">افتح أي نظام لإدارته — لكل نظام بياناته وحفظه المستقل.</p></section>' +
    GROUPS.map((group) => {
      const items = SYSTEMS.filter((system) => system.group === group);
      if (!items.length) return "";
      return (
        '<section class="card"><div class="card-head"><h2>' + group + "</h2>" +
        '<span class="chip">' + items.length + "</span></div>" +
        '<div class="sys-grid">' +
        items
          .map(
            (system) =>
              '<button type="button" class="sys-card" data-sys="' + system.id + '">' +
                '<span class="sys-icon">' + system.icon + "</span>" +
                '<span class="sys-name">' + escapeHtml(system.name) + "</span>" +
                '<span class="sys-desc">' + escapeHtml(system.desc) + "</span>" +
              "</button>"
          )
          .join("") +
        "</div></section>"
      );
    }).join("")
  );
}

function workspaceHtml(system) {
  const state = stateOf(system);
  let body = "";

  if (system.kind === "list") {
    body =
      '<div class="toolbar">' +
        '<input id="sys-input" class="input" placeholder="أضف عنصراً جديداً…" />' +
        '<button type="button" class="btn btn-gold" id="sys-add">إضافة</button>' +
      "</div>" +
      '<div class="rows">' +
      (state.items
        .map(
          (item) =>
            '<div class="row"><span class="row-main"><span class="row-name">' + escapeHtml(item.name) + "</span></span>" +
            '<button type="button" class="icon-btn" data-del="' + item.id + '">حذف</button></div>'
        )
        .join("") || '<p class="empty">لا عناصر بعد — أضف أول عنصر.</p>') +
      "</div>";
  } else if (system.kind === "switches") {
    body =
      '<div class="switch-list">' +
      (system.options || [])
        .map(
          (name) =>
            '<label class="switch"><span>' + escapeHtml(name) + "</span>" +
            '<input type="checkbox" data-opt="' + escapeHtml(name) + '"' +
            (state.options[name] ? " checked" : "") + " /></label>"
        )
        .join("") +
      "</div>";
  } else {
    body =
      '<div class="kpis"><div class="kpi"><div class="kpi-value">' + state.value + "</div>" +
      '<div class="kpi-label">' + escapeHtml(system.unit || "قيمة") + "</div>" +
      '<div class="kpi-sub">القيمة الحالية</div></div></div>' +
      '<div class="actions-row" style="margin-top:12px">' +
        '<button type="button" class="btn btn-gold" data-step="1">+ إضافة</button>' +
        '<button type="button" class="btn" data-step="-1">− إنقاص</button>' +
      "</div>";
  }

  return (
    '<section class="card">' +
      '<div class="sys-head"><button type="button" class="btn" data-back>→ كل الأنظمة</button></div>' +
      '<div class="card-head"><h2>' + system.icon + " " + escapeHtml(system.name) + "</h2>" +
      '<span class="chip sched">' + escapeHtml(system.group) + "</span></div>" +
      '<p class="hint">' + escapeHtml(system.desc) + "</p>" +
      body +
    "</section>"
  );
}

export default {
  title: "الأنظمة",
  subtitle: "٥٠ نظاماً مستقلاً لإدارة مساحتك",

  render(root) {
    let openId = null;

    const paint = () => {
      const system = openId ? SYSTEMS.find((item) => item.id === openId) : null;
      root.innerHTML = system ? workspaceHtml(system) : hubHtml();
      if (system) wireWorkspace(system);
      else wireHub();
    };

    const wireHub = () => {
      root.querySelectorAll("[data-sys]").forEach((card) =>
        card.addEventListener("click", () => {
          openId = card.dataset.sys;
          paint();
        })
      );
    };

    const wireWorkspace = (system) => {
      root.querySelector("[data-back]").addEventListener("click", () => {
        openId = null;
        paint();
      });

      if (system.kind === "list") {
        const input = root.querySelector("#sys-input");
        const add = () => {
          const value = input.value.trim();
          if (!value) return;
          const state = stateOf(system);
          state.items = [{ id: newId(), name: value }].concat(state.items);
          saveSystemState(system.id, state);
          logActivity("system", system.name + ": أُضيف «" + value + "»");
          toast("تمت الإضافة");
          paint();
        };
        root.querySelector("#sys-add").addEventListener("click", add);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") add();
        });
        root.querySelectorAll("[data-del]").forEach((button) =>
          button.addEventListener("click", () => {
            const state = stateOf(system);
            state.items = state.items.filter((item) => item.id !== button.dataset.del);
            saveSystemState(system.id, state);
            toast("تم الحذف");
            paint();
          })
        );
      } else if (system.kind === "switches") {
        root.querySelectorAll("[data-opt]").forEach((box) =>
          box.addEventListener("change", () => {
            const state = stateOf(system);
            state.options[box.dataset.opt] = box.checked;
            saveSystemState(system.id, state);
            toast("تم الحفظ");
          })
        );
      } else {
        root.querySelectorAll("[data-step]").forEach((button) =>
          button.addEventListener("click", () => {
            const state = stateOf(system);
            state.value = Math.max(0, Number(state.value || 0) + Number(button.dataset.step));
            saveSystemState(system.id, state);
            paint();
          })
        );
      }
    };

    paint();
  },
};
