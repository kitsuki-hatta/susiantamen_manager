/**
 * form5.js — 様式5：活動記録日誌
 */

App.Form5 = (() => {
  "use strict";

  // -------------------------------------------------------
  // 内部ユーティリティ
  // -------------------------------------------------------

  function getForm5Data(recId) {
    const all = App.Storage.getForm5() || {};
    return all[recId] || {};
  }

  function saveForm5Data(recId, data) {
    const all = App.Storage.getForm5() || {};
    const prev = all[recId] || {};
    all[recId] = {
      ...prev,
      ...data,
      _savedAt: new Date().toISOString(),
    };
    App.Storage.setForm5(all);
  }

  function isEdited(recId) {
    const all = App.Storage.getForm5() || {};
    return !!all[recId]?._savedAt;
  }

  // -------------------------------------------------------
  // form4.js と同じロジックで行データを生成
  // -------------------------------------------------------

  function buildRows(periodId) {
    const recs =
      App.Calc && typeof App.Calc.getTargetRecords === "function"
        ? App.Calc.getTargetRecords(periodId || "all")
        : App.Storage.getRecord() || [];

    const areas = App.Storage.getAreas() || [];
    const areaMap = Object.fromEntries(areas.map((a) => [a.id, a]));

    const allActs =
      App.Master && typeof App.Master.getActivities === "function"
        ? App.Master.getActivities()
        : [];

    return recs.map((rec) => {
      const area = areaMap[rec.areaId] || { name: rec.areaId || "" };
      const act = allActs.find((a) => a.code === rec.activityCode);
      const actLabel = act ? act.label : rec.activityCode || "";

      const start = rec._start || rec.start || rec.startTime || "";
      const end = rec._end || rec.end || rec.endTime || "";
      const hours = rec._hours || rec.workHours || 3.5;

      let hoursStr = "—";
      if (start && end) {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const mins = eh * 60 + em - (sh * 60 + sm);
        if (mins > 0) hoursStr = (mins / 60).toFixed(1) + "h";
      } else if (hours) {
        hoursStr = Number(hours).toFixed(1) + "h";
      }

      const people = rec.people ?? rec.peopleCount ?? 0;

      return {
        id: rec.id,
        date: rec.date,
        start,
        end,
        hoursStr,
        people,
        areaName: area.name || "—",
        actLabel,
        workTitle: rec.workTitle || actLabel,
      };
    });
  }

  // -------------------------------------------------------
  // 活動一覧テーブル描画
  // -------------------------------------------------------

  function renderTable(sortOrder = "asc") {
    const periodVal =
      document.getElementById("f56-period-filter")?.value || "all";
    const areaVal = document.getElementById("f56-area-filter")?.value || "all";

    let rows = buildRows(periodVal);

    if (areaVal !== "all") {
      const areas = App.Storage.getAreas() || [];
      const area = areas.find((a) => a.id === areaVal);
      const areaName = area?.name || "";
      rows = rows.filter((r) => r.areaName === areaName);
    }

    rows.sort((a, b) => {
      if (sortOrder === "asc") {
        return (a.date || "").localeCompare(b.date || "");
      } else {
        return (b.date || "").localeCompare(a.date || "");
      }
    });

    const tbody = document.getElementById("f56-activity-tbody");
    if (!tbody) return;

    if (rows.length === 0) {
      tbody.innerHTML = `
      <tr>
        <td colspan="7"
          style="text-align:center; color:#64748b; padding:24px;">
          表示できる実績データがありません
        </td>
      </tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((row) => {
        const f5done = isEdited(row.id);
        const f6done = App.Form6.isEdited(row.id);

        const btn5Style = f5done
          ? "background:#7c3aed; color:#fff; border:none; padding:5px 10px; border-radius:6px; font-size:11px; cursor:pointer; white-space:nowrap; box-shadow:0 0 0 2px rgba(124,58,237,0.4);"
          : "background:#334155; color:#e2e8f0; border:1px solid #475569; padding:5px 10px; border-radius:6px; font-size:11px; cursor:pointer; white-space:nowrap;";
        const btn5Label = f5done ? "✅ 様式5編集済" : "📋 様式5を編集";

        const btn6Style = f6done
          ? "background:#0e7490; color:#fff; border:none; padding:5px 10px; border-radius:6px; font-size:11px; cursor:pointer; white-space:nowrap; box-shadow:0 0 0 2px rgba(14,116,144,0.4);"
          : "background:#334155; color:#e2e8f0; border:1px solid #475569; padding:5px 10px; border-radius:6px; font-size:11px; cursor:pointer; white-space:nowrap;";
        const btn6Label = f6done ? "✅ 様式6編集済" : "📸 様式6を編集";

        return `
      <tr data-rec-id="${row.id}">
        <td style="white-space:nowrap;">${row.date || "—"}</td>
        <td>${escHtml(row.areaName)}</td>
        <td>${escHtml(row.actLabel)}</td>
        <td style="text-align:center;">${row.people}人</td>
        <td style="text-align:center;">${row.hoursStr}</td>
        <td style="text-align:center;">
          <button style="${btn5Style}"
            onclick="App.Form5.openModal('${row.id}')">
            ${btn5Label}
          </button>
        </td>
        <td style="text-align:center;">
          <button style="${btn6Style}"
            onclick="App.Form6.openModal('${row.id}')">
            ${btn6Label}
          </button>
        </td>
      </tr>`;
      })
      .join("");
  }

  // -------------------------------------------------------
  // 地区フィルタの選択肢を更新
  // -------------------------------------------------------

  function refreshAreaFilter() {
    const areas = App.Storage.getAreas() || [];
    const select = document.getElementById("f56-area-filter");
    if (!select) return;
    const cur = select.value;
    select.innerHTML =
      '<option value="all">全地区</option>' +
      areas
        .map((a) => `<option value="${a.id}">${escHtml(a.name)}</option>`)
        .join("");
    if ([...select.options].some((o) => o.value === cur)) {
      select.value = cur;
    }
  }

  // -------------------------------------------------------
  // 様式5 モーダル
  // -------------------------------------------------------

  function openModal(recId) {
    const records = App.Storage.getRecord() || [];
    const areas = App.Storage.getAreas() || [];
    const rec = records.find((r) => r.id === recId);
    if (!rec) {
      alert("実績データが見つかりません。");
      return;
    }

    const area = areas.find((a) => a.id === rec.areaId);

    // 活動項目名を解決
    const allActs =
      App.Master && typeof App.Master.getActivities === "function"
        ? App.Master.getActivities()
        : [];
    const act = allActs.find((a) => a.code === rec.activityCode);
    const actLabel = act ? act.label : rec.activityCode || "—";

    // 保存済みデータ
    const saved = getForm5Data(recId);

    // ---- モーダルタイトル ----
    document.getElementById("modal-form5-title").textContent =
      `📋 様式5：活動記録日誌の編集（${rec.date}）`;
    document.getElementById("modal-form5-rec-id").value = recId;

    // ---- ヘッダー情報（読み取り専用） ----
    const start = rec.start || rec.startTime || "";
    const end = rec.end || rec.endTime || "";
    const hours = rec.workHours || 0;

    document.getElementById("f5m-date").textContent = _wareki(rec.date);
    document.getElementById("f5m-time").textContent =
      start && end ? `${start}～${end}` : "";
    document.getElementById("f5m-hours").textContent = hours
      ? Number(hours).toFixed(1)
      : "";
    document.getElementById("f5m-activity").textContent =
      rec.workTitle || actLabel;
    document.getElementById("f5m-area").textContent = area?.name || "—";

    // ---- 作業者テーブル ----
    _renderMemberTable(rec);

    // ---- 環境観察・コメント ----
    document.getElementById("f5m-comment").value =
      saved.comment || rec.note || "";

    // ---- モーダルを開く ----
    App.Navigation.openModal("modal-form5");

    // ↓↓↓ 追加：位置図プレビューを反映 ↓↓↓
    _renderMapPreview(recId);
    // ↑↑↑ 追加ここまで ↑↑↑
  }

  /** 様式5モーダルの位置図プレビューを描画 */
  function _renderMapPreview(recId) {
    const preview = document.getElementById("f5m-map-preview");
    if (!preview) return;
    const entry = getForm5Data(recId);
    const imgData = entry.mapPreviewData || entry.mapBgData || null;

    if (imgData) {
      preview.innerHTML = `<img src="${imgData}"
              style="width:100%; height:auto; object-fit:contain;
                     border-radius:6px; display:block;" />`;
    } else {
      preview.innerHTML = "位置図編集ボタンから編集できます";
      preview.style.color = "#64748b";
      preview.style.fontSize = "13px";
    }
  }

  /**
   * 作業者テーブルを描画
   */
  function _renderMemberTable(rec) {
    const tbody = document.getElementById("f5m-member-tbody");
    const tfoot = document.getElementById("f5m-member-tfoot");
    if (!tbody || !tfoot) return;

    // 費用計算
    const cost =
      App.Record && typeof App.Record.calcRecordCost === "function"
        ? App.Record.calcRecordCost(rec)
        : { jinken: 0, yousen: 0, kotsu: 0, total: 0 };

    // 出席者・用船・車両のセット
    const participants = rec.participants || rec.members || [];
    const vesselProviders = rec.vesselProviders || rec.boatOwners || [];
    const vehicleProviders = rec.vehicleProviders || rec.carOwners || [];

    const vesselSet = new Set(vesselProviders.map(String));
    const vehicleSet = new Set(vehicleProviders.map(String));

    // ---- tbody：メンバー行 ----
    if (participants.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; color:#64748b; padding:12px;">
            出席者データがありません
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = participants
        .map(
          (name) => `
        <tr>
          <td>${escHtml(name)}</td>
          <td style="text-align:center;">✓</td>
          <td style="text-align:center;">${vesselSet.has(name) ? "✓" : ""}</td>
          <td style="text-align:center;">${vehicleSet.has(name) ? "✓" : ""}</td>
        </tr>`,
        )
        .join("");
    }

    // ---- tfoot：合計行 ----
    const yen = (n) => Number(n || 0).toLocaleString();

    tfoot.innerHTML = `
      <tr style="font-weight:bold; background:#1e293b;">
        <td>合計</td>
        <td style="text-align:center;">
          ${rec.people || participants.length}人<br>
          <small style="color:#94a3b8;">(${yen(cost.jinken)}円)</small>
        </td>
        <td style="text-align:center;">
          ${rec.boat || 0}隻<br>
          <small style="color:#94a3b8;">(${yen(cost.yousen)}円)</small>
        </td>
        <td style="text-align:center;">
          ${rec.car || 0}台<br>
          <small style="color:#94a3b8;">(${yen(cost.kotsu)}円)</small>
        </td>
      </tr>`;
  }

  // -------------------------------------------------------
  // 保存
  // -------------------------------------------------------

  function saveModal() {
    const recId = document.getElementById("modal-form5-rec-id").value;
    if (!recId) return;

    const data = {
      comment: document.getElementById("f5m-comment").value.trim(),
    };

    saveForm5Data(recId, data);
    App.Navigation.closeModal("modal-form5");
    renderTable();
    alert("様式5を保存しました。");
  }

  // -------------------------------------------------------
  // 位置図編集モーダル
  // -------------------------------------------------------
  function openImageMapModal() {
    const recId = document.getElementById("modal-form5-rec-id").value;
    if (!recId) {
      alert("先に様式5を開いてください。");
      return;
    }

    const records = App.Storage.getRecord() || [];
    const rec = records.find((r) => r.id === recId);
    if (!rec) {
      alert("実績データが見つかりません。");
      return;
    }

    document.getElementById("modal-form5-imagemap-title").textContent =
      `🖼️ 位置図の編集（任意画像）（${rec.date}）`;

    // モーダルを表示する処理
    App.Navigation.openModal("modal-form5-imagemap");

    setTimeout(() => {
      const canvasEl = document.getElementById("f5imagemap-canvas");
      if (
        canvasEl &&
        App.Form5ImageMap &&
        typeof App.Form5ImageMap.init === "function"
      ) {
        App.Form5ImageMap.init(canvasEl, rec);
      }
    }, 150);
  }

  function _updateMapToolBtn(activeTool) {
    ["select", "rect", "circle"].forEach((tool) => {
      const btn = document.getElementById(`f5map-tool-${tool}`);
      if (!btn) return;
      if (tool === activeTool) {
        btn.classList.add("f5map-tool-active");
      } else {
        btn.classList.remove("f5map-tool-active");
      }
    });
  }

  function _mapZoom(delta) {
    if (!App.Form5Map) return;
    const state = App.Form5Map._getMapState?.();
    if (state) {
      state.zoom = Math.max(16, Math.min(17, state.zoom + delta));
      App.Form5Map.render();
    }
  }

  // -------------------------------------------------------
  // Excel 出力
  // -------------------------------------------------------

  function exportAllExcel() {
    const records = App.Storage.getRecord() || [];
    if (records.length === 0) {
      alert("実績データがありません。");
      return;
    }
    _buildExcelWorkbook(records).then((wb) => {
      wb.xlsx.writeBuffer().then((buf) => {
        const blob = new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `様式5_活動記録日誌_全件_${_today()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  function exportExcelById(recId) {
    const records = App.Storage.getRecord() || [];
    const rec = records.find((r) => r.id === recId);
    if (!rec) return;
    _buildExcelWorkbook([rec]).then((wb) => {
      wb.xlsx.writeBuffer().then((buf) => {
        const blob = new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `様式5_活動記録日誌_${rec.date}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  async function _buildExcelWorkbook(records) {
    const wb = new ExcelJS.Workbook();
    const areas = App.Storage.getAreas() || [];
    const org = App.Storage.getOrg() || {};
    const settings = App.Storage.getSettings() || {};
    const areaMap = Object.fromEntries(areas.map((a) => [a.id, a]));
    const allActs =
      App.Master && typeof App.Master.getActivities === "function"
        ? App.Master.getActivities()
        : [];

    for (const rec of records) {
      const saved = getForm5Data(rec.id);
      const area = areaMap[rec.areaId];
      const act = allActs.find((a) => a.code === rec.activityCode);
      const actLabel = act ? act.label : rec.activityCode || "";

      const cost =
        App.Record && typeof App.Record.calcRecordCost === "function"
          ? App.Record.calcRecordCost(rec)
          : { jinken: 0, yousen: 0, kotsu: 0 };

      const participants = rec.participants || rec.members || [];
      const vesselProviders = rec.vesselProviders || rec.boatOwners || [];
      const vehicleProviders = rec.vehicleProviders || rec.carOwners || [];
      const vesselSet = new Set(vesselProviders.map(String));
      const vehicleSet = new Set(vehicleProviders.map(String));

      const sheetName = `${rec.date}_${(area?.name || "").slice(0, 8)}`.replace(
        /[\\/*?[\]:]/g,
        "_",
      );
      const ws = wb.addWorksheet(sheetName);

      const yen = (n) => Number(n || 0).toLocaleString();

      // -------------------------------------------------------
      // A4印刷設定
      // -------------------------------------------------------
      ws.pageSetup = {
        paperSize: 9, // A4
        orientation: "portrait", // 縦
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: {
          left: 0.5,
          right: 0.5,
          top: 0.7,
          bottom: 0.7,
          header: 0.3,
          footer: 0.3,
        },
      };

      // -------------------------------------------------------
      // 列幅（A～E列）
      // -------------------------------------------------------
      ws.columns = [
        { key: "A", width: 22 }, // A：氏名 / ラベル
        { key: "B", width: 10 }, // B：出席
        { key: "C", width: 10 }, // C：用船
        { key: "D", width: 10 }, // D：車両
        { key: "E", width: 18 }, // E：金額補足
      ];

      let rowIdx = 1;

      // -------------------------------------------------------
      // タイトル行
      // -------------------------------------------------------
      ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
      const titleCell = ws.getCell(`A${rowIdx}`);
      titleCell.value = `令和${settings.year || ""}年度　漁場生産力・水産多面的機能強化対策　活動記録日誌`;
      titleCell.font = { bold: true, size: 12 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(rowIdx).height = 22;
      rowIdx++;

      // -------------------------------------------------------
      // 組織・活動項目
      // -------------------------------------------------------
      ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
      const orgCell = ws.getCell(`A${rowIdx}`);
      orgCell.value = `（${org.orgName || ""}：${actLabel}）`;
      orgCell.alignment = { horizontal: "center", vertical: "middle" };
      orgCell.font = { size: 10 };
      ws.getRow(rowIdx).height = 16;
      rowIdx++;

      // -------------------------------------------------------
      // 基本情報（罫線付きラベル＋値）
      // -------------------------------------------------------
      const start = rec.start || rec.startTime || "";
      const end = rec.end || rec.endTime || "";
      const hours = rec.workHours || 0;

      const infoRows = [
        [
          "活動日",
          `${_wareki(rec.date)}　${start}～${end}（${Number(hours).toFixed(1)}時間）`,
        ],
        ["活動内容", rec.workTitle || actLabel],
        ["活動場所", `${area?.name || "—"}地先`],
      ];

      infoRows.forEach(([label, value]) => {
        // A列：ラベル
        const labelCell = ws.getCell(`A${rowIdx}`);
        labelCell.value = label;
        labelCell.font = { bold: true, size: 10 };
        labelCell.alignment = { horizontal: "center", vertical: "middle" };
        labelCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDDEBF7" },
        };
        labelCell.border = _boxBorder();

        // B～E列：値
        ws.mergeCells(`B${rowIdx}:E${rowIdx}`);
        const valCell = ws.getCell(`B${rowIdx}`);
        valCell.value = value;
        valCell.font = { size: 10 };
        valCell.alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        };
        valCell.border = _boxBorder();

        ws.getRow(rowIdx).height = 18;
        rowIdx++;
      });

      // -------------------------------------------------------
      // 作業者テーブル ヘッダー
      // -------------------------------------------------------
      ws.getRow(rowIdx).height = 16;
      const hLabels = ["氏名", "出席", "用船", "車両", "備考"];
      hLabels.forEach((v, i) => {
        const col = ["A", "B", "C", "D", "E"][i];
        const cell = ws.getCell(`${col}${rowIdx}`);
        cell.value = v;
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDDEBF7" },
        };
        cell.border = _boxBorder();
      });
      rowIdx++;

      // -------------------------------------------------------
      // 作業者テーブル 明細行
      // -------------------------------------------------------
      participants.forEach((name) => {
        ws.getRow(rowIdx).height = 14;
        const cols = ["A", "B", "C", "D", "E"];
        const vals = [
          name,
          "✓",
          vesselSet.has(name) ? "✓" : "",
          vehicleSet.has(name) ? "✓" : "",
          "",
        ];
        vals.forEach((v, i) => {
          const cell = ws.getCell(`${cols[i]}${rowIdx}`);
          cell.value = v;
          cell.font = { size: 9 };
          cell.alignment = {
            horizontal: i === 0 ? "left" : "center",
            vertical: "middle",
          };
          cell.border = _boxBorder();
        });
        rowIdx++;
      });

      // -------------------------------------------------------
      // 合計行
      // -------------------------------------------------------
      ws.getRow(rowIdx).height = 24;
      const totalDefs = [
        ["合計", "left"],
        [
          `${rec.people || participants.length}人\n(${yen(cost.jinken)}円)`,
          "center",
        ],
        [`${rec.boat || 0}隻\n(${yen(cost.yousen)}円)`, "center"],
        [`${rec.car || 0}台\n(${yen(cost.kotsu)}円)`, "center"],
        ["", "center"],
      ];
      totalDefs.forEach(([v, align], i) => {
        const col = ["A", "B", "C", "D", "E"][i];
        const cell = ws.getCell(`${col}${rowIdx}`);
        cell.value = v;
        cell.font = { bold: true, size: 9 };
        cell.alignment = {
          horizontal: align,
          vertical: "middle",
          wrapText: true,
        };
        cell.border = _boxBorder();
      });
      rowIdx++;

      // -------------------------------------------------------
      // 位置図
      // -------------------------------------------------------
      ws.getRow(rowIdx).height = 14;
      ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
      const mapTitleCell = ws.getCell(`A${rowIdx}`);
      mapTitleCell.value = "【位置図】";
      mapTitleCell.font = { bold: true, size: 10 };
      mapTitleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDDEBF7" },
      };
      rowIdx++;

      const mapBgData = saved.mapBgData || null;
      const mapStartRow = rowIdx;

      if (mapBgData && mapBgData.indexOf("data:image") === 0) {
        const base64 = mapBgData.split(",")[1];
        const ext = mapBgData.indexOf("image/png") >= 0 ? "png" : "jpeg";
        const imgId = wb.addImage({ base64, extension: ext });

        // アスペクト比 3:2 を維持（width480 → height=480/1.5=320）
        const imgWidth = 480;
        const imgHeight = Math.round(imgWidth / 1.5); // 320px

        // 行高さの合計が imgHeight に近くなるよう行数を調整
        // ExcelJS の行高さ単位は pt（1pt ≒ 1.333px）
        // 320px ÷ 1.333 ≒ 240pt → 15pt × 16行
        const mapRowCount = 16;
        for (let i = 0; i < mapRowCount; i++) {
          ws.getRow(rowIdx++).height = 15;
        }

        ws.addImage(imgId, {
          tl: { col: 0, row: mapStartRow - 1 },
          ext: { width: imgWidth, height: imgHeight },
        });
      } else {
        // 位置図なし：枠線のみ
        const mapRowCount = 10;
        ws.mergeCells(`A${mapStartRow}:E${mapStartRow + mapRowCount - 1}`);
        const emptyMapCell = ws.getCell(`A${mapStartRow}`);
        emptyMapCell.value = "（位置図なし）";
        emptyMapCell.alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        emptyMapCell.border = _boxBorder();
        for (let i = 0; i < mapRowCount; i++) {
          ws.getRow(rowIdx++).height = 15;
        }
      }

      // -------------------------------------------------------
      // 環境観察・コメント
      // -------------------------------------------------------
      ws.getRow(rowIdx).height = 14;
      ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
      const commentTitleCell = ws.getCell(`A${rowIdx}`);
      commentTitleCell.value = "【環境観察・コメント】";
      commentTitleCell.font = { bold: true, size: 10 };
      commentTitleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDDEBF7" },
      };
      rowIdx++;

      const commentRowCount = 5;
      ws.mergeCells(`A${rowIdx}:E${rowIdx + commentRowCount - 1}`);
      const commentCell = ws.getCell(`A${rowIdx}`);
      commentCell.value = saved.comment || rec.note || "";
      commentCell.alignment = { wrapText: true, vertical: "top" };
      commentCell.border = _boxBorder();
      for (let i = 0; i < commentRowCount; i++) {
        ws.getRow(rowIdx++).height = 15;
      }
    }

    return wb;
  }

  function deleteImageData(recId) {
    const form5Data = App.Storage.getForm5 ? App.Storage.getForm5() || {} : {};
    const entry = form5Data[recId];

    if (entry && entry.mapBgData) {
      delete entry.mapBgData;
      delete entry.mapPreviewData; // プレビュー画像も削除
      delete entry._mapBgMediaId;
      delete entry._mapPreviewMediaId;
      form5Data[recId] = entry;
      App.Storage.setForm5(form5Data);
      App.DataStore?.pruneMedia();
      alert(`画像データを削除しました: recId=${recId}`);
    } else {
      alert(`画像データが見つかりませんでした: recId=${recId}`);
    }
  }

  function checkStorageQuota() {
    if (App.DataStore && App.DataStore.isReady()) {
      App.DataStore.refreshPanel().catch(function (error) {
        console.error("ストレージ容量の確認に失敗しました:", error);
        alert("ストレージ容量を確認できませんでした。\n" + error.message);
      });
    }
  }

  function deleteUnusedData() {
    const form5Data = App.Storage.getForm5 ? App.Storage.getForm5() || {} : {};
    const currentDate = new Date();

    Object.keys(form5Data).forEach((recId) => {
      const entry = form5Data[recId];
      const savedDate = new Date(entry._savedAt || currentDate);

      // 例えば、保存から30日以上経過したデータを削除
      const daysElapsed = (currentDate - savedDate) / (1000 * 60 * 60 * 24);
      if (daysElapsed > 30) {
        delete form5Data[recId];
      }
    });

    App.Storage.setForm5(form5Data);
    alert("不要なデータを削除しました。");
  }

  // -------------------------------------------------------
  // ヘルパー
  // -------------------------------------------------------

  /** 和暦変換（令和） */
  function _wareki(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = String(dateStr).split("-").map(Number);
    return `令和${y - 2018}年${m}月${d}日`;
  }

  function _today() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }

  function _boxBorder() {
    const s = { style: "thin", color: { argb: "FF999999" } };
    return { top: s, left: s, bottom: s, right: s };
  }

  function escHtml(v) {
    if (typeof App.Utils?.escHtml === "function") return App.Utils.escHtml(v);
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function deleteImageData(recId) {
    const form5Data = App.Storage.getForm5 ? App.Storage.getForm5() || {} : {};
    const entry = form5Data[recId];

    if (!entry) {
      alert("対象データが見つかりません。");
      return;
    }

    delete entry.mapBgData;
    delete entry.mapPreviewData;
    delete entry._mapBgMediaId;
    delete entry._mapPreviewMediaId;
    delete entry.imageMapShapes;
    delete entry.imageMapView;

    form5Data[recId] = entry;
    App.Storage.setForm5(form5Data);
    App.DataStore?.pruneMedia();

    alert("この作業の位置図データを削除しました。");
  }

  function deleteUnusedData() {
    const form5Data = App.Storage.getForm5 ? App.Storage.getForm5() || {} : {};
    const records = App.Storage.getRecord ? App.Storage.getRecord() || [] : [];
    const validIds = new Set(records.map((r) => String(r.id)));

    let deletedCount = 0;

    Object.keys(form5Data).forEach((recId) => {
      if (!validIds.has(String(recId))) {
        delete form5Data[recId];
        deletedCount += 1;
      }
    });

    if (deletedCount && !confirm(`実績に紐づかない様式5データ ${deletedCount} 件を削除します。続行しますか？`)) {
      return;
    }
    App.Storage.setForm5(form5Data);
    App.DataStore?.pruneMedia();
    alert(`不要データを削除しました。件数: ${deletedCount}`);
  }

  function deleteCurrentImageData() {
    const recId = document.getElementById("modal-form5-rec-id")?.value;
    if (!recId) {
      alert("先に様式5を開いてください。");
      return;
    }

    const form5Data = App.Storage.getForm5 ? App.Storage.getForm5() || {} : {};
    const entry = form5Data[recId];

    if (!entry) {
      alert("対象データが見つかりません。");
      return;
    }

    delete entry.mapBgData;
    delete entry.mapPreviewData;
    delete entry._mapBgMediaId;
    delete entry._mapPreviewMediaId;
    delete entry.imageMapShapes;
    delete entry.imageMapView;

    form5Data[recId] = entry;
    App.Storage.setForm5(form5Data);
    App.DataStore?.pruneMedia();

    if (typeof _renderMapPreview === "function") {
      _renderMapPreview(recId);
    }

    alert("この作業の位置図データを削除しました。");
  }

  // -------------------------------------------------------
  // イベント登録
  // -------------------------------------------------------

  function bindEvents() {
    // 保存ボタン
    document
      .getElementById("btn-save-form5-modal")
      ?.addEventListener("click", saveModal);

    // 位置図編集モーダルを開くボタン
    document
      .getElementById("btn-open-imagemap")
      ?.addEventListener("click", openImageMapModal);

    // 様式5全件Excel出力ボタン
    document
      .getElementById("btn-f56-export-all-f5")
      ?.addEventListener("click", exportAllExcel);

    // フィルター変更イベント
    document
      .getElementById("f56-period-filter")
      ?.addEventListener("change", renderTable);

    document
      .getElementById("f56-area-filter")
      ?.addEventListener("change", renderTable);

    // 一覧更新ボタン
    document
      .getElementById("btn-f56-refresh")
      ?.addEventListener("click", function () {
        refreshAreaFilter();
        renderTable();
      });

    // 任意画像モーダル 閉じるボタン
    document
      .getElementById("imagemap-modal-close")
      ?.addEventListener("click", function () {
        App.Navigation.closeModal("modal-form5-imagemap");
      });

    // 任意画像モーダル 保存ボタン
    document
      .getElementById("imagemap-modal-save")
      ?.addEventListener("click", function () {
        const recId = document.getElementById("modal-form5-rec-id")?.value;
        if (
          recId &&
          App.Form5ImageMap &&
          typeof App.Form5ImageMap.saveData === "function"
        ) {
          App.Form5ImageMap.saveData();
        }
        if (recId) _renderMapPreview(recId);
        App.Navigation.closeModal("modal-form5-imagemap");
      });

    // 任意画像モーダル キャンセルボタン
    document
      .getElementById("imagemap-modal-cancel")
      ?.addEventListener("click", function () {
        App.Navigation.closeModal("modal-form5-imagemap");
      });

    // 任意画像モーダル 画像選択
    document
      .getElementById("imagemap-file-input")
      ?.addEventListener("change", function (e) {
        if (e.target.files && e.target.files[0] && App.Form5ImageMap) {
          App.Form5ImageMap.loadImageFile(e.target.files[0]);
        }
      });

    // ツール選択
    document
      .getElementById("imagemap-tool-select")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.setTool("select");
      });

    document
      .getElementById("imagemap-tool-rect")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.setTool("rect");
      });

    document
      .getElementById("imagemap-tool-circle")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.setTool("circle");
      });

    document
      .getElementById("imagemap-tool-text")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.addText();
      });

    document
      .getElementById("imagemap-tool-marker")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.addMarker();
      });

    // 色選択
    document
      .getElementById("imagemap-color-picker")
      ?.addEventListener("input", function (e) {
        App.Form5ImageMap?.setColor(e.target.value);
      });

    // 編集・削除操作
    document
      .getElementById("imagemap-edit-text")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.editSelectedText();
      });

    document
      .getElementById("imagemap-delete")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.deleteSelected();
      });

    document
      .getElementById("imagemap-clear")
      ?.addEventListener("click", function () {
        App.Form5ImageMap?.clearAll();
      });

    // 位置図データ削除ボタン
    document
      .getElementById("btn-delete-current-image")
      ?.addEventListener("click", deleteCurrentImageData);

    // ストレージ容量確認ボタン
    [
      "btn-check-storage",
      "btn-check-storage-map",
      "btn-check-storage-imagemap",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", checkStorageQuota);
    });

    // 不要データ削除ボタン
    [
      "btn-delete-unused-data-main",
      "btn-delete-unused-data-map",
      "btn-delete-unused-data-imagemap",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", deleteUnusedData);
    });
  }

  // -------------------------------------------------------
  // 公開 API
  // -------------------------------------------------------

  return {
    init() {
      bindEvents();
      refreshAreaFilter();
      renderTable();
    },
    renderTable,
    refreshAreaFilter,
    openModal,
    saveModal,
    isEdited,
    exportExcel: exportAllExcel,
    exportExcelById,
    openImageMapModal,
    _updateMapToolBtn,
    _mapZoom,
    deleteCurrentImageData,
  };
})();
