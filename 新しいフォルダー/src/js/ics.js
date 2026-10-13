window.App = window.App || {};

App.Ics = (function () {
  "use strict";

  function build(from, to) {
    const plans = (App.Plan && App.Plan.list ? App.Plan.list() : []).filter(function (row) {
      if (from && row.date < from) return false;
      if (to && row.date > to) return false;
      return true;
    }).sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""))
        || String(a.start || "").localeCompare(String(b.start || ""));
    });

    const lines = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//moba-higata//activity//JP");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");

    const stamp = utcStamp(new Date());

    plans.forEach(function (row, idx) {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + uid(row, idx));
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART:" + icsDateTime(row.date, row.start));
      lines.push("DTEND:" + icsDateTime(row.date, row.end || row.start));
      lines.push("SUMMARY:" + esc((row.content || "作業") + " [" + (row.areaId || "") + "]"));
      lines.push("DESCRIPTION:" + esc(buildDescription(row)));
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function buildDescription(row) {
    const lines = [];
    lines.push("activityCode: " + (row.activityCode || ""));
    lines.push("people: " + (row.people || 0));
    lines.push("boat: " + (row.boat || 0));
    lines.push("car: " + (row.car || 0));
    if (row.tools) lines.push("tools: " + row.tools);
    return lines.join("\n");
  }

  function icsDateTime(dateStr, timeStr) {
    const d = String(dateStr || "").replace(/-/g, "");
    const t = String(timeStr || "00:00").replace(/:/g, "") + "00";
    return d + "T" + t;
  }

  function uid(row, idx) {
    const base = String(row.id || row.date || "") + "-" + String(idx);
    return "moba-" + base.replace(/[^0-9a-zA-Z_-]/g, "") + "@local";
  }

  function esc(text) {
    return String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function utcStamp(date) {
    return date.getUTCFullYear()
      + pad2(date.getUTCMonth() + 1)
      + pad2(date.getUTCDate())
      + "T"
      + pad2(date.getUTCHours())
      + pad2(date.getUTCMinutes())
      + pad2(date.getUTCSeconds())
      + "Z";
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  return {
    build: build,
  };
})();
