/* =====================================================================
   batch.js ― 報告書一括出力モジュール（様式1〜4の一括出力）
   ===================================================================== */

window.App = window.App || {};

App.Batch = (function () {
  "use strict";

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : true;
  }

  function setMsg(msg, isError) {
    const el = document.getElementById("batch-msg");
    if (el) {
      el.textContent = msg;
      el.style.color = isError ? "red" : "green";
    }
  }

  /**
   * 様式1〜4 を一括出力
   * @param {Object} [options] - 出力対象のフラグ { form1, form2, form3, form4 }
   */
  async function exportBatch(options) {
    const Form1 = App.Form1;
    const Form2 = App.Form2;
    const FormLedger = App.FormLedger;
    const Form4 = App.Form4;

    const opts = options || {
      form1: getChecked("b-f1"),
      form2: getChecked("b-f2"),
      form3: getChecked("b-f3"),
      form4: getChecked("b-f4")
    };

    setMsg("一括出力を開始します...", false);

    try {
      // 1. 様式3（金銭出納簿）の Excel 出力
      if (opts.form3 && FormLedger && typeof FormLedger.exportExcel === "function") {
        setMsg("様式3（金銭出納簿）を出力中...", false);
        await FormLedger.exportExcel();
        await delay(500);
      }

      // 2. 様式2（交付金執行状況報告書）の Excel 出力
      if (opts.form2 && Form2 && typeof Form2.exportExcel === "function") {
        setMsg("様式2（交付金執行状況報告書）を出力中...", false);
        if (typeof Form2.render === "function") Form2.render();
        await Form2.exportExcel();
        await delay(500);
      }

      // 3. 様式4（活動記録簿）の Excel 出力
      if (opts.form4 && Form4 && typeof Form4.exportExcel === "function") {
        setMsg("様式4（活動記録簿）を出力中...", false);
        await Form4.exportExcel();
        await delay(500);
      }

      // 4. 様式1（交付金交付申請書）の Word 出力
      if (opts.form1 && Form1 && typeof Form1.exportWord === "function") {
        setMsg("様式1（交付申請書）を出力中...", false);
        Form1.exportWord();
        await delay(500);
      }

      setMsg("すべての対象様式の一括出力が完了しました ✓", false);
    } catch (err) {
      console.error("一括出力中にエラーが発生しました:", err);
      setMsg("一括出力エラー: " + (err.message || err), true);
    }
  }

  return {
    exportBatch: exportBatch,
    exportAll: exportBatch
  };
})();
