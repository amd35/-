"use strict";

import dashboard from "./pages/dashboard.js";
import dataList from "./pages/data-list.js";
import addItem from "./pages/add-item.js";
import tasks from "./pages/tasks.js";
import analytics from "./pages/analytics.js";
import profile from "./pages/profile.js";
import settings from "./pages/settings.js";
import faq from "./pages/faq.js";
import systems from "./pages/systems.js";
import activityLog from "./pages/activity-log.js";
import notifications from "./pages/notifications.js";
import contact from "./pages/contact.js";
import help from "./pages/help.js";
import { getDB, hydrate } from "./store.js";

const ROUTES = [
  { id: "dashboard", label: "لوحة التحكم", href: "/dashboard/", page: dashboard },
  { id: "data-list", label: "البيانات", href: "/data-list/", page: dataList },
  { id: "add-item", label: "إضافة عنصر", href: "/add-item/", page: addItem },
  { id: "tasks", label: "المهام", href: "/tasks/", page: tasks },
  { id: "analytics", label: "التحليلات", href: "/analytics/", page: analytics },
  { id: "systems", label: "الأنظمة", href: "/systems/", page: systems },
  { id: "activity-log", label: "سجل النشاط", href: "/activity-log/", page: activityLog },
  { id: "notifications", label: "التنبيهات", href: "/notifications/", page: notifications },
  { id: "profile", label: "الملف الشخصي", href: "/profile/", page: profile },
  { id: "settings", label: "الإعدادات", href: "/settings/", page: settings },
  { id: "contact", label: "اتصل بنا", href: "/contact/", page: contact },
  { id: "help", label: "مركز المساعدة", href: "/help/", page: help },
  { id: "faq", label: "الأسئلة الشائعة", href: "/faq/", page: faq },
];

const side = document.getElementById("side");
const content = document.getElementById("content");

function currentId() {
  const segment = location.pathname.replace(/^\/+|\/+$/g, "");
  if (ROUTES.some((route) => route.id === segment)) return segment;
  const fromBody = document.body.dataset.page;
  return fromBody && ROUTES.some((route) => route.id === fromBody) ? fromBody : "dashboard";
}

function spaceName() {
  return getDB().settings.spaceName || "غرفة الأصدقاء";
}

function renderSide(activeId) {
  side.innerHTML =
    '<div class="brand"><span class="brand-dot"></span><span>' +
    spaceName().replace(/[<>&]/g, "") +
    "</span></div>" +
    '<a class="room-btn" href="/"><span class="room-btn-arrow" aria-hidden="true">←</span> العودة إلى الغرفة</a>' +
    '<nav class="nav">' +
    ROUTES.map(
      (route) =>
        '<a href="' + route.href + '" data-route="' + route.id + '"' +
        (route.id === activeId ? ' class="active"' : "") + ">" + route.label + "</a>"
    ).join("") +
    "</nav>";
}

function render(id) {
  const entry = ROUTES.find((route) => route.id === id) || ROUTES[0];
  document.title = entry.page.title + " · " + spaceName();
  renderSide(entry.id);
  content.innerHTML =
    '<div class="page-head"><h1>' + entry.page.title + "</h1><p>" + entry.page.subtitle + "</p></div>";
  const body = document.createElement("div");
  body.className = "page-body";
  content.appendChild(body);
  entry.page.render(body);
}

function go(path) {
  if (location.pathname !== path) history.pushState({}, "", path);
  render(currentId());
  window.scrollTo(0, 0);
}

document.addEventListener("click", (event) => {
  const anchor = event.target.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href || !href.startsWith("/") || href === "/" || anchor.target === "_blank") return;
  event.preventDefault();
  go(href);
});

document.addEventListener("spa:navigate", (event) => go(event.detail));
document.addEventListener("spa:refresh-nav", () => render(currentId()));
window.addEventListener("popstate", () => render(currentId()));

await hydrate();
render(currentId());
