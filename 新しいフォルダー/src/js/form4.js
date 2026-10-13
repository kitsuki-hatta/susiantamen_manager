/* =====================================================================
   form4.js ― 様式4 活動記録簿（一覧表示 & Excel出力）
   ===================================================================== */

window.App = window.App || {};

App.Form4 = (function () {
  "use strict";

  const Storage = App.Storage;
  const Calc = App.Calc;
  const Const = App.Const;

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }

  function mmdd(d) {
    if (!d) return "";
    const parts = String(d).split("-");
    if (parts.length < 3) return d;
    return Number(parts[1]) + "月" + Number(parts[2]) + "日";
  }

  /**
   * 作業実績行のHTMLを生成（モーダル用）
   * rowUid: 行ごとに一意なID（単位datalistを独立させるため）
   */
  function makeWorkResultRow(title, value, unit, rowUid) {
    // rowUid が未指定の場合は生成
    if (!rowUid) {
      rowUid =
        "wr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    return (
      '<div class="work-result-row"' +
      ' style="display:flex; gap:8px; align-items:center; margin-bottom:6px;"' +
      ' data-row-uid="' +
      rowUid +
      '">' +
      // 項目名（共有datalist参照）
      '<input type="text" class="wr-title"' +
      ' placeholder="項目名（例：袋交換）"' +
      ' value="' +
      esc(title || "") +
      '"' +
      ' list="wr-title-list"' +
      ' autocomplete="off"' +
      ' style="flex:2;">' +
      // 数量
      '<input type="number" class="wr-value"' +
      ' placeholder="数量"' +
      ' value="' +
      esc(value || "") +
      '"' +
      ' style="flex:1;" inputmode="numeric">' +
      // 単位（行ごとのdatalist参照）
      '<input type="text" class="wr-unit"' +
      ' placeholder="単位（例：袋）"' +
      ' value="' +
      esc(unit || "") +
      '"' +
      ' list="wr-unit-list-' +
      rowUid +
      '"' +
      ' autocomplete="off"' +
      ' style="flex:1;">' +
      // 単位候補（行ごとに独立）
      '<datalist id="wr-unit-list-' +
      rowUid +
      '"></datalist>' +
      '<button type="button"' +
      ' class="btn-del btn-sm wr-remove"' +
      ' style="flex-shrink:0;">✕</button>' +
      "</div>"
    );
  }

  /**
   * モーダルの作業実績エリアを初期化
   */
  function initWorkResultArea(workResults) {
    const container = document.getElementById("modal-rec-work-results");
    if (!container) return;
    container.innerHTML = "";

    // ---- 過去の実績から項目名・単位を収集 ----
    // { 項目名: { unitCount: {単位: 回数}, total: 回数 } }
    const itemMap = {};
    const allRecords = App.Storage.getRecord
      ? App.Storage.getRecord() || []
      : [];

    allRecords.forEach(function (rec) {
      (rec.workResults || []).forEach(function (wr) {
        const key = (wr.title || "").trim();
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

    // 使用頻度順にソート
    const suggestions = Object.entries(itemMap)
      .sort(function (a, b) {
        return b[1].total - a[1].total;
      })
      .map(function (entry) {
        const units = Object.entries(entry[1].unitCount)
          .sort(function (a, b) {
            return b[1] - a[1];
          })
          .map(function (u) {
            return u[0];
          });
        return { title: entry[0], units: units };
      });

    // ---- 項目名の共有datalistを更新 ----
    let titleDl = document.getElementById("wr-title-list");
    if (!titleDl) {
      titleDl = document.createElement("datalist");
      titleDl.id = "wr-title-list";
      document.body.appendChild(titleDl);
    }
    titleDl.innerHTML = suggestions
      .map(function (s) {
        return '<option value="' + esc(s.title) + '">';
      })
      .join("");

    // ---- suggestionMapをコンテナに保持（bindWorkResultEventsで参照） ----
    container._suggestions = suggestions;

    // ---- 行を生成 ----
    const results =
      workResults && workResults.length > 0
        ? workResults
        : [{ title: "", value: "", unit: "" }];

    results.forEach(function (wr) {
      const rowUid =
        "wr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      container.insertAdjacentHTML(
        "beforeend",
        makeWorkResultRow(wr.title, wr.value, wr.unit, rowUid),
      );
    });

    bindWorkResultEvents(container);

    // ---- 既存データがある行の単位候補を初期表示 ----
    container.querySelectorAll(".work-result-row").forEach(function (row) {
      const titleInput = row.querySelector(".wr-title");
      if (titleInput && titleInput.value) {
        _refreshUnitSuggestions(row, titleInput.value, suggestions);
      }
    });

    // ---- 「＋ 実績を追加」ボタンの再バインド ----
    const addBtn = document.getElementById("btn-add-work-result");
    if (addBtn) {
      const newBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newBtn, addBtn);
      newBtn.addEventListener("click", function () {
        const rowUid =
          "wr" +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 6);
        container.insertAdjacentHTML(
          "beforeend",
          makeWorkResultRow("", "", "", rowUid),
        );
        bindWorkResultEvents(container);
      });
    }
  }

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

  /**
   * モーダルから作業実績を収集
   */
  function collectWorkResults() {
    const container = document.getElementById("modal-rec-work-results");
    if (!container) return [];
    const results = [];
    container.querySelectorAll(".work-result-row").forEach(function (row) {
      const title = row.querySelector(".wr-title").value.trim();
      const value = row.querySelector(".wr-value").value.trim();
      const unit = row.querySelector(".wr-unit").value.trim();
      if (title || value) {
        results.push({ title: title, value: value, unit: unit });
      }
    });
    return results;
  }

  /**
   * store の実績（moba_record）から様式4用の明細行データを生成
   */
  function buildRows(period) {
    const periodId = period || getVal("f4-period") || "all";
    const recs = Calc.getTargetRecords ? Calc.getTargetRecords(periodId) : [];
    const areas = Storage.getAreas ? Storage.getAreas() || [] : [];
    const areasById = {};
    areas.forEach(function (a) {
      areasById[a.id] = a;
    });

    return recs.map(function (r) {
      const total = Number(r.people) || 0;
      const volunteer = Number(r.volunteer) || 0;
      const fisher = Math.max(0, total - volunteer);
      const area = areasById[r.areaId] || { name: r.areaId || "" };

      // activityCode から活動項目名・区分を取得
      const allActs =
        App.Master && typeof App.Master.getActivities === "function"
          ? App.Master.getActivities()
          : [];
      const act = allActs.find(function (item) {
        return item.code === r.activityCode;
      });
      const activityLabel = act ? act.label : r.activityCode || "";
      const activityCategory = act ? act.category : "";

      // K列用：作業タイトル（新フィールド優先、なければ activityLabel）
      const workTitle = r.workTitle || activityLabel;

      // 作業実績（新フィールド優先、なければ旧 note から生成）
      let workResults = [];
      if (r.workResults && r.workResults.length > 0) {
        workResults = r.workResults;
      } else if (r.note) {
        // 旧データ互換：note テキストをそのまま1件目として扱う
        workResults = [{ title: r.note, value: "", unit: "" }];
      }

      const start = r._start || r.start || "";
      const end = r._end || r.end || "";
      const hours = r._hours || r.workHours || 3.5;

      // 備考：用船・車両情報
      const notes = [];
      if (r.boat && r.boat > 0) notes.push("用船 " + r.boat + "隻");
      if (r.car && r.car > 0) notes.push("車両 " + r.car + "台");
      const note = notes.join(" ");

      return {
        id: r.id,
        date: r.date,
        start: start,
        end: end,
        hours: hours,
        total: total,
        fisher: fisher,
        fisherOther: 0,
        volunteer: volunteer,
        nonMember: 0,
        activityCode: r.activityCode || "",
        activityLabel: activityLabel,
        activityCategory: activityCategory,
        workTitle: workTitle,
        content: activityLabel + (r.content ? " (" + r.content + ")" : ""),
        position: area.name ? area.name + "地先" : "",
        note: note,
        workResults: workResults,
        needInput: r._needInput,
      };
    });
  }

  /**
   * 画面プレビュー表示
   */
  function render() {
    const period = getVal("f4-period") || "all";
    const rows = buildRows(period);
    const tbl = document.getElementById("f4-table");
    if (!tbl) return;

    // 実績がある列を動的に収集（最大10列）
    const allTitles = [];
    rows.forEach(function (r) {
      (r.workResults || []).forEach(function (wr) {
        if (
          wr.title &&
          allTitles.indexOf(wr.title) === -1 &&
          allTitles.length < 10
        ) {
          allTitles.push(wr.title);
        }
      });
    });

    // ヘッダー生成
    let head =
      "<thead><tr>" +
      "<th>実施月日</th><th>開始</th><th>終了</th><th>実施時間</th>" +
      "<th>総参加</th><th>漁業者</th><th>ボランティア</th>" +
      "<th>活動項目・内容</th><th>活動位置</th><th>備考</th>";

    if (allTitles.length > 0) {
      head += '<th colspan="' + allTitles.length + '">作業実績</th>';
    }
    head += "</tr>";

    // 作業実績サブヘッダー行
    if (allTitles.length > 0) {
      head +=
        '<tr style="background:#f0f4ff;">' +
        '<th colspan="10"></th>' +
        allTitles
          .map(function (t) {
            return "<th>" + esc(t) + "</th>";
          })
          .join("") +
        "</tr>";
    }
    head += "</thead>";

    // ボディ生成
    let body = "<tbody>";
    rows.forEach(function (r) {
      // 作業実績をタイトルで引く
      const wrMap = {};
      (r.workResults || []).forEach(function (wr) {
        if (wr.title)
          wrMap[wr.title] = (wr.value || "") + (wr.unit ? " " + wr.unit : "");
      });

      body +=
        '<tr class="clickable-activity ' +
        (r.needInput ? "row-warn" : "") +
        '" data-id="' +
        r.id +
        '" style="cursor:pointer;" title="クリックで活動記録日誌(様式5/6)へジャンプ">' +
        "<td>" +
        mmdd(r.date) +
        "</td>" +
        "<td>" +
        (r.start || "") +
        "</td>" +
        "<td>" +
        (r.end || "") +
        "</td>" +
        "<td>" +
        r.hours +
        "時間</td>" +
        "<td>" +
        r.total +
        "人</td>" +
        "<td>" +
        r.fisher +
        "人</td>" +
        "<td>" +
        r.volunteer +
        "人</td>" +
        "<td>" +
        esc(r.content) +
        "</td>" +
        "<td>" +
        esc(r.position) +
        "</td>" +
        "<td>" +
        esc(r.note) +
        "</td>";

      allTitles.forEach(function (t) {
        body += "<td>" + esc(wrMap[t] || "") + "</td>";
      });

      body += "</tr>";
    });
    body += "</tbody>";

    tbl.innerHTML = head + body;

    // 行クリックイベント
    tbl.querySelectorAll(".clickable-activity").forEach(function (row) {
      row.addEventListener("click", function () {
        const recordId = row.dataset.id;
        if (typeof App.jumpToDetailEdit === "function") {
          App.jumpToDetailEdit(recordId);
        } else if (App.Form5 && typeof App.Form5.edit === "function") {
          App.Form5.edit(recordId);
        }
      });
    });

    const summaryDiv = document.getElementById("f4-summary");
    if (summaryDiv) {
      summaryDiv.innerHTML = "<p>対象件数：" + rows.length + "件</p>";
    }
  }

  /**
   * 様式4 活動記録簿を ExcelJS で Excel ファイルに出力
   */
  async function exportExcel() {
    if (typeof ExcelJS === "undefined") {
      alert("ExcelJS ライブラリが読み込まれていません。");
      return;
    }

    const period = getVal("f4-period") || "all";
    const rows = buildRows(period);
    const settings =
      Storage && Storage.getSettings ? Storage.getSettings() : {};
    const org = Storage && Storage.getOrg ? Storage.getOrg() : {};
    const year = settings.year || "";

    const enabledActs =
      App.Master && typeof App.Master.getEnabledActivities === "function"
        ? App.Master.getEnabledActivities()
        : [];
    const actNames = enabledActs
      .map(function (a) {
        return a.label;
      })
      .join("、");

    // 作業実績の全タイトルを収集（最大10列）
    const allTitles = [];
    rows.forEach(function (r) {
      (r.workResults || []).forEach(function (wr) {
        if (
          wr.title &&
          allTitles.indexOf(wr.title) === -1 &&
          allTitles.length < 10
        ) {
          allTitles.push(wr.title);
        }
      });
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("活動記録簿");

    function boxBorder() {
      if (App.FormLedger && typeof App.FormLedger.boxBorder === "function") {
        return App.FormLedger.boxBorder();
      }
      const s = { style: "thin", color: { argb: "FF999999" } };
      return { top: s, left: s, bottom: s, right: s };
    }

    // 固定列数（A〜M列）＋作業実績列（N列〜）
    const fixedCols = 13; // A〜M
    const totalCols = fixedCols + allTitles.length;

    // 1行目：タイトル
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell("A1");
    titleCell.value =
      "令和" +
      (year ? year : "X") +
      "年度 漁場生産力・水産多面的機能強化対策事業 活動記録簿";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 25;

    // 2行目：組織名・活動項目
    ws.getCell("A2").value =
      "活動組織名：" +
      (org.orgName || "") +
      "（活動項目：" +
      (actNames || "全項目") +
      "）";
    ws.getCell("A2").font = { size: 11 };

    // 3〜5行目：ヘッダー
    // 固定ヘッダー
    ws.mergeCells("A3:E3");
    ws.getCell("A3").value = "活動実施日時";
    ws.mergeCells("F3:J3");
    ws.getCell("F3").value = "活動参加人数";
    ws.mergeCells("K3:K5");
    ws.getCell("K3").value = "活動内容";
    ws.mergeCells("L3:L5");
    ws.getCell("L3").value = "協定区域における活動の位置";
    ws.mergeCells("M3:M5");
    ws.getCell("M3").value = "備考";

    // 作業実績ヘッダー（N列〜）
    if (allTitles.length > 0) {
      const startCol = fixedCols + 1; // N列 = 14列目
      const endCol = fixedCols + allTitles.length;
      ws.mergeCells(3, startCol, 3, endCol);
      ws.getCell(3, startCol).value = "作業実績";

      allTitles.forEach(function (title, i) {
        ws.getCell(4, startCol + i).value = title;
        // 単位行（5行目）
        const unitRow = rows.find(function (r) {
          return (r.workResults || []).some(function (wr) {
            return wr.title === title && wr.unit;
          });
        });
        const unit = unitRow
          ? (
              unitRow.workResults.find(function (wr) {
                return wr.title === title;
              }) || {}
            ).unit || ""
          : "";
        ws.getCell(5, startCol + i).value = unit ? "（" + unit + "）" : "";
      });
    }

    ws.mergeCells("A4:A5");
    ws.getCell("A4").value = "実施月日";
    ws.mergeCells("B4:E4");
    ws.getCell("B4").value = "実施時間";
    ws.mergeCells("F4:F5");
    ws.getCell("F4").value = "総参加者";
    ws.mergeCells("G4:H4");
    ws.getCell("G4").value = "構成員";
    ws.mergeCells("I4:I5");
    ws.getCell("I4").value = "ボランティア";
    ws.mergeCells("J4:J5");
    ws.getCell("J4").value = "非構成員";

    ws.mergeCells("B5:D5");
    ws.getCell("B5").value = "時間帯";
    ws.getCell("E5").value = "実施時間";
    ws.getCell("G5").value = "漁業者";
    ws.getCell("H5").value = "漁業者以外";

    // ヘッダースタイル
    for (let rn = 3; rn <= 5; rn++) {
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(rn, c);
        cell.font = { bold: true, size: 9 };
        cell.alignment = {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDDEBF7" },
        };
        cell.border = boxBorder();
      }
    }

    // 明細データ（6行目〜）
    const startRow = 6;
    rows.forEach(function (r, idx) {
      const rowNum = startRow + idx;
      const row = ws.getRow(rowNum);
      row.height = 40;

      row.getCell(1).value = mmdd(r.date);
      row.getCell(2).value = r.start;
      row.getCell(3).value = "～";
      row.getCell(4).value = r.end;
      row.getCell(5).value = r.hours + "時間";
      row.getCell(6).value = r.total + "人";
      row.getCell(7).value = r.fisher + "人";
      row.getCell(8).value = r.nonMember + "人";
      row.getCell(9).value = r.volunteer + "人";
      row.getCell(10).value = "";
      // K列：作業タイトル
      row.getCell(11).value = r.workTitle || "";
      // L列：活動位置
      row.getCell(12).value = r.position;
      // M列：備考（用船・車両）
      row.getCell(13).value = r.note;

      // N列〜：作業実績
      const wrMap = {};
      (r.workResults || []).forEach(function (wr) {
        if (wr.title) wrMap[wr.title] = wr.value || "";
      });
      allTitles.forEach(function (title, i) {
        row.getCell(fixedCols + 1 + i).value = wrMap[title] || "";
      });

      // スタイル適用
      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        cell.border = boxBorder();
        cell.font = { size: 9 };
        // 修正②：上下中央、左右は制御しない
        cell.alignment = { vertical: "middle", wrapText: true };
      }
    });

    // 列幅設定
    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 3;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 10;
    ws.getColumn(6).width = 10;
    ws.getColumn(7).width = 10;
    ws.getColumn(8).width = 10;
    ws.getColumn(9).width = 10;
    ws.getColumn(10).width = 10;
    ws.getColumn(11).width = 24; // K列：作業タイトル
    ws.getColumn(12).width = 16; // L列：活動位置
    ws.getColumn(13).width = 20; // M列：備考
    allTitles.forEach(function (_, i) {
      ws.getColumn(fixedCols + 1 + i).width = 14;
    });

    const filename = "様式4_活動記録簿.xlsx";
    if (
      App.FormLedger &&
      typeof App.FormLedger.downloadWorkbook === "function"
    ) {
      await App.FormLedger.downloadWorkbook(wb, filename);
    } else {
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  /**
   * 行の単位datalistを更新し、単位が未入力なら最頻出単位を自動補完する
   * @param {HTMLElement} row        - .work-result-row 要素
   * @param {string}      titleValue - 現在の項目名
   * @param {Array}       suggestions - [{title, units:[]}]
   */
  function _refreshUnitSuggestions(row, titleValue, suggestions) {
    const unitInput = row.querySelector(".wr-unit");
    const rowUid = row.dataset.rowUid;
    const unitDl = rowUid
      ? document.getElementById("wr-unit-list-" + rowUid)
      : null;

    if (!unitInput) return;

    const matched = suggestions.find(function (s) {
      return s.title === titleValue.trim();
    });

    if (matched && matched.units.length) {
      // 単位候補を更新
      if (unitDl) {
        unitDl.innerHTML = matched.units
          .map(function (u) {
            return '<option value="' + esc(u) + '">';
          })
          .join("");
      }
      // 単位が未入力なら最頻出単位を自動補完
      if (!unitInput.value.trim()) {
        unitInput.value = matched.units[0];
      }
    } else {
      // 候補なし → datalistをクリア（単位はそのまま保持）
      if (unitDl) unitDl.innerHTML = "";
    }
  }

  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return {
    render: render,
    exportExcel: exportExcel,
    buildRows: buildRows,
    initWorkResultArea: initWorkResultArea,
    collectWorkResults: collectWorkResults,
  };
})();
