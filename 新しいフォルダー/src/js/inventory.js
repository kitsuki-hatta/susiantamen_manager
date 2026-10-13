/* =====================================================================
   inventory.js ― 物品管理モジュール (モーダル化・編集機能付き)
   ===================================================================== */

window.App = window.App || {};

App.Inventory = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;

  // ---- データアクセス ----
  function listItems() {
    return (Storage.getInventory() || []).map(normalizeItem);
  }
  function upsertItem(item) {
    const rows = listItems();
    const n = normalizeItem(item);
    const i = rows.findIndex(function (x) {
      return x.id === n.id;
    });
    if (i >= 0) rows[i] = n;
    else rows.push(n);
    Storage.setInventory(rows);
    return n;
  }
  function removeItem(id) {
    Storage.setInventory(
      listItems().filter(function (x) {
        return x.id !== id;
      }),
    );
  }
  function listLogs() {
    return (Storage.getInvLog() || []).map(normalizeLog).sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
  }
  function addInLog(input) {
    const log = normalizeLog(Object.assign({}, input, { type: "in" }));
    const rows = listLogs();
    rows.push(log);
    Storage.setInvLog(rows);
    applyStock(log, 1);
    return log;
  }
  function upsertLog(input) {
    const rows = listLogs();
    const log = normalizeLog(Object.assign({}, input));
    const i = rows.findIndex(function (x) {
      return x.id === log.id;
    });
    if (i >= 0) {
      applyStock(rows[i], -1);
      rows[i] = log;
    } else rows.push(log);
    Storage.setInvLog(rows);
    applyStock(log, 1);
    return log;
  }
  function removeLog(id) {
    const rows = listLogs();
    const target = rows.find(function (x) {
      return x.id === id;
    });
    if (target) applyStock(target, -1);
    Storage.setInvLog(
      rows.filter(function (x) {
        return x.id !== id;
      }),
    );
  }
  function replaceOutLogsForRecord(recordId, date, usedItems) {
    const tag = "record:" + recordId;
    listLogs()
      .filter(function (r) {
        return r.type === "out" && r.memo === tag;
      })
      .forEach(function (r) {
        removeLog(r.id);
      });
    (usedItems || []).forEach(function (r) {
      upsertLog(
        Object.assign({}, r, {
          type: "out",
          date: date,
          memo: tag,
          source: "record",
        }),
      );
    });
  }
  function getShortageList() {
    return listItems().filter(function (it) {
      return it.category === "shomohin" && it.min > 0 && it.qty <= it.min;
    });
  }
  function purchaseTotal() {
    return listLogs()
      .filter(function (r) {
        return r.type === "in";
      })
      .reduce(function (s, r) {
        return s + (r.totalCost || 0);
      }, 0);
  }
  function purchaseRows() {
    return listLogs().filter(function (r) {
      return r.type === "in";
    });
  }

  function applyStock(log, dir) {
    const rows = listItems();
    const i = rows.findIndex(function (x) {
      return x.id === log.itemId;
    });
    if (i < 0) return;
    const sign = log.type === "in" ? 1 : -1;
    rows[i].qty = Math.max(0, rows[i].qty + sign * (+log.qty || 0) * dir);
    if (log.type === "in" && log.place) rows[i].place = String(log.place);
    Storage.setInventory(rows);
  }

  function normalizeItem(it) {
    return {
      id: String((it && it.id) || "").trim() || Utils.makeId("item"),
      name: String((it && it.name) || "").trim(),
      category: String((it && it.category) || "bihin"),
      qty: +it.qty || 0,
      unit: String((it && it.unit) || ""),
      place: String((it && it.place) || ""),
      min: +it.min || 0,
      memo: String((it && it.memo) || ""),
      budgetUnit: +it.budgetUnit || 0,
    };
  }
  function normalizeLog(lg) {
    const qty = +lg.qty || 0,
      unitPrice = +lg.unitPrice || 0,
      extra = +lg.extraCost || 0;
    return {
      id: String((lg && lg.id) || "").trim() || Utils.makeId("invlog"),
      itemId: String((lg && lg.itemId) || ""),
      itemName: String((lg && lg.itemName) || ""),
      type: lg && lg.type === "out" ? "out" : "in",
      qty: qty,
      date: String((lg && lg.date) || Utils.todayStr()),
      memo: String((lg && lg.memo) || ""),
      source: String((lg && lg.source) || "manual"),
      unitPrice: unitPrice,
      extraCost: extra,
      totalCost: +lg.totalCost || qty * unitPrice + extra,
      place: String((lg && lg.place) || ""),
      receiptNo: String((lg && lg.receiptNo) || ""),
      slipNo: String((lg && lg.slipNo) || ""),
    };
  }

  // ---- render ----
  function render() {
    renderItemList();
    renderLogList();
    bindModals();
  }

  function renderItemList() {
    const el = document.getElementById("inventory-item-list");
    if (!el) return;
    const items = listItems();
    const yen = function (n) {
      return (n || 0).toLocaleString();
    };
    if (!items.length) {
      el.innerHTML =
        "<div class='guide-empty'><strong>物品台帳はまだ空です。</strong>" +
        "<span>活動で使用する備品・消耗品を登録すると、在庫や入出庫を管理できます。</span>" +
        "<button type='button' class='btn-primary btn-sm' data-guide-trigger='btn-open-inv-item-modal'>最初の物品を登録</button></div>";
      return;
    }
    let html =
      "<table class='data-table'><thead><tr><th>品名</th><th>分類</th><th>在庫</th><th>保管場所</th><th>適正発注残</th><th>備考</th><th>操作</th></tr></thead><tbody>";
    items.forEach(function (it) {
      const warn = it.category === "shomohin" && it.min > 0 && it.qty <= it.min;
      html +=
        "<tr class='" +
        (warn ? "row-warn" : "") +
        "'>" +
        "<td>" +
        Utils.esc(it.name) +
        "</td>" +
        "<td>" +
        (it.category === "bihin" ? "備品" : "消耗品") +
        "</td>" +
        "<td><strong>" +
        it.qty +
        " " +
        Utils.esc(it.unit) +
        "</strong>" +
        (warn ? " ⚠️" : "") +
        "</td>" +
        "<td>" +
        Utils.esc(it.place) +
        "</td>" +
        "<td>" +
        (it.min ? it.min + " " + Utils.esc(it.unit) : "—") +
        "</td>" +
        "<td>" +
        Utils.esc(it.memo) +
        "</td>" +
        "<td>" +
        "<button class='btn-edit' data-edit-item='" +
        it.id +
        "'>✏️ 編集</button> " +
        "<button class='btn-del' data-del-item='" +
        it.id +
        "'>削除</button>" +
        "</td></tr>";
    });
    el.innerHTML = html + "</tbody></table>";

    el.querySelectorAll("[data-edit-item]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openItemModal(btn.dataset.editItem);
      });
    });
    el.querySelectorAll("[data-del-item]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const it = listItems().find(function (x) {
          return x.id === btn.dataset.delItem;
        });
        if (
          confirm(
            "「" + (it ? it.name : btn.dataset.delItem) + "」を削除しますか？",
          )
        ) {
          removeItem(btn.dataset.delItem);
          renderItemList();
        }
      });
    });
  }

  function renderLogList() {
    const el = document.getElementById("inventory-log-list");
    if (!el) return;

    const logs = listLogs();
    const yen = function (n) {
      return (n || 0).toLocaleString();
    };

    if (!logs.length) {
      el.innerHTML =
        "<div class='guide-empty'><strong>入出庫の記録はまだありません。</strong>" +
        "<span>物品を登録した後、購入・入庫または活動で使用した数量を記録できます。</span>" +
        (listItems().length
          ? "<button type='button' class='btn-primary btn-sm' data-guide-trigger='btn-open-inv-log-modal'>入庫・購入を登録</button>"
          : "<button type='button' class='btn-outline btn-sm' data-guide-trigger='btn-open-inv-item-modal'>先に物品を登録</button>") +
        "</div>";
      return;
    }

    let html =
      "<table class='data-table'><thead><tr><th>日付</th><th>区分</th><th>品名</th><th>数量</th><th>費用</th><th>件番</th><th>操作</th></tr></thead><tbody>";

    logs.forEach(function (lg) {
      html +=
        "<tr>" +
        "<td>" +
        Utils.esc(lg.date) +
        "</td>" +
        "<td>" +
        (lg.type === "in"
          ? "<span style='color:green;'>入庫</span>"
          : "<span style='color:#2980b9;'>出庫</span>") +
        "</td>" +
        "<td>" +
        Utils.esc(lg.itemName) +
        "</td>" +
        "<td>" +
        lg.qty +
        "</td>" +
        "<td>" +
        (lg.type === "in" ? yen(lg.totalCost) + " 円" : "—") +
        "</td>" +
        "<td>" +
        Utils.esc(lg.slipNo || lg.receiptNo || "") +
        "</td>" +
        "<td>" +
        "<button class='btn-edit' data-edit-log='" +
        lg.id +
        "'>✏️ 編集</button> " +
        "<button class='btn-del' data-del-log='" +
        lg.id +
        "'>削除</button>" +
        "</td></tr>";
    });

    el.innerHTML = html + "</tbody></table>";

    el.querySelectorAll("[data-edit-log]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openLogModal(btn.dataset.editLog);
      });
    });

    el.querySelectorAll("[data-del-log]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (confirm("このログを削除しますか？")) {
          removeLog(btn.dataset.delLog);
          renderItemList();
          renderLogList();
          if (App.Record && App.Record.renderExpenseList) {
            App.Record.renderExpenseList();
          }
        }
      });
    });
  }

  function buildItemOptions(selectedId) {
    const items = listItems();
    let html = "<option value=''>物品を選択...</option>";
    items.forEach(function (it) {
      html +=
        "<option value='" +
        it.id +
        "'" +
        (it.id === selectedId ? " selected" : "") +
        ">" +
        Utils.esc(it.name) +
        " (現在:" +
        it.qty +
        it.unit +
        ")</option>";
    });
    return html;
  }

  function bindModals() {
    const btnItem = document.getElementById("btn-open-inv-item-modal");
    if (btnItem && !btnItem.dataset.bound) {
      btnItem.dataset.bound = "1";
      btnItem.addEventListener("click", function () {
        openItemModal(null);
      });
    }
    const btnSaveItem = document.getElementById("btn-save-inv-item-modal");
    if (btnSaveItem && !btnSaveItem.dataset.bound) {
      btnSaveItem.dataset.bound = "1";
      btnSaveItem.addEventListener("click", saveItemModal);
    }

    const btnLog = document.getElementById("btn-open-inv-log-modal");
    if (btnLog && !btnLog.dataset.bound) {
      btnLog.dataset.bound = "1";
      btnLog.addEventListener("click", function () {
        openLogModal(null);
      });
    }
    const btnSaveLog = document.getElementById("btn-save-inv-log-modal");
    if (btnSaveLog && !btnSaveLog.dataset.bound) {
      btnSaveLog.dataset.bound = "1";
      btnSaveLog.addEventListener("click", saveLogModal);
    }
  }

  function openItemModal(id) {
    document.getElementById("modal-inv-item-title").textContent = id
      ? "物品の編集"
      : "物品を登録";
    document.getElementById("modal-inv-item-id").value = id || "";
    if (id) {
      const it =
        listItems().find(function (x) {
          return x.id === id;
        }) || {};
      document.getElementById("modal-inv-item-name").value = it.name || "";
      document.getElementById("modal-inv-item-cat").value =
        it.category || "bihin";
      document.getElementById("modal-inv-item-qty").value = it.qty || 0;
      document.getElementById("modal-inv-item-unit").value = it.unit || "";
      document.getElementById("modal-inv-item-place").value = it.place || "";
      document.getElementById("modal-inv-item-min").value = it.min || 0;
      document.getElementById("modal-inv-item-memo").value = it.memo || "";
    } else {
      ["name", "cat", "qty", "unit", "place", "min", "memo"].forEach(
        function (k) {
          const el = document.getElementById("modal-inv-item-" + k);
          if (el) el.value = k === "qty" || k === "min" ? 0 : "";
        },
      );
    }
    if (App.Navigation) App.Navigation.openModal("modal-inv-item");
  }
  function saveItemModal() {
    const name = document.getElementById("modal-inv-item-name").value.trim();
    if (!name) {
      alert("品名を入力してください。");
      return;
    }
    const id = document.getElementById("modal-inv-item-id").value;
    upsertItem({
      id: id || undefined,
      name: name,
      category: document.getElementById("modal-inv-item-cat").value,
      qty: +document.getElementById("modal-inv-item-qty").value || 0,
      unit: document.getElementById("modal-inv-item-unit").value,
      place: document.getElementById("modal-inv-item-place").value,
      min: +document.getElementById("modal-inv-item-min").value || 0,
      memo: document.getElementById("modal-inv-item-memo").value,
    });
    if (App.Navigation) App.Navigation.closeModal("modal-inv-item");
    renderItemList();
  }

  function openLogModal(id) {
    const sel = document.getElementById("modal-inv-log-item");
    if (sel) sel.innerHTML = buildItemOptions(null);

    document.getElementById("modal-inv-log-title").textContent = id
      ? "入庫記録の編集"
      : "入庫・購入を登録";
    document.getElementById("modal-inv-log-id").value = id || "";

    if (id) {
      const lg =
        listLogs().find(function (x) {
          return x.id === id;
        }) || {};

      if (sel) sel.value = lg.itemId || "";
      document.getElementById("modal-inv-log-date").value = lg.date || "";
      document.getElementById("modal-inv-log-qty").value = lg.qty || 1;
      document.getElementById("modal-inv-log-price").value = lg.unitPrice || 0;
      document.getElementById("modal-inv-log-extra").value = lg.extraCost || 0;
      document.getElementById("modal-inv-log-receipt").value =
        lg.receiptNo || "";
      const slipEl = document.getElementById("modal-inv-log-slip");
      if (slipEl) slipEl.value = lg.slipNo || "";
    } else {
      document.getElementById("modal-inv-log-date").value = Utils.todayStr();
      document.getElementById("modal-inv-log-qty").value = 1;
      document.getElementById("modal-inv-log-price").value = 0;
      document.getElementById("modal-inv-log-extra").value = 0;
      document.getElementById("modal-inv-log-receipt").value = "";
      const slipEl = document.getElementById("modal-inv-log-slip");
      if (slipEl) slipEl.value = "";
    }

    if (App.Navigation) App.Navigation.openModal("modal-inv-log");
  }

  function saveLogModal() {
    const itemId = document.getElementById("modal-inv-log-item").value;
    const date = document.getElementById("modal-inv-log-date").value;
    const qty = +document.getElementById("modal-inv-log-qty").value || 0;

    if (!itemId || !date || qty <= 0) {
      alert("物品・日付・数量を入力してください。");
      return;
    }

    const id = document.getElementById("modal-inv-log-id").value;
    const item =
      listItems().find(function (x) {
        return x.id === itemId;
      }) || {};

    const price = +document.getElementById("modal-inv-log-price").value || 0;
    const extra = +document.getElementById("modal-inv-log-extra").value || 0;

    const receiptNo = (
      document.getElementById("modal-inv-log-receipt").value || ""
    ).trim();
    const slipEl = document.getElementById("modal-inv-log-slip");
    const slipNo = slipEl ? String(slipEl.value || "").trim() : "";

    upsertLog({
      id: id || undefined,
      type: "in",
      itemId: itemId,
      itemName: item.name || "",
      date: date,
      qty: qty,
      unitPrice: price,
      extraCost: extra,
      totalCost: qty * price + extra,
      receiptNo: receiptNo,
      slipNo: slipNo,
    });

    if (App.Navigation) App.Navigation.closeModal("modal-inv-log");
    renderItemList();
    renderLogList();
    if (App.Record && App.Record.renderExpenseList)
      App.Record.renderExpenseList();
  }

  return {
    listItems: listItems,
    upsertItem: upsertItem,
    removeItem: removeItem,
    listLogs: listLogs,
    addInLog: addInLog,
    upsertLog: upsertLog,
    removeLog: removeLog,
    replaceOutLogsForRecord: replaceOutLogsForRecord,
    getShortageList: getShortageList,
    purchaseTotal: purchaseTotal,
    purchaseRows: purchaseRows,
    render: render,
    renderItemList: renderItemList,
    renderLogList: renderLogList,
  };
})();
