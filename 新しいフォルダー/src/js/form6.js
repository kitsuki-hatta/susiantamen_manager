/**
 * form6.js — 様式6：作業写真整理帳
 */

App.Form6 = (() => {
  "use strict";

  // -------------------------------------------------------
  // 内部ユーティリティ
  // -------------------------------------------------------

  function getForm6Data(recId) {
    const all = App.Storage.getForm6() || {};
    return all[recId] || { photos: [] };
  }

  // 活動区分を activityCode から判定
  function _getActivityKubun(activityCode) {
    const monitorCodes = ["moba_14", "higata_16"];
    if (monitorCodes.includes(activityCode)) return "monitoring";
    return "hozen";
  }

  // 実績から備考の初期値（作業員内訳）を生成
  function _buildBikoFromRecord(rec) {
    const memberCount = (rec.members || rec.participants || []).length;
    const volunteerCount = rec.volunteer || rec.volunteerCount || 0;
    const totalCount = rec.people || 0;
    const otherCount = Math.max(0, totalCount - memberCount - volunteerCount);
    return `構成員 ${memberCount}名、非構成員 0名、ボランティア ${volunteerCount}名、その他 ${otherCount}名`;
  }

  /**
   * 備考文字列から0名の項目を除いて表示用テキストを生成
   * 例: "構成員 17名、非構成員 0名、ボランティア 0名、その他 0名"
   *  → "構成員 17名"
   */
  function _buildBikoDisplay(bikoStr) {
    if (!bikoStr) return "";

    // 「◎名」形式のカンマ区切りを分解
    return bikoStr
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter((s) => {
        // "0名" を含む項目を除外
        const match = s.match(/(\d+)名/);
        if (!match) return true; // 数字がなければそのまま表示
        return parseInt(match[1], 10) > 0;
      })
      .join("、");
  }

  /**
   * 備考の表示エリアをリアルタイム更新
   */
  function _refreshBikoDisplay(idx, value) {
    const card = document.querySelector(`.f6-photo-card[data-idx="${idx}"]`);
    if (!card) return;
    const displayDiv = card.querySelectorAll(
      "div[style*='min-height:24px']",
    )[0];
    if (!displayDiv) return;
    const result = _buildBikoDisplay(value);
    displayDiv.innerHTML = result
      ? App.Utils.esc(result)
      : '<span style="color:#475569;">（内訳なし）</span>';
  }

  function saveForm6Data(recId, data) {
    const all = App.Storage.getForm6() || {};
    all[recId] = { ...data, _savedAt: new Date().toISOString() };
    App.Storage.setForm6(all);
    App.DataStore?.pruneMedia();
  }

  function isEdited(recId) {
    const all = App.Storage.getForm6() || {};
    return !!all[recId]?._savedAt;
  }

  // -------------------------------------------------------
  // モーダル内の写真枠描画
  // -------------------------------------------------------

  function renderPhotos(photos) {
    const container = document.getElementById("f6m-photos-container");
    const emptyMsg = document.getElementById("f6m-empty-msg");
    if (!container) return;

    if (!photos || photos.length === 0) {
      container.innerHTML = "";
      if (emptyMsg) emptyMsg.style.display = "block";
      return;
    }
    if (emptyMsg) emptyMsg.style.display = "none";

    // ★ コンテナ自体を縦1列に強制
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "12px";

    container.innerHTML = photos
      .map((p, idx) => {
        const bikoDisplay = _buildBikoDisplay(p.biko || "");

        // 3枚ごとのページ区切り線
        const pageBreak =
          idx > 0 && idx % 3 === 0
            ? `<div style="border-top:2px dashed #334155; margin:4px 0 8px;
                       text-align:center; position:relative;">
             <span style="background:#0f172a; padding:0 10px;
                          font-size:10px; color:#475569;
                          position:relative; top:-9px;">
               ── ${Math.floor(idx / 3) + 1}ページ目 ──
             </span>
           </div>`
            : "";

        return `
        ${pageBreak}

        <!-- ★ カード1枚 = 横幅100%・左右2分割 -->
        <div class="f6-photo-card" data-idx="${idx}"
          style="width:100%; box-sizing:border-box;
                 display:grid; grid-template-columns:1fr 1fr;
                 border:1px solid #334155; border-radius:8px;
                 overflow:hidden; background:#162032;">

          <!-- ===== 左側：写真エリア ===== -->
          <div style="background:#0f172a; display:flex; flex-direction:column;">

            <!-- 写真番号バッジ -->
            <div style="padding:6px 10px; background:#1e293b;
                        font-size:11px; font-weight:bold; color:#7dd3fc;
                        border-bottom:1px solid #334155;">
              写真番号&nbsp;${idx + 1}
              <span style="font-size:9px; color:#475569; margin-left:6px;">
                ${Math.floor(idx / 3) + 1}ページ / ${(idx % 3) + 1}枚目
              </span>
            </div>

            <!-- 写真クリックエリア -->
            <div onclick="App.Form6._selectImage(${idx})"
              style="flex:1; min-height:180px; cursor:pointer;
                     display:flex; align-items:center; justify-content:center;
                     overflow:hidden;">
              ${
                p.dataUrl
                  ? `<img src="${p.dataUrl}"
                     style="width:100%; height:100%;
                            object-fit:cover; display:block;">`
                  : `<div style="text-align:center; color:#475569; padding:20px;">
                     <div style="font-size:36px; margin-bottom:8px;">📷</div>
                     <div style="font-size:11px;">クリックして<br>画像を選択</div>
                   </div>`
              }
            </div>

            <!-- 削除ボタン -->
            <div style="padding:6px 8px; background:#1e293b;
                        border-top:1px solid #334155; text-align:right;">
              <button type="button"
                onclick="App.Form6._removePhoto(${idx})"
                style="background:rgba(239,68,68,.8); border:none;
                       border-radius:4px; color:#fff; font-size:10px;
                       padding:3px 10px; cursor:pointer;">
                ✕ 削除
              </button>
            </div>
          </div>

          <!-- ===== 右側：情報エリア ===== -->
          <div style="border-left:1px solid #334155; display:flex;
                      flex-direction:column; font-size:11px;">

            <!-- 実施日（読み取り専用） -->
            <div style="padding:7px 10px; border-bottom:1px solid #1e293b;">
              <div style="font-size:9px; color:#64748b; margin-bottom:2px;">
                実施日
              </div>
              <div style="color:#94a3b8;">
                ${App.Utils.esc(p.date || "—")}
              </div>
            </div>

            <!-- 活動区分 -->
            <div style="padding:7px 10px; border-bottom:1px solid #1e293b;">
              <div style="font-size:9px; color:#64748b; margin-bottom:3px;">
                活動区分
              </div>
              <select onchange="App.Form6._updatePhotoField(${idx}, 'kubun', this.value)"
                style="width:100%; background:#0f172a; border:1px solid #334155;
                       color:#e2e8f0; border-radius:4px; padding:4px 6px;
                       font-size:11px;">
                <option value="keikaku"
                  ${p.kubun === "keikaku" ? "selected" : ""}>計画づくり</option>
                <option value="monitoring"
                  ${p.kubun === "monitoring" ? "selected" : ""}>モニタリング</option>
                <option value="hozen"
                  ${p.kubun === "hozen" ? "selected" : ""}>保全活動</option>
              </select>
            </div>

            <!-- 場所 -->
            <div style="padding:7px 10px; border-bottom:1px solid #1e293b;">
              <div style="font-size:9px; color:#64748b; margin-bottom:3px;">
                場所
                <span style="font-size:9px; color:#334155; margin-left:4px;">
                  ✏️ 編集可
                </span>
              </div>
              <input type="text"
                value="${App.Utils.esc(p.place || "")}"
                onchange="App.Form6._updatePhotoField(${idx}, 'place', this.value)"
                style="width:100%; background:#0f172a; border:1px solid #334155;
                       color:#e2e8f0; border-radius:4px; padding:4px 6px;
                       font-size:11px; box-sizing:border-box;">
            </div>

            <!-- 活動項目 -->
            <div style="padding:7px 10px; border-bottom:1px solid #1e293b;">
              <div style="font-size:9px; color:#64748b; margin-bottom:3px;">
                活動項目
                <span style="font-size:9px; color:#334155; margin-left:4px;">
                  ✏️ 編集可
                </span>
              </div>
              <input type="text"
                value="${App.Utils.esc(p.actItem || "")}"
                onchange="App.Form6._updatePhotoField(${idx}, 'actItem', this.value)"
                style="width:100%; background:#0f172a; border:1px solid #334155;
                       color:#e2e8f0; border-radius:4px; padding:4px 6px;
                       font-size:11px; box-sizing:border-box;">
            </div>

            <!-- 備考（作業員内訳） -->
            <div style="padding:7px 10px; flex:1; display:flex; flex-direction:column;">
              <div style="font-size:9px; color:#64748b; margin-bottom:3px;">
                備考（作業員内訳）
                <span style="font-size:9px; color:#334155; margin-left:4px;">
                  ✏️ 編集可
                </span>
              </div>
              <!-- 0名非表示の表示エリア -->
              <div style="font-size:11px; color:#94a3b8; background:#0f172a;
                          border:1px solid #1e293b; border-radius:4px;
                          padding:4px 6px; margin-bottom:4px; min-height:22px;">
                ${
                  bikoDisplay
                    ? App.Utils.esc(bikoDisplay)
                    : '<span style="color:#475569; font-size:10px;">（内訳なし）</span>'
                }
              </div>
              <!-- 編集用テキストエリア -->
              <textarea rows="2" id="f6-biko-${idx}"
                onchange="App.Form6._updatePhotoField(${idx}, 'biko', this.value);
                          App.Form6._refreshBikoDisplay(${idx}, this.value);"
                style="width:100%; background:#0f172a; border:1px solid #334155;
                       color:#64748b; border-radius:4px; padding:4px 6px;
                       font-size:10px; resize:vertical; box-sizing:border-box;"
                placeholder="構成員 ◎名、非構成員 ◎名、ボランティア ◎名、その他 ◎名"
                >${App.Utils.esc(p.biko || "")}</textarea>
            </div>

          </div>
          <!-- ===== 右側ここまで ===== -->

        </div>
      `;
      })
      .join("");
  }

  // -------------------------------------------------------
  // 写真操作
  // -------------------------------------------------------

  let _currentRecId = null;
  let _currentPhotos = [];

  function addPhoto() {
    const records = App.Storage.getRecord() || [];
    const areas = App.Storage.getAreas() || [];
    const activities = App.Storage.getActivities?.() || [];
    const recId = document.getElementById("modal-form6-rec-id").value;
    const rec = records.find((r) => r.id === recId);
    const area = rec ? areas.find((a) => a.id === rec.areaId) : null;
    const activity = rec
      ? activities.find((a) => a.code === rec.activityCode)
      : null;

    // 現在の枚数から次の3の倍数まで追加
    const current = _currentPhotos.length;
    const nextBlock = Math.ceil((current + 1) / 3) * 3;
    const addCount = nextBlock - current;

    for (let i = 0; i < addCount; i++) {
      _currentPhotos.push({
        dataUrl: "",
        kubun: rec ? _getActivityKubun(rec.activityCode) : "hozen",
        date: rec?.date || "",
        place: area?.name || "",
        actItem: rec?.workTitle || activity?.label || "",
        biko: rec ? _buildBikoFromRecord(rec) : "",
        caption: "",
      });
    }
    renderPhotos(_currentPhotos);
  }

  function _removePhoto(idx) {
    if (!confirm("この写真枠を削除しますか？")) return;
    _currentPhotos.splice(idx, 1);
    renderPhotos(_currentPhotos);
  }

  function _selectImage(idx) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        _compressImage(ev.target.result, 800, 0.7).then((compressed) => {
          _currentPhotos[idx].dataUrl = compressed;
          renderPhotos(_currentPhotos);

          // 圧縮後サイズを確認
          const kb = Math.round((compressed.length * 0.75) / 1024);
          if (kb > 300) {
            console.warn(`写真${idx + 1}: 圧縮後 ${kb}KB（大きめです）`);
          }
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  /**
   * 画像をリサイズ＆JPEG圧縮してBase64を返す
   * @param {string} dataUrl  元画像のBase64
   * @param {number} maxSize  長辺の最大px（デフォルト800）
   * @param {number} quality  JPEG品質 0〜1（デフォルト0.7）
   * @returns {Promise<string>} 圧縮後Base64
   */
  function _compressImage(dataUrl, maxSize = 800, quality = 0.7) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;

        // 長辺が maxSize を超える場合のみ縮小
        if (w > maxSize || h > maxSize) {
          if (w >= h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = dataUrl;
    });
  }

  function _updatePhotoField(idx, field, value) {
    if (_currentPhotos[idx]) {
      _currentPhotos[idx][field] = value;
    }
  }

  // -------------------------------------------------------
  // 様式6 モーダル
  // -------------------------------------------------------

  function openModal(recId) {
    const records = App.Storage.getRecord() || [];
    const areas = App.Storage.getAreas() || [];
    const activities = App.Storage.getActivities?.() || [];
    const rec = records.find((r) => r.id === recId);
    if (!rec) {
      alert("実績データが見つかりません。");
      return;
    }

    const area = areas.find((a) => a.id === rec.areaId);
    const activity = activities.find((a) => a.code === rec.activityCode);
    const saved = getForm6Data(recId);

    _currentRecId = recId;
    _currentPhotos = JSON.parse(JSON.stringify(saved.photos || []));

    // 既存写真に実績データを補完（未設定の場合のみ）
    _currentPhotos = _currentPhotos.map((p) => ({
      ...p,
      kubun: p.kubun || _getActivityKubun(rec.activityCode),
      place: p.place || area?.name || "",
      actItem: p.actItem || rec.workTitle || activity?.label || "",
      biko: p.biko || _buildBikoFromRecord(rec),
    }));

    // ヘッダー情報
    document.getElementById("modal-form6-title").textContent =
      `📸 様式6：作業写真整理帳の編集（${rec.date}）`;
    document.getElementById("modal-form6-rec-id").value = recId;
    document.getElementById("f6m-date").textContent = rec.date;
    document.getElementById("f6m-area").textContent = area?.name || "—";
    document.getElementById("f6m-activity").textContent =
      rec.workTitle || activity?.label || rec.activityCode || "—";
    document.getElementById("f6m-people").textContent =
      (rec.people ?? "—") + "人";

    renderPhotos(_currentPhotos);
    App.Navigation.openModal("modal-form6");
  }

  async function saveModal() {
    const recId = document.getElementById("modal-form6-rec-id").value;
    if (!recId) return;

    try {
      saveForm6Data(recId, { photos: _currentPhotos });
      if (App.DataStore) await App.DataStore.flush();
    } catch (error) {
      console.error("様式6の保存に失敗しました:", error);
      alert("様式6を保存できませんでした。\n" + error.message);
      return;
    }
    App.Navigation.closeModal("modal-form6");
    App.Form5.renderTable();
    alert("様式6を保存しました。");
  }

  // -------------------------------------------------------
  // Excel出力
  // -------------------------------------------------------

  function exportExcel() {
    const recId = document.getElementById("modal-form6-rec-id").value;
    if (!recId) return;
    exportExcelById(recId);
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
        a.download = `様式6_作業写真整理帳_${rec.date}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  function exportExcelAll() {
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
        a.download = `様式6_作業写真整理帳_一括出力.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  async function _buildExcelWorkbook(records) {
    const wb = new ExcelJS.Workbook();
    const areas = App.Storage.getAreas() || [];
    const org = App.Storage.getOrg() || {};

    // 全写真をフラット化
    const allPhotos = [];
    for (const rec of records) {
      const area = areas.find((a) => a.id === rec.areaId);
      const saved = getForm6Data(rec.id);
      const photos = saved.photos || [];
      if (photos.length === 0) {
        allPhotos.push({ photo: null, rec, area });
      } else {
        photos.forEach((photo) => allPhotos.push({ photo, rec, area }));
      }
    }

    // 3枚ごとにページ分割
    const pages = [];
    for (let i = 0; i < Math.max(allPhotos.length, 1); i += 3) {
      pages.push(allPhotos.slice(i, i + 3));
    }

    const totalPages = pages.length;

    pages.forEach((pageItems, pageIdx) => {
      const ws = wb.addWorksheet(`${pageIdx + 1}ページ`);

      // -------------------------------------------------------
      // A4印刷設定
      // -------------------------------------------------------
      ws.pageSetup = {
        paperSize: 9,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: {
          left: 0.5,
          right: 0.5,
          top: 0.5,
          bottom: 0.5,
          header: 0.3,
          footer: 0.3,
        },
      };

      // -------------------------------------------------------
      // 列幅
      // -------------------------------------------------------
      ws.getColumn(1).width = 0.54; // A
      ws.getColumn(2).width = 9.5; // B
      ws.getColumn(3).width = 6.25; // C
      ws.getColumn(4).width = 32.13; // D
      ws.getColumn(5).width = 3.13; // E
      ws.getColumn(6).width = 13.5; // F
      ws.getColumn(7).width = 18.75; // G

      // -------------------------------------------------------
      // 行の高さ（1～42）
      // -------------------------------------------------------
      ws.getRow(1).height = 14.25;
      ws.getRow(2).height = 24.0;
      ws.getRow(3).height = 24.0;
      for (let r = 4; r <= 42; r++) {
        ws.getRow(r).height = 18.75;
      }

      // -------------------------------------------------------
      // A1：様式名
      // -------------------------------------------------------
      const a1 = ws.getCell("A1");
      a1.value = "（添付様式１３－２）";
      a1.font = { size: 12 };
      a1.alignment = { horizontal: "left", vertical: "middle" };

      // -------------------------------------------------------
      // F2：No.ラベル　G2：ページ番号
      // -------------------------------------------------------
      const f2 = ws.getCell("F2");
      f2.value = "No.";
      f2.font = { size: 12 };
      f2.alignment = { horizontal: "right", vertical: "middle" };

      const g2 = ws.getCell("G2");
      g2.value = pageIdx + 1;
      g2.font = { size: 12 };
      g2.alignment = { horizontal: "center", vertical: "middle" };

      // -------------------------------------------------------
      // B3：タイトル
      // -------------------------------------------------------
      const b3 = ws.getCell("B3");
      b3.value = "作業写真整理帳";
      b3.font = { bold: true, size: 12 };
      b3.alignment = { horizontal: "left", vertical: "middle" };

      // -------------------------------------------------------
      // D3～G3：活動組織名（右寄せ・下線）
      // -------------------------------------------------------
      ws.mergeCells("D3:G3");
      const d3 = ws.getCell("D3");
      d3.value = `活動組織名：${org.orgName || ""}`;
      d3.font = { size: 12, underline: true };
      d3.alignment = { horizontal: "right", vertical: "middle" };

      // -------------------------------------------------------
      // ブロック定義（3枚分）
      // -------------------------------------------------------
      const blockDefs = [
        {
          noRow: 5,
          imgTop: 6,
          imgBot: 16,
          dateRows: [6, 7],
          actRows: [8, 10],
          placeRows: [11, 12],
          actItemRows: [13, 14],
          bikoRows: [15, 16],
        },
        {
          noRow: 18,
          imgTop: 19,
          imgBot: 29,
          dateRows: [19, 20],
          actRows: [21, 23],
          placeRows: [24, 25],
          actItemRows: [26, 27],
          bikoRows: [28, 29],
        },
        {
          noRow: 31,
          imgTop: 32,
          imgBot: 42,
          dateRows: [32, 33],
          actRows: [34, 36],
          placeRows: [37, 38],
          actItemRows: [39, 40],
          bikoRows: [41, 42],
        },
      ];

      const timingLabel = {
        before: "作業前",
        during: "作業中",
        after: "作業後",
        other: "その他",
      };

      // 活動区分チェックボックス文字列生成
      function _activityKubun(timing) {
        const isKeikaku = false; // 現状データに計画づくり区分なし
        const isMonitor = timing === "during";
        const isHozen = timing === "after" || timing === "before";
        return [
          `${isKeikaku ? "■" : "□"}　計画づくり`,
          `${isMonitor ? "■" : "□"}　モニタリング`,
          `${isHozen ? "■" : "□"}　保全活動`,
        ].join("\n");
      }

      // ブロック定義内の各値セット部分を以下に変更
      blockDefs.forEach((def, blockIdx) => {
        const item = pageItems[blockIdx] || null;
        const photo = item?.photo || null;
        const rec = item?.rec || null;
        const area = item?.area || null;
        const photoNo = pageIdx * 3 + blockIdx + 1;

        // 活動区分チェックボックス
        function kubunText(kubun) {
          return [
            `${kubun === "keikaku" ? "■" : "□"}　計画づくり`,
            `${kubun === "monitoring" ? "■" : "□"}　モニタリング`,
            `${kubun === "hozen" ? "■" : "□"}　保全活動`,
          ].join("\n");
        }

        // --- 写真番号行 ---
        const bNo = ws.getCell(`B${def.noRow}`);
        bNo.value = "写真番号";
        bNo.font = { size: 11 };
        bNo.alignment = { horizontal: "left", vertical: "middle" };

        const cNo = ws.getCell(`C${def.noRow}`);
        cNo.value = item ? photoNo : "";
        cNo.font = { size: 11, bold: true };
        cNo.alignment = { horizontal: "center", vertical: "middle" };

        ws.getCell(`D${def.noRow}`).alignment = { vertical: "middle" };

        // --- 写真貼り付けエリア ---
        ws.mergeCells(`B${def.imgTop}:D${def.imgBot}`);
        const photoCell = ws.getCell(`B${def.imgTop}`);
        photoCell.alignment = { horizontal: "center", vertical: "middle" };

        if (
          photo &&
          photo.dataUrl &&
          photo.dataUrl.indexOf("data:image") === 0
        ) {
          const base64 = photo.dataUrl.split(",")[1];
          const ext = photo.dataUrl.indexOf("image/png") >= 0 ? "png" : "jpeg";
          const imgId = wb.addImage({ base64, extension: ext });
          ws.addImage(imgId, {
            tl: { col: 1, row: def.imgTop - 1 },
            br: { col: 4, row: def.imgBot },
          });
        } else {
          photoCell.value = "（写真なし）";
          photoCell.font = { size: 11, color: { argb: "FF94A3B8" } };
        }

        // --- F～G列情報 ---
        _setLabel(ws, "F", def.dateRows[0], def.dateRows[1], "実施年月日");
        _setValue(
          ws,
          "G",
          def.dateRows[0],
          def.dateRows[1],
          rec ? _wareki(rec.date) : "",
        );

        _setLabel(ws, "F", def.actRows[0], def.actRows[1], "活動区分");
        _setValue(
          ws,
          "G",
          def.actRows[0],
          def.actRows[1],
          kubunText(
            photo?.kubun || (rec ? _getActivityKubun(rec.activityCode) : ""),
          ),
        );

        _setLabel(ws, "F", def.placeRows[0], def.placeRows[1], "場所");
        _setValue(
          ws,
          "G",
          def.placeRows[0],
          def.placeRows[1],
          photo?.place || area?.name || (rec ? "—" : ""),
        );

        _setLabel(ws, "F", def.actItemRows[0], def.actItemRows[1], "活動項目");
        _setValue(
          ws,
          "G",
          def.actItemRows[0],
          def.actItemRows[1],
          photo?.actItem || rec?.workTitle || "—",
        );

        _setLabel(ws, "F", def.bikoRows[0], def.bikoRows[1], "備考");
        _setValue(ws, "G", def.bikoRows[0], def.bikoRows[1], photo?.biko || "");
      });
    });

    return wb;
  }

  // -------------------------------------------------------
  // ヘルパー関数
  // -------------------------------------------------------

  /** F列ラベルセル（結合＋罫線あり） */
  function _setLabel(ws, col, rowFrom, rowTo, label) {
    if (rowFrom < rowTo) ws.mergeCells(`${col}${rowFrom}:${col}${rowTo}`);
    const cell = ws.getCell(`${col}${rowFrom}`);
    cell.value = label;
    cell.font = { size: 11 };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDDEBF7" },
    };
    cell.border = _border();
  }

  /** G列値セル（結合＋罫線あり） */
  function _setValue(ws, col, rowFrom, rowTo, value) {
    if (rowFrom < rowTo) ws.mergeCells(`${col}${rowFrom}:${col}${rowTo}`);
    const cell = ws.getCell(`${col}${rowFrom}`);
    cell.value = value || "";
    cell.font = { size: 11 };
    cell.alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = _border();
  }

  /** 罫線（thin・黒） */
  function _border() {
    return {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  /** 和暦変換 */
  function _wareki(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return `令和${y - 2018}年${m}月${d}日`;
  }

  // -------------------------------------------------------
  // 印刷
  // -------------------------------------------------------

  function printCurrent() {
    const recId = document.getElementById("modal-form6-rec-id").value;
    if (!recId) return;
    _printByRecId(recId);
  }

  function printAll() {
    const records = App.Storage.getRecord() || [];
    if (records.length === 0) {
      alert("実績データがありません。");
      return;
    }
    const html = records
      .map((r) => _buildPrintHtml(r))
      .join('<div style="page-break-after:always;"></div>');
    _execPrint(html);
  }

  function _printByRecId(recId) {
    const records = App.Storage.getRecord() || [];
    const rec = records.find((r) => r.id === recId);
    if (!rec) return;
    _execPrint(_buildPrintHtml(rec));
  }

  function _buildPrintHtml(rec) {
    const areas = App.Storage.getAreas() || [];
    const org = App.Storage.getOrg() || {};
    const settings = App.Storage.getSettings() || {};
    const area = areas.find((a) => a.id === rec.areaId);
    const saved = getForm6Data(rec.id);
    const photos = saved.photos || [];

    const timingLabel = {
      before: "作業前",
      during: "作業中",
      after: "作業後",
      other: "その他",
    };

    const pages = [];
    for (let i = 0; i < Math.max(photos.length, 1); i += 3) {
      pages.push(photos.slice(i, i + 3));
    }

    return pages
      .map(
        (pagePhotos, pageIdx) => `
      <div style="font-family:'MS Mincho',serif; padding:20px;
                  max-width:800px; margin:0 auto;">
        <h2 style="text-align:center; font-size:16px; margin-bottom:4px;">
          様式6　作業写真整理帳
        </h2>
        <div style="text-align:right; font-size:11px; margin-bottom:8px;">
          ${pageIdx + 1} / ${pages.length} ページ
        </div>
        <table style="width:100%; border-collapse:collapse;
                      font-size:12px; margin-bottom:8px;">
          <tr>
            <td style="border:1px solid #000; padding:4px 8px;
                       width:15%; font-weight:bold;">活動組織名</td>
            <td style="border:1px solid #000; padding:4px 8px; width:35%;">
              ${App.Utils.esc(org.orgName || "")}
            </td>
            <td style="border:1px solid #000; padding:4px 8px;
                       width:15%; font-weight:bold;">実施日</td>
            <td style="border:1px solid #000; padding:4px 8px; width:35%;">
              ${rec.date}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:4px 8px;
                       font-weight:bold;">地区名</td>
            <td style="border:1px solid #000; padding:4px 8px;">
              ${App.Utils.esc(area?.name || "—")}
            </td>
            <td style="border:1px solid #000; padding:4px 8px;
                       font-weight:bold;">活動項目</td>
            <td style="border:1px solid #000; padding:4px 8px;">
              ${App.Utils.esc(rec.activityName || rec.activityId || "—")}
            </td>
          </tr>
        </table>
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            ${pagePhotos
              .map(
                (p) => `
              <td style="border:1px solid #000; width:33%;
                         padding:8px; vertical-align:top; text-align:center;">
                ${
                  p.dataUrl
                    ? `<img src="${p.dataUrl}"
                       style="max-width:100%; max-height:180px; object-fit:contain;">`
                    : `<div style="width:100%; height:180px; background:#f0f0f0;
                       display:flex; align-items:center; justify-content:center;
                       color:#999; font-size:12px;">（写真なし）</div>`
                }
                <div style="margin-top:6px; font-size:11px;
                            font-weight:bold; text-align:left;">
                  【${timingLabel[p.timing] || p.timing}】
                </div>
                <div style="font-size:11px; text-align:left;
                            margin-top:2px; min-height:40px;">
                  ${App.Utils.esc(p.caption || "")}
                </div>
              </td>
            `,
              )
              .join("")}
            ${
              pagePhotos.length < 3
                ? Array(3 - pagePhotos.length)
                    .fill(0)
                    .map(
                      () =>
                        `<td style="border:1px solid #000; width:33%; padding:8px;"></td>`,
                    )
                    .join("")
                : ""
            }
          </tr>
        </table>
      </div>
    `,
      )
      .join('<div style="page-break-after:always;"></div>');
  }

  function _execPrint(html) {
    const printArea = document.getElementById("f6-print");
    if (!printArea) return;
    printArea.innerHTML = html;
    window.print();
    setTimeout(() => {
      printArea.innerHTML = "";
    }, 1000);
  }

  // -------------------------------------------------------
  // イベント登録
  // -------------------------------------------------------
  function bindEvents() {
    document
      .getElementById("btn-save-form6-modal")
      ?.addEventListener("click", saveModal);

    document
      .getElementById("btn-f6m-add-photo")
      ?.addEventListener("click", addPhoto);

    document
      .getElementById("btn-f6m-print")
      ?.addEventListener("click", printCurrent);

    document
      .getElementById("btn-f6m-export-excel")
      ?.addEventListener("click", exportExcel);

    document
      .getElementById("btn-f56-print-all-f6")
      ?.addEventListener("click", printAll);

    document
      .getElementById("btn-f6-export-excel-all")
      ?.addEventListener("click", exportExcelAll);
  }

  // -------------------------------------------------------
  // 公開 API
  // -------------------------------------------------------
  return {
    init() {
      bindEvents();
    },
    openModal,
    saveModal,
    isEdited,
    addPhoto,
    _removePhoto,
    _selectImage,
    _updatePhotoField,
    _refreshBikoDisplay,
    printCurrent,
    printAll,
    exportExcel,
    exportExcelById,
    exportExcelAll,
    // 旧API互換
    addEntry: addPhoto,
  };
})();
