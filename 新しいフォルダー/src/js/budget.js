/* =====================================================================
   budget.js ― 予算管理モジュール (サブタブ対応・編集機能・執行計画額管理)
   ===================================================================== */

window.App = window.App || {};

App.Budget = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;

  // ---- データアクセス ----
  function getBudget() {
    const b = Storage.getBudget();
    return {
      amount: +b.amount || 0,
      approvedAmount: +b.approvedAmount || +b.amount || 0,
      planByPeriod: b.planByPeriod || { 1: 0, 2: 0, 3: 0 },
    };
  }
  function setBudgetAmount(amount) {
    const b = Storage.getBudget();
    const approvedAmount = +amount || 0;
    const next = Object.assign({}, b, {
      amount: approvedAmount,
      approvedAmount: approvedAmount,
    });
    Storage.setBudget(next);
    return next;
  }
  function getPlanByPeriod() {
    return getBudget().planByPeriod;
  }
  function setPlanByPeriod(planObj) {
    const b = Storage.getBudget();
    const planByPeriod = {
      1: +(planObj && planObj[1]) || 0,
      2: +(planObj && planObj[2]) || 0,
      3: +(planObj && planObj[3]) || 0,
    };
    const next = Object.assign({}, b, { planByPeriod: planByPeriod });
    Storage.setBudget(next);
    return planByPeriod;
  }

  function listGrantFlow() {
    const d = Storage.getGrantFlow();
    return (Array.isArray(d.entries) ? d.entries.map(normalizeGrant) : []).sort(
      function (a, b) {
        return String(a.date).localeCompare(String(b.date));
      },
    );
  }
  function upsertGrantFlow(entry) {
    const d = Storage.getGrantFlow();
    const entries = Array.isArray(d.entries) ? d.entries.slice() : [];
    const n = normalizeGrant(entry);
    const idx = entries.findIndex(function (x) {
      return x.id === n.id;
    });
    if (idx >= 0) entries[idx] = n;
    else entries.push(n);
    Storage.setGrantFlow({ entries: entries });
    return n;
  }
  function removeGrantFlow(id) {
    const d = Storage.getGrantFlow();
    const entries = (d.entries || []).filter(function (x) {
      return x.id !== id;
    });
    Storage.setGrantFlow({ entries: entries });
    return entries;
  }

  function listBudgetExpense() {
    return (Storage.getBudgetExpense() || [])
      .map(normalizeExpense)
      .sort(function (a, b) {
        return String(a.paidDate || a.date).localeCompare(
          String(b.paidDate || b.date),
        );
      });
  }
  function upsertBudgetExpense(row) {
    const rows = listBudgetExpense();
    const n = normalizeExpense(row);
    const idx = rows.findIndex(function (x) {
      return x.id === n.id;
    });
    if (idx >= 0) rows[idx] = n;
    else rows.push(n);
    const savedRows = saveBudgetExpenses(rows);
    return savedRows.find(function (x) {
      return x.id === n.id;
    });
  }
  function removeBudgetExpense(id) {
    const rows = listBudgetExpense().filter(function (x) {
      return x.id !== id;
    });

    saveBudgetExpenses(rows);

    // 紐付く物品購入ログの slipNo をクリア
    const allLogs = Storage.getInvLog() || [];
    const logsToUpdate = allLogs.map(function (log) {
      const updatedSlipNo = rows.some(function (exp) {
        return (exp.inventoryLogIds || []).includes(log.id);
      })
        ? log.slipNo
        : "";
      return Object.assign({}, log, { slipNo: updatedSlipNo });
    });

    Storage.setInvLog(logsToUpdate);

    return rows;
  }
  function totalExpenseAmount() {
    return listBudgetExpense().reduce(function (s, r) {
      return s + r.amount;
    }, 0);
  }
  function paidAmountMap(records, costResolver, expenseFilter) {
    const recMap = {};
    (records || []).forEach(function (r) {
      recMap[String(r.id)] = r;
    });

    const out = {};
    listBudgetExpense().forEach(function (row) {
      if (expenseFilter && !expenseFilter(row)) return;
      const ids = (row.recordIds || []).map(String);
      if (!ids.length) return;

      // ★ breakdownがあれば費目合計を直接使用
      if (row.breakdown) {
        ids.forEach(function (id) {
          const bd = row.breakdown[id];
          if (!bd) return;
          const paid = (+bd.jinken || 0) + (+bd.yousen || 0) + (+bd.kotsu || 0);
          out[id] = (out[id] || 0) + paid;
        });
        return;
      }

      // ★ breakdownなし（旧データ）：従来のコスト比按分
      if (ids.length === 1) {
        out[ids[0]] = (out[ids[0]] || 0) + row.amount;
        return;
      }
      const ws = ids.map(function (id) {
        return recMap[id] && costResolver ? +costResolver(recMap[id]) || 0 : 0;
      });
      const tw = Utils.sum(ws);
      ids.forEach(function (id, i) {
        const share =
          tw > 0 ? (row.amount * ws[i]) / tw : row.amount / ids.length;
        out[id] = (out[id] || 0) + share;
      });
    });
    return out;
  }

  // ---- 正規化 ----
  function normalizeGrant(e) {
    let type = String((e && (e.type || e.stage)) || "council_to_org");
    if (type === "councilToOrg") type = "council_to_org";
    if (type === "orgToJfa") type = "org_to_jfa";
    return {
      id: String((e && e.id) || "").trim() || Utils.makeId("grant"),
      type: type,
      stage: type,
      date: String((e && e.date) || "").trim(),
      amount: +e.amount || 0,
    };
  }
  function normalizeExpense(r) {
    const paidDate = String((r && r.paidDate) || "").trim();
    const date = String((r && (r.date || r.paidDate)) || "").trim();
    const slipNo = String((r && r.slipNo) || r.receiptNo || "").trim();

    return {
      id: String((r && r.id) || "").trim() || Utils.makeId("expense"),
      date: date,
      paidDate: paidDate,
      amount: +r.amount || 0,
      payer: String((r && r.payer) || "").trim(),
      recordIds: (r && Array.isArray(r.recordIds) ? r.recordIds : [])
        .map(String)
        .filter(Boolean),
      inventoryLogIds: (r && Array.isArray(r.inventoryLogIds)
        ? r.inventoryLogIds
        : []
      )
        .map(String)
        .filter(Boolean),
      slipNo: slipNo,
      breakdown:
        r &&
        r.breakdown &&
        typeof r.breakdown === "object" &&
        !Array.isArray(r.breakdown)
          ? Object.keys(r.breakdown).reduce(function (result, id) {
              const item = r.breakdown[id];
              if (!item || typeof item !== "object") return result;
              result[id] = {
                jinken: Number(item.jinken) || 0,
                yousen: Number(item.yousen) || 0,
                kotsu: Number(item.kotsu) || 0,
              };
              return result;
            }, {})
          : null,
    };
  }

  function saveBudgetExpenses(rows) {
    const sorted = (rows || []).map(normalizeExpense).sort(function (a, b) {
      const dateOrder = String(a.paidDate || a.date).localeCompare(
        String(b.paidDate || b.date),
      );
      return dateOrder || String(a.id).localeCompare(String(b.id));
    });

    sorted.forEach(function (row, index) {
      row.slipNo = "領収書-" + (index + 1);
    });

    Storage.setBudgetExpense(sorted);
    syncInventorySlipNos(sorted);

    return sorted;
  }

  function syncInventorySlipNos(expenses) {
    if (!Storage.getInvLog || !Storage.setInvLog) return;
    const logs = Storage.getInvLog() || [];
    const slipByLogId = {};
    (expenses || []).forEach(function (exp) {
      (exp.inventoryLogIds || []).forEach(function (logId) {
        if (!slipByLogId[String(logId)]) {
          slipByLogId[String(logId)] = exp.slipNo || "";
        }
      });
    });
    const nextLogs = logs.map(function (log) {
      const slipNo = slipByLogId[String(log.id)] || "";
      return Object.assign({}, log, { slipNo: slipNo });
    });
    Storage.setInvLog(nextLogs);
  }

  // ---- render ----
  function render() {
    saveBudgetExpenses(Storage.getBudgetExpense() || []);
    renderGrantList();
    const amtEl = document.getElementById("budget-amount");
    if (amtEl) {
      amtEl.value = getBudget().amount || "";
    }
    const btnSave = document.getElementById("btn-save-budget");
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", function () {
        const v = +amtEl.value || 0;
        setBudgetAmount(v);
        alert("採択予算額を保存しました ✓");
      });
    }

    // 期別執行計画額
    const plan1El = document.getElementById("budget-plan1");
    const plan2El = document.getElementById("budget-plan2");
    const plan3El = document.getElementById("budget-plan3");
    const plans = getPlanByPeriod();
    if (plan1El) plan1El.value = plans[1] || 0;
    if (plan2El) plan2El.value = plans[2] || 0;
    if (plan3El) plan3El.value = plans[3] || 0;

    const btnSavePlans = document.getElementById("btn-save-plan-periods");
    if (btnSavePlans && !btnSavePlans.dataset.bound) {
      btnSavePlans.dataset.bound = "1";
      btnSavePlans.addEventListener("click", function () {
        setPlanByPeriod({
          1: +plan1El.value || 0,
          2: +plan2El.value || 0,
          3: +plan3El.value || 0,
        });
        alert("期別執行計画額を保存しました ✓");
      });
    }

    bindGrantModal();
  }

  function renderGrantList() {
    const container = document.getElementById("budget-grant-list");
    if (!container) return;
    const yen = function (n) {
      return (n || 0).toLocaleString();
    };
    const stageLabel = {
      council_to_org: "協議会 → 組織",
      org_to_jfa: "組織 → 漁協（立替者）",
      councilToOrg: "協議会 → 組織",
    };
    const rows = listGrantFlow();
    let html =
      "<table class='data-table' style='margin-bottom:4px;'>" +
      "<thead><tr><th>受領日</th><th>区分</th><th>金額（税込）</th><th>操作</th></tr></thead><tbody>";
    if (!rows.length) {
      html +=
        "<tr><td colspan='4'><div class='guide-empty compact'>" +
        "<strong>交付金収受の記録はまだありません。</strong>" +
        "<span>交付金を受領したら、受領日・区分・金額を登録します。</span>" +
        "<button type='button' class='btn-primary btn-sm' data-guide-trigger='btn-open-grant-modal'>収受を登録</button>" +
        "</div></td></tr>";
    } else {
      rows.forEach(function (g) {
        html +=
          "<tr>" +
          "<td>" +
          Utils.esc(g.date) +
          "</td>" +
          "<td>" +
          (stageLabel[g.type || g.stage] || g.type || g.stage) +
          "</td>" +
          "<td>" +
          yen(g.amount) +
          " 円</td>" +
          "<td>" +
          "<button class='btn-edit' data-edit-grant='" +
          g.id +
          "'>✏️ 編集</button> " +
          "<button class='btn-del' data-del-grant='" +
          g.id +
          "'>削除</button>" +
          "</td></tr>";
      });
    }
    html += "</tbody></table>";
    container.innerHTML = html;

    container.querySelectorAll("[data-edit-grant]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openGrantModal(btn.dataset.editGrant);
      });
    });
    container.querySelectorAll("[data-del-grant]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (confirm("この収受記録を削除しますか？")) {
          removeGrantFlow(btn.dataset.delGrant);
          renderGrantList();
        }
      });
    });
  }

  function bindGrantModal() {
    const btnOpen = document.getElementById("btn-open-grant-modal");
    if (btnOpen && !btnOpen.dataset.bound) {
      btnOpen.dataset.bound = "1";
      btnOpen.addEventListener("click", function () {
        openGrantModal(null);
      });
    }
    const btnSave = document.getElementById("btn-save-grant-modal");
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", saveGrantModal);
    }
  }

  function openGrantModal(id) {
    const Nav = App.Navigation;
    document.getElementById("modal-grant-title").textContent = id
      ? "交付金収受の編集"
      : "交付金収受の登録";
    document.getElementById("modal-grant-id").value = id || "";
    if (id) {
      const g = listGrantFlow().find(function (x) {
        return x.id === id;
      });
      if (g) {
        document.getElementById("modal-grant-date").value = g.date;
        document.getElementById("modal-grant-stage").value = g.type || g.stage;
        document.getElementById("modal-grant-amount").value = g.amount;
      }
    } else {
      document.getElementById("modal-grant-date").value = Utils.todayStr();
      document.getElementById("modal-grant-stage").value = "council_to_org";
      document.getElementById("modal-grant-amount").value = 0;
    }
    if (Nav) Nav.openModal("modal-grant");
  }

  function saveGrantModal() {
    const id = document.getElementById("modal-grant-id").value;
    const date = document.getElementById("modal-grant-date").value;
    const stage = document.getElementById("modal-grant-stage").value;
    const amount = +document.getElementById("modal-grant-amount").value || 0;
    if (!date || !amount) {
      alert("日付と金額を入力してください。");
      return;
    }
    upsertGrantFlow({
      id: id || undefined,
      date: date,
      type: stage,
      stage: stage,
      amount: amount,
    });
    if (App.Navigation) App.Navigation.closeModal("modal-grant");
    renderGrantList();
  }

  return {
    getBudget: getBudget,
    setBudgetAmount: setBudgetAmount,
    getPlanByPeriod: getPlanByPeriod,
    setPlanByPeriod: setPlanByPeriod,
    listGrantFlow: listGrantFlow,
    upsertGrantFlow: upsertGrantFlow,
    removeGrantFlow: removeGrantFlow,
    listBudgetExpense: listBudgetExpense,
    upsertBudgetExpense: upsertBudgetExpense,
    removeBudgetExpense: removeBudgetExpense,
    totalExpenseAmount: totalExpenseAmount,
    paidAmountMap: paidAmountMap,
    render: render,
    renderGrantList: renderGrantList,
  };
})();
