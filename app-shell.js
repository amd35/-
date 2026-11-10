"use strict";

/**
 * هيكل التطبيق: بوابة الدخول + الأقسام الرئيسية في الشريط السفلي.
 * لا يوجد أي حساب وهمي: كل قسم يقرأ ويكتب في قاعدة البيانات عبر api.js.
 */

import * as api from "./api.js";
import { esc, initial, METHOD_LABELS } from "./sections/common.js";
import roomsSection from "./sections/rooms.js";
import friendsSection from "./sections/friends.js";
import gamesSection from "./sections/games.js";
import accountSection from "./sections/account.js";

const TABS = {
  rooms: roomsSection,
  friends: friendsSection,
  games: gamesSection,
  account: accountSection,
};

const gate = document.getElementById("gate");
const shellEl = document.getElementById("shell");
const view = document.getElementById("view");
const tabbar = document.getElementById("tabbar");
const toastEl = document.getElementById("toast");

const state = { tab: "rooms", filter: {} };

/* ---------- التنبيه ---------- */

let toastTimer = null;
window.addEventListener("app:toast", (event) => {
  toastEl.textContent = String(event.detail || "");
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3400);
});

/* ---------- بوابة الدخول ---------- */

const auth = { mode: "login", method: "email", busy: false };

const $ = (id) => document.getElementById(id);

function paintGate() {
  const guest = auth.method === "guest";
  const signup = auth.mode === "signup";

  $("mode-tabs").hidden = guest;
  document.querySelectorAll("#mode-tabs [data-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.mode === auth.mode ? "true" : "false");
  });
  document.querySelectorAll("#method-tabs [data-method]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.method === auth.method ? "true" : "false");
  });

  $("row-name").hidden = !(signup || guest);
  $("row-ident").hidden = guest;
  $("row-pass").hidden = guest;

  const ident = $("in-ident");
  if (auth.method === "phone") {
    $("ident-label").textContent = "رقم الهاتف";
    ident.placeholder = "07XX XXX XXXX";
    ident.setAttribute("inputmode", "tel");
    ident.setAttribute("autocomplete", "tel");
  } else {
    $("ident-label").textContent = "البريد الإلكتروني";
    ident.placeholder = "name@example.com";
    ident.setAttribute("inputmode", "email");
    ident.setAttribute("autocomplete", "username");
  }

  $("in-pass").setAttribute("autocomplete", signup ? "new-password" : "current-password");

  $("auth-hint").textContent = guest
    ? "دخول سريع باسم مستعار — يمكنك إنشاء حساب كامل لاحقاً."
    : signup
    ? "أنشئ حسابك ليُحفظ اسمك وأصدقاؤك وغرفك في قاعدة البيانات."
    : "أدخل بيانات حسابك للمتابعة.";

  $("auth-submit").textContent = guest ? "دخول كضيف" : signup ? "إنشاء الحساب" : "دخول";
}

function authError(message) {
  const box = $("auth-error");
  if (!message) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.textContent = message;
  box.hidden = false;
}

function authBusy(on) {
  auth.busy = on;
  const btn = $("auth-submit");
  btn.disabled = on;
  if (on) btn.textContent = "جارٍ التنفيذ…";
  else paintGate();
}

function showGate(message) {
  shellEl.hidden = true;
  gate.hidden = false;
  document.title = "صوت — تسجيل الدخول";
  if (message) authError(message);
  paintGate();
}

