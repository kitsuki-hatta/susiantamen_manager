/* =====================================================================
   record.js ― 実績記録モジュール（計画ベース一覧・月別表示）
   ===================================================================== */

window.App = window.App || {};

App.Record = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;

  // ================================================================
  // ---- 作業実績 CRUD ----
  // ================================================================

  function list() {
    return (Storage.getRecord() || []).map(normalize);
  }
  function get(id) {
    return (
      list().find(function (r) {
        return String(r.id) === String(id);
      }) || null
    );
  }

  function upsert(row) {
    const rows = list();
    const n = normalize(row);
    validate(n);
    const i = rows.findIndex(function (x) {
      return String(x.id) === String(n.id);
    });
    if (i >= 0) rows[i] = n;
    else rows.push(n);
    Storage.setRecord(rows);
    syncInventoryByRecord(n);
    return n;
  }

  function remove(id) {
    const target = get(id);
    Storage.setRecord(
      list().filter(function (r) {
        return String(r.id) !== String(id);
      }),
    );
    if (target && App.Inventory && App.Inventory.replaceOutLogsForRecord) {
      App.Inventory.replaceOutLogsForRecord(target.id, target.date, []);
    }
  }

  function monthly(year, month) {
    const prefix = year + "-" + Utils.pad2(month);
    return list().filter(function (r) {
      return String(r.date || "").indexOf(prefix) === 0;
    });
  }

  // ================================================================
  // ---- 費用計算 ----
  // ================================================================

  function calcRecordCost(row) {
    const rec = normalize(row);
    const m = Storage.getMaster(),
      s = Storage.getSettings();
    const people = +rec.people || 0,
      boat = +rec.boat || 0,
      car = +rec.car || 0;
    let jinken =
      s.wageMode === "hourly"
        ? people * rec.workHours * (+m.wageHourly || 0)
        : people * (+m.wageDaily || 0);
    jinken += calcSpecialPayDelta(rec, s, m);
    const yousen = boat * (+m.yousen || 0);
    const kotsu = car * (+m.sharyo || 0);
    return {
      jinken: jinken,
      yousen: yousen,
      kotsu: kotsu,
      total: jinken + yousen + kotsu,
    };
  }

  function calcSpecialPayDelta(rec, s, m) {
    if (!rec.specialPay) return 0;
    const unit = +rec.specialPay.unit || 0,
      members = rec.specialPay.members || [];
    if (!members.length || unit <= 0) return 0;
    const base =
      rec.specialPay.mode === "hourly" ? +m.wageHourly || 0 : +m.wageDaily || 0;
    if (rec.specialPay.mode !== s.wageMode) return 0;
    return (unit - base) * members.length;
  }

  function getMemberPayMap(row) {
    const rec = normalize(row);
    const m = Storage.getMaster(),
      s = Storage.getSettings();
    const map = {};
    const base =
      s.wageMode === "hourly" ? +m.wageHourly || 0 : +m.wageDaily || 0;
    (rec.members || []).forEach(function (name) {
      map[name] = base;
    });
    if (rec.specialPay && rec.specialPay.mode === s.wageMode) {
      const u = +rec.specialPay.unit || 0;
      (rec.specialPay.members || []).forEach(function (name) {
        map[name] = u;
      });
    }
    return map;
  }

  // ================================================================
  // ---- 作業実績 項目候補（datalist用） ----
  // ================================================================

  /**
   * 過去の実績から workResults の item・unit を収集し、
   * 使用頻度順で返す
   * @returns {Array<{item:string, units:string[]}>}
   */
  function getWorkItemSuggestions() {
    const itemMap = {}; // { 項目名: { unitCount:{単位:回数}, total:回数 } }

    list().forEach(function (rec) {
      (rec.workResults || []).forEach(function (wr) {
        const key = (wr.item || "").trim();
        if (!key) return;
        if (!itemMap[key]) itemMap[key] = { unitCount: {}, total: 0 };
        itemMap[key].total++;
        const unit = (wr.unit || "").trim();
        if (unit) {
          itemMap[key].unitCount[unit] =
            (itemMap[key].unitCount[unit] || 0) + 1;
        }
      });
    });

    // 使用頻度の高い順にソート
    return Object.entries(itemMap)
      .sort(function (a, b) {
        return b[1].total - a[1].total;
      })
      .map(function (entry) {
        const name = entry[0];
        const info = entry[1];
        // 単位も使用頻度順
        const units = Object.entries(info.unitCount)
          .sort(function (a, b) {
            return b[1] - a[1];
          })
          .map(function (u) {
            return u[0];
          });
        return { item: name, units: units };
      });
  }

  /**
   * body に共有 datalist（項目名用）を生成・更新する
   * id: "datalist-work-items"
   */
  function bindWorkResultEvents(container) {
    const suggestions = container._suggestions || [];

    container.querySelectorAll(".work-result-row").forEach(function (row) {
      // ---- 削除ボタン（重複バインド防止） ----
      const removeBtn = row.querySelector(".wr-remove");
      if (removeBtn && !removeBtn.dataset.bound) {
        removeBtn.dataset.bound = "1";
        removeBtn.onclick = function () {
          row.remove();
        };
      }

      // ---- 項目名変更 → 単位候補更新 & 自動補完（重複バインド防止） ----
      const titleInput = row.querySelector(".wr-title");
      if (titleInput && !titleInput.dataset.bound) {
        titleInput.dataset.bound = "1";
        titleInput.addEventListener("input", function () {
          _refreshUnitSuggestions(row, titleInput.value, suggestions);
        });
        titleInput.addEventListener("change", function () {
          _refreshUnitSuggestions(row, titleInput.value, suggestions);
        });
      }
    });
  }

  // ================================================================
  // ---- normalize / validate ----
  // ================================================================

  function normalize(row) {
    const s = Storage.getSettings();
    const start = String((row && row.start) || "").trim();
    const end = String((row && row.end) || "").trim();
    const wh =
      +row.workHours > 0
        ? +row.workHours
        : Utils.calcHourDiff(start, end, s.defaultHours);
    const participants = normArr(row && (row.participants || row.members));
    const vesselProviders = normArr(
      row && (row.vesselProviders || row.boatOwners),
    );
    const vehicleProviders = normArr(
      row && (row.vehicleProviders || row.carOwners),
    );
    const volunteerCount = resolveVolunteerCount(row, participants);
    const legacyBoatCount = vesselProviders.length
      ? 0
      : Math.max(
          0,
          +((row && row.legacyBoatCount) != null
            ? row.legacyBoatCount
            : row && row.boat) || 0,
        );
    const legacyCarCount = vehicleProviders.length
      ? 0
      : Math.max(
          0,
          +((row && row.legacyCarCount) != null
            ? row.legacyCarCount
            : row && row.car) || 0,
        );
    return {
      id: String((row && row.id) || "").trim() || Utils.makeId("record"),
      planId: row && row.planId ? String(row.planId) : null,
      date: String((row && row.date) || "").trim(),
      areaId: String((row && row.areaId) || "").trim(),
      activityCode: String((row && row.activityCode) || "").trim(),
      content: String((row && row.content) || "").trim(),
      participants: participants,
      vesselProviders: vesselProviders,
      vehicleProviders: vehicleProviders,
      volunteerCount: volunteerCount,
      legacyBoatCount: legacyBoatCount,
      legacyCarCount: legacyCarCount,
      members: participants.slice(),
      people: participants.length + volunteerCount,
      volunteer: volunteerCount,
      boatOwners: vesselProviders.slice(),
      carOwners: vehicleProviders.slice(),
      boat: vesselProviders.length || legacyBoatCount,
      car: vehicleProviders.length || legacyCarCount,
      usedItems: Array.isArray(row && row.usedItems) ? row.usedItems : [],
      diving: normDiving(row && row.diving),
      weather: String((row && row.weather) || "").trim(),
      tideLevel: row && row.tideLevel != null ? Number(row.tideLevel) : null,
      tideNote: String((row && row.tideNote) || "").trim(),
      note: String((row && row.note) || "").trim(),
      start: start,
      end: end,
      workHours: wh,
      receiptNo: String((row && row.receiptNo) || "").trim(),
      specialPay: normSpecialPay(row && row.specialPay),
      workTitle: String((row && row.workTitle) || "").trim(),
      workResults: Array.isArray(row && row.workResults) ? row.workResults : [],
    };
  }

  function normArr(v) {
    return (v || [])
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean);
  }
  function resolveVolunteerCount(row, participants) {
    if (row && row.volunteerCount != null)
      return Math.max(0, +row.volunteerCount || 0);
    if (row && row.volunteer != null) return Math.max(0, +row.volunteer || 0);
    if (participants && participants.length) return 0;
    return Math.max(0, +((row && row.people) || 0));
  }
  function normDiving(v) {
    return v === "yes" || v === "あり"
      ? "yes"
      : v === "no" || v === "なし"
        ? "no"
        : "";
  }
  function normSpecialPay(v) {
    if (!v || typeof v !== "object") return null;
    const u = +v.unit || 0,
      m = normArr(v.members);
    if (u <= 0 || !m.length) return null;
    return {
      mode: v.mode === "hourly" ? "hourly" : "daily",
      unit: u,
      members: m,
    };
  }

  function validate(row) {
    if (!row.date) throw new Error("日付は必須です");
    if (!row.areaId) throw new Error("地区は必須です");
    if (!row.activityCode) throw new Error("活動項目は必須です");
    if (!row.diving) throw new Error("潜水作業の有無を選択してください");
  }

  function syncInventoryByRecord(record) {
    if (App.Inventory && App.Inventory.replaceOutLogsForRecord)
      App.Inventory.replaceOutLogsForRecord(
        record.id,
        record.date,
        record.usedItems || [],
      );
  }

  // ================================================================
  // ---- 月選択セレクト構築 ----
  // ================================================================

  /**
   * 作業計画が存在する年月の一覧を返す（重複なし・降順）
   */
  function getPlanMonths() {
    const plans = App.Plan ? App.Plan.list() : [];
    const set = {};

    // 作業計画の年月を収集
    plans.forEach(function (p) {
      const d = String(p.date || "");
      if (d.length >= 7) set[d.slice(0, 7)] = true;
    });

    // 計画外作業実績の年月を収集
    list()
      .filter(function (r) {
        return !r.planId;
      })
      .forEach(function (r) {
        const d = String(r.date || "");
        if (d.length >= 7) set[d.slice(0, 7)] = true;
      });

    // 物品購入ログの年月を収集
    const logs =
      App.Inventory && App.Inventory.purchaseRows
        ? App.Inventory.purchaseRows()
        : [];
    logs.forEach(function (log) {
      const d = String(log.date || "");
      if (d.length >= 7) set[d.slice(0, 7)] = true;
    });

    // 新しい月順にソートして返す
    return Object.keys(set).sort().reverse();
  }

  function buildMonthSelect() {
    const sel = document.getElementById("record-month-select");
    if (!sel) return;

    const months = getPlanMonths();
    const today = new Date();
    const currentYM =
      today.getFullYear() + "-" + Utils.pad2(today.getMonth() + 1);

    // 当月が計画にない場合も選択肢に追加
    if (!months.includes(currentYM)) months.push(currentYM);

    // 時系列順（古い→新しい）に並べ替え
    months.sort();

    const prev = sel.value;
    sel.innerHTML = months
      .map(function (ym) {
        const parts = ym.split("-");
        const label = parts[0] + "年" + parseInt(parts[1], 10) + "月";
        return "<option value='" + ym + "'>" + label + "</option>";
      })
      .join("");

    // 前回選択を復元 or 当月にフォールバック
    sel.value = months.includes(prev)
      ? prev
      : months.includes(currentYM)
        ? currentYM
        : months[months.length - 1] || currentYM;
  }

  // ================================================================
  // ---- メイン一覧レンダリング ----
  // ================================================================

  function render() {
    buildMonthSelect();
    renderRecordList();
    renderReceiptList();
    bindModals();
    _bindSubTabs();

    // 月選択変更
    const sel = document.getElementById("record-month-select");
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = "1";
      sel.addEventListener("change", renderRecordList);
    }

    // 前月ボタン
    const btnPrev = document.getElementById("btn-month-prev");
    if (btnPrev && !btnPrev.dataset.bound) {
      btnPrev.dataset.bound = "1";
      btnPrev.addEventListener("click", function () {
        const sel = document.getElementById("record-month-select");
        if (!sel || sel.selectedIndex <= 0) return;
        sel.selectedIndex -= 1;
        renderRecordList();
      });
    }

    // 翌月ボタン
    const btnNext = document.getElementById("btn-month-next");
    if (btnNext && !btnNext.dataset.bound) {
      btnNext.dataset.bound = "1";
      btnNext.addEventListener("click", function () {
        const sel = document.getElementById("record-month-select");
        if (!sel || sel.selectedIndex >= sel.options.length - 1) return;
        sel.selectedIndex += 1;
        renderRecordList();
      });
    }
  }

  // ================================================================
  // ---- サブタブ制御 ----
  // ================================================================

  function _bindSubTabs() {
    const tabList = document.getElementById("rec-subtab-list");
    const tabReceipt = document.getElementById("rec-subtab-receipt");
    const panelList = document.getElementById("rec-panel-list");
    const panelReceipt = document.getElementById("rec-panel-receipt");
    if (!tabList || !tabReceipt) return;
    if (tabList.dataset.bound) return;
    tabList.dataset.bound = "1";

    function activateTab(tab) {
      if (tab === "list") {
        tabList.style.borderBottomColor = "#8b5cf6";
        tabList.style.color = "#f1f5f9";
        tabList.style.fontWeight = "700";
        tabReceipt.style.borderBottomColor = "transparent";
        tabReceipt.style.color = "#94a3b8";
        tabReceipt.style.fontWeight = "600";
        panelList.style.display = "";
        panelReceipt.style.display = "none";
      } else {
        tabReceipt.style.borderBottomColor = "#8b5cf6";
        tabReceipt.style.color = "#f1f5f9";
        tabReceipt.style.fontWeight = "700";
        tabList.style.borderBottomColor = "transparent";
        tabList.style.color = "#94a3b8";
        tabList.style.fontWeight = "600";
        panelList.style.display = "none";
        panelReceipt.style.display = "";
        renderReceiptList();
      }
    }

    tabList.addEventListener("click", function () {
      activateTab("list");
    });
    tabReceipt.addEventListener("click", function () {
      activateTab("receipt");
    });
  }

  // ================================================================
  // ---- 領収書一覧レンダリング ----
  // ================================================================

  function renderReceiptList() {
    const container = document.getElementById("receipt-list");
    if (!container) return;

    const allExpenses = App.Budget ? App.Budget.listBudgetExpense() : [];
    const allRecords = App.Record ? App.Record.list() : [];
    const allLogs =
      App.Inventory && App.Inventory.purchaseRows
        ? App.Inventory.purchaseRows()
        : [];

    const searchVal = document.getElementById("receipt-search")
      ? document.getElementById("receipt-search").value.trim().toLowerCase()
      : "";

    const groups = {};
    allExpenses.forEach(function (exp) {
      const key = exp.slipNo
        ? String(exp.slipNo).trim()
        : exp.receiptNo
          ? String(exp.receiptNo).trim()
          : "__no_slip__" + exp.id;

      if (!groups[key]) groups[key] = [];
      groups[key].push(exp);
    });

    const sortedKeys = Object.keys(groups).sort(function (a, b) {
      const dateA = groups[a][0].date || "";
      const dateB = groups[b][0].date || "";
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });

    const filteredKeys = sortedKeys.filter(function (key) {
      if (!searchVal) return true;
      const exps = groups[key];
      return exps.some(function (exp) {
        return (
          (exp.slipNo || "").toLowerCase().includes(searchVal) ||
          (exp.receiptNo || "").toLowerCase().includes(searchVal) ||
          (exp.payer || "").toLowerCase().includes(searchVal)
        );
      });
    });

    if (!filteredKeys.length) {
      container.innerHTML =
        "<p class='hint' style='margin-top:16px;'>該当する領収書がありません。</p>";
      return;
    }

    function buildLinkLabel(exp) {
      const labels = [];

      (exp.recordIds || []).forEach(function (rid) {
        const rec = allRecords.find(function (r) {
          return String(r.id) === String(rid);
        });
        labels.push("作業 " + (rec ? rec.date || rec.workDate || "" : rid));
      });

      (exp.inventoryLogIds || []).forEach(function (lid) {
        const log = allLogs.find(function (l) {
          return String(l.id) === String(lid);
        });
        labels.push("物品 " + (log ? log.date || "" : lid));
      });

      return labels.length ? labels.join("　／　") : "―";
    }

    let html =
      "<table class='data-table' style='width:100%; font-size:13px;'>" +
      "<thead><tr>" +
      "<th style='width:140px;'>領収書番号</th>" +
      "<th style='width:100px;'>支払日</th>" +
      "<th style='text-align:right; width:110px;'>金額</th>" +
      "<th>支払者</th>" +
      "<th>紐付き内容</th>" +
      "<th style='width:90px;'>操作</th>" +
      "</tr></thead><tbody>";

    filteredKeys.forEach(function (key) {
      const exps = groups[key];
      const hasSlip = !key.startsWith("__no_slip__");

      const totalAmount = exps.reduce(function (s, e) {
        return s + (+e.amount || 0);
      }, 0);
      const displayDate = exps[0].date || "";
      const displayPayer = exps[0].payer || "";
      const slipLabel = hasSlip
        ? Utils.esc(key)
        : "<span style='color:#64748b;'>―</span>";

      const linkLabel = exps.map(buildLinkLabel).join("　／　");

      html +=
        "<tr>" +
        "<td style='font-weight:700; color:#a78bfa;'>" +
        slipLabel +
        "</td>" +
        "<td>" +
        Utils.esc(displayDate) +
        "</td>" +
        "<td style='text-align:right; color:#4ade80; font-weight:700;'>" +
        totalAmount.toLocaleString() +
        "円</td>" +
        "<td>" +
        Utils.esc(displayPayer) +
        "</td>" +
        "<td style='font-size:12px; color:#94a3b8;'>" +
        Utils.esc(linkLabel) +
        "</td>" +
        "<td style='white-space:nowrap;'>";

      if (exps.length === 1) {
        html +=
          "<button class='btn-edit btn-sm' data-edit-receipt='" +
          exps[0].id +
          "'>✏️</button> " +
          "<button class='btn-del btn-sm' data-del-receipt='" +
          exps[0].id +
          "'>🗑️</button>";
      } else {
        html +=
          "<button class='btn-secondary btn-sm' data-detail-receipt='" +
          Utils.esc(key) +
          "'>📋 詳細</button>";
      }

      html += "</td></tr>";
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    container.querySelectorAll("[data-edit-receipt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const expId = btn.dataset.editReceipt;
        const exp = allExpenses.find(function (e) {
          return String(e.id) === String(expId);
        });
        if (!exp) return;
        if ((exp.inventoryLogIds || []).length > 0) {
          openInventoryExpenseModal(expId);
        } else {
          openExpenseModal(expId);
        }
      });
    });

    container.querySelectorAll("[data-del-receipt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("この支払い履歴を削除しますか？")) return;
        App.Budget.removeBudgetExpense(btn.dataset.delReceipt);
        renderReceiptList();
        renderRecordList();
      });
    });

    container.querySelectorAll("[data-detail-receipt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const slipNo = btn.dataset.detailReceipt;
        const targetExps = groups[slipNo];
        if (!targetExps) return;
        alert(
          "【" +
            slipNo +
            "】\n\n" +
            targetExps
              .map(function (e) {
                return (
                  e.date +
                  "　" +
                  (+e.amount || 0).toLocaleString() +
                  "円　" +
                  (e.payer || "") +
                  "\n" +
                  buildLinkLabel(e)
                );
              })
              .join("\n\n"),
        );
      });
    });

    const searchEl = document.getElementById("receipt-search");
    if (searchEl && !searchEl.dataset.bound) {
      searchEl.dataset.bound = "1";
      searchEl.addEventListener("input", renderReceiptList);
    }
  }

  function renderRecordList() {
    const el = document.getElementById("record-list");
    if (!el) return;

    const sel = document.getElementById("record-month-select");
    const ym = sel ? sel.value : "";
    if (!ym) {
      el.innerHTML = "<p class='hint'>月を選択してください。</p>";
      return;
    }

    // ---- データ収集 ----
    const plans = (App.Plan ? App.Plan.list() : [])
      .filter(function (p) {
        return String(p.date || "").indexOf(ym) === 0;
      })
      .sort(function (a, b) {
        return (
          String(a.date).localeCompare(String(b.date)) ||
          String(a.start || "").localeCompare(String(b.start || ""))
        );
      });

    const allRecords = list();
    const allExpenses = App.Budget ? App.Budget.listBudgetExpense() : [];

    // 計画外実績（同月・planId なし）
    const unplannedRecs = allRecords.filter(function (r) {
      return !r.planId && String(r.date || "").indexOf(ym) === 0;
    });

    const areas = Storage.getAreas ? Storage.getAreas() : [];
    const acts = App.Master ? App.Master.getActivities() : [];
    const areaMap = {},
      actMap = {};
    areas.forEach(function (a) {
      areaMap[a.id] = a.name;
    });
    acts.forEach(function (a) {
      actMap[a.code] = a.label;
    });

    const yen = function (n) {
      return (n || 0).toLocaleString();
    };

    // ---- 実績IDごとの支払い状況を集計（按分対応） ----
    // paidAmountMap で按分済み金額を取得
    const costResolver = function (r) {
      return calcRecordCost(r).total;
    };
    const paidAmountByRecId = App.Budget
      ? App.Budget.paidAmountMap(allRecords, costResolver)
      : {};

    // 支払い件数・明細は別途カウント
    // { "recId": { total: 按分済合計, count: 支払件数, expenses: [...] } }
    const paidSummaryMap = {};

    // 按分済み金額をセット
    Object.keys(paidAmountByRecId).forEach(function (rid) {
      paidSummaryMap[rid] = {
        total: paidAmountByRecId[rid],
        count: 0,
        expenses: [],
      };
    });

    // 件数・明細を追加
    allExpenses.forEach(function (exp) {
      (exp.recordIds || []).forEach(function (rid) {
        const key = String(rid);
        if (!paidSummaryMap[key]) {
          paidSummaryMap[key] = { total: 0, count: 0, expenses: [] };
        }
        paidSummaryMap[key].count += 1;
        paidSummaryMap[key].expenses.push(exp);
      });
    });

    // ---- 行データ構築 ----
    const rows = [];

    plans.forEach(function (plan) {
      const rec =
        allRecords.find(function (r) {
          return String(r.planId) === String(plan.id);
        }) || null;
      rows.push({ type: "plan", plan: plan, rec: rec, date: plan.date });
    });

    unplannedRecs.forEach(function (rec) {
      rows.push({ type: "unplanned", plan: null, rec: rec, date: rec.date });
    });

    // ★ 入庫ログ（購入履歴）を追加
    const invLogs = (
      App.Inventory && App.Inventory.purchaseRows
        ? App.Inventory.purchaseRows()
        : []
    ).filter(function (log) {
      return log.type === "in" && String(log.date || "").indexOf(ym) === 0;
    });

    invLogs.forEach(function (log) {
      rows.push({
        type: "invlog",
        plan: null,
        rec: null,
        log: log,
        date: log.date,
      });
    });

    // ★ 日付順にソート
    rows.sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    });

    if (!rows.length) {
      el.innerHTML =
        "<div class='guide-empty'><strong>この月の作業計画・実績はまだありません。</strong>" +
        "<span>予定が決まっている場合は作業計画を登録し、計画外の活動は実績から直接入力できます。</span>" +
        "<div><button type='button' class='btn-outline btn-sm' data-guide-view='plan'>作業計画を見る</button>" +
        "<button type='button' class='btn-primary btn-sm' data-guide-trigger='btn-open-rec-modal'>実績を入力</button></div></div>";
      return;
    }

    // ---- テーブル構築 ----
    let html =
      "<table class='data-table record-unified-table'>" +
      "<thead><tr>" +
      "<th>日付</th>" +
      "<th>地区</th>" +
      "<th>活動項目</th>" +
      "<th>計画人数</th>" +
      "<th class='col-rec-status'>作業実績</th>" +
      "<th class='col-pay-status'>支払実績</th>" +
      "<th>操作</th>" +
      "</tr></thead><tbody>";

    // ---- 入庫ログの支払い状況マップを構築（按分対応） ----
    const allInvLogs =
      App.Inventory && App.Inventory.purchaseRows
        ? App.Inventory.purchaseRows()
        : [];

    const paidInvMap = {}; // { "logId": { total: 按分済金額, count: 件数 } }
    allExpenses.forEach(function (exp) {
      const ids = (exp.inventoryLogIds || []).map(String);
      if (!ids.length) return;

      const expAmount = +exp.amount || 0;

      if (ids.length === 1) {
        // 1件のみ：全額加算
        const key = ids[0];
        if (!paidInvMap[key]) paidInvMap[key] = { total: 0, count: 0 };
        paidInvMap[key].total += expAmount;
        paidInvMap[key].count += 1;
        return;
      }

      // 複数紐付き：totalCost比で按分
      const weights = ids.map(function (lid) {
        const targetLog = allInvLogs.find(function (l) {
          return String(l.id) === lid;
        });
        return targetLog ? +targetLog.totalCost || 0 : 0;
      });
      const totalWeight = weights.reduce(function (s, w) {
        return s + w;
      }, 0);

      ids.forEach(function (lid, i) {
        const share =
          totalWeight > 0
            ? (expAmount * weights[i]) / totalWeight
            : expAmount / ids.length;
        if (!paidInvMap[lid]) paidInvMap[lid] = { total: 0, count: 0 };
        paidInvMap[lid].total += share;
        paidInvMap[lid].count += 1;
      });
    });

    rows.forEach(function (row) {
      const plan = row.plan;
      const rec = row.rec;
      const isUnplanned = row.type === "unplanned";

      // ★ 入庫ログ行の描画
      if (row.type === "invlog") {
        const log = row.log;
        const logCost = +log.totalCost || 0;
        const ps = paidInvMap[String(log.id)];
        const paidTotal = ps ? ps.total : 0;
        const paidCount = ps ? ps.count : 0;
        const shortage = logCost - paidTotal;

        let invPayStatus = "none";
        if (paidTotal === 0) invPayStatus = "none";
        else if (shortage > 0) invPayStatus = "partial";
        else if (shortage === 0) invPayStatus = "full";
        else invPayStatus = "over";

        // 支払セル
        let invPayCell = "";
        if (invPayStatus === "none") {
          invPayCell =
            "<span class='status-badge status-pending'>🔴 未入力</span>";
        } else if (invPayStatus === "partial") {
          invPayCell =
            "<span class='status-badge' style='background:#f59e0b22; color:#fbbf24;" +
            " border:1px solid #92400e;'>⚡ 一部支払済</span>" +
            "<br><small style='color:#fbbf24;'>支払済: " +
            yen(paidTotal) +
            "円</small>" +
            "<br><small style='color:#f87171;'>残額: " +
            yen(shortage) +
            "円</small>";
        } else if (invPayStatus === "full") {
          invPayCell =
            "<span class='status-badge status-done'>✅ 支払完了</span>" +
            "<br><small style='color:#94a3b8;'>" +
            yen(paidTotal) +
            "円</small>" +
            (paidCount > 1
              ? "<br><small style='color:#64748b;'>(" +
                paidCount +
                "回払い)</small>"
              : "");
        } else {
          invPayCell =
            "<span class='status-badge' style='background:#ef444422; color:#f87171;" +
            " border:1px solid #7f1d1d;'>⚠️ 過払い</span>" +
            "<br><small style='color:#f87171;'>+" +
            yen(Math.abs(shortage)) +
            "円</small>";
        }

        // 操作ボタン
        let invOpBtns = "";
        if (invPayStatus === "none") {
          invOpBtns =
            "<button class='btn-primary btn-sm' data-open-inv-exp='" +
            log.id +
            "'>💵 支払入力</button>";
        } else if (invPayStatus === "partial") {
          const nextCount = paidCount + 1;
          invOpBtns =
            "<button class='btn-primary btn-sm' style='background:#f59e0b;'" +
            " data-open-inv-exp='" +
            log.id +
            "'>" +
            "💵 支払入力(" +
            nextCount +
            "回目)</button>";
        } else {
          invOpBtns =
            "<button class='btn-edit btn-sm' data-show-inv-pay-history='" +
            log.id +
            "'>✏️ 支払履歴(" +
            paidCount +
            "件)</button>";
        }

        const rowClass =
          invPayStatus === "none"
            ? "row-pay-pending"
            : invPayStatus === "partial"
              ? "row-pay-partial"
              : invPayStatus === "over"
                ? "row-pay-over"
                : "row-done";

        html +=
          "<tr class='" +
          rowClass +
          "'>" +
          "<td>" +
          Utils.esc(log.date || "") +
          "<span class='cal-badge' style='font-size:10px; background:#8b5cf6;" +
          " color:#fff; margin-left:4px;'>物品</span></td>" +
          "<td colspan='3' style='color:#c4b5fd;'>🛒 " +
          Utils.esc(log.itemName || "") +
          " × " +
          (log.qty || 0) +
          " (" +
          yen(log.unitPrice) +
          "円/個)</td>" +
          "<td class='col-rec-status'><span style='color:#cbd5e1;'>─</span></td>" +
          "<td class='col-pay-status'>" +
          invPayCell +
          "</td>" +
          "<td class='op-col'>" +
          invOpBtns +
          "</td>" +
          "</tr>";
        return; // 以降の作業実績処理をスキップ
      }

      const date = plan ? plan.date : rec.date;
      const areaId = plan ? plan.areaId : rec.areaId;
      const actCode = plan ? plan.activityCode : rec.activityCode;
      const planPeople = plan ? plan.people || 0 : "─";

      const dateDisp = Utils.esc(date || "");
      const areaDisp = Utils.esc(areaMap[areaId] || areaId || "");
      const actDisp = Utils.esc(actMap[actCode] || actCode || "");

      // ---- 実績コスト・支払い状況を計算 ----
      let recCost = 0;
      let paidTotal = 0;
      let paidCount = 0;
      let shortage = 0;
      let payStatus = "none"; // "none" | "partial" | "full" | "over"

      if (rec) {
        recCost = calcRecordCost(rec).total;
        const ps = paidSummaryMap[String(rec.id)];
        if (ps) {
          paidTotal = ps.total;
          paidCount = ps.count;
        }
        shortage = recCost - paidTotal;
        if (paidTotal === 0) payStatus = "none";
        else if (shortage > 0) payStatus = "partial";
        else if (shortage === 0) payStatus = "full";
        else payStatus = "over"; // 過払い
      }

      // ---- 作業実績セル ----
      let recCell = "";
      if (rec) {
        recCell =
          "<span class='status-badge status-done'>✅ 入力済</span>" +
          "<br><small style='color:#94a3b8;'>" +
          rec.people +
          "人 / " +
          yen(recCost) +
          "円</small>";
      } else {
        recCell = "<span class='status-badge status-pending'>🔴 未入力</span>";
      }

      // ---- 支払実績セル ----
      let payCell = "";
      if (!rec) {
        payCell = "<span style='color:#cbd5e1;'>─</span>";
      } else if (payStatus === "none") {
        payCell = "<span class='status-badge status-pending'>🔴 未入力</span>";
      } else if (payStatus === "partial") {
        // 分割払い中：支払済額・残額を表示
        payCell =
          "<span class='status-badge' style='background:#f59e0b22; color:#fbbf24;" +
          " border:1px solid #92400e;'>⚡ 一部支払済</span>" +
          "<br><small style='color:#fbbf24;'>支払済: " +
          yen(paidTotal) +
          "円</small>" +
          "<br><small style='color:#f87171;'>残額: " +
          yen(shortage) +
          "円</small>";
      } else if (payStatus === "full") {
        payCell =
          "<span class='status-badge status-done'>✅ 支払完了</span>" +
          "<br><small style='color:#94a3b8;'>" +
          yen(paidTotal) +
          "円</small>" +
          (paidCount > 1
            ? "<br><small style='color:#64748b;'>(" +
              paidCount +
              "回払い)</small>"
            : "");
      } else {
        // 過払い
        payCell =
          "<span class='status-badge' style='background:#ef444422; color:#f87171;" +
          " border:1px solid #7f1d1d;'>⚠️ 過払い</span>" +
          "<br><small style='color:#f87171;'>+" +
          yen(Math.abs(shortage)) +
          "円</small>";
      }

      // ---- 操作ボタン ----
      let opBtns = "";

      if (!rec) {
        // 実績未入力
        const planId = plan ? plan.id : "";
        opBtns =
          "<button class='btn-primary btn-sm' data-open-rec-plan='" +
          planId +
          "'>📝 実績入力</button>";
      } else {
        // 実績編集ボタン
        opBtns =
          "<button class='btn-edit btn-sm' data-edit-rec='" +
          rec.id +
          "'>✏️ 実績編集</button> ";

        if (payStatus === "none") {
          // 支払い未入力
          opBtns +=
            "<button class='btn-primary btn-sm' data-open-exp-rec='" +
            rec.id +
            "'>💵 支払入力</button> ";
        } else if (payStatus === "partial") {
          // 分割払い：追加支払いボタン（何回目か表示）
          const nextCount = paidCount + 1;
          opBtns +=
            "<button class='btn-primary btn-sm' style='background:#f59e0b;'" +
            " data-open-exp-rec='" +
            rec.id +
            "'>" +
            "💵 支払入力(" +
            nextCount +
            "回目)</button> ";
        } else {
          // 支払完了・過払い：支払履歴ボタン
          opBtns +=
            "<button class='btn-edit btn-sm' data-show-pay-history='" +
            rec.id +
            "'>✏️ 支払履歴(" +
            paidCount +
            "件)</button> ";
        }
        // 削除ボタン
        opBtns +=
          "<button class='btn-del btn-sm' data-del-rec='" +
          rec.id +
          "'>削除</button>";
      }

      // ---- 行クラス ----
      const rowClass = !rec
        ? "row-pending"
        : payStatus === "none"
          ? "row-pay-pending"
          : payStatus === "partial"
            ? "row-pay-partial"
            : payStatus === "over"
              ? "row-pay-over"
              : "row-done";

      // 計画外バッジ
      const unplannedBadge = isUnplanned
        ? "<span class='cal-badge' style='font-size:10px; background:#f59e0b;" +
          " color:#fff; margin-left:4px;'>計画外</span>"
        : "";

      html +=
        "<tr class='" +
        rowClass +
        "'>" +
        "<td>" +
        dateDisp +
        unplannedBadge +
        "</td>" +
        "<td>" +
        areaDisp +
        "</td>" +
        "<td>" +
        actDisp +
        "</td>" +
        "<td style='text-align:center;'>" +
        planPeople +
        (plan ? "人" : "") +
        "</td>" +
        "<td class='col-rec-status'>" +
        recCell +
        "</td>" +
        "<td class='col-pay-status'>" +
        payCell +
        "</td>" +
        "<td class='op-col'>" +
        opBtns +
        "</td>" +
        "</tr>";
    });

    html += "</tbody></table>";
    el.innerHTML = html;

    // ---- イベントバインド ----

    el.querySelectorAll("[data-open-rec-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openRecModal(null, btn.dataset.openRecPlan || null);
      });
    });

    el.querySelectorAll("[data-edit-rec]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openRecModal(btn.dataset.editRec);
      });
    });

    el.querySelectorAll("[data-open-exp-rec]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openExpenseModal(null, btn.dataset.openExpRec);
      });
    });

    el.querySelectorAll("[data-edit-exp]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openExpenseModal(btn.dataset.editExp);
      });
    });

    el.querySelectorAll("[data-del-rec]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (
          confirm(
            "この実績記録を削除しますか？\n紐付く在庫出庫ログも削除されます。",
          )
        ) {
          remove(btn.dataset.delRec);
          renderRecordList();
        }
      });
    });

    // 支払履歴モーダルを開く
    el.querySelectorAll("[data-show-pay-history]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPayHistoryModal(btn.dataset.showPayHistory);
      });
    });

    // ★ 物品購入ログの支払い入力
    el.querySelectorAll("[data-open-inv-exp]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openInventoryExpenseModal(null, btn.dataset.openInvExp);
      });
    });

    // ★ 物品購入ログの支払い履歴
    el.querySelectorAll("[data-show-inv-pay-history]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openInvPayHistoryModal(btn.dataset.showInvPayHistory);
      });
    });
  }

  // ================================================================
  // ---- セレクト構築ヘルパー ----
  // ================================================================

  function buildSelects() {
    const areas = Storage.getAreas ? Storage.getAreas() : [];
    const acts = App.Master ? App.Master.getActivities() : [];
    const plans = (App.Plan ? App.Plan.list() : [])
      .slice()
      .sort(function (a, b) {
        const d = String(a.date || "").localeCompare(String(b.date || ""));
        return d !== 0
          ? d
          : String(a.start || "").localeCompare(String(b.start || ""));
      });

    let aHtml = "<option value=''>地区を選択...</option>";
    areas.forEach(function (a) {
      aHtml +=
        "<option value='" + a.id + "'>" + Utils.esc(a.name) + "</option>";
    });

    let cHtml = "<option value=''>活動項目を選択...</option>";
    acts
      .filter(function (a) {
        return a.enabled;
      })
      .forEach(function (a) {
        cHtml +=
          "<option value='" + a.code + "'>" + Utils.esc(a.label) + "</option>";
      });

    let pHtml = "<option value=''>(計画外・突発作業)</option>";
    plans.forEach(function (p) {
      const act = acts.find(function (x) {
        return x.code === p.activityCode;
      });
      pHtml +=
        "<option value='" +
        p.id +
        "'>" +
        Utils.esc(p.date) +
        " [" +
        Utils.esc(act ? act.label : p.activityCode) +
        "]</option>";
    });

    return { area: aHtml, act: cHtml, plan: pHtml };
  }

  // ================================================================
  // ---- モーダルバインド ----
  // ================================================================

  function bindModals() {
    // 計画外作業登録ボタン
    const btnRec = document.getElementById("btn-open-rec-modal");
    if (btnRec && !btnRec.dataset.bound) {
      btnRec.dataset.bound = "1";
      btnRec.addEventListener("click", function () {
        openRecModal(null, null);
      });
    }

    const btnSaveRec = document.getElementById("btn-save-rec-modal");
    if (btnSaveRec && !btnSaveRec.dataset.bound) {
      btnSaveRec.dataset.bound = "1";
      btnSaveRec.addEventListener("click", saveRecModal);
    }

    const btnAddRecItemRow = document.getElementById("btn-add-rec-item-row");
    if (btnAddRecItemRow && !btnAddRecItemRow.dataset.bound) {
      btnAddRecItemRow.dataset.bound = "1";
      btnAddRecItemRow.addEventListener("click", function () {
        addUsedItemRow(null, 1);
      });
    }

    const btnSaveExp = document.getElementById("btn-save-expense-modal");
    if (btnSaveExp && !btnSaveExp.dataset.bound) {
      btnSaveExp.dataset.bound = "1";
      btnSaveExp.addEventListener("click", saveExpenseModal);
    }

    const btnSaveInvExp = document.getElementById("btn-save-inv-expense-modal");
    if (btnSaveInvExp && !btnSaveInvExp.dataset.bound) {
      btnSaveInvExp.dataset.bound = "1";
      btnSaveInvExp.addEventListener("click", saveInventoryExpenseModal);
    }
  }

  // ================================================================
  // ---- 実績モーダル ----
  // ================================================================

  function addUsedItemRow(itemId, qty) {
    const container = document.getElementById("modal-rec-items-container");
    if (!container) return;
    const items = App.Inventory ? App.Inventory.listItems() : [];
    let itemOpts = "<option value=''>物品を選択...</option>";
    items.forEach(function (it) {
      itemOpts +=
        "<option value='" +
        it.id +
        "'" +
        (it.id === itemId ? " selected" : "") +
        ">" +
        Utils.esc(it.name) +
        " (" +
        (it.category === "bihin" ? "備品" : "消耗品") +
        " / 在庫:" +
        it.qty +
        it.unit +
        ")</option>";
    });
    const rowDiv = document.createElement("div");
    rowDiv.className = "rec-used-item-row";
    rowDiv.style.cssText =
      "display:flex; gap:8px; margin-bottom:6px; align-items:center;";
    rowDiv.innerHTML =
      "<select class='rec-item-select' style='flex:2;'>" +
      itemOpts +
      "</select>" +
      "<input type='number' class='rec-item-qty' value='" +
      (qty || 1) +
      "' style='flex:1;' placeholder='数量' inputmode='numeric'>" +
      "<button type='button' class='btn-del' style='padding:3px 8px;'>✕</button>";
    rowDiv.querySelector(".btn-del").addEventListener("click", function () {
      rowDiv.remove();
    });
    container.appendChild(rowDiv);
  }

  function getAreaMembers(areaId) {
    return App.Master && App.Master.getMembersByArea
      ? App.Master.getMembersByArea(areaId)
      : [];
  }

  function renderMemberSelector(
    containerId,
    members,
    selectedNames,
    inputClass,
    emptyText,
  ) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const selected = new Set((selectedNames || []).map(String));
    if (!members.length) {
      container.innerHTML =
        "<p class='hint'>" +
        Utils.esc(emptyText || "名簿がありません。") +
        "</p>";
      return;
    }
    container.innerHTML = members
      .map(function (name, idx) {
        const id = containerId + "-" + idx;
        return (
          "<label for='" +
          id +
          "' class='activity-check-item'>" +
          "<input type='checkbox' id='" +
          id +
          "' class='" +
          inputClass +
          "' value='" +
          Utils.esc(name) +
          "'" +
          (selected.has(String(name)) ? " checked" : "") +
          "> " +
          Utils.esc(name) +
          "</label>"
        );
      })
      .join("");
  }

  function checkedValues(selector) {
    return Array.from(document.querySelectorAll(selector + ":checked"))
      .map(function (el) {
        return String(el.value || "").trim();
      })
      .filter(Boolean);
  }

  function updateRecordCounts() {
    const participantCount = checkedValues(".rec-participant-chk").length;
    const vesselCount = checkedValues(".rec-vessel-chk").length;
    const vehicleCount = checkedValues(".rec-vehicle-chk").length;
    const volunteerCount =
      +(document.getElementById("modal-rec-volunteer-count") || {}).value || 0;
    const legacyBoatCount =
      +(document.getElementById("modal-rec-legacy-boat-count") || {}).value ||
      0;
    const legacyCarCount =
      +(document.getElementById("modal-rec-legacy-car-count") || {}).value || 0;

    const peopleTotal = document.getElementById("modal-rec-people-total");
    const boatTotal = document.getElementById("modal-rec-boat-total");
    const carTotal = document.getElementById("modal-rec-car-total");

    if (peopleTotal)
      peopleTotal.textContent = participantCount + volunteerCount + "人";
    if (boatTotal)
      boatTotal.textContent =
        (vesselCount || legacyBoatCount) +
        "隻" +
        (!vesselCount && legacyBoatCount ? "（旧データ保持）" : "");
    if (carTotal)
      carTotal.textContent =
        (vehicleCount || legacyCarCount) +
        "台" +
        (!vehicleCount && legacyCarCount ? "（旧データ保持）" : "");
  }

  function bindRecordMemberPickers() {
    document
      .querySelectorAll(
        ".rec-participant-chk, .rec-vessel-chk, .rec-vehicle-chk",
      )
      .forEach(function (el) {
        el.addEventListener("change", updateRecordCounts);
      });
    const volunteerEl = document.getElementById("modal-rec-volunteer-count");
    if (volunteerEl) volunteerEl.oninput = updateRecordCounts;
  }

  function renderRecordMemberPickers(
    areaId,
    selectedParticipants,
    selectedVessels,
    selectedVehicles,
  ) {
    const members = getAreaMembers(areaId);
    renderMemberSelector(
      "modal-rec-participants",
      members,
      selectedParticipants,
      "rec-participant-chk",
      "この地区の名簿メンバーがありません。先に地区名簿を登録してください。",
    );
    renderMemberSelector(
      "modal-rec-vessel-providers",
      members,
      selectedVessels,
      "rec-vessel-chk",
      "用船提供者を選べる名簿メンバーがありません。",
    );
    renderMemberSelector(
      "modal-rec-vehicle-providers",
      members,
      selectedVehicles,
      "rec-vehicle-chk",
      "車両提供者を選べる名簿メンバーがありません。",
    );
    bindRecordMemberPickers();
    updateRecordCounts();
  }

  function applyPlanDefaults(plan, areaEl, actEl) {
    if (!plan) return;
    document.getElementById("modal-rec-date").value =
      plan.date || Utils.todayStr();
    if (areaEl) areaEl.value = plan.areaId || "";
    if (actEl) actEl.value = plan.activityCode || "";
    document.getElementById("modal-rec-volunteer-count").value = 0;
    document.getElementById("modal-rec-legacy-boat-count").value =
      plan.boat || 0;
    document.getElementById("modal-rec-legacy-car-count").value = plan.car || 0;
    document.getElementById("modal-rec-start").value = plan.start || "";
    document.getElementById("modal-rec-end").value = plan.end || "";
    document.getElementById("modal-rec-note").value = "";
    const wt = document.getElementById("modal-rec-work-title");
    if (wt) wt.value = plan.content || "";
    renderRecordMemberPickers(plan.areaId || "", [], [], []);

    // 計画に用船・車がない場合の追加案内
    ["plan-boat-notice", "plan-car-notice"].forEach(function (nid) {
      const old = document.getElementById(nid);
      if (old) old.remove();
    });

    // 用船がない場合
    if (!plan.boat || plan.boat === 0) {
      const vesselWrap = document.getElementById("modal-rec-vessel-providers");
      if (vesselWrap) {
        const notice = document.createElement("div");
        notice.id = "plan-boat-notice";
        notice.style.cssText =
          "margin-top:6px; padding:8px 10px; border-radius:6px;" +
          "background:rgba(56,189,248,.1); border:1px solid #0369a1;" +
          "color:#7dd3fc; font-size:12px;";
        notice.innerHTML =
          "ℹ️ 計画では用船なしでした。" +
          "実際に用船があった場合は上のチェックボックスから提供者を選択してください。";
        vesselWrap.parentNode.insertBefore(notice, vesselWrap.nextSibling);
      }
    }

    // 車両がない場合
    if (!plan.car || plan.car === 0) {
      const vehicleWrap = document.getElementById(
        "modal-rec-vehicle-providers",
      );
      if (vehicleWrap) {
        const notice = document.createElement("div");
        notice.id = "plan-car-notice";
        notice.style.cssText =
          "margin-top:6px; padding:8px 10px; border-radius:6px;" +
          "background:rgba(56,189,248,.1); border:1px solid #0369a1;" +
          "color:#7dd3fc; font-size:12px;";
        notice.innerHTML =
          "ℹ️ 計画では車両なしでした。" +
          "実際に車両があった場合は上のチェックボックスから提供者を選択してください。";
        vehicleWrap.parentNode.insertBefore(notice, vehicleWrap.nextSibling);
      }
    }
  }

  function openRecModal(id, targetPlanId) {
    const s = buildSelects();
    const pEl = document.getElementById("modal-rec-plan-select");
    const aEl = document.getElementById("modal-rec-area");
    const cEl = document.getElementById("modal-rec-act");
    if (pEl) pEl.innerHTML = s.plan;
    if (aEl) aEl.innerHTML = s.area;
    if (cEl) cEl.innerHTML = s.act;

    const itemsContainer = document.getElementById("modal-rec-items-container");
    const paymentsContainer = document.getElementById(
      "modal-rec-payments-container",
    );
    if (itemsContainer) itemsContainer.innerHTML = "";
    if (paymentsContainer) paymentsContainer.innerHTML = "";

    document.getElementById("modal-rec-title").textContent = id
      ? "作業実績の編集"
      : "作業実績の登録";
    document.getElementById("modal-rec-id").value = id || "";

    // ---- 「紐付ける作業計画」欄の表示制御 ----
    // closest("label") ではなく、wrapper の id で確実に取得する
    const planRow = document.getElementById("modal-rec-plan-row");

    if (id) {
      // ---- 既存実績の編集 ----
      const r = get(id) || {};
      const hasplan = !!r.planId;
      if (planRow) planRow.style.display = hasplan ? "" : "none";

      if (pEl) pEl.value = r.planId || "";
      document.getElementById("modal-rec-date").value = r.date || "";
      if (aEl) aEl.value = r.areaId || "";
      if (cEl) cEl.value = r.activityCode || "";
      document.getElementById("modal-rec-volunteer-count").value =
        r.volunteerCount || 0;
      document.getElementById("modal-rec-legacy-boat-count").value =
        r.legacyBoatCount || 0;
      document.getElementById("modal-rec-legacy-car-count").value =
        r.legacyCarCount || 0;
      document.getElementById("modal-rec-start").value = r.start || "";
      document.getElementById("modal-rec-end").value = r.end || "";
      document.getElementById("modal-rec-diving").value = r.diving || "no";
      document.getElementById("modal-rec-weather").value = r.weather || "";
      document.getElementById("modal-rec-tide-level").value =
        r.tideLevel != null ? r.tideLevel : "";
      document.getElementById("modal-rec-tide-note").value = r.tideNote || "";
      document.getElementById("modal-rec-note").value = r.note || "";
      // 作業タイトル・作業実績の復元
      const titleEl = document.getElementById("modal-rec-work-title");
      if (titleEl) {
        // workTitle があればそれを、なければ活動項目ラベルをフォールバック
        const allActs =
          App.Master && typeof App.Master.getActivities === "function"
            ? App.Master.getActivities()
            : [];
        const act = allActs.find(function (a) {
          return a.code === r.activityCode;
        });
        titleEl.value = r.workTitle || (act ? act.label : "") || "";
      }
      App.Form4.initWorkResultArea(r.workResults || []);

      renderRecordMemberPickers(
        r.areaId || "",
        r.participants || [],
        r.vesselProviders || [],
        r.vehicleProviders || [],
      );
      // 旧データ警告表示
      const legacyBoat = +(r.legacyBoatCount || 0);
      const legacyCar = +(r.legacyCarCount || 0);
      const hasVessel = (r.vesselProviders || []).length > 0;
      const hasVehicle = (r.vehicleProviders || []).length > 0;

      // 既存の警告を一旦削除
      ["legacy-boat-warn", "legacy-car-warn"].forEach(function (wid) {
        const old = document.getElementById(wid);
        if (old) old.remove();
      });

      // 用船：旧データあり・提供者未設定
      if (legacyBoat > 0 && !hasVessel) {
        const vesselWrap = document.getElementById(
          "modal-rec-vessel-providers",
        );
        if (vesselWrap) {
          const warn = document.createElement("div");
          warn.id = "legacy-boat-warn";
          warn.style.cssText =
            "margin-top:6px; padding:8px 10px; border-radius:6px;" +
            "background:rgba(234,179,8,.15); border:1px solid #92400e;" +
            "color:#fbbf24; font-size:12px;";
          warn.innerHTML =
            "⚠️ 旧データ：用船 <strong>" +
            legacyBoat +
            "隻</strong> の提供者が未設定です。" +
            "上のチェックボックスから提供者を選択してください。";
          vesselWrap.parentNode.insertBefore(warn, vesselWrap.nextSibling);
        }
      }

      // 車両：旧データあり・提供者未設定
      if (legacyCar > 0 && !hasVehicle) {
        const vehicleWrap = document.getElementById(
          "modal-rec-vehicle-providers",
        );
        if (vehicleWrap) {
          const warn = document.createElement("div");
          warn.id = "legacy-car-warn";
          warn.style.cssText =
            "margin-top:6px; padding:8px 10px; border-radius:6px;" +
            "background:rgba(234,179,8,.15); border:1px solid #92400e;" +
            "color:#fbbf24; font-size:12px;";
          warn.innerHTML =
            "⚠️ 旧データ：車両 <strong>" +
            legacyCar +
            "台</strong> の提供者が未設定です。" +
            "上のチェックボックスから提供者を選択してください。";
          vehicleWrap.parentNode.insertBefore(warn, vehicleWrap.nextSibling);
        }
      }

      (r.usedItems || []).forEach(function (it) {
        addUsedItemRow(it.itemId, it.qty);
      });

      // 紐付く支払表示
      if (paymentsContainer && App.Budget) {
        const expenses = App.Budget.listBudgetExpense().filter(function (e) {
          return (e.recordIds || []).map(String).includes(String(id));
        });
        if (!expenses.length) {
          paymentsContainer.innerHTML =
            "<p class='hint'>紐付いている支払実績はありません。</p>";
        } else {
          let payHtml =
            "<ul style='margin:0; padding-left:18px; font-size:12px;'>";
          expenses.forEach(function (e) {
            payHtml +=
              "<li>" +
              Utils.esc(e.date) +
              " : " +
              (e.amount || 0).toLocaleString() +
              " 円 (" +
              Utils.esc(e.payer) +
              ")</li>";
          });
          paymentsContainer.innerHTML = payHtml + "</ul>";
        }
      }
    } else if (targetPlanId) {
      // ---- 計画から実績作成 ----
      const p = App.Plan ? App.Plan.get(targetPlanId) : null;
      if (pEl) pEl.value = targetPlanId;
      if (p) {
        applyPlanDefaults(p, aEl, cEl);
        App.Form4.initWorkResultArea([]);

        if (App.TideData) {
          const lk = App.TideData.lookup(p.date, p.start, p.end);
          if (lk.min != null)
            document.getElementById("modal-rec-tide-level").value = lk.min;
        }
      } else {
        _resetRecModal(aEl, cEl);
      }
    } else {
      // ---- 計画外・新規 ----
      _resetRecModal(aEl, cEl);
    }

    if (aEl) {
      aEl.onchange = function () {
        renderRecordMemberPickers(
          aEl.value,
          checkedValues(".rec-participant-chk"),
          checkedValues(".rec-vessel-chk"),
          checkedValues(".rec-vehicle-chk"),
        );
      };
    }
    if (pEl) {
      pEl.onchange = function () {
        const pid = pEl.value;
        if (pid && App.Plan) {
          const p = App.Plan.get(pid);
          if (p) {
            applyPlanDefaults(p, aEl, cEl);
            // 新規：作業タイトルと実績をリセット
            const titleEl3 = document.getElementById("modal-rec-work-title");
            if (titleEl3) titleEl3.value = "";
            App.Form4.initWorkResultArea([]);

            if (App.TideData) {
              const lk = App.TideData.lookup(p.date, p.start, p.end);
              document.getElementById("modal-rec-tide-level").value =
                lk.min != null ? lk.min : "";
            }
          }
        } else {
          document.getElementById("modal-rec-legacy-boat-count").value = 0;
          document.getElementById("modal-rec-legacy-car-count").value = 0;
          updateRecordCounts();
        }
      };
    }

    if (App.Navigation) App.Navigation.openModal("modal-rec");
  }

  function _resetRecModal(aEl, cEl) {
    document.getElementById("modal-rec-date").value = Utils.todayStr();
    document.getElementById("modal-rec-volunteer-count").value = 0;
    document.getElementById("modal-rec-legacy-boat-count").value = 0;
    document.getElementById("modal-rec-legacy-car-count").value = 0;
    document.getElementById("modal-rec-start").value = "";
    document.getElementById("modal-rec-end").value = "";
    document.getElementById("modal-rec-diving").value = "no";
    document.getElementById("modal-rec-weather").value = "";
    document.getElementById("modal-rec-tide-level").value = "";
    document.getElementById("modal-rec-tide-note").value = "";
    document.getElementById("modal-rec-note").value = "";
    renderRecordMemberPickers(aEl ? aEl.value : "", [], [], []);
  }

  function saveRecModal() {
    const date = document.getElementById("modal-rec-date").value;
    const areaId = document.getElementById("modal-rec-area").value;
    const actCode = document.getElementById("modal-rec-act").value;
    const note = document.getElementById("modal-rec-note").value.trim();
    const diving = document.getElementById("modal-rec-diving").value;

    if (!date || !areaId || !actCode) {
      alert("日付・地区・活動項目は必須です。");
      return;
    }
    const workTitle = (
      document.getElementById("modal-rec-work-title")?.value || ""
    ).trim();
    if (!workTitle) {
      alert("作業内容を入力してください。");
      return;
    }

    const usedItems = [];
    document.querySelectorAll(".rec-used-item-row").forEach(function (row) {
      const itemId =
        row.querySelector(".rec-item-select") &&
        row.querySelector(".rec-item-select").value;
      const qty =
        +(
          row.querySelector(".rec-item-qty") &&
          row.querySelector(".rec-item-qty").value
        ) || 0;
      if (itemId && qty > 0) usedItems.push({ itemId: itemId, qty: qty });
    });

    const tideLevelVal = document.getElementById("modal-rec-tide-level").value;
    const participants = checkedValues(".rec-participant-chk");
    const vesselProviders = checkedValues(".rec-vessel-chk");
    const vehicleProviders = checkedValues(".rec-vehicle-chk");
    const volunteerCount =
      +document.getElementById("modal-rec-volunteer-count").value || 0;
    const legacyBoatCount = vesselProviders.length
      ? 0
      : +document.getElementById("modal-rec-legacy-boat-count").value || 0;
    const legacyCarCount = vehicleProviders.length
      ? 0
      : +document.getElementById("modal-rec-legacy-car-count").value || 0;

    try {
      upsert({
        id: document.getElementById("modal-rec-id").value || undefined,
        planId: document.getElementById("modal-rec-plan-select").value || null,
        date: date,
        areaId: areaId,
        activityCode: actCode,
        participants: participants,
        vesselProviders: vesselProviders,
        vehicleProviders: vehicleProviders,
        volunteerCount: volunteerCount,
        legacyBoatCount: legacyBoatCount,
        legacyCarCount: legacyCarCount,
        start: document.getElementById("modal-rec-start").value,
        end: document.getElementById("modal-rec-end").value,
        diving: diving,
        weather: document.getElementById("modal-rec-weather").value,
        tideLevel: tideLevelVal !== "" ? Number(tideLevelVal) : null,
        tideNote: document.getElementById("modal-rec-tide-note").value,
        usedItems: usedItems,
        note: note,
        workTitle: workTitle,
        workResults: App.Form4.collectWorkResults(),
      });
      if (App.Navigation) App.Navigation.closeModal("modal-rec");
      renderRecordList();
    } catch (e) {
      alert("保存エラー: " + e.message);
    }
  }

  // ================================================================
  // ---- 支払モーダル ----
  // ================================================================

  /**
   * @param {string|null} id        - 編集時は支払実績ID、新規はnull
   * @param {string|null} preRecId  - 一覧の[支払入力]から開く場合の実績ID（自動チェック用）
   */
  function openExpenseModal(id, preRecId) {
    document.getElementById("modal-expense-title").textContent = id
      ? "支払実績の編集"
      : "支払実績の登録";
    document.getElementById("modal-expense-id").value = id || "";

    const recSelContainer = document.getElementById(
      "modal-expense-records-select",
    );
    const invSelContainer = document.getElementById(
      "modal-expense-inventory-select",
    );

    let currentSelectedIds = [],
      currentInvIds = [];
    let currentExpense = null;

    if (id && App.Budget) {
      const exp = App.Budget.listBudgetExpense().find(function (x) {
        return String(x.id) === String(id);
      });
      if (exp) {
        currentExpense = exp;
        currentSelectedIds = (exp.recordIds || []).map(String);
        currentInvIds = (exp.inventoryLogIds || []).map(String);
        document.getElementById("modal-expense-date").value = exp.date || "";
        document.getElementById("modal-expense-amount").value = exp.amount || 0;
        document.getElementById("modal-expense-payer").value = exp.payer || "";
        const slipEl = document.getElementById("modal-expense-slip-no");
        if (slipEl) slipEl.value = exp.slipNo || "";
      }
    } else {
      document.getElementById("modal-expense-date").value = Utils.todayStr();
      document.getElementById("modal-expense-amount").value = 0;
      document.getElementById("modal-expense-payer").value = "";
      const slipEl = document.getElementById("modal-expense-slip-no");
      if (slipEl) slipEl.value = "";
    }

    if (preRecId && !currentSelectedIds.includes(String(preRecId))) {
      currentSelectedIds = [String(preRecId)];
    }

    if (recSelContainer) {
      const editingId = document.getElementById("modal-expense-id").value;
      const allExpenses = App.Budget ? App.Budget.listBudgetExpense() : [];

      const paidRecIds = new Set();
      allExpenses.forEach(function (e) {
        if (String(e.id) === String(editingId)) return;
        (e.recordIds || []).forEach(function (rid) {
          paidRecIds.add(String(rid));
        });
      });

      const fullyPaidRecIds = new Set();
      list().forEach(function (r) {
        if (!paidRecIds.has(String(r.id))) return;

        const recCost = calcRecordCost(r).total;

        const paidTotal = allExpenses
          .filter(function (e) {
            return (
              String(e.id) !== String(editingId) &&
              (e.recordIds || []).map(String).includes(String(r.id))
            );
          })
          .reduce(function (s, e) {
            const ids = (e.recordIds || []).map(String);
            if (ids.length === 1) return s + (+e.amount || 0);

            const weights = ids.map(function (id) {
              const target = list().find(function (rec) {
                return String(rec.id) === String(id);
              });
              return target ? +calcRecordCost(target).total || 0 : 0;
            });
            const totalWeight = weights.reduce(function (a, b) {
              return a + b;
            }, 0);
            const idx = ids.indexOf(String(r.id));
            if (idx === -1) return s;

            const share =
              totalWeight > 0
                ? ((+e.amount || 0) * weights[idx]) / totalWeight
                : (+e.amount || 0) / ids.length;
            return s + share;
          }, 0);

        if (paidTotal >= recCost) fullyPaidRecIds.add(String(r.id));
      });

      const records = list().filter(function (r) {
        if (
          fullyPaidRecIds.has(String(r.id)) &&
          !currentSelectedIds.includes(String(r.id))
        )
          return false;
        return true;
      });

      const areas = Storage.getAreas ? Storage.getAreas() : [];
      const areaMap = {};
      areas.forEach(function (a) {
        areaMap[a.id] = a.name;
      });

      if (!records.length) {
        recSelContainer.innerHTML =
          "<p class='hint'>対象となる作業実績がありません。</p>";
      } else {
        let html = "";
        records.forEach(function (r) {
          const isChecked = currentSelectedIds.includes(String(r.id));
          const cost = calcRecordCost(r);
          const areaName = Utils.esc(areaMap[r.areaId] || r.areaId || "");
          const noteTxt = Utils.esc(r.note || r.activityCode || "");

          const existBreakdown =
            currentExpense && currentExpense.breakdown
              ? currentExpense.breakdown[String(r.id)] || {}
              : {};

          const bdJinken =
            existBreakdown.jinken != null ? existBreakdown.jinken : cost.jinken;
          const bdYousen =
            existBreakdown.yousen != null ? existBreakdown.yousen : cost.yousen;
          const bdKotsu =
            existBreakdown.kotsu != null ? existBreakdown.kotsu : cost.kotsu;

          const borderCol = isChecked ? "#3b82f6" : "transparent";
          const bgCol = isChecked
            ? "rgba(59,130,246,.12)"
            : "rgba(255,255,255,.03)";

          html +=
            "<div class='exp-rec-item'" +
            " style='margin-bottom:6px; border-radius:6px;" +
            " border:1px solid " +
            borderCol +
            ";" +
            " background:" +
            bgCol +
            ";'>" +
            "<label style='display:grid; grid-template-columns:20px 1fr auto;" +
            " align-items:center; gap:8px; padding:7px 10px; cursor:pointer;'>" +
            "<input type='checkbox' class='exp-rec-chk' value='" +
            r.id +
            "'" +
            " data-jinken='" +
            cost.jinken +
            "'" +
            " data-yousen='" +
            cost.yousen +
            "'" +
            " data-kotsu='" +
            cost.kotsu +
            "'" +
            " data-cost='" +
            cost.total +
            "'" +
            (isChecked ? " checked" : "") +
            " style='width:16px; height:16px; cursor:pointer; accent-color:#3b82f6;'>" +
            "<div style='min-width:0;'>" +
            "<div style='font-size:12px; color:#94a3b8; margin-bottom:2px;'>" +
            Utils.esc(r.date || "") +
            "　📍 " +
            areaName +
            "</div>" +
            "<div style='font-size:13px; color:#f1f5f9;" +
            " white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'>" +
            noteTxt +
            "</div>" +
            "</div>" +
            "<div style='font-size:13px; font-weight:700; color:#4ade80;" +
            " white-space:nowrap; text-align:right;'>" +
            "<span class='exp-rec-subtotal' data-id='" +
            r.id +
            "'>" +
            (isChecked
              ? (bdJinken + bdYousen + bdKotsu).toLocaleString()
              : cost.total.toLocaleString()) +
            "</span>円" +
            "</div>" +
            "</label>" +
            "<div class='exp-rec-breakdown' data-id='" +
            r.id +
            "'" +
            " style='padding:4px 10px 10px 36px; display:" +
            (isChecked ? "grid" : "none") +
            ";" +
            " grid-template-columns:repeat(3,1fr); gap:6px;'>" +
            (cost.jinken > 0
              ? "<label style='display:flex; flex-direction:column; gap:3px; font-size:11px; color:#94a3b8;'>日当（最大" +
                cost.jinken.toLocaleString() +
                "円）" +
                "<input type='number' class='exp-bd-jinken' data-id='" +
                r.id +
                "'" +
                " value='" +
                (isChecked ? bdJinken : cost.jinken) +
                "'" +
                " min='0' max='" +
                cost.jinken +
                "'" +
                " style='width:100%; padding:4px 6px; border-radius:4px;" +
                " border:1px solid #334155; background:#1e293b; color:#f1f5f9; font-size:12px;'>" +
                "</label>"
              : "<div></div>") +
            (cost.yousen > 0
              ? "<label style='display:flex; flex-direction:column; gap:3px; font-size:11px; color:#94a3b8;'>用船料（最大" +
                cost.yousen.toLocaleString() +
                "円）" +
                "<input type='number' class='exp-bd-yousen' data-id='" +
                r.id +
                "'" +
                " value='" +
                (isChecked ? bdYousen : cost.yousen) +
                "'" +
                " min='0' max='" +
                cost.yousen +
                "'" +
                " style='width:100%; padding:4px 6px; border-radius:4px;" +
                " border:1px solid #334155; background:#1e293b; color:#f1f5f9; font-size:12px;'>" +
                "</label>"
              : "<div></div>") +
            (cost.kotsu > 0
              ? "<label style='display:flex; flex-direction:column; gap:3px; font-size:11px; color:#94a3b8;'>車両代（最大" +
                cost.kotsu.toLocaleString() +
                "円）" +
                "<input type='number' class='exp-bd-kotsu' data-id='" +
                r.id +
                "'" +
                " value='" +
                (isChecked ? bdKotsu : cost.kotsu) +
                "'" +
                " min='0' max='" +
                cost.kotsu +
                "'" +
                " style='width:100%; padding:4px 6px; border-radius:4px;" +
                " border:1px solid #334155; background:#1e293b; color:#f1f5f9; font-size:12px;'>" +
                "</label>"
              : "<div></div>") +
            "</div>" +
            "</div>";
        });

        recSelContainer.innerHTML = html;

        recSelContainer
          .querySelectorAll(".exp-rec-chk")
          .forEach(function (chk) {
            chk.addEventListener("change", function () {
              const item = chk.closest(".exp-rec-item");
              const bd = recSelContainer.querySelector(
                ".exp-rec-breakdown[data-id='" + chk.value + "']",
              );
              if (chk.checked) {
                item.style.border = "1px solid #3b82f6";
                item.style.background = "rgba(59,130,246,.12)";
                if (bd) bd.style.display = "grid";
              } else {
                item.style.border = "1px solid transparent";
                item.style.background = "rgba(255,255,255,.03)";
                if (bd) bd.style.display = "none";
              }
              updateExpenseTotal();
            });
          });

        recSelContainer
          .querySelectorAll(".exp-bd-jinken, .exp-bd-yousen, .exp-bd-kotsu")
          .forEach(function (inp) {
            inp.addEventListener("input", function () {
              updateExpenseTotal();
            });
          });
      }
    }

    function updateExpenseTotal() {
      var total = 0;

      if (recSelContainer) {
        recSelContainer
          .querySelectorAll(".exp-rec-chk:checked")
          .forEach(function (chk) {
            var id = chk.value;
            var jinken =
              +(
                recSelContainer.querySelector(
                  ".exp-bd-jinken[data-id='" + id + "']",
                ) || { value: chk.dataset.jinken || 0 }
              ).value || 0;
            var yousen =
              +(
                recSelContainer.querySelector(
                  ".exp-bd-yousen[data-id='" + id + "']",
                ) || { value: chk.dataset.yousen || 0 }
              ).value || 0;
            var kotsu =
              +(
                recSelContainer.querySelector(
                  ".exp-bd-kotsu[data-id='" + id + "']",
                ) || { value: chk.dataset.kotsu || 0 }
              ).value || 0;

            var subtotalEl = recSelContainer.querySelector(
              ".exp-rec-subtotal[data-id='" + id + "']",
            );
            if (subtotalEl) {
              subtotalEl.textContent = (
                jinken +
                yousen +
                kotsu
              ).toLocaleString();
            }

            total += jinken + yousen + kotsu;
          });
      }

      if (invSelContainer) {
        invSelContainer
          .querySelectorAll(".exp-inv-chk:checked")
          .forEach(function (chk) {
            total += +chk.dataset.cost || 0;
          });
      }

      var amountEl = document.getElementById("modal-expense-amount");
      if (amountEl) amountEl.value = total;

      _updateExpenseDiff();
    }

    if (invSelContainer) {
      const logs =
        App.Inventory && App.Inventory.purchaseRows
          ? App.Inventory.purchaseRows()
          : [];

      if (!logs.length) {
        invSelContainer.innerHTML =
          "<p class='hint'>対象となる物品購入ログがありません。</p>";
      } else {
        let html = "";
        logs.forEach(function (log) {
          const checked = currentInvIds.includes(String(log.id))
            ? "checked"
            : "";
          const logCost = +log.totalCost || 0;

          html +=
            "<label style='display:flex; align-items:center; gap:6px;" +
            " font-size:12px; margin-bottom:4px; cursor:pointer;'>" +
            "<input type='checkbox' class='exp-inv-chk' value='" +
            log.id +
            "'" +
            " data-cost='" +
            logCost +
            "' " +
            checked +
            "> " +
            Utils.esc(log.date) +
            " [" +
            Utils.esc(log.itemName || "") +
            "] " +
            Utils.esc(log.slipNo || log.receiptNo || "") +
            " (<strong>" +
            logCost.toLocaleString() +
            "円</strong>)" +
            "</label>";
        });
        invSelContainer.innerHTML = html;

        invSelContainer
          .querySelectorAll(".exp-inv-chk")
          .forEach(function (chk) {
            chk.addEventListener("change", function () {
              updateExpenseTotal();
            });
          });
      }
    }

    _ensureExpenseDiffArea();

    const amountEl = document.getElementById("modal-expense-amount");
    if (amountEl) {
      const newAmountEl = amountEl.cloneNode(true);
      amountEl.parentNode.replaceChild(newAmountEl, amountEl);
      newAmountEl.addEventListener("input", _updateExpenseDiff);
    }

    document
      .querySelectorAll(".exp-rec-chk, .exp-inv-chk")
      .forEach(function (chk) {
        chk.addEventListener("change", _updateExpenseDiff);
      });

    const editingId = document.getElementById("modal-expense-id").value;
    const alreadyPaidMap = {};

    if (App.Budget) {
      const allExpenses = App.Budget.listBudgetExpense();
      const otherExpenses = allExpenses.filter(function (e) {
        return String(e.id) !== String(editingId);
      });

      const allRecs = list();
      const recMap = {};
      allRecs.forEach(function (r) {
        recMap[String(r.id)] = r;
      });

      otherExpenses.forEach(function (exp) {
        const ids = (exp.recordIds || []).map(String);
        if (!ids.length) return;

        if (ids.length === 1) {
          alreadyPaidMap[ids[0]] =
            (alreadyPaidMap[ids[0]] || 0) + (+exp.amount || 0);
          return;
        }

        const ws = ids.map(function (id) {
          return recMap[id] ? +calcRecordCost(recMap[id]).total || 0 : 0;
        });

        const tw = ws.reduce(function (s, w) {
          return s + w;
        }, 0);

        ids.forEach(function (id, i) {
          const share =
            tw > 0
              ? ((+exp.amount || 0) * ws[i]) / tw
              : (+exp.amount || 0) / ids.length;
          alreadyPaidMap[id] = (alreadyPaidMap[id] || 0) + share;
        });
      });
    }

    _updateExpenseDiff._paidMap = alreadyPaidMap;
    _updateExpenseDiff(alreadyPaidMap);

    if (App.Navigation) App.Navigation.openModal("modal-expense");
  }

  // ================================================================
  // ---- 物品購入支払いモーダル ----
  // ================================================================

  function openInventoryExpenseModal(id, preLogId) {
    document.getElementById("modal-inv-expense-title").textContent = id
      ? "物品支払実績の編集"
      : "物品支払実績の登録";
    document.getElementById("modal-inv-expense-id").value = id || "";

    const invSelContainer = document.getElementById(
      "modal-inv-expense-inventory-select",
    );

    let currentInvIds = [];
    if (id && App.Budget) {
      const exp = App.Budget.listBudgetExpense().find(function (x) {
        return String(x.id) === String(id);
      });
      if (exp) {
        currentInvIds = (exp.inventoryLogIds || []).map(String);
        document.getElementById("modal-inv-expense-date").value =
          exp.date || "";
        document.getElementById("modal-inv-expense-amount").value =
          exp.amount || 0;
        document.getElementById("modal-inv-expense-payer").value =
          exp.payer || "";
        const slipEl = document.getElementById("modal-inv-expense-slip-no");
        if (slipEl) slipEl.value = exp.slipNo || "";
      }
    } else {
      document.getElementById("modal-inv-expense-date").value =
        Utils.todayStr();
      document.getElementById("modal-inv-expense-amount").value = 0;
      document.getElementById("modal-inv-expense-payer").value = "";
      const slipEl = document.getElementById("modal-inv-expense-slip-no");
      if (slipEl) slipEl.value = "";
    }

    if (preLogId && !currentInvIds.includes(String(preLogId))) {
      currentInvIds = [String(preLogId)];
    }

    const editingId = document.getElementById("modal-inv-expense-id").value;
    const allExpenses = App.Budget ? App.Budget.listBudgetExpense() : [];
    const allLogs =
      App.Inventory && App.Inventory.purchaseRows
        ? App.Inventory.purchaseRows()
        : [];

    const paidLogMap = {};
    allExpenses.forEach(function (exp) {
      if (String(exp.id) === String(editingId)) return;
      const ids = (exp.inventoryLogIds || []).map(String);
      if (!ids.length) return;

      const expAmount = +exp.amount || 0;

      if (ids.length === 1) {
        paidLogMap[ids[0]] = (paidLogMap[ids[0]] || 0) + expAmount;
        return;
      }

      const weights = ids.map(function (lid) {
        const targetLog = allLogs.find(function (l) {
          return String(l.id) === lid;
        });
        return targetLog ? +targetLog.totalCost || 0 : 0;
      });
      const totalWeight = weights.reduce(function (s, w) {
        return s + w;
      }, 0);

      ids.forEach(function (lid, i) {
        const share =
          totalWeight > 0
            ? (expAmount * weights[i]) / totalWeight
            : expAmount / ids.length;
        paidLogMap[lid] = (paidLogMap[lid] || 0) + share;
      });
    });

    const fullyPaidLogIds = new Set();
    allLogs.forEach(function (log) {
      const paid = paidLogMap[String(log.id)] || 0;
      if (paid >= (+log.totalCost || 0) && +log.totalCost > 0) {
        fullyPaidLogIds.add(String(log.id));
      }
    });

    if (invSelContainer) {
      const logs = allLogs.filter(function (log) {
        if (log.type !== "in") return false;
        if (
          fullyPaidLogIds.has(String(log.id)) &&
          !currentInvIds.includes(String(log.id))
        )
          return false;
        return true;
      });

      if (!logs.length) {
        invSelContainer.innerHTML =
          "<p class='hint'>対象となる物品購入ログがありません。</p>";
      } else {
        let html = "";
        logs.forEach(function (log) {
          const isChecked = currentInvIds.includes(String(log.id));
          const logCost = +log.totalCost || 0;
          const alreadyPaid = paidLogMap[String(log.id)] || 0;
          const remaining = logCost - alreadyPaid;

          const borderCol = isChecked ? "#8b5cf6" : "transparent";
          const bgCol = isChecked
            ? "rgba(139,92,246,.12)"
            : "rgba(255,255,255,.03)";

          html +=
            "<div class='inv-exp-item'" +
            " style='margin-bottom:6px; border-radius:6px;" +
            " border:1px solid " +
            borderCol +
            ";" +
            " background:" +
            bgCol +
            ";'>" +
            "<label style='display:grid; grid-template-columns:20px 1fr auto;" +
            " align-items:center; gap:8px; padding:7px 10px; cursor:pointer;'>" +
            "<input type='checkbox' class='inv-exp-chk' value='" +
            log.id +
            "'" +
            " data-cost='" +
            logCost +
            "'" +
            (isChecked ? " checked" : "") +
            " style='width:16px; height:16px; cursor:pointer; accent-color:#8b5cf6;'>" +
            "<div style='min-width:0;'>" +
            "<div style='font-size:12px; color:#94a3b8; margin-bottom:2px;'>" +
            Utils.esc(log.date || "") +
            (log.receiptNo ? "　🧾 " + Utils.esc(log.receiptNo) : "") +
            (log.slipNo ? "　📄 " + Utils.esc(log.slipNo) : "") +
            "</div>" +
            "<div style='font-size:13px; color:#f1f5f9;" +
            " white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'>" +
            "🛒 " +
            Utils.esc(log.itemName || "") +
            " × " +
            (log.qty || 0) +
            " (" +
            (log.unitPrice || 0).toLocaleString() +
            "円/個)" +
            "</div>" +
            (alreadyPaid > 0
              ? "<div style='font-size:11px; color:#fbbf24; margin-top:2px;'>" +
                "既払い: " +
                alreadyPaid.toLocaleString() +
                "円　残: " +
                remaining.toLocaleString() +
                "円</div>"
              : "") +
            "</div>" +
            "<div style='font-size:13px; font-weight:700; color:#4ade80;" +
            " white-space:nowrap; text-align:right;'>" +
            logCost.toLocaleString() +
            "円" +
            "</div>" +
            "</label>" +
            "</div>";
        });

        invSelContainer.innerHTML = html;

        invSelContainer
          .querySelectorAll(".inv-exp-chk")
          .forEach(function (chk) {
            chk.addEventListener("change", function () {
              const item = chk.closest(".inv-exp-item");
              if (chk.checked) {
                item.style.border = "1px solid #8b5cf6";
                item.style.background = "rgba(139,92,246,.12)";
              } else {
                item.style.border = "1px solid transparent";
                item.style.background = "rgba(255,255,255,.03)";
              }
              _updateInvExpenseTotal();
            });
          });
      }
    }

    function _updateInvExpenseTotal() {
      var total = 0;
      invSelContainer
        .querySelectorAll(".inv-exp-chk:checked")
        .forEach(function (chk) {
          total += +chk.dataset.cost || 0;
        });

      var amountEl = document.getElementById("modal-inv-expense-amount");
      if (amountEl) amountEl.value = total;
    }

    if (!currentInvIds.length) {
      _updateInvExpenseTotal();
    }

    if (App.Navigation) App.Navigation.openModal("modal-inv-expense");
  }

  // ----------------------------------------------------------------
  // 物品支払いモーダルの保存
  // ----------------------------------------------------------------
  function saveInventoryExpenseModal() {
    const date = document.getElementById("modal-inv-expense-date").value;
    const amount =
      +document.getElementById("modal-inv-expense-amount").value || 0;

    if (!date || !amount) {
      alert("支払日と金額を入力してください。");
      return;
    }
    if (!App.Budget) {
      alert("Budget モジュールが読み込まれていません。");
      return;
    }

    const selectedLogIds = [];
    document.querySelectorAll(".inv-exp-chk:checked").forEach(function (chk) {
      selectedLogIds.push(chk.value);
    });

    const slipEl = document.getElementById("modal-inv-expense-slip-no");

    App.Budget.upsertBudgetExpense({
      id: document.getElementById("modal-inv-expense-id").value || undefined,
      date: date,
      paidDate: date,
      amount: amount,
      payer: document.getElementById("modal-inv-expense-payer").value,
      slipNo: slipEl ? String(slipEl.value || "").trim() : "",
      recordIds: [],
      inventoryLogIds: selectedLogIds,
    });

    if (App.Navigation) App.Navigation.closeModal("modal-inv-expense");
    renderRecordList();
    renderReceiptList();
  }

  // ----------------------------------------------------------------
  // 物品支払い履歴モーダル
  // ----------------------------------------------------------------
  function openInvPayHistoryModal(logId) {
    const allExpenses = App.Budget ? App.Budget.listBudgetExpense() : [];
    const allLogs =
      App.Inventory && App.Inventory.purchaseRows
        ? App.Inventory.purchaseRows()
        : [];

    const log = allLogs.find(function (l) {
      return String(l.id) === String(logId);
    });
    const logCost = log ? +log.totalCost || 0 : 0;
    const logName = log ? log.itemName : logId;

    const related = allExpenses.filter(function (exp) {
      return (exp.inventoryLogIds || []).map(String).includes(String(logId));
    });

    // ---- モーダルがなければ動的生成 ----
    let modal = document.getElementById("modal-inv-pay-history");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-inv-pay-history";
      modal.style.cssText =
        "position:fixed; inset:0; background:rgba(0,0,0,0.6);" +
        "display:none; align-items:center; justify-content:center; z-index:9999;";
      modal.innerHTML =
        "<div style='background:var(--surface-color,#1e293b); border-radius:10px;" +
        " width:90%; max-width:520px; max-height:80vh;" +
        " display:flex; flex-direction:column; overflow:hidden;'>" +
        "<div style='display:flex; justify-content:space-between; align-items:center;" +
        " padding:14px 20px; border-bottom:1px solid #334155;'>" +
        "<h3 id='modal-inv-pay-history-title'" +
        " style='margin:0; font-size:15px; color:var(--text-color,#f1f5f9);'>物品支払履歴</h3>" +
        "<button id='btn-close-inv-pay-history'" +
        " style='background:none; border:none; color:#94a3b8;" +
        " font-size:20px; cursor:pointer; line-height:1;'>✕</button>" +
        "</div>" +
        "<div id='modal-inv-pay-history-body'" +
        " style='overflow-y:auto; padding:16px 20px; flex:1;'></div>" +
        "<div style='padding:12px 20px; border-top:1px solid #334155;" +
        " display:flex; gap:8px; justify-content:flex-end;'>" +
        "<button class='btn-primary' id='btn-inv-pay-history-add'>💵 支払いを追加</button>" +
        "<button class='btn-secondary' id='btn-inv-pay-history-close'>閉じる</button>" +
        "</div>" +
        "</div>";
      document.body.appendChild(modal);
    }

    // ---- 本文を描画 ----
    const bodyEl = document.getElementById("modal-inv-pay-history-body");
    const titleEl = document.getElementById("modal-inv-pay-history-title");
    if (titleEl) {
      titleEl.textContent =
        "物品支払履歴：" + logName + "（" + logCost.toLocaleString() + "円）";
    }

    if (bodyEl) {
      let html = "";
      if (!related.length) {
        html = "<p class='hint'>支払い履歴がありません。</p>";
      } else {
        html =
          "<table class='data-table' style='font-size:12px; width:100%;'>" +
          "<thead><tr>" +
          "<th>支払日</th><th>金額</th><th>支払者</th><th>操作</th>" +
          "</tr></thead><tbody>";
        related.forEach(function (exp) {
          html +=
            "<tr>" +
            "<td>" +
            Utils.esc(exp.date || "") +
            "</td>" +
            "<td style='text-align:right;'>" +
            (+exp.amount || 0).toLocaleString() +
            "円</td>" +
            "<td>" +
            Utils.esc(exp.payer || "") +
            "</td>" +
            "<td style='white-space:nowrap;'>" +
            "<button class='btn-edit btn-sm'" +
            " data-edit-inv-exp='" +
            exp.id +
            "'>✏️ 編集</button> " +
            "<button class='btn-del btn-sm'" +
            " data-del-inv-exp='" +
            exp.id +
            "'>🗑️ 削除</button>" +
            "</td>" +
            "</tr>";
        });
        html += "</tbody></table>";
      }
      bodyEl.innerHTML = html;

      // 編集ボタン
      bodyEl.querySelectorAll("[data-edit-inv-exp]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          modal.style.display = "none";
          openInventoryExpenseModal(btn.dataset.editInvExp);
        });
      });

      // 削除ボタン
      bodyEl.querySelectorAll("[data-del-inv-exp]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("この支払い履歴を削除しますか？")) return;
          if (App.Budget.removeBudgetExpense) {
            App.Budget.removeBudgetExpense(btn.dataset.delInvExp);
          } else if (App.Budget.deleteBudgetExpense) {
            App.Budget.deleteBudgetExpense(btn.dataset.delInvExp);
          }
          modal.style.display = "none";
          renderRecordList();
        });
      });
    }

    // ---- ボタンイベント（クローン置換でリスナー重複防止） ----
    [
      "btn-close-inv-pay-history",
      "btn-inv-pay-history-add",
      "btn-inv-pay-history-close",
    ].forEach(function (btnId) {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      const nb = btn.cloneNode(true);
      btn.parentNode.replaceChild(nb, btn);
    });

    document
      .getElementById("btn-close-inv-pay-history")
      .addEventListener("click", function () {
        modal.style.display = "none";
      });
    document
      .getElementById("btn-inv-pay-history-close")
      .addEventListener("click", function () {
        modal.style.display = "none";
      });
    document
      .getElementById("btn-inv-pay-history-add")
      .addEventListener("click", function () {
        modal.style.display = "none";
        openInventoryExpenseModal(null, logId);
      });

    modal.style.display = "flex";

    // オーバーレイクリックで閉じる
    modal.onclick = function (e) {
      if (e.target === modal) modal.style.display = "none";
    };
  }

  // ---- 差額表示エリアを modal-footer の直前に挿入 ----
  function _ensureExpenseDiffArea() {
    // 既存があれば再利用
    if (document.getElementById("expense-diff-area")) return;

    const footer = document.querySelector("#modal-expense .modal-footer");
    if (!footer) return;

    const div = document.createElement("div");
    div.id = "expense-diff-area";
    div.style.cssText =
      "padding:10px 20px; font-size:13px; border-top:1px solid #334155;";
    footer.parentNode.insertBefore(div, footer);
  }

  // ---- 差額をリアルタイム計算して表示 ----
  // alreadyPaidMap: { recId: 既払い按分額, ... }（編集中IDを除いた既払い）
  function _updateExpenseDiff(alreadyPaidMap) {
    const area = document.getElementById("expense-diff-area");
    if (!area) return;

    const paidMap = alreadyPaidMap || _updateExpenseDiff._paidMap || {};

    const amountEl = document.getElementById("modal-expense-amount");
    const paid = amountEl ? +amountEl.value || 0 : 0;

    let recTotal = 0;
    let alreadyPaid = 0;

    document.querySelectorAll(".exp-rec-chk:checked").forEach(function (chk) {
      const id = chk.value;

      const jinken =
        +(
          document.querySelector(".exp-bd-jinken[data-id='" + id + "']") || {
            value: chk.dataset.jinken || 0,
          }
        ).value || 0;
      const yousen =
        +(
          document.querySelector(".exp-bd-yousen[data-id='" + id + "']") || {
            value: chk.dataset.yousen || 0,
          }
        ).value || 0;
      const kotsu =
        +(
          document.querySelector(".exp-bd-kotsu[data-id='" + id + "']") || {
            value: chk.dataset.kotsu || 0,
          }
        ).value || 0;

      recTotal += jinken + yousen + kotsu;
      alreadyPaid += +paidMap[String(chk.value)] || 0;
    });

    let invTotal = 0;
    document.querySelectorAll(".exp-inv-chk:checked").forEach(function (chk) {
      invTotal += +chk.dataset.cost || 0;
    });

    const expectedTotal = recTotal + invTotal;
    const remainingTotal = expectedTotal - alreadyPaid;
    const diff = paid - remainingTotal;

    if (expectedTotal === 0) {
      area.innerHTML =
        "<span style='color:#64748b;'>紐付ける実績・物品を選択すると差額を確認できます。</span>";
      return;
    }

    if (paid === 0) {
      area.innerHTML =
        "<span style='color:#64748b;'>支払金額を入力すると差額を確認できます。</span>" +
        " <span style='color:#94a3b8;'>（選択実績合計: " +
        expectedTotal.toLocaleString() +
        "円" +
        (alreadyPaid > 0
          ? " / 既払い: " +
            alreadyPaid.toLocaleString() +
            "円 / 残額: " +
            remainingTotal.toLocaleString() +
            "円"
          : "") +
        "）</span>";
      return;
    }

    let breakdown = "";
    if (recTotal > 0) {
      breakdown += "作業実績: " + recTotal.toLocaleString() + "円";
    }
    if (invTotal > 0) {
      breakdown +=
        (breakdown ? " ＋ " : "") +
        "物品購入: " +
        invTotal.toLocaleString() +
        "円";
    }
    if (alreadyPaid > 0) {
      breakdown +=
        " / 既払い: " +
        alreadyPaid.toLocaleString() +
        "円 / 今回残額: " +
        remainingTotal.toLocaleString() +
        "円";
    }

    if (diff === 0) {
      area.innerHTML =
        "<div style='display:flex; align-items:center; gap:10px;" +
        " padding:8px 10px; border-radius:6px;" +
        " background:rgba(34,197,94,.15); border:1px solid #166534;'>" +
        "<span style='font-size:16px;'>✅</span>" +
        "<div>" +
        "<div style='color:#4ade80; font-weight:700;'>支払金額と残額が一致しています</div>" +
        "<div style='color:#64748b; font-size:11px; margin-top:2px;'>" +
        breakdown +
        "</div>" +
        "</div></div>";
    } else if (diff < 0) {
      const shortage = Math.abs(diff);
      area.innerHTML =
        "<div style='display:flex; align-items:center; gap:10px;" +
        " padding:8px 10px; border-radius:6px;" +
        " background:rgba(239,68,68,.15); border:1px solid #7f1d1d;'>" +
        "<span style='font-size:16px;'>⚠️</span>" +
        "<div>" +
        "<div style='color:#f87171; font-weight:700;'>" +
        "支払金額が残額より <strong style='font-size:15px;'>" +
        shortage.toLocaleString() +
        "円</strong> 不足しています</div>" +
        "<div style='color:#64748b; font-size:11px; margin-top:2px;'>" +
        "支払金額: " +
        paid.toLocaleString() +
        "円 ／ " +
        breakdown +
        "</div>" +
        "<div style='color:#94a3b8; font-size:11px; margin-top:3px;'>" +
        "💡 分割払いの場合はこのまま保存できます。残額は次回の支払い登録で紐付けてください。" +
        "</div>" +
        "</div></div>";
    } else {
      area.innerHTML =
        "<div style='display:flex; align-items:center; gap:10px;" +
        " padding:8px 10px; border-radius:6px;" +
        " background:rgba(234,179,8,.15); border:1px solid #92400e;'>" +
        "<span style='font-size:16px;'>⚠️</span>" +
        "<div>" +
        "<div style='color:#fbbf24; font-weight:700;'>" +
        "支払金額が残額より <strong style='font-size:15px;'>" +
        diff.toLocaleString() +
        "円</strong> 多いです</div>" +
        "<div style='color:#64748b; font-size:11px; margin-top:2px;'>" +
        "支払金額: " +
        paid.toLocaleString() +
        "円 ／ " +
        breakdown +
        "</div>" +
        "<div style='color:#94a3b8; font-size:11px; margin-top:3px;'>" +
        "💡 他の実績・物品購入が含まれる場合は追加で選択してください。" +
        "</div>" +
        "</div></div>";
    }
  }

  function saveExpenseModal() {
    const date = document.getElementById("modal-expense-date").value;
    const amount = +document.getElementById("modal-expense-amount").value || 0;

    if (!date || !amount) {
      alert("支払日と金額を入力してください。");
      return;
    }
    if (!App.Budget) {
      alert("Budget モジュールが読み込まれていません。");
      return;
    }

    const selectedRecordIds = [];
    document.querySelectorAll(".exp-rec-chk:checked").forEach(function (chk) {
      selectedRecordIds.push(chk.value);
    });

    const selectedInventoryLogIds = [];
    document.querySelectorAll(".exp-inv-chk:checked").forEach(function (chk) {
      selectedInventoryLogIds.push(chk.value);
    });

    const breakdown = {};
    document.querySelectorAll(".exp-rec-chk:checked").forEach(function (chk) {
      const id = chk.value;
      const jinkenEl = document.querySelector(
        ".exp-bd-jinken[data-id='" + id + "']",
      );
      const yousenEl = document.querySelector(
        ".exp-bd-yousen[data-id='" + id + "']",
      );
      const kotsuEl = document.querySelector(
        ".exp-bd-kotsu[data-id='" + id + "']",
      );

      breakdown[id] = {
        jinken: jinkenEl ? +jinkenEl.value || 0 : 0,
        yousen: yousenEl ? +yousenEl.value || 0 : 0,
        kotsu: kotsuEl ? +kotsuEl.value || 0 : 0,
      };
    });

    const slipEl = document.getElementById("modal-expense-slip-no");

    App.Budget.upsertBudgetExpense({
      id: document.getElementById("modal-expense-id").value || undefined,
      date: date,
      paidDate: date,
      amount: amount,
      payer: document.getElementById("modal-expense-payer").value,
      slipNo: slipEl ? String(slipEl.value || "").trim() : "",
      recordIds: selectedRecordIds,
      inventoryLogIds: selectedInventoryLogIds,
      breakdown: breakdown,
    });

    if (App.Navigation) App.Navigation.closeModal("modal-expense");
    renderRecordList();
    renderReceiptList();
  }

  // ================================================================
  // ---- 支払履歴モーダル ----
  // ================================================================

  function openPayHistoryModal(recId) {
    if (!recId || !App.Budget) return;

    const allExpenses = App.Budget.listBudgetExpense();
    const rec = get(recId);
    if (!rec) return;

    const recCost = calcRecordCost(rec).total;
    const expenses = allExpenses.filter(function (e) {
      return (e.recordIds || []).map(String).includes(String(recId));
    });

    // ---- モーダルがなければ動的生成 ----
    let modal = document.getElementById("modal-pay-history");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-pay-history";
      modal.className = "modal-overlay";
      modal = document.createElement("div");
      modal.id = "modal-pay-history";
      // modal-overlay クラスは使わず、インラインスタイルで確実に制御
      modal.style.cssText =
        "position:fixed; inset:0; background:rgba(0,0,0,0.6);" +
        "display:none; align-items:center; justify-content:center; z-index:9999;";
      modal.innerHTML =
        "<div style='background:var(--surface-color,#1e293b); border-radius:10px;" +
        " width:90%; max-width:520px; max-height:80vh;" +
        " display:flex; flex-direction:column; overflow:hidden;'>" +
        "<div style='display:flex; justify-content:space-between; align-items:center;" +
        " padding:14px 20px; border-bottom:1px solid #334155;'>" +
        "<h3 id='modal-pay-history-title'" +
        " style='margin:0; font-size:15px; color:var(--text-color,#f1f5f9);'>支払履歴</h3>" +
        "<button id='btn-close-pay-history'" +
        " style='background:none; border:none; color:#94a3b8;" +
        " font-size:20px; cursor:pointer; line-height:1;'>✕</button>" +
        "</div>" +
        "<div id='modal-pay-history-body'" +
        " style='overflow-y:auto; padding:16px 20px; flex:1;'></div>" +
        "<div style='padding:12px 20px; border-top:1px solid #334155;" +
        " display:flex; gap:8px; justify-content:flex-end;'>" +
        "<button class='btn-primary' id='btn-pay-history-add'>💵 支払いを追加</button>" +
        "<button class='btn-secondary' id='btn-pay-history-close'>閉じる</button>" +
        "</div>" +
        "</div>";
      document.body.appendChild(modal);
    }

    // ---- 本文を描画 ----
    _renderPayHistoryBody(recId, recCost, expenses);

    // ---- ボタンイベント ----
    const closeBtn = document.getElementById("btn-close-pay-history");
    const closeBtn2 = document.getElementById("btn-pay-history-close");
    const addBtn = document.getElementById("btn-pay-history-add");

    // クローン置換でリスナー重複防止
    [closeBtn, closeBtn2, addBtn].forEach(function (btn) {
      if (!btn) return;
      const nb = btn.cloneNode(true);
      btn.parentNode.replaceChild(nb, btn);
    });

    document
      .getElementById("btn-close-pay-history")
      .addEventListener("click", function () {
        modal.style.display = "none";
      });
    document
      .getElementById("btn-pay-history-close")
      .addEventListener("click", function () {
        modal.style.display = "none";
      });
    document
      .getElementById("btn-pay-history-add")
      .addEventListener("click", function () {
        modal.style.display = "none";
        openExpenseModal(null, recId);
      });

    modal.style.display = "flex";

    // オーバーレイクリックで閉じる
    modal.onclick = function (e) {
      if (e.target === modal) modal.style.display = "none";
    };
  }

  function _renderPayHistoryBody(recId, recCost, expenses) {
    const body = document.getElementById("modal-pay-history-body");
    if (!body) return;

    const yen = function (n) {
      return (+n || 0).toLocaleString();
    };

    // 按分済み支払い合計を取得
    const costResolver = function (r) {
      return calcRecordCost(r).total;
    };
    const paidMap = App.Budget
      ? App.Budget.paidAmountMap(list(), costResolver)
      : {};
    const paidTotal = paidMap[String(recId)] || 0;
    const shortage = recCost - paidTotal;

    let summaryColor = "#4ade80",
      summaryText = "支払完了";
    if (shortage > 0) {
      summaryColor = "#fbbf24";
      summaryText = "残額あり";
    }
    if (shortage < 0) {
      summaryColor = "#f87171";
      summaryText = "過払い";
    }

    let html =
      "<div style='padding:10px 0 14px; border-bottom:1px solid #334155; margin-bottom:14px;'>" +
      "<div style='display:flex; gap:24px; font-size:13px; flex-wrap:wrap;'>" +
      "<div>実績金額: <strong>" +
      yen(recCost) +
      "円</strong></div>" +
      "<div>支払済合計(按分): <strong>" +
      yen(paidTotal) +
      "円</strong></div>" +
      "<div style='color:" +
      summaryColor +
      "; font-weight:700;'>▶ " +
      summaryText +
      (shortage !== 0
        ? "（" +
          (shortage > 0 ? "残 " : "超過 ") +
          yen(Math.abs(shortage)) +
          "円）"
        : "") +
      "</div>" +
      "</div>" +
      "</div>";

    if (!expenses.length) {
      html += "<p class='hint'>支払い記録がありません。</p>";
    } else {
      html +=
        "<table class='data-table' style='font-size:12px; width:100%;'>" +
        "<thead><tr>" +
        "<th>支払日</th><th>金額</th><th>支払者</th><th>領収書No</th><th>操作</th>" +
        "</tr></thead><tbody>";

      expenses.forEach(function (exp) {
        html +=
          "<tr>" +
          "<td>" +
          Utils.esc(exp.date || "") +
          "</td>" +
          "<td>" +
          yen(exp.amount) +
          "円</td>" +
          "<td>" +
          Utils.esc(exp.payer || "") +
          "</td>" +
          "<td>" +
          Utils.esc(exp.slipNo || "") +
          "</td>" +
          "<td style='white-space:nowrap;'>" +
          "<button class='btn-edit btn-sm' data-ph-edit='" +
          exp.id +
          "'" +
          " data-rec-id='" +
          recId +
          "'>✏️ 編集</button> " +
          "<button class='btn-del btn-sm' data-ph-del='" +
          exp.id +
          "'" +
          " data-rec-id='" +
          recId +
          "'>削除</button>" +
          "</td>" +
          "</tr>";
      });

      html += "</tbody></table>";
    }

    body.innerHTML = html;

    // ---- 編集ボタン ----
    body.querySelectorAll("[data-ph-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.getElementById("modal-pay-history").style.display = "none";
        openExpenseModal(btn.dataset.phEdit);
      });
    });

    // ---- 削除ボタン ----
    body.querySelectorAll("[data-ph-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("この支払い記録を削除しますか？")) return;
        App.Budget.removeBudgetExpense(btn.dataset.phDel);
        const remaining = App.Budget.listBudgetExpense().filter(function (e) {
          return (e.recordIds || [])
            .map(String)
            .includes(String(btn.dataset.recId));
        });
        const targetRec = list().find(function (r) {
          return String(r.id) === String(btn.dataset.recId);
        });
        const targetCost = targetRec ? calcRecordCost(targetRec).total : 0;
        _renderPayHistoryBody(btn.dataset.recId, targetCost, remaining);
        renderRecordList();
      });
    });
  }

  // ================================================================
  // ---- 後方互換用（他モジュールから呼ばれる可能性があるもの） ----
  // ================================================================

  function renderWorkList() {
    renderRecordList();
  }
  function renderExpenseList() {
    renderRecordList();
  }

  // ================================================================
  // ---- Public API ----
  // ================================================================

  return {
    list: list,
    get: get,
    upsert: upsert,
    remove: remove,
    monthly: monthly,
    calcRecordCost: calcRecordCost,
    getMemberPayMap: getMemberPayMap,
    render: render,
    renderWorkList: renderWorkList,
    renderExpenseList: renderExpenseList,
    openRecModal: openRecModal,
  };
})();
