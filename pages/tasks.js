"use strict";

import { getDB, addTask, toggleTask, deleteTask } from "../store.js";
import { escapeHtml, toast } from "../ui.js";

export default {
  title: "المهام",
  subtitle: "أنشئ مهامك، حدّثها، وعلّم المنتهي منها",

  render(root) {
    root.innerHTML =
      '<section class="card">' +
        '<div class="card-head"><h2>قائمة المهام</h2><span class="chip" id="task-count"></span></div>' +
        '<div class="toolbar">' +
          '<input id="new-task" class="input" placeholder="أضف مهمة جديدة…" aria-label="مهمة جديدة" />' +
          '<button type="button" class="btn btn-gold" id="add-task">إضافة</button>' +
        "</div>" +
        '<div class="progress"><span id="task-progress"></span></div>' +
        '<p class="hint" id="task-summary"></p>' +
        '<div id="task-list"></div>' +
      "</section>";

    const list = root.querySelector("#task-list");
    const input = root.querySelector("#new-task");

    const paint = () => {
      const tasks = getDB().tasks;
      const done = tasks.filter((task) => task.done).length;
      const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

      root.querySelector("#task-count").textContent = tasks.length + " مهمة";
      root.querySelector("#task-progress").style.width = percent + "%";
      root.querySelector("#task-summary").textContent =
        done + " مكتملة · " + (tasks.length - done) + " مفتوحة · " + percent + "% إنجاز";

      list.innerHTML =
        tasks
          .map(
            (task) =>
              '<div class="task' + (task.done ? " done" : "") + '" data-id="' + task.id + '">' +
                '<input type="checkbox" data-toggle="' + task.id + '"' + (task.done ? " checked" : "") +
                ' aria-label="إكمال المهمة" />' +
                '<span class="task-text">' + escapeHtml(task.text) + "</span>" +
                '<button type="button" class="icon-btn" data-del="' + task.id + '" aria-label="حذف">حذف</button>' +
              "</div>"
          )
          .join("") || '<p class="empty">لا مهام بعد — أضف أول مهمة.</p>';
    };

    const submit = () => {
      const value = input.value.trim();
      if (!value) return;
      addTask(value);
      input.value = "";
      toast("تمت إضافة المهمة");
      paint();
    };

    root.querySelector("#add-task").addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });

    list.addEventListener("change", (event) => {
      const box = event.target.closest("[data-toggle]");
      if (!box) return;
      toggleTask(box.dataset.toggle);
      paint();
    });

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-del]");
      if (!button) return;
      deleteTask(button.dataset.del);
      toast("تم حذف المهمة");
      paint();
    });

    paint();
  },
};