async function onAuthSubmit(event) {
  event.preventDefault();
  if (auth.busy) return;
  authError("");

  const name = $("in-name").value.trim();
  const ident = $("in-ident").value.trim();
  const pass = $("in-pass").value;

  try {
    authBusy(true);
    let data;
    if (auth.method === "guest") {
      data = await api.enterAsGuest(name);
    } else if (!ident) {
      throw new Error(auth.method === "phone" ? "أدخل رقم هاتفك" : "أدخل بريدك الإلكتروني");
    } else if (auth.mode === "signup") {
      if (!name) throw new Error("أدخل اسمك");
      if (pass.length < 6) throw new Error("كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      data =
        auth.method === "phone"
          ? await api.signupPhone(name, ident, pass)
          : await api.signupEmail(name, ident, pass);
    } else {
      if (!pass) throw new Error("أدخل كلمة المرور");
      data = await api.loginWith(ident, pass);
    }

    api.saveSession(data);
    $("auth-error").hidden = true;
    $("in-pass").value = "";
    await enterApp();
  } catch (err) {
    authError((err && err.message) || "تعذّر إتمام العملية");
  } finally {
    authBusy(false);
  }
}

function wireGate() {
  document.querySelectorAll("#mode-tabs [data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === auth.mode) return;
      auth.mode = btn.dataset.mode;
      authError("");
      paintGate();
    });
  });

  document.querySelectorAll("#method-tabs [data-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.method === auth.method) return;
      auth.method = btn.dataset.method;
      $("in-ident").value = "";
      $("in-pass").value = "";
      authError("");
      paintGate();
    });
  });

  $("auth-form").addEventListener("submit", onAuthSubmit);
}

/* ---------- التطبيق ---------- */

function currentUser() {
  const session = api.getSession();
  return session ? session.user : null;
}

function paintMe() {
  const user = currentUser();
  if (!user) return;
  $("me-avatar").textContent = initial(user.name);
  $("me-name").textContent = user.name;
  $("me-hello").textContent = METHOD_LABELS[user.method] || "حسابك";
}

function paintTabs(tab) {
  tabbar.querySelectorAll(".tab").forEach((anchor) => {
    if (anchor.dataset.tab === tab) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  });
}

function errorState(message) {
  return (
    '<div class="empty"><span class="glyph">!</span><p><strong>تعذّر تحميل القسم</strong>' +
    esc(message) +
    "</p></div>"
  );
}

const ctx = {
  get user() {
    return currentUser();
  },
  filter: () => state.filter,
  goTab,
  refresh: () => renderTab(state.tab),
  setUser(user) {
    api.updateUser(user);
    paintMe();
  },
  signOut,
};

async function renderTab(name) {
  const tab = TABS[name] ? name : "rooms";
  state.tab = tab;
  paintTabs(tab);
  // حاوية جديدة لكل عرض حتى لا تبقى مستمعات القسم السابق على الحاوية الدائمة
  view.innerHTML = "";
  const root = document.createElement("div");
  root.className = "view-inner";
  root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  view.appendChild(root);
  try {
    await TABS[tab].render(root, ctx);
    document.title = (TABS[tab].title || "صوت") + " · صوت";
  } catch (err) {
    root.innerHTML = errorState((err && err.message) || "خطأ غير معروف");
  }
}

function tabFromHash() {
  const name = location.hash.replace(/^#\/?/, "");
  return TABS[name] ? name : "rooms";
}

function goTab(name, filter) {
  state.filter = filter || {};
  const target = TABS[name] ? name : "rooms";
  if (location.hash === "#" + target) renderTab(target);
  else location.hash = "#" + target;
}

async function enterApp() {
  gate.hidden = true;
  shellEl.hidden = false;
  paintMe();
  const tab = tabFromHash();
  state.filter = {};
  await renderTab(tab);
}

function signOut() {
  const work = api.isSignedIn() ? api.logout() : Promise.resolve(null);
  work
    .catch(() => {})
    .then(() => {
      api.clearSession();
      history.replaceState({}, "", location.pathname);
      showGate();
    });
}

/* ---------- الإقلاع ---------- */

async function boot() {
  if (!api.isSignedIn()) {
    showGate();
    return;
  }
  try {
    const data = await api.checkSession();
    api.saveSession(data);
    await enterApp();
  } catch (err) {
    const message = (err && err.message) || "تعذّر التحقق من الجلسة";
    if (/الجلسة/.test(message) || err.status === 401) {
      api.clearSession();
      showGate(message);
    } else {
      showGate(message);
    }
  }
}

wireGate();
window.addEventListener("hashchange", () => renderTab(tabFromHash()));
$("btn-refresh").addEventListener("click", () => renderTab(state.tab));
paintGate();
boot();
