/* =====================================================================
   tideRecord.js ― 潮位・作業記録モジュール (モーダル化・編集機能付き)
   ===================================================================== */

window.App = window.App || {};

App.TideRecord = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils   = App.Utils;

  function list() { return (Storage.getTideRecord() || []).map(normalize); }
  function upsert(row) {
    const rows = list();
    const n = enrichWithTideInfo(normalize(row));
    const i = rows.findIndex(function(x){ return x.id === n.id; });
    if (i >= 0) rows[i] = n; else rows.push(n);
    Storage.setTideRecord(rows);
    return n;
  }
  function remove(id) {
    Storage.setTideRecord(list().filter(function(x){ return x.id !== id; }));
  }

  function normalize(row) {
    return {
      id:          String(row && row.id || "").trim() || Utils.makeId("tide-rec"),
      date:        String(row && row.date || "").trim(),
      startTime:   String(row && row.startTime || "").trim(),
      endTime:     String(row && row.endTime || "").trim(),
      areaId:      String(row && row.areaId || "").trim(),
      location:    String(row && row.location || "").trim(),
      content:     String(row && row.content || "").trim(),
      operability: String(row && row.operability || "").trim(),
      note:        String(row && row.note || "").trim(),
      tideLevel:   row && row.tideLevel !== undefined ? row.tideLevel : null,
      tideName:    String(row && row.tideName || "").trim(),
      tideStatus:  String(row && row.tideStatus || "").trim()
    };
  }
  function enrichWithTideInfo(row) {
    if (!App.TideData || typeof App.TideData.lookup !== "function") return row;
    const lk = App.TideData.lookup(row.date, row.startTime, row.endTime);
    const tideName = App.TideData.getTideName ? App.TideData.getTideName(row.date) : "";
    let tideStatus = row.tideStatus;
    if (lk.start !== null && lk.end !== null) {
      tideStatus = lk.end > lk.start + 3 ? "上げ潮" : lk.end < lk.start - 3 ? "下げ潮" : "潮止まり付近";
    }
    return Object.assign({}, row, { tideLevel: lk.min, tideName: tideName || row.tideName, tideStatus: tideStatus });
  }

  // ---- render ----
  function render() {
    renderList();
    bindModal();
  }

  function renderList() {
    const el = document.getElementById("tide-summary");
    if (!el) return;
    const records = list().sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
    const areas = Storage.getAreas ? Storage.getAreas() : [];
    const areaMap = {};
    areas.forEach(function(a){ areaMap[a.id] = a.name; });

    if (!records.length) {
      el.innerHTML = "<p class='hint'>潮位・作業記録がありません。</p>"; return;
    }
    let html = "<table class='data-table'><thead><tr><th>日付</th><th>時刻</th><th>地区</th><th>場所</th><th>潮位</th><th>潮況</th><th>作業可否</th><th>備考</th><th>操作</th></tr></thead><tbody>";
    records.forEach(function(r) {
      html += "<tr>"
        + "<td>" + Utils.esc(r.date) + "</td>"
        + "<td>" + Utils.esc(r.startTime) + " ～ " + Utils.esc(r.endTime) + "</td>"
        + "<td>" + Utils.esc(areaMap[r.areaId] || r.areaId) + "</td>"
        + "<td>" + Utils.esc(r.location) + "</td>"
        + "<td>" + (r.tideLevel != null ? r.tideLevel + " cm" : "—") + "</td>"
        + "<td>" + Utils.esc(r.tideStatus) + "</td>"
        + "<td>" + Utils.esc(r.operability) + "</td>"
        + "<td style='max-width:150px; text-align:left;'>" + Utils.esc(r.note) + "</td>"
        + "<td>"
        + "<button class='btn-edit' data-edit-tide='" + r.id + "'>✏️ 編集</button> "
        + "<button class='btn-del' data-del-tide='" + r.id + "'>削除</button>"
        + "</td></tr>";
    });
    el.innerHTML = html + "</tbody></table>";

    el.querySelectorAll("[data-edit-tide]").forEach(function(btn) {
      btn.addEventListener("click", function(){ openModal(btn.dataset.editTide); });
    });
    el.querySelectorAll("[data-del-tide]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (confirm("この記録を削除しますか？")) { remove(btn.dataset.delTide); renderList(); }
      });
    });
  }

  function buildAreaOptions(selectedId) {
    const areas = Storage.getAreas ? Storage.getAreas() : [];
    let html = "<option value=''>地区を選択...</option>";
    areas.forEach(function(a) {
      html += "<option value='" + a.id + "'" + (a.id === selectedId ? " selected" : "") + ">" + Utils.esc(a.name) + "</option>";
    });
    return html;
  }

  function bindModal() {
    const btnOpen = document.getElementById("btn-open-tide-modal");
    if (btnOpen && !btnOpen.dataset.bound) {
      btnOpen.dataset.bound = "1";
      btnOpen.addEventListener("click", function(){ openModal(null); });
    }
    const btnSave = document.getElementById("btn-save-tide-modal");
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", saveModal);
    }
  }

  function openModal(id) {
    document.getElementById("modal-tide-title").textContent = id ? "潮位・作業記録の編集" : "潮位・作業記録の追加";
    document.getElementById("modal-tide-id").value = id || "";
    const areaEl = document.getElementById("modal-tide-area");

    if (id) {
      const r = list().find(function(x){ return x.id === id; }) || {};
      if (areaEl) areaEl.innerHTML = buildAreaOptions(r.areaId);
      document.getElementById("modal-tide-date").value     = r.date || "";
      document.getElementById("modal-tide-location").value = r.location || "";
      document.getElementById("modal-tide-start").value    = r.startTime || "";
      document.getElementById("modal-tide-end").value      = r.endTime || "";
      document.getElementById("modal-tide-oper").value     = r.operability || "";
      document.getElementById("modal-tide-note").value     = r.note || "";
    } else {
      if (areaEl) areaEl.innerHTML = buildAreaOptions(null);
      document.getElementById("modal-tide-date").value     = Utils.todayStr();
      document.getElementById("modal-tide-location").value = "";
      document.getElementById("modal-tide-start").value    = "";
      document.getElementById("modal-tide-end").value      = "";
      document.getElementById("modal-tide-oper").value     = "";
      document.getElementById("modal-tide-note").value     = "";
    }
    if (App.Navigation) App.Navigation.openModal("modal-tide");
  }

  function saveModal() {
    const date = document.getElementById("modal-tide-date").value;
    if (!date) { alert("日付を入力してください。"); return; }
    upsert({
      id:          document.getElementById("modal-tide-id").value || undefined,
      date:        date,
      areaId:      document.getElementById("modal-tide-area").value,
      location:    document.getElementById("modal-tide-location").value,
      startTime:   document.getElementById("modal-tide-start").value,
      endTime:     document.getElementById("modal-tide-end").value,
      operability: document.getElementById("modal-tide-oper").value,
      note:        document.getElementById("modal-tide-note").value
    });
    if (App.Navigation) App.Navigation.closeModal("modal-tide");
    renderList();
  }

  return {
    list: list, upsert: upsert, remove: remove,
    render: render, renderList: renderList, openModal: openModal
  };
})();
