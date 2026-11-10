"use strict";

export function escapeHtml(text) {
  return String(text == null ? "" : text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el.dataset.timer);
  const timer = setTimeout(() => {
    el.hidden = true;
  }, 2800);
  el.dataset.timer = String(timer);
}

export function navigate(path) {
  document.dispatchEvent(new CustomEvent("spa:navigate", { detail: path }));
}

export function fmtDate(value) {
  const parts = String(value || "").split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : value || "—";
}

export function fmtDateTime(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value || "—");
  const two = (n) => String(n).padStart(2, "0");
  return (
    two(date.getDate()) + "/" + two(date.getMonth() + 1) + " · " + two(date.getHours()) + ":" + two(date.getMinutes())
  );
}

export function statusChip(status) {
  const map = {
    live: { label: "مباشر", tone: "live" },
    scheduled: { label: "مجدول", tone: "sched" },
    closed: { label: "مغلق", tone: "closed" },
  };
  const item = map[status] || map.closed;
  return '<span class="chip ' + item.tone + '">' + item.label + "</span>";
}
