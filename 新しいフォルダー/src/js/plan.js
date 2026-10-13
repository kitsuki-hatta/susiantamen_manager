/* =====================================================================
   plan.js ― 作業計画モジュール（全面修正版）
   ===================================================================== */

window.App = window.App || {};

App.Plan = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;

  let _year = new Date().getFullYear();
  let _month = new Date().getMonth() + 1;
  let _selectedTideDate = "";

  // ============================================================
  // データアクセス
  // ============================================================
  function list() {
    return (Storage.getPlan() || []).map(normalize);
  }
  function get(id) {
    return (
      list().find(function (r) {
        return r.id === id;
      }) || null
    );
  }

  function upsert(row) {
    const rows = list();
    const n = normalize(row);
    validate(n);
    const i = rows.findIndex(function (x) {
      return x.id === n.id;
    });
    if (i >= 0) rows[i] = n;
    else rows.push(n);
    Storage.setPlan(rows);
    return n;
  }

  function remove(id) {
    Storage.setPlan(
      list().filter(function (r) {
        return r.id !== id;
      }),
    );
  }

  function monthly(year, month) {
    const prefix = year + "-" + Utils.pad2(month);
    return list().filter(function (r) {
      return String(r.date || "").indexOf(prefix) === 0;
    });
  }

  function estimateCost(plan) {
    const p = normalize(plan);
    const m = Storage.getMaster();
    const s = Storage.getSettings();
    const hours = Utils.calcHourDiff
      ? Utils.calcHourDiff(p.start, p.end, s.defaultHours || 3.5)
      : s.defaultHours || 3.5;
    const jinken =
      s.wageMode === "hourly"
        ? p.people * hours * (+m.wageHourly || 0)
        : p.people * (+m.wageDaily || 0);
    const yousen = p.boat * (+m.yousen || 0);
    const kotsu = p.car * (+m.sharyo || 0);

    // 物品費
    const itemsCost = calcItemsCost(p.usedItems || []);

    return {
      jinken: jinken,
      yousen: yousen,
      kotsu: kotsu,
      itemsCost: itemsCost,
      total: jinken + yousen + kotsu + itemsCost,
    };
  }

  function calcItemsCost(usedItems) {
    const inventory = Storage.getInventory() || [];
    return (usedItems || []).reduce(function (sum, ui) {
      const item = inventory.find(function (inv) {
        return inv.id === ui.itemId;
      });
      const unitPrice = item ? +item.budgetUnit || +item.unitPrice || 0 : 0;
      return sum + unitPrice * (+ui.qty || 0);
    }, 0);
  }

  function normalize(row) {
    return {
      id: String((row && row.id) || "").trim() || Utils.makeId("plan"),
      date: String((row && row.date) || "").trim(),
      areaId: String((row && row.areaId) || "").trim(),
      activityCode: String((row && row.activityCode) || "").trim(),
      start: String((row && row.start) || "").trim(),
      end: String((row && row.end) || "").trim(),
      content: String((row && row.content) || "").trim(),
      people: Math.max(0, +row.people || 0),
      boat: Math.max(0, +row.boat || 0),
      car: Math.max(0, +row.car || 0),
      usedItems: Array.isArray(row && row.usedItems) ? row.usedItems : [],
    };
  }

  function validate(row) {
    if (!row.date) throw new Error("plan.date is required");
    if (!row.areaId) throw new Error("plan.areaId is required");
    if (!row.activityCode) throw new Error("plan.activityCode is required");
  }

  // ============================================================
  // 終了時刻の自動算出（開始時刻 + 標準作業時間、30分単位）
  // ============================================================
  function calcEndTime(startTime) {
    if (!startTime) return "";
    const s = Storage.getSettings();
    const hours = +(s.defaultHours || 3.5);
    const parts = startTime.split(":");
    if (parts.length < 2) return "";
    const startMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    // 30分単位に丸める
    const durationMin = Math.round(hours * 2) * 30;
    const endMin = startMin + durationMin;
    const endH = Math.floor(endMin / 60) % 24;
    const endM = endMin % 60;
    return Utils.pad2(endH) + ":" + Utils.pad2(endM);
  }

  // ============================================================
  // カレンダー描画
  // ============================================================
  function render() {
    renderColorBasisControls();
    renderCalendar();
    bindCalNav();
    bindPlanModal();
  }

  function renderColorBasisControls() {
    const basisEl = document.getElementById("plan-calendar-basis");
    const btnSave = document.getElementById("btn-save-plan-calendar-basis");
    const settings = Storage.getSettings ? Storage.getSettings() : {};
    if (basisEl) basisEl.value = settings.calendarColorBasis || "activity";
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", function () {
        const nextBasis = basisEl ? basisEl.value : "activity";
        const currentSettings = Storage.getSettings
          ? Storage.getSettings()
          : {};
        if (Storage.setSettings) {
          Storage.setSettings(
            Object.assign({}, currentSettings, {
              calendarColorBasis: nextBasis,
            }),
          );
        }
        if (
          App.Master &&
          typeof App.Master.renderActivitySummary === "function"
        ) {
          App.Master.renderActivitySummary();
        }
        renderCalendar();
        alert("カレンダー色分けの適用軸を保存しました ✓");
      });
    }
  }

  function renderCalendar() {
    const titleEl = document.getElementById("cal-title");
    const gridEl = document.getElementById("cal-grid");
    if (!titleEl || !gridEl) return;

    titleEl.textContent =
      "令和" + (_year - 2018) + "年（" + _year + "年）" + _month + "月";

    const plans = monthly(_year, _month);
    const emptyGuidance = document.getElementById("plan-empty-guidance");
    if (emptyGuidance) {
      if (plans.length) {
        emptyGuidance.innerHTML = "";
      } else {
        const firstDate = _year + "-" + Utils.pad2(_month) + "-01";
        emptyGuidance.innerHTML =
          "<div class='guide-empty'><strong>この月の作業計画はまだありません。</strong>" +
          "<span>カレンダーの日付をダブルクリックするか、下のボタンから計画を登録できます。</span>" +
          "<button type='button' class='btn-primary btn-sm' id='btn-create-first-plan'>この月の計画を登録</button></div>";
        const createButton = document.getElementById("btn-create-first-plan");
        if (createButton) {
          createButton.addEventListener("click", function () {
            openPlanModal(null, firstDate);
          });
        }
      }
    }
    const plansByDate = {};
    plans.forEach(function (p) {
      if (!plansByDate[p.date]) plansByDate[p.date] = [];
      plansByDate[p.date].push(p);
    });

    const acts = App.Master ? App.Master.getActivities() : [];
    const areas = App.Master ? App.Master.getAreas() : [];
    const actMap = {};
    const areaMap = {};
    acts.forEach(function (a) {
      actMap[a.code] = a;
    });
    areas.forEach(function (a) {
      areaMap[a.id] = a;
    });

    const firstDay = new Date(_year, _month - 1, 1);
    const lastDate = new Date(_year, _month, 0).getDate();
    const startDow = firstDay.getDay();
    const todayStr = Utils.todayStr();
    const basis = Storage.getSettings
      ? Storage.getSettings().calendarColorBasis || "activity"
      : "activity";

    let html = ["日", "月", "火", "水", "木", "金", "土"]
      .map(function (d) {
        return "<div class='cal-dow'>" + d + "</div>";
      })
      .join("");

    for (let i = 0; i < startDow; i++) {
      html +=
        "<div class='cal-day other-month'><div class='cal-day-num'></div></div>";
    }

    for (let d = 1; d <= lastDate; d++) {
      const dateStr = _year + "-" + Utils.pad2(_month) + "-" + Utils.pad2(d);
      const isToday = dateStr === todayStr;
      const dayPlans = plansByDate[dateStr] || [];

      let badges = "";
      dayPlans.slice(0, 3).forEach(function (p) {
        const act = actMap[p.activityCode] || {};
        const area = areaMap[p.areaId] || {};
        const cls = act.category || "moba";
        const src = basis === "area" ? area : act;
        let customStyle = "";
        if (src && src.color) {
          customStyle =
            "style='background-color:" +
            src.color +
            ";" +
            patternStyle(src.pattern, src.color) +
            "'";
        }
        const tip = [
          p.date,
          area.name || p.areaId,
          act.label || p.activityCode,
          p.content || "",
        ]
          .filter(Boolean)
          .join(" / ");
        badges +=
          "<span class='cal-badge " +
          cls +
          "' title='" +
          Utils.esc(tip) +
          "' " +
          customStyle +
          " data-edit-plan='" +
          p.id +
          "'>" +
          Utils.esc(act.label || p.activityCode) +
          "</span>";
      });
      if (dayPlans.length > 3) {
        badges +=
          "<span style='font-size:10px; color:#888;'>他" +
          (dayPlans.length - 3) +
          "件</span>";
      }

      html +=
        "<div class='cal-day" +
        (isToday ? " today" : "") +
        (dateStr === _selectedTideDate ? " tide-selected" : "") +
        "' data-new-plan-date='" +
        dateStr +
        "'>" +
        "<div class='cal-day-num'>" +
        d +
        "</div>" +
        badges +
        "</div>";
    }

    const total = startDow + lastDate;
    const remainder = total % 7;
    if (remainder !== 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        html +=
          "<div class='cal-day other-month'><div class='cal-day-num'></div></div>";
      }
    }

    gridEl.innerHTML = html;

    gridEl.querySelectorAll("[data-new-plan-date]").forEach(function (cell) {
      cell.addEventListener("click", function (e) {
        if (e.target.closest("[data-edit-plan]")) return;
        _selectedTideDate = cell.dataset.newPlanDate;
        gridEl
          .querySelectorAll("[data-new-plan-date].tide-selected")
          .forEach(function (selectedCell) {
            selectedCell.classList.remove("tide-selected");
          });
        cell.classList.add("tide-selected");
        renderTideGraph(_selectedTideDate);
      });
      cell.addEventListener("dblclick", function (e) {
        if (e.target.closest("[data-edit-plan]")) return;
        openPlanModal(null, cell.dataset.newPlanDate);
      });
      cell.addEventListener("mouseenter", function () {
        if (!_selectedTideDate) renderTideGraph(cell.dataset.newPlanDate);
      });
    });

    gridEl.querySelectorAll("[data-edit-plan]").forEach(function (badge) {
      badge.addEventListener("click", function (e) {
        e.stopPropagation();
        openPlanModal(badge.dataset.editPlan, null);
      });
    });

    if (_selectedTideDate) {
      renderTideGraph(_selectedTideDate);
    } else {
      const initDate =
        todayStr.indexOf(_year + "-" + Utils.pad2(_month) + "-") === 0
          ? todayStr
          : _year + "-" + Utils.pad2(_month) + "-01";
      renderTideGraph(initDate);
    }
  }

  // ============================================================
  // 潮位グラフ
  // ============================================================
  // 2026年の年間データ（T.P.補正後: -28〜243 cm）を覆う固定範囲。
  const TIDE_GRAPH_MIN = -50;
  const TIDE_GRAPH_MAX = 250;

  function renderTideGraph(dateStr) {
    const container = document.getElementById("plan-tide-graph");
    if (!container) return;

    // App.TideData.getHourly() を優先、なければ list() から取得
    let hourly = null;
    if (App.TideData && App.TideData.getHourly) {
      hourly = App.TideData.getHourly(dateStr);
    } else if (App.TideData && App.TideData.list) {
      const data = App.TideData.list();
      hourly = data[dateStr] || null;
    }

    if (!Array.isArray(hourly) || !hourly.length) {
      container.innerHTML =
        "<p style='font-weight:600; margin:0 0 8px;'>" +
        Utils.esc(dateStr || "未選択") +
        "</p><p class='hint'>潮位データなし</p>";
      return;
    }

    const values = hourly.map(Number).filter(function (v) {
      return !isNaN(v);
    });
    if (!values.length) {
      container.innerHTML =
        "<p style='font-weight:600; margin:0 0 8px;'>" +
        Utils.esc(dateStr || "未選択") +
        "</p><p class='hint'>潮位データなし</p>";
      return;
    }

    const width = 360,
      height = 220;
    const padL = 34,
      padR = 14,
      padT = 18,
      padB = 28;
    const min = TIDE_GRAPH_MIN;
    const max = TIDE_GRAPH_MAX;
    const range = max - min;
    const stepX = (width - padL - padR) / 23;

    const points = hourly
      .map(function (v, i) {
        const num = Number(v);
        return {
          x: padL + stepX * i,
          y: isNaN(num)
            ? null
            : height - padB - ((num - min) / range) * (height - padT - padB),
          value: num,
          hour: i,
        };
      })
      .filter(function (p) {
        return p.y !== null;
      });

    const polyline = points
      .map(function (p) {
        return p.x.toFixed(1) + "," + p.y.toFixed(1);
      })
      .join(" ");
    const dayRecords = App.Record && App.Record.list
      ? App.Record.list().filter(function (record) {
          return String(record.date || "") === String(dateStr);
        })
      : [];
    const workIntervals = dayRecords.map(function (record) {
      const toMinutes = function (time) {
        const match = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour > 23 || minute > 59) return null;
        return hour * 60 + minute;
      };
      const start = toMinutes(record.start);
      const end = toMinutes(record.end);
      if (start === null || end === null) return null;
      const endMinutes = end <= start ? end + 24 * 60 : end;
      const startHour = start / 60;
      const endHour = Math.min(23, endMinutes / 60);
      if (endHour <= startHour) return null;
      const activity = App.Const.activityItems.find(function (item) {
        return item.code === record.activityCode;
      });
      return {
        x: padL + stepX * startHour,
        width: stepX * (endHour - startHour),
        start: record.start,
        end: record.end,
        activity: activity ? activity.label : record.activityCode,
      };
    }).filter(Boolean);
    const workOverlay = workIntervals.map(function (interval) {
      return "<rect x='" + interval.x.toFixed(1) + "' y='" + padT +
        "' width='" + interval.width.toFixed(1) + "' height='" +
        (height - padT - padB) +
        "' fill='#22c55e' fill-opacity='0.12'><title>" +
        Utils.esc(interval.activity + " / " + interval.start + "〜" +
          interval.end) + "</title></rect>";
    }).join("");

    const yTicks = [max, 200, 150, 100, 50, 0, min]
      .map(function (val) {
        const ratio = (max - val) / range;
        const y = padT + (height - padT - padB) * ratio;
        return (
          "<line x1='" +
          padL +
          "' y1='" +
          y.toFixed(1) +
          "' x2='" +
          (width - padR) +
          "' y2='" +
          y.toFixed(1) +
          "' stroke='#d9e2ec' stroke-width='1'/>" +
          "<text x='" +
          (padL - 6) +
          "' y='" +
          (y + 4).toFixed(1) +
          "' text-anchor='end' font-size='10' fill='#64748b'>" +
          val +
          "</text>"
        );
      })
      .join("");

    const xTicks = [0, 6, 12, 18, 23]
      .map(function (h) {
        const x = padL + stepX * h;
        return (
          "<text x='" +
          x.toFixed(1) +
          "' y='" +
          (height - 8) +
          "' text-anchor='middle' font-size='10' fill='#64748b'>" +
          h +
          "</text>"
        );
      })
      .join("");

    container.innerHTML =
      "<p style='font-weight:600; margin:0 0 8px;'>" +
      Utils.esc(dateStr) +
      "</p>" +
      "<svg class='plan-tide-graph-svg' viewBox='0 0 " +
      width +
      " " +
      height +
      "'>" +
      "<rect x='0' y='0' width='" +
      width +
      "' height='" +
      height +
      "' rx='10' fill='#f8fbfd'/>" +
      yTicks +
      workOverlay +
      "<line x1='" +
      padL +
      "' y1='" +
      (height - padB) +
      "' x2='" +
      (width - padR) +
      "' y2='" +
      (height - padB) +
      "' stroke='#94a3b8' stroke-width='1.2'/>" +
      "<line x1='" +
      padL +
      "' y1='" +
      padT +
      "' x2='" +
      padL +
      "' y2='" +
      (height - padB) +
      "' stroke='#94a3b8' stroke-width='1.2'/>" +
      "<polyline fill='none' stroke='#0f766e' stroke-width='2.5' points='" +
      polyline +
      "'/>" +
      points
        .map(function (p) {
          return (
            "<circle cx='" +
            p.x.toFixed(1) +
            "' cy='" +
            p.y.toFixed(1) +
            "' r='2.8' fill='#0f766e'><title>" +
            p.hour +
            "時: " +
            p.value +
            " cm</title></circle>"
          );
        })
        .join("") +
      "<g class='tide-crosshair' visibility='hidden' pointer-events='none'>" +
      "<line class='tide-crosshair-x' x1='" +
      padL +
      "' y1='" +
      padT +
      "' x2='" +
      padL +
      "' y2='" +
      (height - padB) +
      "' stroke='#dc2626' stroke-width='1' stroke-dasharray='3 3'/>" +
      "<line class='tide-crosshair-y' x1='" +
      padL +
      "' y1='" +
      padT +
      "' x2='" +
      (width - padR) +
      "' y2='" +
      padT +
      "' stroke='#dc2626' stroke-width='1' stroke-dasharray='3 3'/>" +
      "<circle class='tide-crosshair-point' cx='" +
      padL +
      "' cy='" +
      padT +
      "' r='4' fill='#dc2626' stroke='#fff' stroke-width='1.5'/>" +
      "<rect class='tide-crosshair-time-bg' x='0' y='" +
      (height - padB + 1) +
      "' width='42' height='16' rx='3' fill='#dc2626'/>" +
      "<text class='tide-crosshair-time' x='21' y='" +
      (height - padB + 12) +
      "' text-anchor='middle' font-size='10' font-weight='700' fill='#fff'></text>" +
      "<rect class='tide-crosshair-value-bg' x='" +
      (padL + 3) +
      "' y='" +
      padT +
      "' width='48' height='16' rx='3' fill='#dc2626'/>" +
      "<text class='tide-crosshair-value' x='" +
      (padL + 27) +
      "' y='" +
      (padT + 11) +
      "' text-anchor='middle' font-size='10' font-weight='700' fill='#fff'></text>" +
      "</g>" +
      xTicks +
      "</svg>" +
      (workIntervals.length
        ? "<p class='tide-work-legend'><span></span>当日の作業実績時間帯（緑）</p>"
        : "");

    bindTideGraphInteraction(container, hourly, {
      width: width,
      height: height,
      padL: padL,
      padR: padR,
      padT: padT,
      padB: padB,
      min: min,
      max: max,
    });
  }

  function bindTideGraphInteraction(container, hourly, graph) {
    const svg = container.querySelector(".plan-tide-graph-svg");
    const crosshair = svg && svg.querySelector(".tide-crosshair");
    if (!svg || !crosshair) return;

    const plotWidth = graph.width - graph.padL - graph.padR;
    const plotHeight = graph.height - graph.padT - graph.padB;
    const updateCrosshair = function (event) {
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      const x = Math.max(
        graph.padL,
        Math.min(
          graph.width - graph.padR,
          ((event.clientX - bounds.left) / bounds.width) * graph.width,
        ),
      );
      const hour = ((x - graph.padL) / plotWidth) * 23;
      const lowerHour = Math.floor(hour);
      const upperHour = Math.min(23, lowerHour + 1);
      const lowerValue = Number(hourly[lowerHour]);
      const upperValue = Number(hourly[upperHour]);
      if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) return;

      const value =
        lowerValue + (upperValue - lowerValue) * (hour - lowerHour);
      const y = Math.max(
        graph.padT,
        Math.min(
          graph.height - graph.padB,
          graph.height -
            graph.padB -
            ((value - graph.min) / (graph.max - graph.min)) * plotHeight,
        ),
      );
      const minutes = Math.round(hour * 60);
      const timeText =
        Utils.pad2(Math.floor(minutes / 60) % 24) +
        ":" +
        Utils.pad2(minutes % 60);
      const valueText = Math.round(value) + " cm";

      crosshair.setAttribute("visibility", "visible");
      crosshair.querySelector(".tide-crosshair-x").setAttribute("x1", x);
      crosshair.querySelector(".tide-crosshair-x").setAttribute("x2", x);
      crosshair.querySelector(".tide-crosshair-y").setAttribute("y1", y);
      crosshair.querySelector(".tide-crosshair-y").setAttribute("y2", y);
      crosshair.querySelector(".tide-crosshair-point").setAttribute("cx", x);
      crosshair.querySelector(".tide-crosshair-point").setAttribute("cy", y);

      const timeBg = crosshair.querySelector(".tide-crosshair-time-bg");
      const timeLabel = crosshair.querySelector(".tide-crosshair-time");
      const timeX = Math.max(
        graph.padL,
        Math.min(graph.width - graph.padR - 42, x - 21),
      );
      timeBg.setAttribute("x", timeX);
      timeLabel.setAttribute("x", timeX + 21);
      timeLabel.textContent = timeText;

      const valueBg = crosshair.querySelector(".tide-crosshair-value-bg");
      const valueLabel = crosshair.querySelector(".tide-crosshair-value");
      const labelY = Math.max(
        graph.padT,
        Math.min(graph.height - graph.padB - 16, y - 8),
      );
      valueBg.setAttribute("y", labelY);
      valueLabel.setAttribute("y", labelY + 11);
      valueLabel.textContent = valueText;
    };

    svg.addEventListener("pointermove", updateCrosshair);
    svg.addEventListener("pointerleave", function () {
      crosshair.setAttribute("visibility", "hidden");
    });
  }
  function patternStyle(pattern, color) {
    if (pattern === "stripe") {
      return (
        "background-image:repeating-linear-gradient(45deg," +
        "rgba(255,255,255,0.32) 0,rgba(255,255,255,0.32) 6px," +
        "transparent 6px,transparent 12px);"
      );
    }
    if (pattern === "dot") {
      return (
        "background-image:radial-gradient(rgba(255,255,255,0.4) 18%," +
        "transparent 20%); background-size:10px 10px;"
      );
    }
    return "";
  }

  // ============================================================
  // カレンダーナビ
  // ============================================================
  function bindCalNav() {
    const prev = document.getElementById("cal-prev");
    const next = document.getElementById("cal-next");
    const today = document.getElementById("cal-today");
    if (prev && !prev.dataset.bound) {
      prev.dataset.bound = "1";
      prev.addEventListener("click", function () {
        _month--;
        if (_month < 1) {
          _month = 12;
          _year--;
        }
        renderCalendar();
      });
    }
    if (next && !next.dataset.bound) {
      next.dataset.bound = "1";
      next.addEventListener("click", function () {
        _month++;
        if (_month > 12) {
          _month = 1;
          _year++;
        }
        renderCalendar();
      });
    }
    if (today && !today.dataset.bound) {
      today.dataset.bound = "1";
      today.addEventListener("click", function () {
        const now = new Date();
        _year = now.getFullYear();
        _month = now.getMonth() + 1;
        renderCalendar();
      });
    }
  }

  // ============================================================
  // 30分刻みの選択肢を <select> に設定する
  // ============================================================
  function buildTimeOptions(selectEl, selectedValue) {
    if (!selectEl) return;
    let html = "<option value=''>-- 選択 --</option>";
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const val = Utils.pad2(h) + ":" + Utils.pad2(m);
        const selected = val === selectedValue ? " selected" : "";
        html +=
          "<option value='" +
          val +
          "'" +
          selected +
          ">" +
          Utils.pad2(h) +
          ":" +
          Utils.pad2(m) +
          "</option>";
      }
    }
    selectEl.innerHTML = html;
  }

  // ============================================================
  // モーダルのバインド
  // ============================================================
  function bindPlanModal() {
    const btnSave = document.getElementById("btn-save-plan-modal");
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", savePlanModal);
    }

    const btnDelete = document.getElementById("btn-delete-plan-modal");
    if (btnDelete && !btnDelete.dataset.bound) {
      btnDelete.dataset.bound = "1";
      btnDelete.addEventListener("click", function () {
        const id = document.getElementById("modal-plan-id")?.value || "";
        const plan = id ? get(id) : null;
        if (!plan) return;
        if (
          !confirm(
            plan.date +
              " の作業計画を削除します。よろしいですか？",
          )
        )
          return;
        remove(id);
        if (App.Navigation) App.Navigation.closeModal("modal-plan");
        renderCalendar();
      });
    }

    // 開始時刻変更 → 終了時刻自動算出
    const startEl = document.getElementById("modal-plan-start");
    if (startEl && !startEl.dataset.bound) {
      startEl.dataset.bound = "1";
      // select なので change イベント
      startEl.addEventListener("change", function () {
        const end = calcEndTime(startEl.value);
        const endEl = document.getElementById("modal-plan-end");
        if (endEl)
          endEl.value = end
            ? Utils.pad2(parseInt(end.split(":")[0], 10)) +
              ":" +
              Utils.pad2(parseInt(end.split(":")[1], 10))
            : "";
        updateHoursDisp();
        updateCostPreview();
      });
    }

    // 人数・用船・車両変更 → 費用再計算
    ["modal-plan-people", "modal-plan-boat", "modal-plan-car"].forEach(
      function (id) {
        const el = document.getElementById(id);
        if (el && !el.dataset.costBound) {
          el.dataset.costBound = "1";
          el.addEventListener("input", updateCostPreview);
        }
      },
    );

    // 地区変更 → 標準人数の自動入力
    const areaEl = document.getElementById("modal-plan-area");
    if (areaEl && !areaEl.dataset.areaBound) {
      areaEl.dataset.areaBound = "1";
      areaEl.addEventListener("change", function () {
        const areas = App.Master ? App.Master.getAreas() : [];
        const area = areas.find(function (a) {
          return a.id === areaEl.value;
        });
        if (area && area.standardPeople > 0) {
          const peopleEl = document.getElementById("modal-plan-people");
          if (peopleEl) {
            peopleEl.value = area.standardPeople;
            updateCostPreview();
          }
        }
      });
    }

    // コピーボタン
    const btnCopy = document.getElementById("btn-plan-copy");
    if (btnCopy && !btnCopy.dataset.bound) {
      btnCopy.dataset.bound = "1";
      btnCopy.addEventListener("click", copyPlan);
    }

    // 物品追加ボタン
    const btnAddItem = document.getElementById("btn-plan-add-item");
    if (btnAddItem && !btnAddItem.dataset.bound) {
      btnAddItem.dataset.bound = "1";
      btnAddItem.addEventListener("click", function () {
        addItemRow(null);
      });
    }
  }

  // ============================================================
  // 作業時間表示の更新
  // ============================================================
  function updateHoursDisp() {
    const startEl = document.getElementById("modal-plan-start");
    const endEl = document.getElementById("modal-plan-end");
    const dispEl = document.getElementById("modal-plan-hours-disp");
    if (!startEl || !endEl || !dispEl) return;
    const diff = Utils.calcHourDiff
      ? Utils.calcHourDiff(
          startEl.value,
          endEl.value,
          Storage.getSettings().defaultHours || 3.5,
        )
      : 0;
    dispEl.value = diff > 0 ? diff.toFixed(1) + " 時間" : "";
  }

  // ============================================================
  // 費用プレビューの更新
  // ============================================================
  function updateCostPreview() {
    const people = +(document.getElementById("modal-plan-people")?.value || 0);
    const boat = +(document.getElementById("modal-plan-boat")?.value || 0);
    const car = +(document.getElementById("modal-plan-car")?.value || 0);
    const start = document.getElementById("modal-plan-start")?.value || "";
    const end = document.getElementById("modal-plan-end")?.value || "";
    const usedItems = collectItemRows();

    const cost = estimateCost({
      people: people,
      boat: boat,
      car: car,
      start: start,
      end: end,
      usedItems: usedItems,
    });

    const fmt = function (n) {
      return (n || 0).toLocaleString() + " 円";
    };
    const setEl = function (id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setEl("cost-jinken", fmt(cost.jinken));
    setEl("cost-yousen", fmt(cost.yousen));
    setEl("cost-kotsu", fmt(cost.kotsu));
    setEl("cost-items", fmt(cost.itemsCost));

    const totalEl = document.getElementById("cost-total");
    if (totalEl) {
      totalEl.textContent = fmt(cost.total);
      totalEl.style.color = cost.total > 0 ? "#0f766e" : "#64748b";
    }

    // 予算超過チェック
    checkBudgetAlert(cost.total);
  }

  // ============================================================
  // 予算超過アラート
  // ============================================================
  function checkBudgetAlert(thisCost) {
    const alertEl = document.getElementById("modal-plan-budget-alert");
    if (!alertEl) return;

    const budget = Storage.getBudget();
    const total = budget ? +budget.amount || 0 : 0;
    if (total <= 0) {
      alertEl.style.display = "none";
      return;
    }

    // 既存の執行済み合計を取得
    const records = Storage.getRecord() || [];
    let executed = 0;
    records.forEach(function (r) {
      if (App.Record && App.Record.calcRecordCost) {
        executed += App.Record.calcRecordCost(r).total || 0;
      }
    });

    // 既存の計画見込みを取得（現在編集中の計画は除く）
    const editingId = document.getElementById("modal-plan-id")?.value || "";
    const plans = list();
    let forecast = 0;
    plans.forEach(function (p) {
      if (p.id === editingId) return;
      forecast += estimateCost(p).total || 0;
    });

    const remaining = total - executed - forecast;
    const over = thisCost - remaining;

    if (over > 0) {
      alertEl.style.display = "block";
      alertEl.textContent =
        "⚠️ 予算超過の恐れがあります！" +
        " 残予算 " +
        remaining.toLocaleString() +
        " 円 に対して" +
        " 今回の見積 " +
        thisCost.toLocaleString() +
        " 円（" +
        over.toLocaleString() +
        " 円 超過）";
    } else {
      alertEl.style.display = "none";
    }
  }

  // ============================================================
  // 物品行の追加・収集
  // ============================================================
  function addItemRow(item) {
    const listEl = document.getElementById("modal-plan-items-list");
    if (!listEl) return;

    const inventory = Storage.getInventory() || [];
    const row = document.createElement("div");
    row.className = "plan-item-row";

    let optHtml = "<option value=''>物品を選択...</option>";
    inventory.forEach(function (inv) {
      const selected = item && item.itemId === inv.id ? " selected" : "";
      optHtml +=
        "<option value='" +
        inv.id +
        "'" +
        selected +
        ">" +
        Utils.esc(inv.name) +
        "（" +
        Utils.esc(inv.unit || "") +
        "）</option>";
    });

    row.innerHTML =
      "<select class='item-sel'>" +
      optHtml +
      "</select>" +
      "<input type='number' class='item-qty' min='0' value='" +
      (item ? +item.qty || 1 : 1) +
      "' placeholder='数量'>" +
      "<span class='item-unit' style='font-size:12px; color:#64748b;'>" +
      (item ? Utils.esc(item.unit || "") : "") +
      "</span>" +
      "<button type='button' class='btn-del-item' title='削除'>×</button>";

    // 物品選択 → 単位表示更新 & 費用再計算
    const sel = row.querySelector(".item-sel");
    const unitSpan = row.querySelector(".item-unit");
    sel.addEventListener("change", function () {
      const inv = inventory.find(function (x) {
        return x.id === sel.value;
      });
      unitSpan.textContent = inv ? inv.unit || "" : "";
      updateCostPreview();
    });

    // 数量変更 → 費用再計算
    row.querySelector(".item-qty").addEventListener("input", updateCostPreview);

    // 削除ボタン
    row.querySelector(".btn-del-item").addEventListener("click", function () {
      row.remove();
      updateCostPreview();
    });

    listEl.appendChild(row);
    updateCostPreview();
  }

  function collectItemRows() {
    const listEl = document.getElementById("modal-plan-items-list");
    if (!listEl) return [];
    const inventory = Storage.getInventory() || [];
    const result = [];
    listEl.querySelectorAll(".plan-item-row").forEach(function (row) {
      const itemId = row.querySelector(".item-sel")?.value || "";
      const qty = +(row.querySelector(".item-qty")?.value || 0);
      if (!itemId || qty <= 0) return;
      const inv = inventory.find(function (x) {
        return x.id === itemId;
      });
      result.push({
        itemId: itemId,
        name: inv ? inv.name : "",
        qty: qty,
        unit: inv ? inv.unit || "" : "",
      });
    });
    return result;
  }

  // ============================================================
  // モーダルを開く
  // ============================================================
  function buildSelectOptions() {
    const areas = Storage.getAreas ? Storage.getAreas() : [];
    const acts = App.Master ? App.Master.getActivities() : [];
    let areaHtml = "<option value=''>地区を選択...</option>";
    areas.forEach(function (a) {
      areaHtml +=
        "<option value='" + a.id + "'>" + Utils.esc(a.name) + "</option>";
    });
    let actHtml = "<option value=''>活動項目を選択...</option>";
    acts
      .filter(function (a) {
        return a.enabled;
      })
      .forEach(function (a) {
        actHtml +=
          "<option value='" + a.code + "'>" + Utils.esc(a.label) + "</option>";
      });
    return { area: areaHtml, act: actHtml };
  }

  function openPlanModal(id, dateStr, copyFrom) {
    const opts = buildSelectOptions();
    const areaEl = document.getElementById("modal-plan-area");
    const actEl = document.getElementById("modal-plan-act");
    if (areaEl) areaEl.innerHTML = opts.area;
    if (actEl) actEl.innerHTML = opts.act;

    // 物品リストをクリア
    const itemsListEl = document.getElementById("modal-plan-items-list");
    if (itemsListEl) itemsListEl.innerHTML = "";

    const copyBtn = document.getElementById("btn-plan-copy");
    const deleteBtn = document.getElementById("btn-delete-plan-modal");

    if (copyFrom) {
      // ===== コピーモード =====
      document.getElementById("modal-plan-title").textContent =
        "作業計画のコピー登録";
      document.getElementById("modal-plan-id").value = "";
      document.getElementById("modal-plan-copy-src").value = copyFrom.id || "";
      document.getElementById("modal-plan-date").value = dateStr || "";
      if (areaEl) areaEl.value = copyFrom.areaId || "";
      if (actEl) actEl.value = copyFrom.activityCode || "";
      document.getElementById("modal-plan-people").value = copyFrom.people || 0;
      document.getElementById("modal-plan-boat").value = copyFrom.boat || 0;
      document.getElementById("modal-plan-car").value = copyFrom.car || 0;
      buildTimeOptions(
        document.getElementById("modal-plan-start"),
        copyFrom.start || "",
      );
      const endVal = copyFrom.start
        ? calcEndTime(copyFrom.start)
        : copyFrom.end || "";
      document.getElementById("modal-plan-end").value = endVal;
      document.getElementById("modal-plan-content").value =
        copyFrom.content || "";
      (copyFrom.usedItems || []).forEach(function (ui) {
        addItemRow(ui);
      });
      if (copyBtn) copyBtn.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "none";
    } else if (id) {
      // ===== 編集モード =====
      const p = get(id) || {};
      document.getElementById("modal-plan-title").textContent =
        "作業計画の編集";
      document.getElementById("modal-plan-id").value = id;
      document.getElementById("modal-plan-copy-src").value = "";
      document.getElementById("modal-plan-date").value = p.date || "";
      if (areaEl) areaEl.value = p.areaId || "";
      if (actEl) actEl.value = p.activityCode || "";
      document.getElementById("modal-plan-people").value = p.people || 0;
      document.getElementById("modal-plan-boat").value = p.boat || 0;
      document.getElementById("modal-plan-car").value = p.car || 0;
      buildTimeOptions(
        document.getElementById("modal-plan-start"),
        p.start || "",
      );
      document.getElementById("modal-plan-end").value = p.end || "";
      document.getElementById("modal-plan-content").value = p.content || "";
      (p.usedItems || []).forEach(function (ui) {
        addItemRow(ui);
      });
      if (copyBtn) copyBtn.style.display = "";
      if (deleteBtn) deleteBtn.style.display = "";
    } else {
      // ===== 新規モード =====
      document.getElementById("modal-plan-title").textContent =
        "作業計画の登録";
      document.getElementById("modal-plan-id").value = "";
      document.getElementById("modal-plan-copy-src").value = "";
      document.getElementById("modal-plan-date").value = dateStr || "";
      document.getElementById("modal-plan-people").value = 0;
      document.getElementById("modal-plan-boat").value = 0;
      document.getElementById("modal-plan-car").value = 0;
      buildTimeOptions(document.getElementById("modal-plan-start"), "");
      document.getElementById("modal-plan-end").value = "";
      document.getElementById("modal-plan-content").value = "";
      if (copyBtn) copyBtn.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "none";
    }

    updateHoursDisp();
    updateCostPreview();
    if (App.Navigation) App.Navigation.openModal("modal-plan");
  }

  // ============================================================
  // コピー機能
  // ============================================================
  function copyPlan() {
    const id = document.getElementById("modal-plan-id")?.value;
    if (!id) return;
    const src = get(id);
    if (!src) return;

    // 現在のモーダルを閉じてコピーモードで再オープン
    if (App.Navigation) App.Navigation.closeModal("modal-plan");

    // 日付だけ翌日にして開く
    const nextDate = src.date
      ? (function () {
          const d = new Date(src.date + "T00:00:00");
          d.setDate(d.getDate() + 1);
          return d.toISOString().slice(0, 10);
        })()
      : "";

    setTimeout(function () {
      openPlanModal(null, nextDate, src);
    }, 100);
  }

  // ============================================================
  // 保存
  // ============================================================
  function savePlanModal() {
    const date = document.getElementById("modal-plan-date")?.value || "";
    const areaId = document.getElementById("modal-plan-area")?.value || "";
    const actCode = document.getElementById("modal-plan-act")?.value || "";
    if (!date || !areaId || !actCode) {
      alert("日付・地区・活動項目は必須です。");
      return;
    }

    const start = document.getElementById("modal-plan-start")?.value || "";
    const end = document.getElementById("modal-plan-end")?.value || "";
    const usedItems = collectItemRows();

    // 予算超過の最終確認
    const cost = estimateCost({
      people: +(document.getElementById("modal-plan-people")?.value || 0),
      boat: +(document.getElementById("modal-plan-boat")?.value || 0),
      car: +(document.getElementById("modal-plan-car")?.value || 0),
      start: start,
      end: end,
      usedItems: usedItems,
    });

    const alertEl = document.getElementById("modal-plan-budget-alert");
    if (alertEl && alertEl.style.display !== "none") {
      if (!confirm("予算超過の恐れがあります。このまま保存しますか？")) return;
    }

    const id = document.getElementById("modal-plan-id")?.value || "";
    try {
      upsert({
        id: id || undefined,
        date: date,
        areaId: areaId,
        activityCode: actCode,
        people: +(document.getElementById("modal-plan-people")?.value || 0),
        boat: +(document.getElementById("modal-plan-boat")?.value || 0),
        car: +(document.getElementById("modal-plan-car")?.value || 0),
        start: start,
        end: end,
        content: document.getElementById("modal-plan-content")?.value || "",
        usedItems: usedItems,
      });
      if (App.Navigation) App.Navigation.closeModal("modal-plan");
      renderCalendar();
    } catch (e) {
      alert("保存エラー: " + e.message);
    }
  }

  // ============================================================
  // 公開API
  // ============================================================
  return {
    list: list,
    get: get,
    upsert: upsert,
    remove: remove,
    monthly: monthly,
    estimateCost: estimateCost,
    render: render,
    renderCalendar: renderCalendar,
    openPlanModal: openPlanModal,
  };
})();
