"use strict";

/** قسم الألعاب: ألعاب مسجّلة في قاعدة البيانات، ولكل لعبة طاولاتها الصوتية. */

import * as api from "../api.js";
import { esc, initial } from "./common.js";

function gameCard(game) {
  const open = game.status === "open";
  const tables = Number(game.tables) || 0;
  return (
    '<article class="card">' +
      '<span class="avatar">' + esc(initial(game.name)) + "</span>" +
      '<div class="card-body">' +
        '<div class="card-title"><h4>' + esc(game.name) + "</h4>" +
          (open ? "" : '<span class="tag">قريباً</span>') + "</div>" +
        '<p class="card-sub">' + esc(game.tagline) +
          (open ? '<span class="sep">·</span>' + tables + " طاولة" : "") +
        "</p>" +
      "</div>" +
      (open
        ? '<button type="button" class="btn-ghost" data-game="' + esc(game.id) + '">الطاولات</button>'
        : '<button type="button" class="btn-ghost" disabled>قريباً</button>') +
    "</article>"
  );
}

export default {
  title: "الألعاب",

  async render(root, ctx) {
    const games = await api.games();

    root.innerHTML =
      '<section class="block">' +
        '<div class="block-head">' +
          "<div><h3>الألعاب</h3><p>لكل لعبة طاولات صوتية خاصة</p></div>" +
          '<span class="chip">' + games.length + " لعبة</span>" +
        "</div>" +
        '<div class="list">' +
          (games.length
            ? games.map(gameCard).join("")
            : '<div class="empty"><span class="glyph">◇</span><p>لا توجد ألعاب مسجّلة بعد.</p></div>') +
        "</div>" +
      "</section>" +
      '<section class="block">' +
        '<p class="note">افتح طاولة للعبة، ادعُ أصدقاءك، وتحدّثوا في الغرفة نفسها. ' +
        "اللعبة الجديدة تُضاف إلى القائمة من قاعدة البيانات دون تغيير الواجهة.</p>" +
      "</section>";

    root.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-game]");
      if (!btn) return;
      ctx.goTab("rooms", { game: btn.dataset.game });
    });
  },
};
