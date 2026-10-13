/* =====================================================================
   master.js ― 組織マスタ管理モジュール (モーダル化・活動項目カテゴリー選択・市町村マスタ・潮位データ取込)
   ===================================================================== */

window.App = window.App || {};

App.Master = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;
  const listeners = [];

  const MUNICIPALITIES = [
    { code: "44201", name: "大分市", lat: 33.2382, lng: 131.6126 },
    { code: "44202", name: "別府市", lat: 33.2846, lng: 131.4912 },
    { code: "44203", name: "中津市", lat: 33.5983, lng: 131.1883 },
    { code: "44204", name: "日田市", lat: 33.3213, lng: 130.9409 },
    { code: "44205", name: "佐伯市", lat: 32.9601, lng: 131.9004 },
    { code: "44206", name: "臼杵市", lat: 33.1261, lng: 131.8049 },
    { code: "44207", name: "津久見市", lat: 33.0722, lng: 131.8687 },
    { code: "44208", name: "竹田市", lat: 32.9725, lng: 131.3929 },
    { code: "44209", name: "豊後高田市", lat: 33.5606, lng: 131.4428 },
    { code: "44210", name: "杵築市", lat: 33.4144, lng: 131.6169 },
    { code: "44211", name: "宇佐市", lat: 33.5317, lng: 131.3524 },
    { code: "44212", name: "豊後大野市", lat: 32.9786, lng: 131.5833 },
    { code: "44213", name: "由布市", lat: 33.1783, lng: 131.4642 },
    { code: "44214", name: "国東市", lat: 33.5661, lng: 131.7303 },
    { code: "44322", name: "姫島村", lat: 33.7225, lng: 131.6644 },
    { code: "44341", name: "日出町", lat: 33.3672, lng: 131.5327 },
    { code: "44461", name: "九重町", lat: 33.2128, lng: 131.1444 },
    { code: "44462", name: "玖珠町", lat: 33.2847, lng: 131.1558 },
  ];

  function onChange(cb) {
    if (typeof cb === "function") listeners.push(cb);
  }
  function notifyChanged() {
    listeners.forEach(function (cb) {
      try {
        cb();
      } catch (e) {}
    });
  }

  // ---- getter / setter ----
  function getOrg() {
    return Storage.getOrg();
  }
  function saveOrg(p) {
    const n = Object.assign({}, getOrg(), p || {});
    Storage.setOrg(n);
    notifyChanged();
    return n;
  }
  function getSettings() {
    return Storage.getSettings();
  }
  function saveSettings(p) {
    const n = Object.assign({}, getSettings(), p || {});
    if (!["daily", "hourly"].includes(n.wageMode)) n.wageMode = "daily";
    if (!(+n.defaultHours > 0)) n.defaultHours = 3.5;
    Storage.setSettings(n);
    notifyChanged();
    return n;
  }
  function getMaster() {
    return Storage.getMaster();
  }
  function saveMaster(p) {
    const n = Object.assign({}, getMaster(), p || {});
    ["wageDaily", "wageHourly", "yousen", "sharyo"].forEach(function (k) {
      n[k] = +n[k] || 0;
    });
    Storage.setMaster(n);
    notifyChanged();
    return n;
  }
  function getAreas() {
    return Storage.getAreas();
  }
  function addArea(area) {
    const areas = getAreas();
    const id = String((area && area.id) || "").trim() || Utils.makeId("area");
    if (
      areas.some(function (x) {
        return x.id === id;
      })
    )
      throw new Error("area id already exists");
    const n = {
      id: id,
      name: String(area.name || "").trim(),
      standardPeople: +area.standardPeople || 0,
      color: area.color || "#16a2b8",
      pattern: area.pattern || "solid",
    };
    if (!n.name) throw new Error("area name is required");
    areas.push(n);
    Storage.setAreas(areas);
    notifyChanged();
    return n;
  }
  function updateArea(id, p) {
    const areas = getAreas();
    const i = areas.findIndex(function (x) {
      return x.id === id;
    });
    if (i < 0) throw new Error("area not found");
    const n = Object.assign({}, areas[i], p || {});
    n.id = id;
    n.name = String(n.name || "").trim();
    n.standardPeople = +n.standardPeople || 0;
    if (!n.name) throw new Error("area name is required");
    areas[i] = n;
    Storage.setAreas(areas);
    notifyChanged();
    return n;
  }
  function removeArea(id) {
    const areas = getAreas().filter(function (x) {
      return x.id !== id;
    });
    Storage.setAreas(areas);
    const m = getMembers();
    delete m[id];
    Storage.setMembers(m);
    notifyChanged();
    return areas;
  }
  function getMembers() {
    return Storage.getMembers();
  }
  function getMembersByArea(id) {
    const m = getMembers();
    return Array.isArray(m[id]) ? m[id].slice() : [];
  }
  function saveMembersByArea(id, names) {
    const m = getMembers();
    m[id] = (names || [])
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean);
    Storage.setMembers(m);
    notifyChanged();
    return m[id];
  }
  function getActivities() {
    const s = Storage.getActivities();
    if (Array.isArray(s) && s.length) return s;
    const d = Storage.getDefaultByKey(Storage.KEYS.activities) || [];
    Storage.setActivities(d);
    return d;
  }
  function setActivityEnabled(code, enabled) {
    const rows = getActivities().map(function (r) {
      return r.code === code ? Object.assign({}, r, { enabled: !!enabled }) : r;
    });
    Storage.setActivities(rows);
    notifyChanged();
    return rows;
  }
  function setActivityStyle(code, color, pattern) {
    const rows = getActivities().map(function (r) {
      return r.code === code
        ? Object.assign({}, r, { color: color, pattern: pattern })
        : r;
    });
    Storage.setActivities(rows);
    notifyChanged();
    return rows;
  }
  function getEnabledActivities() {
    return getActivities().filter(function (r) {
      return !!r.enabled;
    });
  }

  function getMunicipalities() {
    return MUNICIPALITIES.slice();
  }

  // ---- render ----
  function render() {
    renderOrgPanel();
    renderWagePanel();
    renderAreaList();
    renderActivitySummary();
    renderMunicipalitySelect();
    renderTidePanel();
    bindModals();
  }

  // 組織情報パネル
  function renderOrgPanel() {
    const el = document.getElementById("settings-org-info");
    if (!el) return;
    const org = getOrg(),
      s = getSettings();
    const bank = org.bankAccount || {};
    el.innerHTML =
      "<div class='info-grid'>" +
      info("組織名", org.orgName || "（未設定）") +
      info("年度", s.year ? "令和" + s.year + "年度" : "（未設定）") +
      info(
        "代表者名",
        s.councilChairName || s.chairman || org.repName || "（未設定）",
      ) +
      info("1日あたり活動時間", (s.defaultHours || 3.5) + " 時間") +
      info(
        "口座情報",
        [bank.bankName, bank.branchName, bank.accountType, bank.accountNo]
          .filter(Boolean)
          .join(" / ") || "（未設定）",
      ) +
      "</div>";
  }

  // 市町村セレクトボックス & 地図タイルモード
  function renderMunicipalitySelect() {
    const sel = document.getElementById("set-municipality");
    const modeSel = document.getElementById("set-map-tile-mode");
    if (!sel) return;
    const settings = getSettings();
    const current = settings.municipality || {};
    let html = "<option value=''>市町村を選択してください...</option>";
    MUNICIPALITIES.forEach(function (m) {
      html +=
        "<option value='" +
        m.code +
        "'" +
        (m.code === current.code ? " selected" : "") +
        ">" +
        Utils.esc(m.name) +
        "</option>";
    });
    sel.innerHTML = html;
    if (modeSel) modeSel.value = settings.mapTileMode || "online";

    const btnSave = document.getElementById("btn-save-municipality");
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", function () {
        const val = sel.value;
        const target = MUNICIPALITIES.find(function (x) {
          return x.code === val;
        });
        saveSettings({
          municipality: target || null,
          mapTileMode: modeSel ? modeSel.value : "online",
        });
        alert("地図設定を保存しました ✓");
      });
    }

    renderGeoJSONSection();
  }

  // GeoJSON 協定範囲制御
  function renderGeoJSONSection() {
    const settings = getSettings();
    const areaData = settings.activityArea || {};
    const statusMsg = document.getElementById("geojson-status-msg");
    const strokeInput = document.getElementById("set-geojson-stroke");
    const fillInput = document.getElementById("set-geojson-fill");
    const opacityInput = document.getElementById("set-geojson-opacity");

    if (areaData.style) {
      if (strokeInput)
        strokeInput.value = areaData.style.strokeColor || "#0044ff";
      if (fillInput) fillInput.value = areaData.style.fillColor || "#0088ff";
      if (opacityInput) opacityInput.value = areaData.style.opacity || 0.3;
    }

    if (statusMsg) {
      if (areaData.geojson) {
        const type = areaData.geojson.type || "GeoJSON";
        statusMsg.textContent = "✓ 協定範囲GeoJSON登録済み (" + type + ")";
        statusMsg.className = "msg ok";
      } else {
        statusMsg.textContent =
          "未登録（GeoJSONファイルを選択して登録してください）";
        statusMsg.className = "hint";
      }
    }

    // ファイル読込
    const fileInput = document.getElementById("input-geojson-file");
    if (fileInput && !fileInput.dataset.bound) {
      fileInput.dataset.bound = "1";
      fileInput.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          try {
            const parsed = JSON.parse(ev.target.result);
            if (
              !parsed ||
              (parsed.type !== "FeatureCollection" &&
                parsed.type !== "Polygon" &&
                parsed.type !== "MultiPolygon" &&
                parsed.type !== "Feature")
            ) {
              alert(
                "無効なGeoJSONファイルです。(Polygon / MultiPolygon / FeatureCollection形式を想定)",
              );
              fileInput.value = "";
              return;
            }
            const currentSetting = getSettings();
            const currArea = currentSetting.activityArea || {};
            const nextStyle = currArea.style || {
              strokeColor: "#0044ff",
              fillColor: "#0088ff",
              opacity: 0.3,
            };
            saveSettings({
              activityArea: {
                geojson: parsed,
                style: nextStyle,
              },
            });
            alert("協定範囲GeoJSONを取り込みました ✓");
            renderGeoJSONSection();
          } catch (err) {
            alert("GeoJSONファイルのパースに失敗しました: " + err.message);
          }
          fileInput.value = "";
        };
        reader.readAsText(file);
      });
    }

    // スタイル保存
    const btnSaveStyle = document.getElementById("btn-save-geojson-style");
    if (btnSaveStyle && !btnSaveStyle.dataset.bound) {
      btnSaveStyle.dataset.bound = "1";
      btnSaveStyle.addEventListener("click", function () {
        const currentSetting = getSettings();
        const currArea = currentSetting.activityArea || {};
        const stroke = strokeInput ? strokeInput.value : "#0044ff";
        const fill = fillInput ? fillInput.value : "#0088ff";
        const opacity = opacityInput
          ? parseFloat(opacityInput.value) || 0.3
          : 0.3;

        saveSettings({
          activityArea: {
            geojson: currArea.geojson || null,
            style: { strokeColor: stroke, fillColor: fill, opacity: opacity },
          },
        });
        alert("協定範囲スタイルを保存しました ✓");
        renderGeoJSONSection();
      });
    }

    // 削除
    const btnDelete = document.getElementById("btn-delete-geojson");
    if (btnDelete && !btnDelete.dataset.bound) {
      btnDelete.dataset.bound = "1";
      btnDelete.addEventListener("click", function () {
        if (confirm("登録されている協定範囲GeoJSONを削除しますか？")) {
          const currentSetting = getSettings();
          saveSettings({ activityArea: null });
          alert("協定範囲GeoJSONを削除しました");
          renderGeoJSONSection();
        }
      });
    }
  }

  // 単価マスタパネル
  function renderWagePanel() {
    const el = document.getElementById("settings-wage-info");
    if (!el) return;
    const s = getSettings(),
      m = getMaster();
    const modeLabel = s.wageMode === "hourly" ? "時給方式" : "日当方式";
    el.innerHTML =
      "<div class='info-grid'>" +
      info("賃金計算方式", modeLabel) +
      info("日当単価（税込）", fmtYen(m.wageDaily)) +
      info("時給単価（税込）", fmtYen(m.wageHourly)) +
      info("用船料/隻（税込）", fmtYen(m.yousen)) +
      info("車両代/台（税込）", fmtYen(m.sharyo)) +
      "</div>";
  }

  // 地区マスタ一覧
  function renderAreaList() {
    const el = document.getElementById("settings-area-list");
    if (!el) return;
    const areas = getAreas();
    if (!areas.length) {
      el.innerHTML =
        "<p class='hint'>地区が登録されていません。「＋ 地区を追加」ボタンで追加してください。</p>";
      return;
    }
    let html =
      "<table class='data-table'><thead><tr><th>地区名</th><th>表示</th><th>標準人数</th><th>名簿メンバー</th><th>操作</th></tr></thead><tbody>";
    areas.forEach(function (a) {
      const members = getMembersByArea(a.id).join("、") || "未登録";
      html +=
        "<tr>" +
        "<td>" +
        Utils.esc(a.name) +
        "</td>" +
        "<td><span class='cal-badge moba' style='display:inline-block; min-width:56px; text-align:center; background-color:" +
        (a.color || "#16a2b8") +
        ";" +
        patternStyle(a.pattern, a.color || "#16a2b8") +
        "'>" +
        Utils.esc(
          a.pattern === "dot" ? "点" : a.pattern === "stripe" ? "斜線" : "単色",
        ) +
        "</span></td>" +
        "<td>" +
        (a.standardPeople || 0) +
        " 人</td>" +
        "<td style='text-align:left; max-width:300px;'>" +
        Utils.esc(members) +
        "</td>" +
        "<td>" +
        "<button class='btn-edit' data-edit-area='" +
        a.id +
        "'>✏️ 編集</button> " +
        "<button class='btn-del' data-del-area='" +
        a.id +
        "'>削除</button>" +
        "</td></tr>";
    });
    html += "</tbody></table>";
    el.innerHTML = html;

    el.querySelectorAll("[data-edit-area]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openAreaModal(btn.dataset.editArea);
      });
    });
    el.querySelectorAll("[data-del-area]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (
          confirm(
            "「" +
              (
                getAreas().find(function (a) {
                  return a.id === btn.dataset.delArea;
                }) || {}
              ).name +
              "」を削除しますか？",
          )
        ) {
          removeArea(btn.dataset.delArea);
          renderAreaList();
        }
      });
    });
  }

  // 活動項目 有効化サマリー（カテゴリーボタン下の集計表示）
  function renderActivitySummary() {
    const el = document.getElementById("settings-activity-summary");
    if (!el) return;
    const acts = getActivities();
    const mobaEnabled = acts.filter(function (a) {
      return a.category === "moba" && a.enabled;
    }).length;
    const higataEnabled = acts.filter(function (a) {
      return a.category === "higata" && a.enabled;
    }).length;
    let listHtml =
      "<table class='data-table' style='margin-top:12px;'><thead><tr><th>区分</th><th>活動項目</th><th>有効</th><th>表示</th><th>操作</th></tr></thead><tbody>";
    acts.forEach(function (a) {
      listHtml +=
        "<tr>" +
        "<td>" +
        (a.category === "moba" ? "①藻場" : "④干潟") +
        "</td>" +
        "<td style='text-align:left;'>" +
        Utils.esc(a.label) +
        "</td>" +
        "<td>" +
        (a.enabled ? "有効" : "無効") +
        "</td>" +
        "<td><span class='cal-badge " +
        (a.category || "moba") +
        "' style='display:inline-block; min-width:56px; text-align:center; background-color:" +
        (a.color || (a.category === "higata" ? "#e67e22" : "#27ae60")) +
        ";" +
        patternStyle(
          a.pattern,
          a.color || (a.category === "higata" ? "#e67e22" : "#27ae60"),
        ) +
        "'>" +
        Utils.esc(
          a.pattern === "dot" ? "点" : a.pattern === "stripe" ? "斜線" : "単色",
        ) +
        "</span></td>" +
        "<td><button class='btn-edit' data-edit-act='" +
        a.code +
        "'>✏️ 編集</button></td>" +
        "</tr>";
    });
    listHtml += "</tbody></table>";

    el.innerHTML =
      "<div style='display:flex; gap:16px; margin-top:4px;'>" +
      "<div class='card' style='flex:1; margin:0; background:#e8f8ef;'>" +
      "<div style='font-size:12px; color:#666;'>藻場の保全 有効項目</div>" +
      "<div style='font-size:22px; font-weight:bold; color:#27ae60;'>" +
      mobaEnabled +
      " <span style='font-size:12px;'>/ 14 項目</span></div>" +
      "</div>" +
      "<div class='card' style='flex:1; margin:0; background:#fff4e5;'>" +
      "<div style='font-size:12px; color:#666;'>干潟等の保全 有効項目</div>" +
      "<div style='font-size:22px; font-weight:bold; color:#e67e22;'>" +
      higataEnabled +
      " <span style='font-size:12px;'>/ 16 項目</span></div>" +
      "</div></div>" +
      listHtml;

    el.querySelectorAll("[data-edit-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openActivityModalByCode(btn.dataset.editAct);
      });
    });
  }

  // ---- 潮位データパネル ----
  function renderTidePanel() {
    const listEl = document.getElementById("tide-imported-list");
    const resultEl = document.getElementById("tide-import-result");
    const summaryEl = document.getElementById("tide-summary-msg");
    if (!listEl) return;

    const data = App.TideData ? App.TideData.list() : {};
    const dates = Object.keys(data).sort().reverse();
    const datesAsc = Object.keys(data).sort();

    if (summaryEl) {
      if (!dates.length) {
        summaryEl.textContent = "取り込み済み潮位データはありません。";
      } else {
        const overall = buildRangeSummary(datesAsc);
        summaryEl.textContent =
          "登録期間: " +
          overall.start +
          " 〜 " +
          overall.end +
          " / 登録 " +
          overall.count +
          "日 / 欠損 " +
          overall.totalMissing +
          "日" +
          (overall.missingLabel ? "（" + overall.missingLabel + "）" : "");
      }
    }

    if (!dates.length) {
      listEl.innerHTML =
        "<p class='hint'>取り込み済みの潮位データがありません。</p>";
    } else {
      let html =
        "<table class='data-table'><thead><tr><th>開始日</th><th>終了日</th><th>登録日数</th><th>欠損日</th><th>操作</th></tr></thead><tbody>";
      const grouped = groupDatesByYear(datesAsc);
      Object.keys(grouped)
        .sort()
        .reverse()
        .forEach(function (year) {
          const yearDates = grouped[year].slice().sort();
          const summary = buildRangeSummary(yearDates);
          html +=
            "<tr>" +
            "<td>" +
            Utils.esc(summary.start) +
            "</td>" +
            "<td>" +
            Utils.esc(summary.end) +
            "</td>" +
            "<td>" +
            summary.count +
            " 日</td>" +
            "<td style='text-align:left;'>" +
            Utils.esc(summary.missingLabel || "なし") +
            "</td>" +
            "<td><button class='btn-del' data-del-tide-range-year='" +
            year +
            "'>この年を削除</button></td>" +
            "</tr>";
        });
      html += "</tbody></table>";
      listEl.innerHTML = html;

      listEl
        .querySelectorAll("[data-del-tide-range-year]")
        .forEach(function (btn) {
          btn.addEventListener("click", function () {
            const year = btn.dataset.delTideRangeYear;
            const yearDates = Object.keys(data).filter(function (d) {
              return String(d).slice(0, 4) === year;
            });
            if (
              confirm(
                year +
                  "年の潮位データ（" +
                  yearDates.length +
                  "日分）を削除しますか？",
              )
            ) {
              yearDates.forEach(function (dateStr) {
                App.TideData.removeDate(dateStr);
              });
              renderTidePanel();
            }
          });
        });
    }

    const btnDeleteRange = document.getElementById("btn-delete-tide-range");
    if (btnDeleteRange && !btnDeleteRange.dataset.bound) {
      btnDeleteRange.dataset.bound = "1";
      btnDeleteRange.addEventListener("click", function () {
        const start = document.getElementById("tide-delete-start")?.value || "";
        const end = document.getElementById("tide-delete-end")?.value || "";
        if (!start || !end) {
          alert("削除開始日と終了日を指定してください。");
          return;
        }
        if (start > end) {
          alert("削除開始日は終了日以前にしてください。");
          return;
        }
        if (
          !confirm(start + " から " + end + " までの潮位データを削除しますか？")
        )
          return;
        Object.keys(data).forEach(function (dateStr) {
          if (dateStr >= start && dateStr <= end) {
            App.TideData.removeDate(dateStr);
          }
        });
        renderTidePanel();
      });
    }

    const btnImport = document.getElementById("btn-import-tide");
    const fileInput = document.getElementById("tide-import-file");
    if (fileInput && !fileInput.dataset.bound) {
      fileInput.dataset.bound = "1";
      fileInput.addEventListener("change", function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const ta = document.getElementById("tide-import-text");
          if (ta) ta.value = String(ev.target.result || "");
          if (resultEl)
            resultEl.textContent = "ファイルを読み込みました: " + file.name;
        };
        reader.readAsText(file);
      });
    }
    if (btnImport && !btnImport.dataset.bound) {
      btnImport.dataset.bound = "1";
      btnImport.addEventListener("click", function () {
        const date = document.getElementById("tide-import-date")?.value;
        const text = document.getElementById("tide-import-text")?.value;
        if (!text) {
          alert("日付または年単位データテキストを入力してください。");
          return;
        }
        if (!App.TideData) {
          alert("潮位データモジュールが読み込まれていません。");
          return;
        }

        let result = null;
        if (
          String(text).match(/^\s*\d{4}[-/]\d{2}[-/]\d{2}/m) ||
          String(text).split(/\r?\n/).length > 1
        ) {
          result = App.TideData.mergeFromText(text);
        } else if (date) {
          const ok = App.TideData.parseTextForDay(date, text);
          result = ok ? { imported: 1, data: App.TideData.list() } : null;
        }

        if (result) {
          const msg = buildTideImportSummary(result, date);
          alert(msg);
          if (resultEl) resultEl.textContent = msg;
          document.getElementById("tide-import-text").value = "";
          if (fileInput) fileInput.value = "";
          renderTidePanel();
        } else {
          alert(
            "潮位データの解析に失敗しました。日付付きの年単位データ、または24個の数値を含む単日データを確認してください。",
          );
          if (resultEl)
            resultEl.textContent =
              "解析に失敗しました。入力形式を確認してください。";
        }
      });
    }
  }

  function groupDatesByYear(dates) {
    const grouped = {};
    (dates || []).forEach(function (d) {
      const y = String(d).slice(0, 4);
      if (!grouped[y]) grouped[y] = [];
      grouped[y].push(d);
    });
    return grouped;
  }

  function buildRangeSummary(sortedDates) {
    const dates = (sortedDates || []).slice().sort();
    if (!dates.length)
      return {
        start: "",
        end: "",
        count: 0,
        totalMissing: 0,
        missingLabel: "",
      };

    const start = dates[0];
    const end = dates[dates.length - 1];
    const set = {};
    dates.forEach(function (d) {
      set[d] = true;
    });

    const startDate = new Date(start + "T00:00:00");
    const endDate = new Date(end + "T00:00:00");
    const missing = [];
    let rangeStart = null;
    let prevDate = null;

    for (
      let cursor = new Date(startDate);
      cursor <= endDate;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const dateStr = Utils.toDateStr(cursor);
      if (set[dateStr]) {
        if (rangeStart) {
          missing.push(
            rangeStart === prevDate ? rangeStart : rangeStart + "〜" + prevDate,
          );
          rangeStart = null;
          prevDate = null;
        }
        continue;
      }
      if (!rangeStart) rangeStart = dateStr;
      prevDate = dateStr;
    }
    if (rangeStart) {
      missing.push(
        rangeStart === prevDate ? rangeStart : rangeStart + "〜" + prevDate,
      );
    }

    const totalDays =
      Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const totalMissing = totalDays - dates.length;
    return {
      start: start,
      end: end,
      count: dates.length,
      totalMissing: Math.max(0, totalMissing),
      missingLabel: missing.join("、"),
    };
  }

  function buildTideImportSummary(result, singleDate) {
    if (!result) return "潮位データを登録しました";
    if (result.dates && result.dates.length) {
      const years = Array.from(
        new Set(
          result.dates.map(function (d) {
            return String(d).slice(0, 4);
          }),
        ),
      ).sort();
      const stats = years
        .map(function (year) {
          const count = result.dates.filter(function (d) {
            return String(d).slice(0, 4) === year;
          }).length;
          const expected = isLeapYear(+year) ? 366 : 365;
          return (
            year +
            "年: " +
            count +
            "日取込 / 欠損 " +
            Math.max(0, expected - count) +
            "日"
          );
        })
        .join("、");
      return (
        "潮位データを " +
        result.imported +
        "日分登録しました ✓（" +
        stats +
        "）"
      );
    }
    if (singleDate) return singleDate + " の潮位データを登録しました ✓";
    return (result.imported || 0) + "日分の潮位データを登録しました ✓";
  }

  function isLeapYear(year) {
    if (!year) return false;
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  // ---- 活動項目モーダル ----
  function openActivityModal(category) {
    const acts = getActivities().filter(function (a) {
      return a.category === category;
    });
    const title =
      category === "moba"
        ? "🌿 藻場の保全 ― 活動項目の有効化設定"
        : "🦀 干潟等の保全 ― 活動項目の有効化設定";
    document.getElementById("modal-activity-title").textContent = title;

    const grid = document.getElementById("modal-activity-grid");
    if (!grid) return;
    grid.innerHTML = "";
    acts.forEach(function (a) {
      const item = document.createElement("label");
      item.className = "activity-check-item";
      item.innerHTML =
        "<input type='checkbox' class='act-chk' data-code='" +
        a.code +
        "' " +
        (a.enabled ? "checked" : "") +
        ">" +
        "<span title='" +
        Utils.esc(a.label) +
        "'>" +
        Utils.esc(a.label) +
        "</span>" +
        "<input type='color' class='act-color' data-code='" +
        a.code +
        "' value='" +
        (a.color || (category === "higata" ? "#e67e22" : "#27ae60")) +
        "'>" +
        "<select class='act-pattern' data-code='" +
        a.code +
        "'>" +
        "<option value='solid'" +
        (a.pattern === "solid" ? " selected" : "") +
        ">単色</option>" +
        "<option value='stripe'" +
        (a.pattern === "stripe" ? " selected" : "") +
        ">斜線</option>" +
        "<option value='dot'" +
        (a.pattern === "dot" ? " selected" : "") +
        ">点模様</option>" +
        "</select>";
      grid.appendChild(item);
    });

    if (App.Navigation) App.Navigation.openModal("modal-activity");

    // 保存ボタン（category を閉じ込め）
    const btnSave = document.getElementById("btn-save-activity-modal");
    if (btnSave) {
      btnSave.onclick = function () {
        grid.querySelectorAll(".act-chk").forEach(function (chk) {
          setActivityEnabled(chk.dataset.code, chk.checked);
        });
        grid.querySelectorAll(".act-color").forEach(function (inp) {
          const code = inp.dataset.code;
          const patternEl = grid.querySelector(
            ".act-pattern[data-code='" + code + "']",
          );
          setActivityStyle(
            code,
            inp.value,
            patternEl ? patternEl.value : "solid",
          );
        });
        if (App.Navigation) App.Navigation.closeModal("modal-activity");
        renderActivitySummary();
        notifyChanged();
      };
    }
  }

  function openActivityModalByCode(code) {
    const act = getActivities().find(function (a) {
      return a.code === code;
    });
    if (!act) return;
    openActivityModal(act.category);
    const grid = document.getElementById("modal-activity-grid");
    if (!grid) return;
    const row = Array.from(grid.querySelectorAll(".act-chk")).find(
      function (chk) {
        return chk.dataset.code === code;
      },
    );
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "center" });
  }

  // ---- バインド（モーダル各種） ----
  function bindModals() {
    // 組織情報 編集ボタン
    const btnOrg = document.getElementById("btn-open-org-modal");
    if (btnOrg && !btnOrg.dataset.bound) {
      btnOrg.dataset.bound = "1";
      btnOrg.addEventListener("click", function () {
        openOrgModal();
      });
    }
    const btnSaveOrg = document.getElementById("btn-save-org-modal");
    if (btnSaveOrg && !btnSaveOrg.dataset.bound) {
      btnSaveOrg.dataset.bound = "1";
      btnSaveOrg.addEventListener("click", saveOrgModal);
    }

    // 単価マスタ 編集ボタン
    const btnWage = document.getElementById("btn-open-wage-modal");
    if (btnWage && !btnWage.dataset.bound) {
      btnWage.dataset.bound = "1";
      btnWage.addEventListener("click", function () {
        openWageModal();
      });
    }
    const btnSaveWage = document.getElementById("btn-save-wage-modal");
    if (btnSaveWage && !btnSaveWage.dataset.bound) {
      btnSaveWage.dataset.bound = "1";
      btnSaveWage.addEventListener("click", saveWageModal);
    }

    // 地区追加ボタン
    const btnArea = document.getElementById("btn-open-area-modal");
    if (btnArea && !btnArea.dataset.bound) {
      btnArea.dataset.bound = "1";
      btnArea.addEventListener("click", function () {
        openAreaModal(null);
      });
    }
    const btnSaveArea = document.getElementById("btn-save-area-modal");
    if (btnSaveArea && !btnSaveArea.dataset.bound) {
      btnSaveArea.dataset.bound = "1";
      btnSaveArea.addEventListener("click", saveAreaModal);
    }
  }

  function openOrgModal() {
    const org = getOrg(),
      s = getSettings();
    const bank = org.bankAccount || {};
    document.getElementById("modal-org-name").value = org.orgName || "";
    document.getElementById("modal-org-year").value = s.year || 8;
    document.getElementById("modal-org-chairman").value =
      s.councilChairName || s.chairman || org.repName || "";
    document.getElementById("modal-org-hours").value = s.defaultHours || 3.5;
    const bankName = document.getElementById("modal-org-bank-name");
    const bankBranch = document.getElementById("modal-org-bank-branch");
    const bankType = document.getElementById("modal-org-bank-type");
    const bankNo = document.getElementById("modal-org-bank-no");
    const bankHolder = document.getElementById("modal-org-bank-holder");
    const bankHolderKana = document.getElementById(
      "modal-org-bank-holder-kana",
    );
    if (bankName) bankName.value = bank.bankName || org.bank || "";
    if (bankBranch) bankBranch.value = bank.branchName || "";
    if (bankType) bankType.value = bank.accountType || "";
    if (bankNo) bankNo.value = bank.accountNo || org.account || "";
    if (bankHolder) bankHolder.value = bank.accountHolder || org.holder || "";
    const orgAddr = document.getElementById("modal-org-addr");
    if (orgAddr) orgAddr.value = org.addr || "";
    if (bankHolderKana)
      bankHolderKana.value = bank.accountHolderKana || org.holderKana || "";
    if (App.Navigation) App.Navigation.openModal("modal-org");
  }
  function saveOrgModal() {
    const name = document.getElementById("modal-org-name").value.trim();
    if (!name) {
      alert("組織名を入力してください。");
      return;
    }
    const currentOrg = getOrg();
    const bankAccount = {
      bankName: document.getElementById("modal-org-bank-name").value.trim(),
      branchName: document.getElementById("modal-org-bank-branch").value.trim(),
      accountType: document.getElementById("modal-org-bank-type").value.trim(),
      accountNo: document.getElementById("modal-org-bank-no").value.trim(),
      accountHolder: document
        .getElementById("modal-org-bank-holder")
        .value.trim(),
      accountHolderKana: document
        .getElementById("modal-org-bank-holder-kana")
        .value.trim(),
    };
    saveOrg(
      Object.assign({}, currentOrg, {
        orgName: name,
        addr: document.getElementById("modal-org-addr")?.value.trim() || "",
        bank: bankAccount.bankName,
        account: bankAccount.accountNo,
        holder: bankAccount.accountHolder,
        holderKana: bankAccount.accountHolderKana,
        bankAccount: bankAccount,
      }),
    );

    saveSettings({
      year: +document.getElementById("modal-org-year").value || 8,
      chairman: document.getElementById("modal-org-chairman").value.trim(),
      councilChairName: document
        .getElementById("modal-org-chairman")
        .value.trim(),
      defaultHours: +document.getElementById("modal-org-hours").value || 3.5,
    });
    if (App.Navigation) App.Navigation.closeModal("modal-org");
    renderOrgPanel();
    if (App.main && App.main.refreshHeaderInfo) App.main.refreshHeaderInfo();
    alert("組織情報を保存しました ✓");
  }

  function openWageModal() {
    const s = getSettings(),
      m = getMaster();
    document.getElementById("modal-wage-mode").value = s.wageMode || "daily";
    document.getElementById("modal-wage-daily").value = m.wageDaily || 0;
    document.getElementById("modal-wage-hourly").value = m.wageHourly || 0;
    document.getElementById("modal-wage-yousen").value = m.yousen || 0;
    document.getElementById("modal-wage-sharyo").value = m.sharyo || 0;
    // ★追加
    document.getElementById("modal-wage-hours").value = s.defaultHours || 3.5;
    if (App.Navigation) App.Navigation.openModal("modal-wage");
  }

  function saveWageModal() {
    // ★defaultHours も一緒に保存
    saveSettings({
      wageMode: document.getElementById("modal-wage-mode").value,
      defaultHours: +document.getElementById("modal-wage-hours").value || 3.5,
    });
    saveMaster({
      wageDaily: +document.getElementById("modal-wage-daily").value || 0,
      wageHourly: +document.getElementById("modal-wage-hourly").value || 0,
      yousen: +document.getElementById("modal-wage-yousen").value || 0,
      sharyo: +document.getElementById("modal-wage-sharyo").value || 0,
    });
    if (App.Navigation) App.Navigation.closeModal("modal-wage");
    renderWagePanel();
    alert("単価マスタを保存しました ✓");
  }

  function openAreaModal(id) {
    document.getElementById("modal-area-title").textContent = id
      ? "地区情報の編集"
      : "地区を追加";
    document.getElementById("modal-area-id").value = id || "";
    if (id) {
      const a =
        getAreas().find(function (x) {
          return x.id === id;
        }) || {};
      document.getElementById("modal-area-name").value = a.name || "";
      document.getElementById("modal-area-people").value =
        a.standardPeople || 0;
      document.getElementById("modal-area-members").value =
        getMembersByArea(id).join("、");
      document.getElementById("modal-area-color").value = a.color || "#16a2b8";
      document.getElementById("modal-area-pattern").value =
        a.pattern || "solid";
    } else {
      document.getElementById("modal-area-name").value = "";
      document.getElementById("modal-area-people").value = 0;
      document.getElementById("modal-area-members").value = "";
      document.getElementById("modal-area-color").value = "#16a2b8";
      document.getElementById("modal-area-pattern").value = "solid";
    }
    if (App.Navigation) App.Navigation.openModal("modal-area");
  }
  function saveAreaModal() {
    const id = document.getElementById("modal-area-id").value;
    const name = document.getElementById("modal-area-name").value.trim();
    const people = +document.getElementById("modal-area-people").value || 0;
    const membersStr = document.getElementById("modal-area-members").value;
    const color =
      document.getElementById("modal-area-color").value || "#16a2b8";
    const pattern =
      document.getElementById("modal-area-pattern").value || "solid";
    if (!name) {
      alert("地区名を入力してください。");
      return;
    }
    try {
      let areaId;
      if (id) {
        updateArea(id, {
          name: name,
          standardPeople: people,
          color: color,
          pattern: pattern,
        });
        areaId = id;
      } else {
        const a = addArea({
          name: name,
          standardPeople: people,
          color: color,
          pattern: pattern,
        });
        areaId = a.id;
      }
      if (membersStr.trim()) {
        saveMembersByArea(areaId, membersStr.split(/[,、，]/));
      }
      if (App.Navigation) App.Navigation.closeModal("modal-area");
      renderAreaList();
    } catch (e) {
      alert("保存エラー: " + e.message);
    }
  }

  // ---- ユーティリティ ----
  function info(label, value) {
    return (
      "<div class='info-item'><div class='info-label'>" +
      label +
      "</div><div class='info-value'>" +
      Utils.esc(String(value)) +
      "</div></div>"
    );
  }
  function fmtYen(n) {
    return (n || 0).toLocaleString() + " 円";
  }
  function patternStyle(pattern, color) {
    const base = color || "#16a2b8";
    if (pattern === "stripe") {
      return "background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.36) 0, rgba(255,255,255,0.36) 6px, transparent 6px, transparent 12px);";
    }
    if (pattern === "dot") {
      return "background-image: radial-gradient(rgba(255,255,255,0.42) 18%, transparent 20%); background-size: 10px 10px;";
    }
    return "";
  }

  return {
    onChange: onChange,
    notifyChanged: notifyChanged,
    getOrg: getOrg,
    saveOrg: saveOrg,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getMaster: getMaster,
    saveMaster: saveMaster,
    getAreas: getAreas,
    addArea: addArea,
    updateArea: updateArea,
    removeArea: removeArea,
    getMembers: getMembers,
    getMembersByArea: getMembersByArea,
    saveMembersByArea: saveMembersByArea,
    getActivities: getActivities,
    setActivityEnabled: setActivityEnabled,
    setActivityStyle: setActivityStyle,
    getEnabledActivities: getEnabledActivities,
    getMunicipalities: getMunicipalities,
    render: render,
    openActivityModal: openActivityModal,
    renderAreaList: renderAreaList,
    renderActivitySummary: renderActivitySummary,
    renderTidePanel: renderTidePanel, // ← 追加
  };
})();
