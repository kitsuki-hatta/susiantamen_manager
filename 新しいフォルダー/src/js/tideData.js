/* ============================================================
   tideData.js
   潮汐データ（気象庁形式 HD16 .txt）の読み込み・解析・検索
   フォルダ選択ボタンから一括読み込みに対応
   ============================================================ */

window.App = window.App || {};

App.TideData = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;

  /* 基準面補正値（大分港潮高零位 → T.P.基準） */
  const TP_OFFSET = 194.7; // cm

  /* 内部キャッシュ */
  let cache = null;

  /* ============================================================
     初期化
     ============================================================ */
  function setup() {
    cache = Storage.load(
      Storage.KEYS.tideData,
      Storage.getDefaultByKey(Storage.KEYS.tideData) || {},
    );
    updateStatus();
    bindFileInput(); // ← bindFolderInput から変更
    bindClearBtn();
  }

  /* ============================================================
   ファイル選択バインド（複数ファイル対応）
   ============================================================ */
  function bindFileInput() {
    const input = document.getElementById("tide-folder-input");
    const btnImp = document.getElementById("tide-data-import-btn");
    if (!btnImp || btnImp.dataset.bound) return;
    btnImp.dataset.bound = "1";

    btnImp.addEventListener("click", function () {
      const files = Array.from(input ? input.files || [] : []).filter(
        function (f) {
          return f.name.match(/\.txt$/i);
        },
      );

      if (!files.length) {
        showMsg("⚠️ .txt ファイルを選択してください。", "#c62828");
        return;
      }

      const data = Storage.load(
        Storage.KEYS.tideData,
        Storage.getDefaultByKey(Storage.KEYS.tideData) || {},
      );
      let totalDays = 0;
      let doneCount = 0;
      const total = files.length;

      files.forEach(function (file) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          const added = parseHD16Text(ev.target.result, data);
          totalDays += added;
          doneCount++;

          if (doneCount === total) {
            if (Storage.save(Storage.KEYS.tideData, data)) {
              cache = data;
              showMsg(
                "✅ " +
                  total +
                  " ファイルから " +
                  totalDays +
                  " 日分の潮汐データを読み込みました。",
                "#2e7d32",
              );
              updateStatus();
              if (App.Master && App.Master.renderTidePanel) {
                App.Master.renderTidePanel();
              }
            }
            if (input) input.value = "";
          }
        };
        reader.onerror = function () {
          doneCount++;
          showMsg("⚠️ " + file.name + " の読み込みに失敗しました。", "#c62828");
          if (input) input.value = "";
        };
        reader.readAsText(file, "UTF-8");
      });
    });
  }

  /* ============================================================
     HD16形式テキストのパース
     1行 = HD16,YYYY/MM/DD,h0,h1,...,h23
     data オブジェクトに追記して追加日数を返す
     ============================================================ */
  function parseHD16Text(text, data) {
    let added = 0;
    const lines = String(text || "").split(/\r?\n/);
    lines.forEach(function (line) {
      line = line.trim();
      if (!line) return;

      const cols = line.split(",");
      // 最低26列（HD16 + 日付 + 24時間分）
      if (cols.length < 26) return;
      // 先頭が HD16 であることを確認
      if (String(cols[0]).trim().toUpperCase() !== "HD16") return;

      // "YYYY/MM/DD" → "YYYY-MM-DD"
      const dateKey = String(cols[1]).trim().replace(/\//g, "-");
      if (!dateKey.match(/^\d{4}-\d{2}-\d{2}$/)) return;

      const hourly = [];
      for (let i = 2; i < 26; i++) {
        const val = parseInt(cols[i], 10);
        hourly.push(isNaN(val) ? null : val);
      }

      // 同一日付は上書き
      if (!data[dateKey]) added++;
      data[dateKey] = hourly;
    });
    return added;
  }

  /* ============================================================
     全削除
     ============================================================ */
  function bindClearBtn() {
    const btn = document.getElementById("tide-data-clear-btn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      if (
        !confirm(
          "読み込んだ潮汐データをすべて削除しますか？\n作業記録自体は削除されません。",
        )
      )
        return;
      cache = {};
      Storage.save(Storage.KEYS.tideData, cache);
      showMsg("✅ 潮汐データを削除しました。", "#2e7d32");
      updateStatus();
      if (App.Master && App.Master.renderTidePanel)
        App.Master.renderTidePanel();
    });
  }

  /* ============================================================
     読込状況の表示
     ============================================================ */
  function updateStatus() {
    const el = document.getElementById("tide-data-status");
    if (!el) return;
    const data = getCache();
    const dates = Object.keys(data).sort();
    if (!dates.length) {
      el.textContent = "潮汐データは未読込です。";
      el.style.color = "#888";
      return;
    }
    el.textContent =
      dates.length +
      " 日分のデータを読込済み（" +
      dates[0] +
      " 〜 " +
      dates[dates.length - 1] +
      "）";
    el.style.color = "#2e7d32";
  }

  /* ============================================================
     メッセージ表示
     ============================================================ */
  function showMsg(text, color) {
    const el = document.getElementById("tide-data-msg");
    if (!el) return;
    el.textContent = text;
    el.style.color = color || "#333";
    // 8秒後に消す
    setTimeout(function () {
      if (el.textContent === text) el.textContent = "";
    }, 8000);
  }

  /* ============================================================
     公開API
     ============================================================ */

  /**
   * 指定日付と時間帯の潮位（最大・最小・開始・終了）を返す
   * @param {string} date      "YYYY-MM-DD"
   * @param {string} startTime "HH:MM"
   * @param {string} endTime   "HH:MM"
   */
  function lookup(date, startTime, endTime) {
    const data = getCache();
    const hourly = data[date];
    if (!hourly || !Array.isArray(hourly)) {
      return { max: null, min: null, start: null, end: null };
    }
    const sh = parseInt((startTime || "").split(":")[0], 10);
    const eh = parseInt((endTime || "").split(":")[0], 10);
    if (isNaN(sh) || isNaN(eh)) {
      return { max: null, min: null, start: null, end: null };
    }
    const values = [];
    for (let h = sh; h <= eh; h++) {
      if (h >= 0 && h < 24 && hourly[h] != null) {
        values.push(hourly[h] - TP_OFFSET);
      }
    }
    if (!values.length) {
      return { max: null, min: null, start: null, end: null };
    }
    const sRaw = sh >= 0 && sh < 24 ? hourly[sh] : null;
    const eRaw = eh >= 0 && eh < 24 ? hourly[eh] : null;
    return {
      max: Math.round(Math.max.apply(null, values)),
      min: Math.round(Math.min.apply(null, values)),
      start: sRaw != null ? Math.round(sRaw - TP_OFFSET) : null,
      end: eRaw != null ? Math.round(eRaw - TP_OFFSET) : null,
    };
  }

  /**
   * 指定日付の24時間分潮位配列を返す（T.P.補正済み）
   * @param {string} date "YYYY-MM-DD"
   * @returns {number[]|null}
   */
  function getHourly(date) {
    const data = getCache();
    const hourly = data[date];
    if (!hourly || !Array.isArray(hourly)) return null;
    return hourly.map(function (v) {
      return v != null ? Math.round(v - TP_OFFSET) : null;
    });
  }

  /**
   * 全データを返す（生データ・補正なし）
   * @returns {Object} { "YYYY-MM-DD": [h0,...,h23], ... }
   */
  function list() {
    return getCache();
  }

  /**
   * 指定日付のデータを削除
   * @param {string} date "YYYY-MM-DD"
   */
  function removeDate(date) {
    const data = getCache();
    delete data[date];
    Storage.save(Storage.KEYS.tideData, data);
    cache = data;
  }

  /**
   * テキストから一括マージ（master.js の既存UIとの互換用）
   */
  function mergeFromText(text) {
    const data = getCache();
    const added = parseHD16Text(text, data);
    Storage.save(Storage.KEYS.tideData, data);
    cache = data;
    return { imported: added, dates: Object.keys(data) };
  }

  /**
   * 月齢から潮名を推定
   * @param {string} date "YYYY-MM-DD"
   */
  function getTideName(date) {
    const age = calcMoonAge(date);
    if (age === null) return "";
    if (age < 1.5 || age >= 28.5) return "大潮";
    if (age < 4.0) return "中潮";
    if (age < 7.0) return "小潮";
    if (age < 9.0) return "長潮";
    if (age < 10.5) return "若潮";
    if (age < 13.5) return "中潮";
    if (age < 16.5) return "大潮";
    if (age < 19.5) return "中潮";
    if (age < 22.5) return "小潮";
    if (age < 24.0) return "長潮";
    if (age < 25.5) return "若潮";
    return "中潮";
  }

  /* ============================================================
     内部ユーティリティ
     ============================================================ */
  function getCache() {
    if (cache === null) {
      cache = Storage.load(
        Storage.KEYS.tideData,
        Storage.getDefaultByKey(Storage.KEYS.tideData) || {},
      );
    }
    return cache;
  }

  function calcMoonAge(dateStr) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    let y = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
    const day = d + 0.5;
    if (mo < 3) {
      y -= 1;
      mo += 12;
    }
    mo += 1;
    const c = Math.floor(365.25 * y);
    const e = Math.floor(30.6 * mo);
    let jd = c + e + day - 694039.09;
    jd /= 29.5305882;
    jd -= Math.floor(jd);
    if (jd < 0) jd += 1;
    return jd * 29.5305882;
  }

  return {
    setup: setup,
    lookup: lookup,
    getHourly: getHourly,
    list: list,
    removeDate: removeDate,
    mergeFromText: mergeFromText,
    getTideName: getTideName,
    getTPOffset: function () {
      return TP_OFFSET;
    },
  };
})();
