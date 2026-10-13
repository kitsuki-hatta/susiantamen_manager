/* =====================================================================
   form-ledger.js ― 様式3 金銭出納簿（画面表示 & Excel出力）
   ===================================================================== */

window.App = window.App || {};

App.FormLedger = (function () {
  "use strict";

  const Storage = App.Storage;
  const Calc = App.Calc;
  const Const = App.Const;
  const Master = App.Master;

  // 行データから紐付く領収書番号を取得する
  function getReceiptNosForRow(r) {
    const allExpenses = App.Budget ? App.Budget.listBudgetExpense() : [];
    const matched = allExpenses.filter(function (exp) {
      if (!exp.slipNo) return false;
      if (r.sourceType === "record" && r.sourceId) {
        return (exp.recordIds || []).some(function (rid) {
          return String(rid) === String(r.sourceId);
        });
      }
      if (r.sourceType === "invLog" && r.sourceId) {
        return (exp.inventoryLogIds || []).some(function (lid) {
          return String(lid) === String(r.sourceId);
        });
      }
      return false;
    });
    // 重複除去・数値部分のみ抽出して返す
    const slipNos = matched.map(function (e) {
      const raw = String(e.slipNo).trim();
      // 数字以外を除去（全角数字も半角に変換）
      const numOnly = raw
        .replace(/[０-９]/g, function (c) {
          return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
        })
        .replace(/[^0-9]/g, "");
      return numOnly || raw; // 数字が取れなければ元の値をフォールバック
    });
    return Array.from(new Set(slipNos));
  }

  /**
   * 画面上に金銭出納簿のプレビューをレンダリングします。
   */
  function render() {
    const periodSelect = document.getElementById("ledger-period");
    const period = periodSelect ? periodSelect.value : "all";
    const rows = Calc.buildLedgerRows(period);
    const tbl = document.getElementById("ledger-table");

    if (!tbl) return;

    // 実績がある費目のみ動的に表示
    const allItems = Const.expenseItems; // 全費目定義
    const activeItems = allItems.filter(function (it) {
      return rows.some(function (r) {
        return (r.alloc[it.key] || 0) > 0;
      });
    });

    const head =
      "<tr><th>No</th><th>活動日</th><th>内容</th><th>地区</th>" +
      "<th>収入</th>" +
      activeItems
        .map(function (it) {
          return "<th>" + esc(it.label) + "</th>";
        })
        .join("") +
      "<th>支出計</th><th>残高</th><th>領収書番号</th><th>備考</th></tr>";

    let body = "";
    rows.forEach(function (r) {
      const rowKey = getRowKey(r);
      body +=
        "<tr>" +
        "<td>" +
        r.no +
        "</td>" +
        "<td>" +
        (r.date || "") +
        "</td>" +
        "<td>" +
        esc(r.activityItem || "") +
        "</td>" +
        "<td>" +
        esc(r.area || "") +
        "</td>" +
        "<td>" +
        Calc.yen(r.income || 0) +
        "</td>" +
        activeItems
          .map(function (it) {
            return "<td>" + Calc.yen(r.alloc[it.key] || 0) + "</td>";
          })
          .join("") +
        "<td><strong>" +
        Calc.yen(r.expense || 0) +
        "</strong></td>" +
        "<td>" +
        Calc.yen(r.balance) +
        "</td>" +
        (function () {
          if (r.sourceType === "grantFlow") return "<td>—</td>";
          const autoNos = getReceiptNosForRow(r);
          const displayVal =
            autoNos.length > 0 ? autoNos.join("　") : r.receiptNo || "";
          return (
            '<td><input type="text" class="ledger-receipt-input" data-row-key="' +
            esc(rowKey) +
            '" value="' +
            esc(displayVal) +
            '" style="width:100%; box-sizing:border-box;"></td>'
          );
        })() +
        "<td>" +
        esc(r.itemNote || "") +
        "</td>" +
        "</tr>";
    });

    const t = Calc.totalByItem(rows);
    body +=
      '<tr class="row-total">' +
      '<td colspan="4">合計</td>' +
      "<td><strong>" +
      Calc.yen(t.income || 0) +
      "</strong></td>" +
      activeItems
        .map(function (it) {
          return "<td>" + Calc.yen(t.byItem[it.key] || 0) + "</td>";
        })
        .join("") +
      "<td><strong>" +
      Calc.yen(t.total) +
      "</strong></td>" +
      '<td colspan="3"></td>' +
      "</tr>";

    tbl.innerHTML = head + body;

    // 領収書番号入力のイベントリスナーを設定
    tbl.querySelectorAll(".ledger-receipt-input").forEach(function (input) {
      input.addEventListener("change", function () {
        setReceiptNo(input.dataset.rowKey, input.value);
      });
    });

    const summaryDiv = document.getElementById("ledger-summary");
    if (summaryDiv) {
      summaryDiv.innerHTML =
        "<p>対象件数：" +
        rows.length +
        "件 ／ 収入合計：<strong>" +
        Calc.yen(t.income || 0) +
        "円</strong> ／ 支出合計：<strong>" +
        Calc.yen(t.total) +
        "円</strong></p>";
    }
  }

  /**
   * 金銭出納簿を ExcelJS で Excel ファイルに出力します。
   */
  async function exportExcel() {
    if (typeof ExcelJS === "undefined") {
      alert("ExcelJS ライブラリが読み込まれていません。");
      return;
    }

    const periodSelect = document.getElementById("ledger-period");
    const period = periodSelect ? periodSelect.value : "all";
    const rows = Calc.buildLedgerRows(period);
    const settings = Storage.getSettings();
    const org = Storage.getOrg();
    const year = settings.year || "";

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("金銭出納簿");

    // 1〜2行目は空白

    // 3行目 タイトル
    ws.mergeCells("B3:AG3");
    ws.getCell("B3").value =
      "令和" +
      (year ? year : "X") +
      "年度 漁場生産力・水産多面的機能強化対策 金銭出納簿";
    ws.getCell("B3").font = { size: 14, bold: true };
    ws.getCell("B3").alignment = { horizontal: "center", vertical: "middle" };

    // 4〜5行目 活動項目名（有効化されている上位2つの活動項目を表示）
    const enabledActs =
      Master && typeof Master.getEnabledActivities === "function"
        ? Master.getEnabledActivities()
        : [];
    ws.getCell("Q4").value = "活動項目：";
    ws.getCell("R4").value = enabledActs[0] ? enabledActs[0].label : "";
    ws.getCell("Q5").value = "活動項目：";
    ws.getCell("R5").value = enabledActs[1] ? enabledActs[1].label : "";

    // 6行目 組織名
    ws.mergeCells("AB6:AC6");
    ws.getCell("AB6").value = "活動組織名：";
    ws.mergeCells("AD6:AG6");
    ws.getCell("AD6").value = org.orgName || "";

    // 8〜10行目ヘッダー
    ws.mergeCells("B8:B10");
    ws.getCell("B8").value = "収入・支出した日付";
    ws.mergeCells("C8:C10");
    ws.getCell("C8").value = "活動項目";
    ws.mergeCells("E8:E10");
    ws.getCell("E8").value = "内容";
    ws.mergeCells("F8:J8");
    ws.mergeCells("K8:K10");
    ws.getCell("K8").value = "収入（円）";
    ws.mergeCells("L8:AA8");
    ws.getCell("L8").value = "支出（円）";
    ws.mergeCells("AB8:AB10");
    ws.getCell("AB8").value = "残高（円）";
    ws.mergeCells("AC8:AC10");
    ws.getCell("AC8").value = "領収書番号";
    ws.mergeCells("AD8:AD10");
    ws.getCell("AD8").value = "活動実施日";
    ws.mergeCells("AE8:AF8");
    ws.getCell("AE8").value = "立替払";
    ws.mergeCells("AG8:AG10");
    ws.getCell("AG8").value = "備考（財産の保管場所）";

    ws.mergeCells("D9:D10");
    ws.getCell("D9").value = "潜水作業";
    ws.mergeCells("F9:J9");
    ws.getCell("F9").value = "内訳";
    ws.mergeCells("L9:L10");
    ws.getCell("L9").value = "小計";
    ws.mergeCells("M9:AA9");
    ws.getCell("M9").value = "内訳";
    ws.mergeCells("AE9:AE10");
    ws.getCell("AE9").value = "立替日";
    ws.mergeCells("AF9:AF10");
    ws.getCell("AF9").value = "立替者";

    ws.getCell("F10").value = "単価";
    ws.mergeCells("G10:H10");
    ws.getCell("G10").value = "数量1";
    ws.mergeCells("I10:J10");
    ws.getCell("I10").value = "数量2";
    ws.getCell("M10").value = "①日当";
    ws.getCell("N10").value = "②謝金";
    ws.getCell("O10").value = "③傭船料";
    ws.getCell("P10").value = "④資材費";
    ws.getCell("Q10").value = "⑤機材費";
    ws.getCell("R10").value = "⑥リース費";
    ws.getCell("S10").value = "⑦交通費";
    ws.getCell("T10").value = "⑧運搬費";
    ws.getCell("U10").value = "⑨委託費";
    ws.getCell("V10").value = "⑩啓発普及費";
    ws.getCell("W10").value = "⑪教材費";
    ws.getCell("X10").value = "⑫施設利用料";
    ws.getCell("Y10").value = "⑬廃棄物等処理費";
    ws.getCell("Z10").value = "⑭種苗購入費";
    ws.getCell("AA10").value = "⑮その他対策事業に必要な経費";

    // 行の高さ
    ws.getRow(8).height = 20.25;
    ws.getRow(9).height = 20.25;
    ws.getRow(10).height = 40.5;

    // 列幅の設定
    ws.getColumn("A").width = 3.5;
    ws.getColumn("B").width = 10.88;
    ws.getColumn("C").width = 10.88;
    ws.getColumn("D").width = 10.88;
    ws.getColumn("E").width = 43.25;
    ws.getColumn("F").width = 8.38;
    ws.getColumn("G").width = 4.13;
    ws.getColumn("H").width = 4.13;
    ws.getColumn("I").width = 4.13;
    ws.getColumn("J").width = 4.13;
    ws.getColumn("K").width = 10.88;
    ws.getColumn("L").width = 10.88;
    [
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "AA",
    ].forEach(function (col) {
      ws.getColumn(col).width = 10.25;
    });
    ws.getColumn("AB").width = 10.88;
    ws.getColumn("AC").width = 7.13;
    ws.getColumn("AD").width = 10.88;
    ws.getColumn("AE").width = 10.88;
    ws.getColumn("AF").width = 10.88;
    ws.getColumn("AG").width = 23.25;

    // ヘッダースタイル適用
    for (let r = 8; r <= 10; r++) {
      for (let c = 2; c <= 33; c++) {
        const cell = ws.getCell(r, c);
        cell.font = { bold: true, size: 9 };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F0E8" },
        };
        cell.border = boxBorder();
      }
    }

    // 明細データの書き込み
    let rowNo = 11;
    let runningBalance = 0;
    rows.forEach(function (r) {
      const itemVals = Const.expenseItems.map(function (it) {
        return r.alloc[it.key] || 0;
      });
      const txDate = r.txDate || "";
      const activityItem = r.activityItem || "";
      const diving = r.diving || "";
      const detailText = r.detailText || r.content || "";
      runningBalance += (r.income || 0) - (r.expense || 0);

      ws.getCell("A" + rowNo).value = r.no;
      ws.getCell("B" + rowNo).value = txDate;
      // 活動項目コードは藻場・干潟で重複ラベルがあるため、コードから区分を判定する
      const matchedAct = Const.activityItems.find(function (item) {
        return item.code === r.activityCode;
      });
      const categoryLabel = matchedAct
        ? matchedAct.category === "higata"
          ? "④干潟"
          : "①藻場"
        : "";
      ws.getCell("C" + rowNo).value = categoryLabel;
      ws.getCell("D" + rowNo).value =
        diving === "yes" || diving === true ? "あり" : "なし";
      ws.getCell("E" + rowNo).value = detailText;
      ws.getCell("F" + rowNo).value = r.isPurchase ? r.unitPrice || 0 : "";
      ws.getCell("G" + rowNo).value = r.isPurchase ? r.qty1 || 0 : "";
      ws.getCell("H" + rowNo).value = r.isPurchase ? r.unit1 || "" : "";
      ws.getCell("I" + rowNo).value = r.isPurchase ? r.qty2 || "" : "";
      ws.getCell("J" + rowNo).value = r.isPurchase ? r.unit2 || "" : "";
      ws.getCell("K" + rowNo).value = r.income || 0;
      ws.getCell("L" + rowNo).value = r.expense || 0;

      const itemCols = [
        "M",
        "N",
        "O",
        "P",
        "Q",
        "R",
        "S",
        "T",
        "U",
        "V",
        "W",
        "X",
        "Y",
        "Z",
        "AA",
      ];
      itemCols.forEach(function (col, i) {
        ws.getCell(col + rowNo).value = itemVals[i] || 0;
      });
      ws.getCell("AB" + rowNo).value = runningBalance;
      // 領収書番号を自動取得（複数はカンマ区切り）
      const autoNosExcel = getReceiptNosForRow(r);
      ws.getCell("AC" + rowNo).value =
        autoNosExcel.length > 0 ? autoNosExcel.join(", ") : r.receiptNo || "";
      ws.getCell("AD" + rowNo).value = r.isIncome ? "" : r.date;
      ws.getCell("AE" + rowNo).value = r.payerDate || txDate || "";
      ws.getCell("AF" + rowNo).value = r.payerName || "";
      ws.getCell("AG" + rowNo).value = r.storagePlace || "";

      for (let c = 1; c <= 33; c++) {
        const cell = ws.getCell(rowNo, c);
        cell.font = { size: 9 };
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = boxBorder();
      }
      rowNo++;
    });

    // 合計行
    const t = Calc.totalByItem(rows);
    ws.getCell("E" + rowNo).value = "合計";
    ws.getCell("K" + rowNo).value = t.income || 0;
    ws.getCell("L" + rowNo).value = t.total;
    ws.getCell("AB" + rowNo).value = runningBalance;

    const totalItemVals = Const.expenseItems.map(function (it) {
      return t.byItem[it.key] || 0;
    });
    [
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "AA",
    ].forEach(function (col, i) {
      ws.getCell(col + rowNo).value = totalItemVals[i] || 0;
    });

    for (let c = 1; c <= 33; c++) {
      const cell = ws.getCell(rowNo, c);
      cell.font = { bold: true, size: 9 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
      cell.border = boxBorder();
    }

    await downloadWorkbook(
      wb,
      "様式3_金銭出納簿_" + periodLabel(period) + ".xlsx",
    );
  }

  /* ---------- 共通ヘルパー ---------- */

  function boxBorder() {
    const s = { style: "thin", color: { argb: "FF999999" } };
    return { top: s, left: s, bottom: s, right: s };
  }

  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getRowKey(r) {
    // sourceType で明示的に判別する
    if (r.sourceType === "record" && r.sourceId) {
      return "record:" + r.sourceId;
    }
    // 資材購入行は sourceId (invLog の id) を使用
    if (r.sourceType === "invLog" && r.sourceId) {
      return "invLogId:" + r.sourceId;
    }
    // フォールバック: 行番号
    return "row:" + (r.no || "");
  }

  function setReceiptNo(rowKey, receiptNo) {
    const trimmed = (receiptNo || "").trim();
    if (!trimmed) return;

    // 実績レコード
    if (rowKey.indexOf("record:") === 0) {
      const id = rowKey.split(":").slice(1).join(":");
      const list = Storage.getRecord() || [];
      const idx = list.findIndex(function (x) {
        return String(x.id) === String(id);
      });
      if (idx >= 0) {
        list[idx].receiptNo = trimmed;
        Storage.setRecord(list);
      }
      return;
    }

    // 資材ログ (直接 ID 指定)
    if (rowKey.indexOf("invLogId:") === 0) {
      const id = rowKey.split(":").slice(1).join(":");
      const list = Storage.getInvLog() || [];
      const idx = list.findIndex(function (x) {
        return String(x.id) === String(id);
      });
      if (idx >= 0) {
        list[idx].receiptNo = trimmed;
        Storage.setInvLog(list);
      }
      return;
    }

    // 手入力支出 (budgetExpenseId 指定)
    if (rowKey.indexOf("budgetExpenseId:") === 0) {
      const id = rowKey.split(":").slice(1).join(":");
      const list = Storage.getBudgetExpense() || [];
      const idx = list.findIndex(function (x) {
        return String(x.id) === String(id);
      });
      if (idx >= 0) {
        list[idx].receiptNo = trimmed;
        Storage.setBudgetExpense(list);
      }
      return;
    }
  }

  function periodLabel(p) {
    if (p === "all") return "全期";
    const obj = Const.periods.find(function (x) {
      return x.id === parseInt(p, 10);
    });
    return obj ? obj.label + obj.range : p;
  }

  async function downloadWorkbook(wb, filename) {
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
    boxBorder: boxBorder,
    periodLabel: periodLabel,
  };
})();
