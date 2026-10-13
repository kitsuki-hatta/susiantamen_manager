window.App = window.App || {};

App.Utils = (function () {
  "use strict";

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function todayStr() {
    const now = new Date();
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  }

  function toDateStr(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function monthRange(year, monthIndex) {
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);
    return { first: toDateStr(first), last: toDateStr(last) };
  }

  function calcHourDiff(start, end, defaultHours) {
    if (!start) return Number(defaultHours) || 0;
    const s = toMinutes(start);
    if (s === null) return Number(defaultHours) || 0;

    if (!end) return Number(defaultHours) || 0;
    const e = toMinutes(end);
    if (e === null) return Number(defaultHours) || 0;

    let diff = e - s;
    if (diff < 0) diff += 24 * 60;
    return diff / 60;
  }

  function toMinutes(hhmm) {
    const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return h * 60 + mm;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    return String(prefix || "id") + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
  }

  function sum(values) {
    return (values || []).reduce(function (acc, n) {
      const v = Number(n);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function groupBy(rows, keyFn) {
    const out = {};
    (rows || []).forEach(function (row) {
      const key = keyFn(row);
      if (!out[key]) out[key] = [];
      out[key].push(row);
    });
    return out;
  }

  function periodOf(month) {
    const m = Number(month);
    if ([4, 5, 6].indexOf(m) >= 0) return 1;
    if ([7, 8, 9, 10].indexOf(m) >= 0) return 2;
    if ([11, 12, 1, 2].indexOf(m) >= 0) return 3;
    return null;
  }

  return {
    pad2: pad2,
    todayStr: todayStr,
    toDateStr: toDateStr,
    monthRange: monthRange,
    calcHourDiff: calcHourDiff,
    toMinutes: toMinutes,
    clone: clone,
    makeId: makeId,
    sum: sum,
    esc: esc,
    groupBy: groupBy,
    periodOf: periodOf,
  };
})();
