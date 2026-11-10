"use strict";

/** قسم الغرف: طاولات صوتية حقيقية من قاعدة البيانات — إنشاء، دخول، ومتابعة. */

import * as api from "../api.js";
import { esc, initial, peopleCount, toast } from "./common.js";

const GAME_LABELS = { voice: "صوت فقط", ludo: "لودو", domino: "دومينو" };
const SEATS = [5, 10, 15, 20];

const gameLabel = (game) => GAME_LABELS[game] || game;

function roomCard(room) {
  const seats = Number(room.seats) || 5;
  const members = Number(room.members) || 0;
  return (
    '<article class="card tap" data-room="' + esc(room.id) + '">' +
      '<span class="avatar">' + esc(initial(room.host)) + "</span>" +
      '<div class="card-body">' +
        '<div class="card-title"><h4>' + esc(room.name) + "</h4>" +
          '<span class="tag">' + esc(gameLabel(room.game)) + "</span></div>" +
        '<p class="card-sub">' + esc(room.host) +
          '<span class="sep">·</span>' + members + "/" + seats + " مقاعد" +
          '<span class="sep">·</span>' + (members > 1 ? peopleCount(members) : "بانتظار أحد") +
        "</p>" +
      "</div>" +
      '<button type="button" class="btn-ghost" data-join="' + esc(room.id) + '">' +
        (room.joined ? "متابعة" : "دخول") +
      "</button>" +
    "</article>"
  );
}

function gameChips(games, active) {
  const options = [{ id: "voice", name: "صوت فقط", status: "open" }].concat(
    (games || []).filter((g) => g.status === "open")
  );
  return options
    .map(
      (game) =>
        '<button type="button" data-game="' + esc(game.id) + '" aria-pressed="' +
        (game.id === active ? "true" : "false") + '">' + esc(game.name) + "</button>"
    )
    .join("");
}

export default {
  title: "الغرف",

  async render(root, ctx) {
    const filterGame = (ctx.filter() || {}).game || null;
    const [list, games] = await Promise.all([api.rooms(filterGame), api.games()]);

    let picked = filterGame || "voice";
    let pickedSeats = 5;

    const filterChip = filterGame
      ? '<div class="block-head"><span class="chip"><span class="dot"></span>طاولات ' +
        esc(gameLabel(filterGame)) +
        '</span><button type="button" class="btn-mini" id="clear-filter">كل الغرف</button></div>'
      : "";

    root.innerHTML =
      '<section class="block">' +
        '<div class="block-head">' +
          "<div><h3>مفتوحة الآن</h3><p>غرف صوتية حقيقية داخل حسابك</p></div>" +
          '<span class="chip"><span class="dot"></span>' + list.length + " غرفة</span>" +
        "</div>" +
        filterChip +
        '<button type="button" class="btn-primary" id="toggle-create">إنشاء غرفة جديدة</button>' +
        '<div id="create-slot"></div>' +
        '<div class="list" id="rooms-list">' +
          (list.length
            ? list.map(roomCard).join("")
            : '<div class="empty"><span class="glyph">◈</span><p><strong>لا توجد غرفة مفتوحة</strong>' +
              "أنشئ غرفتك الأولى وادعُ أصدقاءك — ستظهر هنا مباشرة.</p></div>") +
        "</div>" +
      "</section>";

    const slot = root.querySelector("#create-slot");
    const toggle = root.querySelector("#toggle-create");

    function closeForm() {
      slot.innerHTML = "";
      toggle.hidden = false;
    }

    function openForm() {
      toggle.hidden = true;
      slot.innerHTML =
        '<div class="form-card">' +
          "<h4>غرفة جديدة</h4>" +
          '<label class="field-row"><span class="label">اسم الغرفة</span>' +
            '<input id="room-name" type="text" placeholder="مثال: طاولة الأصدقاء" /></label>' +
          '<div class="field-row"><span class="label">اللعبة</span>' +
            '<div class="segmented" id="game-pick">' + gameChips(games, picked) + "</div></div>" +
          '<div class="field-row"><span class="label">عدد المقاعد</span>' +
            '<div class="segmented" id="seats-pick">' +
              SEATS.map(
                (n) =>
                  '<button type="button" data-seats="' + n + '" aria-pressed="' +
                  (n === pickedSeats ? "true" : "false") + '">' + n + "</button>"
              ).join("") +
            "</div></div>" +
          '<div class="form-actions">' +
            '<button type="button" class="btn-primary" id="create-go">إنشاء ودخول</button>' +
            '<button type="button" class="btn-mini" id="create-cancel">إلغاء</button>' +
          "</div>" +
        "</div>";

      slot.querySelectorAll("#game-pick button").forEach((btn) => {
        btn.addEventListener("click", () => {
          picked = btn.dataset.game;
          slot.querySelectorAll("#game-pick button").forEach((b) =>
            b.setAttribute("aria-pressed", b === btn ? "true" : "false")
          );
        });
      });
      slot.querySelectorAll("#seats-pick button").forEach((btn) => {
        btn.addEventListener("click", () => {
          pickedSeats = Number(btn.dataset.seats);
          slot.querySelectorAll("#seats-pick button").forEach((b) =>
            b.setAttribute("aria-pressed", b === btn ? "true" : "false")
          );
        });
      });

      slot.querySelector("#create-cancel").addEventListener("click", closeForm);
      slot.querySelector("#create-go").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const created = await api.createRoom(
            slot.querySelector("#room-name").value.trim(),
            picked,
            pickedSeats
          );
          location.href = "/room/?room=" + encodeURIComponent(created.id);
        } catch (err) {
          button.disabled = false;
          toast(err.message || "تعذّر إنشاء الغرفة");
        }
      });
      slot.querySelector("#room-name").focus();
    }

    toggle.addEventListener("click", openForm);

    const clear = root.querySelector("#clear-filter");
    if (clear) clear.addEventListener("click", () => ctx.goTab("rooms", {}));

    async function openRoom(roomId) {
      try {
        await api.joinRoom(roomId);
        location.href = "/room/?room=" + encodeURIComponent(roomId);
      } catch (err) {
        toast(err.message || "تعذّر الدخول إلى الغرفة");
      }
    }

    root.querySelector("#rooms-list").addEventListener("click", (event) => {
      const card = event.target.closest("[data-room]");
      if (!card) return;
      openRoom(card.dataset.room);
    });
  },
};
