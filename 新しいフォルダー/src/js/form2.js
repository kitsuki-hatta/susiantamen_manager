/* =====================================================================
   form2.js ― 様式2 交付金執行状況報告書（画面表示 & Excel出力）
   ===================================================================== */

window.App = window.App || {};

App.Form2 = (function () {
  "use strict";

  const Storage = App.Storage;
  const Calc = App.Calc;
  const Const = App.Const;

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }

  function getIntVal(id) {
    const v = parseInt(getVal(id), 10);
    return isNaN(v) ? 0 : v;
  }

  function warekiDate(d) {
    const date = d ? new Date(d) : new Date();
    if (isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const reiwaYear = year - 2018;
    const yStr = reiwaYear === 1 ? "元" : String(reiwaYear);
    return "令和" + yStr + "年" + month + "月" + day + "日";
  }

  function ok(t) {
    return '<div class="chk ok">✓ ' + esc(t) + "</div>";
  }
  function warn(t) {
    return '<div class="chk warn">△ ' + esc(t) + "</div>";
  }
  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * 画面プレビュー & バリデーションチェックの表示
   */
  function render() {
    // 計画額を App.Budget から参照
    const plans =
      App.Budget && typeof App.Budget.getPlanByPeriod === "function"
        ? App.Budget.getPlanByPeriod()
        : { 1: 0, 2: 0, 3: 0 };
    const plan1 = +plans[1] || 0;
    const plan2 = +plans[2] || 0;
    const plan3 = +plans[3] || 0;

    // 前払請求額を取得
    const prepay1 = getIntVal("f2-prepay1");
    const prepay2 = getIntVal("f2-prepay2");
    const prepay3 = getIntVal("f2-prepay3");

    // 実績額を金銭出納簿（Calc.summarizeByPeriod）から直接取得
    const summary = Calc.summarizeByPeriod();
    const p1 = (summary && summary.periods && summary.periods[1]) || {
      executed: 0,
      count: 0,
    };
    const p2 = (summary && summary.periods && summary.periods[2]) || {
      executed: 0,
      count: 0,
    };
    const p3 = (summary && summary.periods && summary.periods[3]) || {
      executed: 0,
      count: 0,
    };

    const checks = [];
    if (plan1 + plan2 + plan3 === 0) {
      checks.push(warn("計画額が未入力です"));
    } else {
      checks.push(ok("計画額合計 " + Calc.yen(plan1 + plan2 + plan3) + "円"));
    }

    checks.push(
      ok(
        "第1回実績： " +
          Calc.yen(p1.executed) +
          "円 (" +
          (p1.count || 0) +
          "件)",
      ),
    );
    checks.push(
      ok(
        "第2回実績： " +
          Calc.yen(p2.executed) +
          "円 (" +
          (p2.count || 0) +
          "件)",
      ),
    );
    checks.push(
      ok(
        "第3回実績： " +
          Calc.yen(p3.executed) +
          "円 (" +
          (p3.count || 0) +
          "件)",
      ),
    );

    const checkDiv = document.getElementById("f2-check");
    if (checkDiv) {
      checkDiv.innerHTML =
        '<div class="check-box">' + checks.join("") + "</div>";
    }

    const previewDiv = document.getElementById("f2-preview");
    if (previewDiv) {
      let html =
        "<h4>【期別実績集計】</h4>" +
        '<table class="data-table" border="1" style="border-collapse:collapse; width:100%; text-align:left;">' +
        '<thead><tr style="background-color:#f2f2f2;"><th>期</th><th>計画額</th><th>実績額（支出計）</th><th>前払請求額</th></tr></thead>' +
        "<tbody>" +
        "<tr><td>第1回(4-6月)</td><td>" +
        Calc.yen(plan1) +
        "円</td><td>" +
        Calc.yen(p1.executed) +
        "円</td><td>" +
        Calc.yen(prepay1) +
        "円</td></tr>" +
        "<tr><td>第2回(7-10月)</td><td>" +
        Calc.yen(plan2) +
        "円</td><td>" +
        Calc.yen(p2.executed) +
        "円</td><td>" +
        Calc.yen(prepay2) +
        "円</td></tr>" +
        "<tr><td>第3回(11-2月)</td><td>" +
        Calc.yen(plan3) +
        "円</td><td>" +
        Calc.yen(p3.executed) +
        "円</td><td>" +
        Calc.yen(prepay3) +
        "円</td></tr>" +
        '<tr style="font-weight:bold; background-color:#fff2cc;"><td>合計</td><td>' +
        Calc.yen(plan1 + plan2 + plan3) +
        "円</td><td>" +
        Calc.yen(p1.executed + p2.executed + p3.executed) +
        "円</td><td>" +
        Calc.yen(prepay1 + prepay2 + prepay3) +
        "円</td></tr>" +
        "</tbody></table>";
      previewDiv.innerHTML = html;
    }
  }

  /**
   * 交付金執行状況報告書を ExcelJS で Excel ファイルに出力します。
   */
  async function exportExcel() {
    if (typeof ExcelJS === "undefined") {
      alert("ExcelJS ライブラリが読み込まれていません。");
      return;
    }

    render();
    const settings =
      Storage && Storage.getSettings ? Storage.getSettings() : {};
    const org = Storage && Storage.getOrg ? Storage.getOrg() : {};
    const year = settings.year || "";

    // 入力データ取得
    const plans =
      App.Budget && typeof App.Budget.getPlanByPeriod === "function"
        ? App.Budget.getPlanByPeriod()
        : { 1: 0, 2: 0, 3: 0 };
    const plan1 = +plans[1] || 0;
    const plan2 = +plans[2] || 0;
    const plan3 = +plans[3] || 0;

    const prepay1 = getIntVal("f2-prepay1");
    const prepay2 = getIntVal("f2-prepay2");
    const prepay3 = getIntVal("f2-prepay3");

    const prepayNote1 = getVal("f2-prepay-note1");
    const prepayNote2 = getVal("f2-prepay-note2");
    const prepayNote3 = getVal("f2-prepay-note3");

    const actNote1 = getVal("f2-activity-note1");
    const actNote2 = getVal("f2-activity-note2");
    const actNote3 = getVal("f2-activity-note3");

    const otherNote = getVal("f2-other-note");

    // 実績額取得
    const summary = Calc.summarizeByPeriod();
    const p1 = (summary && summary.periods && summary.periods[1]) || {
      executed: 0,
    };
    const p2 = (summary && summary.periods && summary.periods[2]) || {
      executed: 0,
    };
    const p3 = (summary && summary.periods && summary.periods[3]) || {
      executed: 0,
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("交付金執行状況報告書");

    function boxBorder() {
      if (App.FormLedger && typeof App.FormLedger.boxBorder === "function") {
        return App.FormLedger.boxBorder();
      }
      const s = { style: "thin", color: { argb: "FF999999" } };
      return { top: s, left: s, bottom: s, right: s };
    }

    // 1行目：提出日付
    ws.getCell("E1").value = warekiDate(new Date());
    ws.getCell("E1").alignment = { horizontal: "right" };
    ws.getCell("E1").font = { size: 10 };

    // 2行目：タイトル
    ws.mergeCells("A2:E2");
    const titleCell = ws.getCell("A2");
    titleCell.value =
      "令和" +
      (year ? year : "X") +
      "年度 漁場生産力・水産多面的機能強化対策事業 交付金執行状況報告書";
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    // 3〜4行目：宛先・組織名
    ws.getCell("A3").value =
      "大分県漁場生産力・水産多面的機能強化対策協議会 会長 殿";
    ws.getCell("A4").value = "活動組織名：" + (org.orgName || "");

    ws.getRow(5).height = 5;

    // 【1】期別 計画・実績・前払請求
    ws.getCell("A6").value = "【1】期別 計画・実績・前払請求";
    ws.getCell("A6").font = { bold: true, size: 11 };

    const hr1Row = ws.getRow(7);
    [
      "期",
      "計画額（円）",
      "実績額（円）",
      "前払請求額（円）",
      "前払請求内容",
    ].forEach(function (v, i) {
      const cell = hr1Row.getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true, size: 10 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8F0E8" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = boxBorder();
    });

    const periodRowsData = [
      ["第1回(4-6月)", plan1, p1.executed, prepay1, prepayNote1],
      ["第2回(7-10月)", plan2, p2.executed, prepay2, prepayNote2],
      ["第3回(11-2月)", plan3, p3.executed, prepay3, prepayNote3],
    ];

    periodRowsData.forEach(function (rowData) {
      const row = ws.addRow(rowData);
      row.height = 30;
      row.eachCell(function (c, colIdx) {
        c.border = boxBorder();
        c.font = { size: 10 };
        if (colIdx >= 2 && colIdx <= 4) {
          c.numFmt = "#,##0";
          c.alignment = { horizontal: "right", vertical: "middle" };
        } else if (colIdx === 5) {
          c.alignment = { wrapText: true, vertical: "top" };
        } else {
          c.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
    });

    const totalPlan = plan1 + plan2 + plan3;
    const totalExec = p1.executed + p2.executed + p3.executed;
    const totalPrepay = prepay1 + prepay2 + prepay3;

    const totRow = ws.addRow(["合計", totalPlan, totalExec, totalPrepay, ""]);
    totRow.height = 24;
    totRow.eachCell(function (c, colIdx) {
      c.font = { bold: true, size: 10 };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
      c.border = boxBorder();
      if (colIdx >= 2 && colIdx <= 4) {
        c.numFmt = "#,##0";
        c.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        c.alignment = { horizontal: "center", vertical: "middle" };
      }
    });

    ws.getRow(ws.lastRow.number + 1).height = 5;

    // 【2】活動の工夫・気づき（出来高が計画と異なる場合は理由）
    const note2HeaderRow = ws.lastRow.number + 1;
    ws.getCell("A" + note2HeaderRow).value =
      "【2】活動の工夫・気づき（出来高が計画と異なる場合は理由）";
    ws.getCell("A" + note2HeaderRow).font = { bold: true, size: 11 };

    const actNotesData = [
      ["第1回(4-6月)", actNote1],
      ["第2回(7-10月)", actNote2],
      ["第3回(11-2月)", actNote3],
    ];

    actNotesData.forEach(function (rowData) {
      const row = ws.addRow(rowData);
      row.height = 40;
      row.eachCell(function (c, colIdx) {
        c.border = boxBorder();
        c.font = { size: 10 };
        if (colIdx === 1) {
          c.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          c.alignment = { wrapText: true, vertical: "top" };
        }
      });
      ws.mergeCells("B" + row.number + ":E" + row.number);
    });

    ws.getRow(ws.lastRow.number + 1).height = 5;

    // 【3】その他の報告事項
    const note3HeaderRow = ws.lastRow.number + 1;
    ws.getCell("A" + note3HeaderRow).value = "【3】その他の報告事項";
    ws.getCell("A" + note3HeaderRow).font = { bold: true, size: 11 };

    const otherRow = ws.addRow(["その他の事項", otherNote]);
    otherRow.height = 60;
    otherRow.eachCell(function (c, colIdx) {
      c.border = boxBorder();
      c.font = { size: 10 };
      if (colIdx === 1) {
        c.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        c.alignment = { wrapText: true, vertical: "top" };
      }
    });
    ws.mergeCells("B" + otherRow.number + ":E" + otherRow.number);

    // 列幅設定
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 36;

    // ---- A4 1枚印刷設定 ----
    ws.pageSetup = {
      paperSize: 9, // A4
      orientation: "portrait", // 縦向き
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.6,
        bottom: 0.6,
        header: 0.2,
        footer: 0.2,
      },
    };

    // 印刷範囲をデータ最終行まで設定
    ws.printArea = "A1:E" + ws.lastRow.number;

    let filename = "様式2_交付金執行状況報告書.xlsx";
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

  return {
    render: render,
    exportExcel: exportExcel,
    warekiDate: warekiDate,
  };
})();
