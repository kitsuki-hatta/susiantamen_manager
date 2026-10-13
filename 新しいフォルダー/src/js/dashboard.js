window.App = window.App || {};

App.Dashboard = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;

  // ============================================================
  // カラーパレット定義
  // ============================================================
  const PALETTE = [
    ["#1d4ed8", "#60a5fa"],
    ["#b45309", "#f59e0b"],
    ["#6d28d9", "#a78bfa"],
    ["#065f46", "#34d399"],
    ["#9f1239", "#fb7185"],
    ["#0e7490", "#22d3ee"],
    ["#713f12", "#fbbf24"],
    ["#1e3a5f", "#38bdf8"],
  ];

  const DONUT_COLORS = [
    "#3b82f6",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#f97316",
    "#84cc16",
  ];

  // ============================================================
  // データ集計
  // ============================================================
  function summarize() {
    const budget =
      App.Budget && App.Budget.getBudget
        ? App.Budget.getBudget()
        : { amount: 0 };
    const plans =
      App.Plan && App.Plan.list ? App.Plan.list() : Storage.getPlan() || [];
    const records =
      App.Record && App.Record.list
        ? App.Record.list()
        : Storage.getRecord() || [];
    const execution = summarizeExecution(records);
    const forecast = summarizeForecast(plans, records);
    const alerts = collectAlerts(plans, records);

    return {
      budget: budget.amount || 0,
      executed: execution.total,
      forecast: forecast.total,
      remaining: (budget.amount || 0) - execution.total - forecast.total,
      byArea: execution.byArea,
      byActivity: execution.byActivity,
      byExpense: execution.byExpense,
      alerts: alerts,
    };
  }

  function summarizeMonthly() {
    const totals = {};
    const expenses =
      App.Budget && App.Budget.listBudgetExpense
        ? App.Budget.listBudgetExpense()
        : Storage.getBudgetExpense() || [];
    expenses.forEach(function (row) {
      const date = String(row.paidDate || "");
      const key = date ? date.slice(0, 7) : "unknown";
      if (!totals[key]) totals[key] = 0;
      totals[key] += Number(row.amount) || 0;
    });

    return Object.keys(totals)
      .sort()
      .map(function (key) {
        return { label: key, value: totals[key] };
      });
  }

  function mapEntries(sourceMap, labelMap, limit) {
    return Object.keys(sourceMap || {})
      .map(function (key) {
        return { label: labelMap[key] || key, value: +sourceMap[key] || 0 };
      })
      .filter(function (row) {
        return row.value > 0;
      })
      .sort(function (a, b) {
        return b.value - a.value;
      })
      .slice(0, limit || 6);
  }

  function summarizeActivityHours(records) {
    const totals = {};
    (records || []).forEach(function (row) {
      const code = String(row.activityCode || "unknown");
      const hours =
        Number(row.workHours) ||
        (App.Utils && App.Utils.calcHourDiff
          ? App.Utils.calcHourDiff(row.start, row.end, 3.5)
          : 0);
      totals[code] = (totals[code] || 0) + hours;
    });
    return totals;
  }

  function summarizePeriodCompare() {
    const plans =
      App.Budget && App.Budget.getPlanByPeriod
        ? App.Budget.getPlanByPeriod()
        : { 1: 0, 2: 0, 3: 0 };
    const expenses =
      App.Budget && App.Budget.listBudgetExpense
        ? App.Budget.listBudgetExpense()
        : Storage.getBudgetExpense() || [];
    return [1, 2, 3].map(function (pid) {
      const period =
        App.Const &&
        App.Const.periods &&
        App.Const.periods.find(function (item) {
          return item.id === pid;
        });
      const months = (period && period.months) || [];
      const executed = expenses.reduce(function (sum, expense) {
        const paidDate = String(expense.paidDate || "");
        const month = parseInt(paidDate.slice(5, 7), 10);
        return paidDate && months.indexOf(month) >= 0
          ? sum + (Number(expense.amount) || 0)
          : sum;
      }, 0);
      const planned = Number(plans[pid] || 0);
      return { label: "第" + pid + "回", executed: executed, planned: planned };
    });
  }

  function summarizeExecution(records) {
    const byArea = {};
    const byActivity = {};
    const byExpense = { jinken: 0, yousen: 0, kotsu: 0, shizai: 0 };
    let total = 0;
    const recordById = {};
    (records || []).forEach(function (record) {
      recordById[String(record.id)] = record;
    });
    const logs =
      App.Inventory && App.Inventory.listLogs
        ? App.Inventory.listLogs()
        : Storage.getInvLog() || [];
    const logById = {};
    logs.forEach(function (log) {
      if (log.type === "in") logById[String(log.id)] = log;
    });
    const expenses =
      App.Budget && App.Budget.listBudgetExpense
        ? App.Budget.listBudgetExpense()
        : Storage.getBudgetExpense() || [];

    expenses.forEach(function (expense) {
      const amount = Number(expense.amount) || 0;
      total += amount;

      const sources = [];
      (expense.recordIds || []).forEach(function (id) {
        const record = recordById[String(id)];
        if (!record) return;
        const cost =
          App.Record && App.Record.calcRecordCost
            ? App.Record.calcRecordCost(record)
            : { total: 0, jinken: 0, yousen: 0, kotsu: 0 };
        const breakdown =
          expense.breakdown && expense.breakdown[String(id)];
        const categories = breakdown || {
          jinken: cost.jinken,
          yousen: cost.yousen,
          kotsu: cost.kotsu,
        };
        const categoryTotal =
          (Number(categories.jinken) || 0) +
          (Number(categories.yousen) || 0) +
          (Number(categories.kotsu) || 0);
        sources.push({
          weight: Math.max(0, Number(cost.total) || categoryTotal),
          categories: categories,
          record: record,
        });
      });
      (expense.inventoryLogIds || []).forEach(function (id) {
        const log = logById[String(id)];
        if (!log) return;
        sources.push({
          weight: Math.max(0, Number(log.totalCost) || 0),
          categories: { shizai: Math.max(0, Number(log.totalCost) || 0) },
        });
      });

      const totalWeight = sources.reduce(function (sum, source) {
        return sum + source.weight;
      }, 0);
      if (totalWeight <= 0) return;

      sources.forEach(function (source) {
        const sourceShare = (amount * source.weight) / totalWeight;
        const record = source.record;
        if (record) {
          const areaId = String(record.areaId || "unknown");
          const activityCode = String(record.activityCode || "unknown");
          byArea[areaId] = (byArea[areaId] || 0) + sourceShare;
          byActivity[activityCode] =
            (byActivity[activityCode] || 0) + sourceShare;
        }

        const categoryTotal = Object.keys(source.categories).reduce(
          function (sum, key) {
            return sum + Math.max(0, Number(source.categories[key]) || 0);
          },
          0,
        );
        if (categoryTotal <= 0) return;
        Object.keys(source.categories).forEach(function (key) {
          if (!Object.prototype.hasOwnProperty.call(byExpense, key)) return;
          const categoryShare =
            (sourceShare *
              Math.max(0, Number(source.categories[key]) || 0)) /
            categoryTotal;
          byExpense[key] += categoryShare;
        });
      });
    });

    return {
      total: total,
      byArea: byArea,
      byActivity: byActivity,
      byExpense: byExpense,
    };
  }

  function summarizeForecast(plans, records) {
    const donePlanIds = {};
    (records || []).forEach(function (row) {
      if (row.planId) donePlanIds[row.planId] = true;
    });
    let total = 0;
    (plans || []).forEach(function (row) {
      if (row.id && donePlanIds[row.id]) return;
      const estimate =
        App.Plan && App.Plan.estimateCost
          ? App.Plan.estimateCost(row)
          : { total: 0 };
      total += estimate.total;
    });
    return { total: total };
  }

  function collectAlerts(plans, records) {
    const today = Utils.todayStr ? Utils.todayStr() : "";
    const alerts = {
      shortageItems:
        App.Inventory && App.Inventory.getShortageList
          ? App.Inventory.getShortageList()
          : [],
      noRecordPlans: [],
      unpaidRecords: [],
    };

    const hasRecordByPlan = {};
    (records || []).forEach(function (row) {
      if (row.planId) hasRecordByPlan[row.planId] = true;
    });

    (plans || []).forEach(function (row) {
      if (row.date > today) return;
      if (!row.id) return;
      if (!hasRecordByPlan[row.id]) alerts.noRecordPlans.push(row);
    });

    const paidMap =
      App.Budget && App.Budget.paidAmountMap
        ? App.Budget.paidAmountMap(records, function (record) {
            return App.Record && App.Record.calcRecordCost
              ? App.Record.calcRecordCost(record).total
              : 0;
          })
        : {};

    (records || []).forEach(function (row) {
      if (row.date > today) return;
      const expected =
        App.Record && App.Record.calcRecordCost
          ? App.Record.calcRecordCost(row).total
          : 0;
      const paid = paidMap[String(row.id)] || 0;
      if (expected - paid > 0) {
        alerts.unpaidRecords.push({
          recordId: row.id,
          date: row.date,
          areaId: row.areaId,
          activityCode: row.activityCode,
          unpaid: expected - paid,
        });
      }
    });

    alerts.unpaidRecords.sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    });

    return alerts;
  }

  function organizationYear() {
    const year = Number((Storage.getOrg() || {}).year);
    return year > 0 ? 2018 + year : new Date().getFullYear();
  }

  function renderOnboarding(plans, records) {
    const container = document.getElementById("dash-onboarding");
    if (!container) return;
    const org = Storage.getOrg() || {};
    const budget = App.Budget && App.Budget.getBudget
      ? App.Budget.getBudget()
      : Storage.getBudget() || {};
    const areas = App.Master && App.Master.getAreas
      ? App.Master.getAreas()
      : Storage.getAreas() || [];
    const activities = App.Master && App.Master.getActivities
      ? App.Master.getActivities()
      : Storage.getActivities() || [];
    const enabledActivities = activities.filter(function (item) {
      return item.enabled !== false;
    });
    const completed = [
      !!String(org.orgName || "").trim(),
      areas.length > 0 && enabledActivities.length > 0,
      Number(budget.amount) > 0,
      plans.length > 0,
      records.length > 0,
      !!Storage.getLastBackup(),
    ];
    const steps = [
      ["活動組織を確認", "settings"],
      ["地区・活動項目を設定", "settings"],
      ["予算額を登録", "budget"],
      ["作業計画を登録", "plan"],
      ["作業実績を記録", "record"],
      ["バックアップを作成", "backup"],
    ];
    const doneCount = completed.filter(Boolean).length;
    let html =
      "<div class='guide-progress'><strong>" +
      doneCount +
      " / " +
      steps.length +
      " 項目完了</strong><div class='guide-progress-track'><span style='width:" +
      Math.round((doneCount / steps.length) * 100) +
      "%'></span></div></div><ol class='guide-checklist'>";
    steps.forEach(function (step, index) {
      html +=
        "<li class='" +
        (completed[index] ? "is-complete" : "") +
        "'><span class='guide-check-icon'>" +
        (completed[index] ? "✓" : index + 1) +
        "</span><span class='guide-step-label'>" +
        Utils.esc(step[0]) +
        "</span><button type='button' class='btn-outline btn-sm' data-guide-view='" +
        step[1] +
        "'>" +
        (completed[index] ? "確認" : "進む") +
        "</button></li>";
    });
    html += "</ol>";
    container.innerHTML = html;
  }

  function allPhotosForYear(records, year) {
    const form6 = Storage.getForm6 ? Storage.getForm6() || {} : {};
    const photos = [];
    (records || []).forEach(function (record) {
      if (String(record.date || "").slice(0, 4) !== String(year)) return;
      const entry = form6[record.id];
      (entry && Array.isArray(entry.photos) ? entry.photos : []).forEach(
        function (photo) {
          if (photo && typeof photo.dataUrl === "string" &&
              photo.dataUrl.indexOf("data:image/") === 0) {
            photos.push({
              date: record.date,
              activityCode: record.activityCode,
              dataUrl: photo.dataUrl,
              caption: photo.caption || photo.biko || "",
            });
          }
        },
      );
    });
    return photos;
  }

  function retrospectiveData(year, records, plans) {
    const yearRecords = (records || []).filter(function (record) {
      return String(record.date || "").slice(0, 4) === String(year);
    });
    const yearPlans = (plans || []).filter(function (plan) {
      return String(plan.date || "").slice(0, 4) === String(year);
    });
    const dates = new Set();
    const activityCount = {};
    let participantTotal = 0;
    yearRecords.forEach(function (record) {
      dates.add(record.date);
      participantTotal += Number(record.people) ||
        (Array.isArray(record.participants) ? record.participants.length : 0);
      const code = String(record.activityCode || "unknown");
      activityCount[code] = (activityCount[code] || 0) + 1;
    });
    const photos = allPhotosForYear(yearRecords, year);
    const activities = App.Master && App.Master.getActivities
      ? App.Master.getActivities()
      : Storage.getActivities() || [];
    const labels = {};
    activities.forEach(function (activity) {
      labels[activity.code] = activity.label;
    });
    return {
      year: Number(year),
      records: yearRecords,
      plans: yearPlans,
      activityDays: dates.size,
      participantTotal: participantTotal,
      mobaCount: yearRecords.filter(function (row) {
        return String(row.activityCode || "").indexOf("moba_") === 0;
      }).length,
      higataCount: yearRecords.filter(function (row) {
        return String(row.activityCode || "").indexOf("higata_") === 0;
      }).length,
      activityCount: activityCount,
      activityLabels: labels,
      photos: photos,
    };
  }

  function availableRetrospectiveYears(records, plans) {
    const years = new Set([new Date().getFullYear(), organizationYear()]);
    (records || []).concat(plans || []).forEach(function (item) {
      const year = parseInt(String(item.date || "").slice(0, 4), 10);
      if (year > 1900) years.add(year);
    });
    return Array.from(years).sort(function (a, b) { return b - a; });
  }

  function renderRetrospective(records, plans) {
    const container = document.getElementById("dash-retrospective");
    const yearSelect = document.getElementById("dash-retrospective-year");
    const printButton = document.getElementById("btn-print-retrospective");
    if (!container || !yearSelect) return;

    const years = availableRetrospectiveYears(records, plans);
    const priorYear = Number(yearSelect.value);
    yearSelect.innerHTML = years.map(function (year) {
      return "<option value='" + year + "'>" + year + "年（令和" +
        (year - 2018) + "年度）</option>";
    }).join("");
    const year = years.indexOf(priorYear) >= 0
      ? priorYear
      : (years.indexOf(organizationYear()) >= 0 ? organizationYear() : years[0]);
    yearSelect.value = String(year);

    const draw = function () {
      const summary = retrospectiveData(yearSelect.value, records, plans);
      const activityRows = Object.keys(summary.activityCount)
        .sort(function (a, b) {
          return summary.activityCount[b] - summary.activityCount[a];
        })
        .slice(0, 5)
        .map(function (code) {
          return "<span class='retrospective-activity-chip'>" +
            Utils.esc(summary.activityLabels[code] || code) + " " +
            summary.activityCount[code] + "回</span>";
        }).join("");
      const photos = summary.photos.slice(0, 6).map(function (photo) {
        return "<figure class='retrospective-photo'><img src='" +
          Utils.esc(photo.dataUrl) + "' alt='" +
          Utils.esc(photo.date + "の活動写真") +
          "'><figcaption>" + Utils.esc(photo.date) +
          (photo.caption ? " " + Utils.esc(photo.caption) : "") +
          "</figcaption></figure>";
      }).join("");
      container.innerHTML =
        "<div class='retrospective-stats'>" +
        "<div><strong>" + summary.activityDays + "</strong><span>活動日数</span></div>" +
        "<div><strong>" + summary.records.length + "</strong><span>実績件数</span></div>" +
        "<div><strong>" + summary.participantTotal + "</strong><span>延べ参加人数</span></div>" +
        "<div><strong>" + summary.plans.length + "</strong><span>計画件数</span></div>" +
        "<div><strong>" + summary.photos.length + "</strong><span>登録写真</span></div>" +
        "</div>" +
        "<p class='retrospective-category'>🌿 藻場 " + summary.mobaCount +
        "件　　🦀 干潟 " + summary.higataCount + "件</p>" +
        (activityRows
          ? "<div class='retrospective-activities'>" + activityRows + "</div>"
          : "<div class='guide-empty'>この年度の実績はまだありません。作業実績を登録すると、ここに活動の記録が積み上がります。<button type='button' class='btn-outline btn-sm' data-guide-view='record'>実績記録へ</button></div>") +
        (photos
          ? "<div class='retrospective-photos'>" + photos + "</div>"
          : "") +
        (summary.photos.length > 6
          ? "<p class='hint'>写真は先頭の6枚を表示しています。印刷用まとめには最大12枚を含めます。</p>"
          : "");
    };

    draw();
    if (yearSelect.dataset.bound !== "1") {
      yearSelect.dataset.bound = "1";
      yearSelect.addEventListener("change", draw);
    }
    if (printButton && printButton.dataset.bound !== "1") {
      printButton.dataset.bound = "1";
      printButton.addEventListener("click", function () {
        const summary = retrospectiveData(yearSelect.value, records, plans);
        printRetrospective(summary);
      });
    }
  }

  function printRetrospective(summary) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("印刷用の別画面を開けませんでした。ブラウザーのポップアップ許可を確認してください。");
      return;
    }
    const org = Storage.getOrg() || {};
    const activityRows = Object.keys(summary.activityCount)
      .sort(function (a, b) {
        return summary.activityCount[b] - summary.activityCount[a];
      })
      .map(function (code) {
        return "<tr><td>" + Utils.esc(summary.activityLabels[code] || code) +
          "</td><td>" + summary.activityCount[code] + "</td></tr>";
      }).join("");
    const photos = summary.photos.slice(0, 12).map(function (photo) {
      return "<figure><img src='" + Utils.esc(photo.dataUrl) +
        "' alt='活動写真'><figcaption>" + Utils.esc(photo.date) +
        (photo.caption ? " " + Utils.esc(photo.caption) : "") +
        "</figcaption></figure>";
    }).join("");
    printWindow.document.open();
    printWindow.document.write(
      "<!doctype html><html lang='ja'><head><meta charset='utf-8'><title>" +
      summary.year + "年度 活動のふりかえり</title><style>" +
      "body{font-family: sans-serif;color:#1f2937;margin:24px}h1{font-size:22px}" +
      ".stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:20px 0}" +
      ".stats div{border:1px solid #cbd5e1;padding:12px;text-align:center}" +
      ".stats strong{display:block;font-size:22px;color:#0f766e}.stats span{font-size:12px}" +
      "table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left}" +
      ".photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.photos figure{margin:0;break-inside:avoid}" +
      ".photos img{width:100%;height:180px;object-fit:contain;border:1px solid #cbd5e1}.photos figcaption{font-size:11px}" +
      ".print-button{padding:8px 14px;margin-bottom:16px;background:#0f766e;color:#fff;border:0;border-radius:5px;font-size:14px;cursor:pointer}" +
      "@media print{body{margin:12mm}.photos img{height:42mm}.print-button{display:none}}" +
      "</style></head><body><button class='print-button' onclick='window.print()'>印刷 / PDFとして保存</button><h1>" + summary.year + "年度 活動のふりかえり</h1><p>" +
      Utils.esc(org.orgName || "活動組織") + "</p><div class='stats'>" +
      "<div><strong>" + summary.activityDays + "</strong><span>活動日数</span></div>" +
      "<div><strong>" + summary.records.length + "</strong><span>実績件数</span></div>" +
      "<div><strong>" + summary.participantTotal + "</strong><span>延べ参加人数</span></div>" +
      "<div><strong>" + summary.plans.length + "</strong><span>計画件数</span></div>" +
      "<div><strong>" + summary.photos.length + "</strong><span>登録写真</span></div>" +
      "</div><p>藻場 " + summary.mobaCount + "件 ／ 干潟 " +
      summary.higataCount + "件</p><h2>活動項目</h2><table><thead><tr><th>項目</th><th>実績件数</th></tr></thead><tbody>" +
      (activityRows || "<tr><td colspan='2'>実績はまだありません。</td></tr>") +
      "</tbody></table>" +
      (photos ? "<h2>活動写真</h2><div class='photos'>" + photos + "</div>" : "") +
      "</body></html>",
    );
    printWindow.document.close();
    printWindow.focus();
  }

  function renderAchievements(records, plans) {
    const container = document.getElementById("dash-achievements");
    if (!container) return;
    const form6 = Storage.getForm6 ? Storage.getForm6() || {} : {};
    const hasPhoto = Object.keys(form6).some(function (recordId) {
      const entry = form6[recordId];
      return entry && Array.isArray(entry.photos) && entry.photos.length > 0;
    });
    const categories = new Set((records || []).map(function (record) {
      return String(record.activityCode || "").split("_")[0];
    }));
    const badges = [
      { icon: "🗓️", label: "計画の第一歩", earned: plans.length > 0, view: "plan" },
      { icon: "📝", label: "初めての実績", earned: records.length > 0, view: "record" },
      { icon: "🌱", label: "記録10件", earned: records.length >= 10, view: "record" },
      { icon: "🌿", label: "藻場と干潟の記録", earned: categories.has("moba") && categories.has("higata"), view: "record" },
      { icon: "📷", label: "写真を記録", earned: hasPhoto, view: "report" },
      { icon: "💾", label: "バックアップ作成", earned: !!Storage.getLastBackup(), view: "backup" },
    ];
    const earnedCount = badges.filter(function (badge) { return badge.earned; }).length;
    container.innerHTML =
      "<div class='achievement-summary'>これまでに <strong>" +
      earnedCount + " / " + badges.length +
      "</strong> 個のバッジを獲得しました</div><div class='achievement-list'>" +
      badges.map(function (badge) {
        return "<button type='button' class='achievement-badge " +
          (badge.earned ? "earned" : "locked") +
          "' data-guide-view='" + badge.view + "' title='関連画面を開く'>" +
          "<span class='achievement-icon'>" + badge.icon + "</span><span>" +
          Utils.esc(badge.label) + "</span><small>" +
          (badge.earned ? "獲得" : "これから") + "</small></button>";
      }).join("") + "</div>";
  }

  // ============================================================
  // グラフ描画：横棒グラフ（色・単位指定可）
  // ============================================================
  function renderEmptyGraph(container, title) {
    container.innerHTML =
      "<div class='guide-empty compact'><span>" +
      Utils.esc(title) +
      "に表示できるデータはまだありません。作業実績や支払を記録すると、ここに集計が表示されます。</span>" +
      "<button type='button' class='btn-outline btn-sm' data-guide-view='record'>実績記録へ</button></div>";
  }

  function renderBarGraph(containerId, title, rows, options) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!rows || !rows.length) {
      renderEmptyGraph(container, title);
      return;
    }

    const opts = options || {};
    const unit = opts.unit || "円";
    const colorPair = opts.colorPair || PALETTE[0];
    const gradId = "grad-" + containerId;

    const width = 420;
    const barHeight = 32;
    const gap = 14;
    const padLeft = 100;
    const padRight = 80;
    const padTop = 12;
    const padBottom = 16;
    const max = Math.max.apply(
      null,
      rows.map(function (r) {
        return r.value;
      }),
    );
    const totalHeight =
      padTop + padBottom + rows.length * (barHeight + gap) - gap;

    let html =
      "<svg class='dash-graph-svg' viewBox='0 0 " +
      width +
      " " +
      totalHeight +
      "' role='img' aria-label='" +
      Utils.esc(title) +
      "'>";
    html +=
      "<defs><linearGradient id='" +
      gradId +
      "' x1='0' y1='0' x2='1' y2='0'>" +
      "<stop offset='0%' stop-color='" +
      colorPair[0] +
      "'/>" +
      "<stop offset='100%' stop-color='" +
      colorPair[1] +
      "'/>" +
      "</linearGradient></defs>";

    rows.forEach(function (row, i) {
      const y = padTop + i * (barHeight + gap);
      const barW = Math.max(
        8,
        (width - padLeft - padRight) * (row.value / max),
      );
      const label =
        row.label.length > 10 ? row.label.slice(0, 10) + "…" : row.label;

      // ラベル文字色: ダーク対応
      html +=
        "<text x='" +
        (padLeft - 6) +
        "' y='" +
        (y + 16) +
        "' font-size='10' fill='#94a3b8' text-anchor='end'>" +
        Utils.esc(label) +
        "</text>";

      html +=
        "<rect x='" +
        padLeft +
        "' y='" +
        y +
        "' width='" +
        barW.toFixed(1) +
        "' height='" +
        barHeight +
        "' rx='6' fill='url(#" +
        gradId +
        ")'/>";

      const valStr =
        unit === "円"
          ? (row.value || 0).toLocaleString() + "円"
          : (Math.round((row.value || 0) * 10) / 10).toLocaleString() + unit;

      // 値文字色: ダーク対応
      html +=
        "<text x='" +
        (padLeft + barW + 6).toFixed(1) +
        "' y='" +
        (y + 16) +
        "' font-size='10' fill='#e2e8f0'>" +
        valStr +
        "</text>";
    });

    html += "</svg>";
    container.innerHTML = html;
  }

  // ============================================================
  // グラフ描画：折れ線グラフ（月別トレンド用）
  // ============================================================
  function renderLineGraph(containerId, title, rows) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!rows || !rows.length) {
      renderEmptyGraph(container, title);
      return;
    }

    const width = 420;
    const height = 200;
    const padLeft = 56;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 28;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;
    const max =
      Math.max.apply(
        null,
        rows.map(function (r) {
          return r.value;
        }),
      ) || 1;
    const step = innerW / Math.max(rows.length - 1, 1);

    const points = rows.map(function (row, i) {
      return {
        x: padLeft + i * step,
        y: padTop + innerH - (row.value / max) * innerH,
        label: row.label,
        value: row.value,
      };
    });

    let areaPath = "M " + points[0].x + " " + (padTop + innerH);
    points.forEach(function (p) {
      areaPath += " L " + p.x.toFixed(1) + " " + p.y.toFixed(1);
    });
    areaPath +=
      " L " + points[points.length - 1].x + " " + (padTop + innerH) + " Z";

    let linePath = "M " + points[0].x.toFixed(1) + " " + points[0].y.toFixed(1);
    points.slice(1).forEach(function (p) {
      linePath += " L " + p.x.toFixed(1) + " " + p.y.toFixed(1);
    });

    let html =
      "<svg class='dash-graph-svg' viewBox='0 0 " +
      width +
      " " +
      height +
      "' role='img' aria-label='" +
      Utils.esc(title) +
      "'>";
    html +=
      "<defs>" +
      "<linearGradient id='line-area-grad-" +
      containerId +
      "' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0%' stop-color='#38bdf8' stop-opacity='0.35'/>" +
      "<stop offset='100%' stop-color='#38bdf8' stop-opacity='0.02'/>" +
      "</linearGradient></defs>";

    // Y軸補助線（グリッド線・Y軸ラベル）: ダーク対応
    for (let t = 0; t <= 4; t++) {
      const gy = padTop + innerH - (t / 4) * innerH;
      const gv = Math.round((max * t) / 4);
      html +=
        "<line x1='" +
        padLeft +
        "' y1='" +
        gy.toFixed(1) +
        "' x2='" +
        (width - padRight) +
        "' y2='" +
        gy.toFixed(1) +
        "' stroke='#334155' stroke-width='1'/>";
      html +=
        "<text x='" +
        (padLeft - 4) +
        "' y='" +
        (gy + 4).toFixed(1) +
        "' font-size='8' fill='#64748b' text-anchor='end'>" +
        (gv >= 10000 ? Math.round(gv / 1000) + "k" : gv) +
        "</text>";
    }

    html +=
      "<path d='" +
      areaPath +
      "' fill='url(#line-area-grad-" +
      containerId +
      ")'/>";
    html +=
      "<path d='" +
      linePath +
      "' fill='none' stroke='#38bdf8' stroke-width='2' stroke-linejoin='round'/>";

    // データポイント: ダーク対応（ドット外枠を暗色に）
    points.forEach(function (p, i) {
      html +=
        "<circle cx='" +
        p.x.toFixed(1) +
        "' cy='" +
        p.y.toFixed(1) +
        "' r='4' fill='#38bdf8' stroke='#1e293b' stroke-width='1.5'/>";
      if (i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1) {
        const shortLabel = p.label.slice(5);
        html +=
          "<text x='" +
          p.x.toFixed(1) +
          "' y='" +
          (padTop + innerH + 16) +
          "' font-size='8' fill='#94a3b8' text-anchor='middle'>" +
          Utils.esc(shortLabel) +
          "</text>";
      }
    });

    html += "</svg>";
    container.innerHTML = html;
  }

  // ============================================================
  // グラフ描画：ドーナツグラフ（科目別内訳用）
  // ============================================================
  function renderDonutGraph(containerId, title, rows) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!rows || !rows.length) {
      renderEmptyGraph(container, title);
      return;
    }

    const total =
      rows.reduce(function (s, r) {
        return s + r.value;
      }, 0) || 1;
    const cx = 110,
      cy = 110,
      r = 88,
      innerR = 54;
    const width = 400,
      height = 240;

    let html =
      "<svg class='dash-graph-svg' viewBox='0 0 " +
      width +
      " " +
      height +
      "' role='img' aria-label='" +
      Utils.esc(title) +
      "'>";

    let startAngle = -Math.PI / 2;
    const slices = rows.map(function (row, i) {
      const angle = (row.value / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);
      const large = angle > Math.PI ? 1 : 0;
      const color = DONUT_COLORS[i % DONUT_COLORS.length];
      const slice = {
        startAngle,
        endAngle,
        x1,
        y1,
        x2,
        y2,
        ix1,
        iy1,
        ix2,
        iy2,
        large,
        color,
        row,
      };
      startAngle = endAngle;
      return slice;
    });

    slices.forEach(function (s) {
      const d = [
        "M",
        s.x1.toFixed(2),
        s.y1.toFixed(2),
        "A",
        r,
        r,
        0,
        s.large,
        1,
        s.x2.toFixed(2),
        s.y2.toFixed(2),
        "L",
        s.ix2.toFixed(2),
        s.iy2.toFixed(2),
        "A",
        innerR,
        innerR,
        0,
        s.large,
        0,
        s.ix1.toFixed(2),
        s.iy1.toFixed(2),
        "Z",
      ].join(" ");
      // ドーナツの区切り線をダーク背景色に
      html +=
        "<path d='" +
        d +
        "' fill='" +
        s.color +
        "' stroke='#1e293b' stroke-width='1.5'/>";
    });

    // 中央テキスト: ダーク対応
    html +=
      "<text x='" +
      cx +
      "' y='" +
      (cy - 6) +
      "' font-size='9' fill='#94a3b8' text-anchor='middle'>合計</text>";
    html +=
      "<text x='" +
      cx +
      "' y='" +
      (cy + 10) +
      "' font-size='11' font-weight='bold' fill='#f1f5f9' text-anchor='middle'>" +
      Math.round(total / 1000).toLocaleString() +
      "k</text>";
    html +=
      "<text x='" +
      cx +
      "' y='" +
      (cy + 22) +
      "' font-size='8' fill='#94a3b8' text-anchor='middle'>円</text>";

    // 凡例: ダーク対応
    const legendX = 192;
    rows.forEach(function (row, i) {
      const ly = 20 + i * 22;
      const pct = Math.round((row.value / total) * 100);
      const color = DONUT_COLORS[i % DONUT_COLORS.length];
      html +=
        "<rect x='" +
        legendX +
        "' y='" +
        (ly - 8) +
        "' width='10' height='10' rx='2' fill='" +
        color +
        "'/>";
      html +=
        "<text x='" +
        (legendX + 14) +
        "' y='" +
        ly +
        "' font-size='10' fill='#cbd5e1'>" +
        Utils.esc(row.label) +
        "</text>";
      html +=
        "<text x='" +
        (width - 4) +
        "' y='" +
        ly +
        "' font-size='10' fill='#e2e8f0' text-anchor='end'>" +
        pct +
        "%</text>";
    });

    html += "</svg>";
    container.innerHTML = html;
  }

  // ============================================================
  // グラフ描画：執行率プログレスバー
  // ============================================================
  function renderExecutionRate(containerId, budget, executed) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const b = Number(budget || 0);
    const e = Number(executed || 0);
    const rate = b > 0 ? Math.min(100, Math.max(0, (e / b) * 100)) : 0;
    const color = rate >= 90 ? "#ef4444" : rate >= 70 ? "#f59e0b" : "#10b981";

    container.innerHTML =
      "<div style='display:flex; justify-content:space-between; font-size:11px; color:#94a3b8; margin-bottom:4px;'>" +
      "<span>執行済み</span><span style='font-weight:700; font-size:18px; color:" +
      color +
      ";'>" +
      rate.toFixed(1) +
      "%</span>" +
      "</div>" +
      "<div style='background:#334155; border-radius:999px; height:20px; overflow:hidden;'>" +
      "<div style='height:100%; width:" +
      rate.toFixed(1) +
      "%; background:linear-gradient(90deg," +
      color +
      "cc," +
      color +
      "); transition:width 0.6s;'></div>" +
      "</div>" +
      "<p style='margin:8px 0 0; font-size:11px; color:#64748b;'>" +
      e.toLocaleString() +
      " 円 / " +
      b.toLocaleString() +
      " 円</p>";
  }

  // ============================================================
  // グラフ描画：期別執行 vs 計画（2段棒グラフ）
  // ============================================================
  function renderPeriodCompare(containerId, rows) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!rows || !rows.length) {
      container.innerHTML = "<p class='hint'>データがありません。</p>";
      return;
    }
    const max = Math.max.apply(
      null,
      rows.map(function (r) {
        return Math.max(r.executed, r.planned, 1);
      }),
    );
    const width = 420;
    const rowHeight = 48;
    const padLeft = 68;
    const padRight = 16;
    const padTop = 12;
    const totalHeight = padTop + rows.length * rowHeight + 10;

    // 凡例: ダーク対応
    let html =
      "<div style='display:flex; gap:16px; align-items:center; margin-bottom:8px; font-size:11px; color:#94a3b8;'>" +
      "<span><span style='display:inline-block; width:10px; height:10px; border-radius:2px; background:#475569; margin-right:4px;'></span>計画</span>" +
      "<span><span style='display:inline-block; width:10px; height:10px; border-radius:2px; background:#38bdf8; margin-right:4px;'></span>執行</span>" +
      "</div>";
    html +=
      "<svg class='dash-graph-svg' viewBox='0 0 " +
      width +
      " " +
      totalHeight +
      "'>";

    rows.forEach(function (row, idx) {
      const y = padTop + idx * rowHeight;
      const availW = width - padLeft - padRight;
      const plannedW = Math.max(4, availW * (row.planned / max));
      const executedW = Math.max(4, availW * (row.executed / max));

      // 期ラベル: ダーク対応
      html +=
        "<text x='0' y='" +
        (y + 14) +
        "' font-size='10' fill='#94a3b8' font-weight='600'>" +
        Utils.esc(row.label) +
        "</text>";

      // 計画バー
      html +=
        "<rect x='" +
        padLeft +
        "' y='" +
        y +
        "' width='" +
        plannedW.toFixed(1) +
        "' height='14' rx='7' fill='#475569'/>";
      html +=
        "<text x='" +
        (padLeft + plannedW + 6).toFixed(1) +
        "' y='" +
        (y + 11) +
        "' font-size='9' fill='#94a3b8'>計画 " +
        row.planned.toLocaleString() +
        "円</text>";

      // 執行バー
      html +=
        "<rect x='" +
        padLeft +
        "' y='" +
        (y + 20) +
        "' width='" +
        executedW.toFixed(1) +
        "' height='14' rx='7' fill='#38bdf8'/>";
      html +=
        "<text x='" +
        (padLeft + executedW + 6).toFixed(1) +
        "' y='" +
        (y + 31) +
        "' font-size='9' fill='#e2e8f0'>執行 " +
        row.executed.toLocaleString() +
        "円</text>";
    });

    html += "</svg>";
    container.innerHTML = html;
  }

  // ============================================================
  // メイン描画
  // ============================================================
  function render() {
    const data = summarize();
    const yen = function (n) {
      return App.Calc && App.Calc.yen
        ? App.Calc.yen(n)
        : (n || 0).toLocaleString();
    };
    const records =
      App.Record && App.Record.list
        ? App.Record.list()
        : Storage.getRecord() || [];
    const plans =
      App.Plan && App.Plan.list
        ? App.Plan.list()
        : Storage.getPlan() || [];
    const areas =
      App.Master && App.Master.getAreas
        ? App.Master.getAreas()
        : Storage.getAreas
          ? Storage.getAreas()
          : [];
    const acts =
      App.Master && App.Master.getActivities ? App.Master.getActivities() : [];
    const areaMap = {};
    const actMap = {};
    areas.forEach(function (area) {
      areaMap[area.id] = area.name;
    });
    acts.forEach(function (act) {
      actMap[act.code] = act.label;
    });

    renderOnboarding(plans, records);
    renderRetrospective(records, plans);
    renderAchievements(records, plans);

    // 執行率（プログレスバー）
    renderExecutionRate("dash-exec-rate", data.budget, data.executed);

    // 月別執行額は支払日を基準に集計する
    renderBarGraph(
      "dash-monthly-trend",
      "月別執行金額",
      summarizeMonthly(),
      { colorPair: PALETTE[0], unit: "円" },
    );

    // 科目別執行内訳 → ドーナツグラフ
    renderDonutGraph(
      "dash-expense-graph",
      "科目別執行内訳",
      mapEntries(
        data.byExpense,
        {
          jinken: "日当",
          yousen: "傭船料",
          shizai: "資材費",
          kotsu: "交通費",
        },
        8,
      ),
    );

    // 地区別執行額 → 青系横棒グラフ
    renderBarGraph(
      "dash-area-graph",
      "地区別執行額",
      mapEntries(data.byArea, areaMap, 6),
      {
        colorPair: PALETTE[0],
      },
    );

    // 活動項目別執行額 → オレンジ系横棒グラフ
    renderBarGraph(
      "dash-activity-graph",
      "活動項目別執行額",
      mapEntries(data.byActivity, actMap, 6),
      {
        colorPair: PALETTE[1],
      },
    );

    // 活動項目別作業時間 → 紫系横棒グラフ・単位「h」
    renderBarGraph(
      "dash-activity-hours",
      "活動項目別 作業時間",
      mapEntries(summarizeActivityHours(records), actMap, 6),
      {
        colorPair: PALETTE[2],
        unit: "h",
      },
    );

    // 期別執行 vs 計画
    renderPeriodCompare("dash-period-compare", summarizePeriodCompare());

    // ── 予算対比サマリーテーブル ──
    const sumDiv = document.getElementById("dash-budget-summary");
    if (sumDiv) {
      const execRate = data.budget
        ? Math.round((data.executed / data.budget) * 1000) / 10
        : 0;
      sumDiv.innerHTML =
        "<table class='data-table' style='margin-bottom:15px;'>" +
        "<thead><tr><th>採択予算額</th><th>執行済み実績額</th><th>今後の計画見込額</th><th>差し引き残高</th><th>執行率</th></tr></thead>" +
        "<tbody><tr>" +
        "<td><strong>" +
        yen(data.budget) +
        "円</strong></td>" +
        "<td>" +
        yen(data.executed) +
        "円</td>" +
        "<td>" +
        yen(data.forecast) +
        "円</td>" +
        "<td><strong style='color:" +
        (data.remaining < 0 ? "#ef4444" : "#10b981") +
        ";'>" +
        yen(data.remaining) +
        "円</strong></td>" +
        "<td>" +
        execRate +
        "%</td>" +
        "</tr></tbody></table>" +
        "<h4>費目別執行内訳</h4>" +
        "<table class='data-table'>" +
        "<thead><tr><th>①日当</th><th>③傭船料</th><th>④資材費</th><th>⑦交通費</th><th>総計</th></tr></thead>" +
        "<tbody><tr>" +
        "<td>" +
        yen(data.byExpense.jinken) +
        "円</td>" +
        "<td>" +
        yen(data.byExpense.yousen) +
        "円</td>" +
        "<td>" +
        yen(data.byExpense.shizai) +
        "円</td>" +
        "<td>" +
        yen(data.byExpense.kotsu) +
        "円</td>" +
        "<td><strong>" +
        yen(data.executed) +
        "円</strong></td>" +
        "</tr></tbody></table>";
    }

    // ── 計画・実績・支払の充足状況 ──
    const fulDiv = document.getElementById("dash-fulfillment-summary");
    if (
      fulDiv &&
      App.Calc &&
      typeof App.Calc.calcFulfillmentAndUnpaid === "function"
    ) {
      const ful = App.Calc.calcFulfillmentAndUnpaid();
      const planRate =
        ful.plansCount > 0
          ? Math.round((ful.planWithRecordCount / ful.plansCount) * 100)
          : 100;
      const payRate =
        ful.recordsCount > 0
          ? Math.round((ful.paidRecordCount / ful.recordsCount) * 100)
          : 100;
      fulDiv.innerHTML =
        "<table class='data-table'>" +
        "<thead><tr><th>登録計画数</th><th>実績化済み計画</th><th>計画実績率</th><th>登録実績数</th><th>支払完了実績</th><th>未払い残額（計）</th></tr></thead>" +
        "<tbody><tr>" +
        "<td>" +
        ful.plansCount +
        " 件</td>" +
        "<td>" +
        ful.planWithRecordCount +
        " 件</td>" +
        "<td>" +
        planRate +
        "%</td>" +
        "<td>" +
        ful.recordsCount +
        " 件</td>" +
        "<td>" +
        ful.paidRecordCount +
        " 件 (" +
        payRate +
        "%)</td>" +
        "<td><strong style='color:" +
        (ful.totalUnpaid > 0 ? "#ef4444" : "#10b981") +
        ";'>" +
        yen(ful.totalUnpaid) +
        " 円</strong></td>" +
        "</tr></tbody></table>";
    }

    // ── 警告アラート ──
    const alertDiv = document.getElementById("dash-alerts");
    if (alertDiv) {
      const items = [];
      if (data.alerts.shortageItems.length > 0)
        items.push(
          "<div class='chk warn'>⚠️ 不足している消耗品が " +
            data.alerts.shortageItems.length +
            " 件あります。</div>",
        );
      if (data.alerts.noRecordPlans.length > 0)
        items.push(
          "<div class='chk warn'>⚠️ 実績未入力の過去計画が " +
            data.alerts.noRecordPlans.length +
            " 件あります。</div>",
        );
      if (data.alerts.unpaidRecords.length > 0)
        items.push(
          "<div class='chk warn'>⚠️ 未支払いの実績記録が " +
            data.alerts.unpaidRecords.length +
            " 件あります。</div>",
        );
      alertDiv.innerHTML =
        items.length === 0
          ? "<div class='chk ok'>✓ 現在、未処理のアラートはありません。</div>"
          : items.join("");
    }
  }

  return { summarize: summarize, render: render };
})();
