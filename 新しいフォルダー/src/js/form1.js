/* =====================================================================
   form1.js ― 様式1 交付金交付申請書（HTML→Word .doc 出力）
   ===================================================================== */

window.App = window.App || {};

App.Form1 = (function () {
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

  function todayStr() {
    return App.Utils && App.Utils.todayStr
      ? App.Utils.todayStr()
      : new Date().toISOString().slice(0, 10);
  }

  function yen(n) {
    return Calc && Calc.yen ? Calc.yen(n) : Number(n || 0).toLocaleString();
  }

  function roundDown1000(value) {
    const n = Math.max(0, Number(value) || 0);
    return Math.floor(n / 1000) * 1000;
  }

  function getBudgetApprovedAmount() {
    const budget =
      App.Budget && typeof App.Budget.getBudget === "function"
        ? App.Budget.getBudget()
        : {};
    return Number(budget.approvedAmount || budget.amount || 0) || 0;
  }

  function getGrantReceived() {
    const entries =
      App.Budget && typeof App.Budget.listGrantFlow === "function"
        ? App.Budget.listGrantFlow()
        : [];
    return entries
      .filter(function (entry) {
        return String(entry.type || entry.stage || "") === "council_to_org";
      })
      .reduce(function (sum, entry) {
        return sum + (Number(entry.amount) || 0);
      }, 0);
  }

  function getApplicationRound() {
    const entries =
      App.Budget && typeof App.Budget.listGrantFlow === "function"
        ? App.Budget.listGrantFlow()
        : [];
    const grantCount = entries.filter(function (entry) {
      return String(entry.type || entry.stage || "") === "council_to_org";
    }).length;
    return grantCount + 1;
  }

  function getPaidCumulative(cutoffDate) {
    const expenses =
      App.Budget && typeof App.Budget.listBudgetExpense === "function"
        ? App.Budget.listBudgetExpense()
        : [];
    const today = todayStr();
    return expenses
      .filter(function (expense) {
        const paidDate = String(expense.paidDate || "");
        return paidDate && paidDate <= cutoffDate && paidDate <= today;
      })
      .reduce(function (sum, expense) {
        return sum + (Number(expense.amount) || 0);
      }, 0);
  }

  function getForecastAmount(cutoffDate, forecastCutoffDate) {
    const includeForecast = !!document.getElementById("f1-include-forecast")
      ?.checked;
    if (!includeForecast) return { amount: 0, warning: "" };
    if (!forecastCutoffDate)
      return { amount: 0, warning: "見込み対象期日を指定してください。" };
    if (forecastCutoffDate < cutoffDate)
      return {
        amount: 0,
        warning: "見込み対象期日は締め日以降を指定してください。",
      };

    const records =
      App.Record && typeof App.Record.list === "function"
        ? App.Record.list()
        : [];
    const paidMap =
      App.Budget && typeof App.Budget.paidAmountMap === "function"
        ? App.Budget.paidAmountMap(records, function (record) {
            return App.Record && App.Record.calcRecordCost
              ? App.Record.calcRecordCost(record).total
              : 0;
          }, function (expense) {
            const paidDate = String(expense.paidDate || "");
            return paidDate && paidDate <= todayStr();
          })
        : {};

    const unpaidInRange = records
      .filter(function (record) {
        const date = String(record.date || "");
        return date > cutoffDate && date <= forecastCutoffDate;
      })
      .reduce(function (sum, record) {
        const expected =
          App.Record && App.Record.calcRecordCost
            ? App.Record.calcRecordCost(record).total
            : 0;
        const paid = Number(paidMap[String(record.id)] || 0);
        return sum + Math.max(0, expected - paid);
      }, 0);

    const plans =
      App.Plan && typeof App.Plan.list === "function" ? App.Plan.list() : [];
    const donePlanIds = {};
    records.forEach(function (record) {
      if (record.planId) donePlanIds[String(record.planId)] = true;
    });

    const futurePlans = plans
      .filter(function (plan) {
        return (
          String(plan.date || "") > cutoffDate &&
          String(plan.date || "") <= forecastCutoffDate &&
          !donePlanIds[String(plan.id || "")]
        );
      })
      .reduce(function (sum, plan) {
        const estimate =
          App.Plan && typeof App.Plan.estimateCost === "function"
            ? App.Plan.estimateCost(plan)
            : { total: 0 };
        return sum + (Number(estimate.total) || 0);
      }, 0);

    return { amount: unpaidInRange + futurePlans, warning: "" };
  }

  function countMissingPaidDate() {
    const expenses =
      App.Budget && typeof App.Budget.listBudgetExpense === "function"
        ? App.Budget.listBudgetExpense()
        : [];
    return expenses.filter(function (expense) {
      return !String(expense.paidDate || "").trim();
    }).length;
  }

  function countFuturePaidDate() {
    const expenses =
      App.Budget && typeof App.Budget.listBudgetExpense === "function"
        ? App.Budget.listBudgetExpense()
        : [];
    const today = todayStr();
    return expenses.filter(function (expense) {
      const paidDate = String(expense.paidDate || "").trim();
      return paidDate && paidDate > today;
    }).length;
  }

  function getOrgBankAccount(org) {
    const bank = (org && org.bankAccount) || {};
    return {
      bankName: bank.bankName || org.bank || "",
      branchName: bank.branchName || "",
      accountType: bank.accountType || "",
      accountNo: bank.accountNo || org.account || "",
      accountHolder: bank.accountHolder || org.holder || "",
      accountHolderKana: bank.accountHolderKana || org.holderKana || "",
    };
  }

  function renderSummary(summary) {
    const el = document.getElementById("f1-summary");
    if (!el) return;
    const rows = [
      ["採択決定額", yen(summary.approvedAmount) + " 円"],
      ["既交付額", yen(summary.grantReceived) + " 円"],
      ["申請回", "第" + summary.applicationRound + "回"],
      ["締め日", summary.cutoffDate || "未設定"],
      ["支払累計", yen(summary.paidCumulative) + " 円"],
      ["見込み額", yen(summary.forecastAmount) + " 円"],
      ["残枠", yen(summary.remainingGrant) + " 円"],
      ["切り捨て前", yen(summary.baseBeforeRound) + " 円"],
      ["申請額", yen(summary.applicationAmount) + " 円"],
      ["上限クリップ", summary.clipApplied ? "適用あり" : "なし"],
    ];

    let html = "<table class='data-table'><tbody>";
    rows.forEach(function (row) {
      html +=
        "<tr><th style='width:32%; text-align:left;'>" +
        row[0] +
        "</th><td style='text-align:left;'>" +
        row[1] +
        "</td></tr>";
    });
    html += "</tbody></table>";
    if (summary.warnings && summary.warnings.length) {
      html +=
        "<div class='chk warn' style='margin-top:8px; text-align:left;'>" +
        summary.warnings
          .map(function (msg) {
            return "・" + msg;
          })
          .join("<br>") +
        "</div>";
    } else {
      html +=
        "<div class='chk ok' style='margin-top:8px; text-align:left;'>✓ 計算条件は有効です。</div>";
    }
    el.innerHTML = html;
  }

  function bindControls() {
    [
      "f1-cutoff-date",
      "f1-include-forecast",
      "f1-forecast-cutoff-date",
    ].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el || el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("change", calculate);
      el.addEventListener("input", calculate);
    });
  }

  function calculate() {
    bindControls();
    const cutoffDateEl = document.getElementById("f1-cutoff-date");
    const includeForecastEl = document.getElementById("f1-include-forecast");
    const forecastCutoffEl = document.getElementById("f1-forecast-cutoff-date");

    if (cutoffDateEl && !cutoffDateEl.value) cutoffDateEl.value = todayStr();
    const cutoffDate = (cutoffDateEl && cutoffDateEl.value) || todayStr();
    const includeForecast = !!(includeForecastEl && includeForecastEl.checked);
    if (includeForecastEl) includeForecastEl.checked = includeForecast;
    if (includeForecast && forecastCutoffEl && !forecastCutoffEl.value)
      forecastCutoffEl.value = cutoffDate;
    const forecastCutoffDate =
      (forecastCutoffEl && forecastCutoffEl.value) || cutoffDate;

    const approvedAmount = getBudgetApprovedAmount();
    const grantReceived = getGrantReceived();
    const applicationRound = getApplicationRound();
    const paidCumulative = getPaidCumulative(cutoffDate);
    const forecast = getForecastAmount(cutoffDate, forecastCutoffDate);
    const forecastAmount = forecast.amount || 0;
    const remainingGrant = Math.max(0, approvedAmount - grantReceived);
    const baseBeforeRound = paidCumulative + forecastAmount - grantReceived;
    const clipped = Math.max(0, Math.min(baseBeforeRound, remainingGrant));
    let applicationAmount = clipped > 0 ? roundDown1000(clipped) : 0;

    const warnings = [];
    if (approvedAmount <= 0) warnings.push("採択決定額が未設定です。");
    if (grantReceived > approvedAmount) {
      warnings.push("既交付額が採択決定額を超えています。");
      applicationAmount = 0;
    }
    if (applicationRound > 1 && grantReceived <= 0)
      warnings.push(
        "前回申請済みの可能性がありますが、協議会→組織の入金記録がありません。",
      );
    const missingPaidDateCount = countMissingPaidDate();
    if (missingPaidDateCount > 0)
      warnings.push(
        "支払日(paidDate)未設定の支払実績が " +
          missingPaidDateCount +
          " 件あります（集計対象外）。",
      );
    const futurePaidDateCount = countFuturePaidDate();
    if (futurePaidDateCount > 0)
      warnings.push(
        "未来日付の支払実績が " +
          futurePaidDateCount +
          " 件あります（集計対象外）。",
      );
    if (includeForecast && forecast.warning) warnings.push(forecast.warning);
    if (remainingGrant <= 0) warnings.push("申請可能な残枠がありません。");
    if (clipped < baseBeforeRound)
      warnings.push("採択額の上限に達したため申請額を上限に調整しました。");
    if (applicationAmount <= 0)
      warnings.push("申請額が0円です。締め日や見込み条件を確認してください。");

    const result = {
      approvedAmount: approvedAmount,
      grantReceived: grantReceived,
      applicationRound: applicationRound,
      cutoffDate: cutoffDate,
      forecastCutoffDate: includeForecast ? forecastCutoffDate : "",
      paidCumulative: paidCumulative,
      forecastAmount: forecastAmount,
      remainingGrant: remainingGrant,
      baseBeforeRound: baseBeforeRound,
      clipped: clipped,
      clipApplied: clipped < baseBeforeRound,
      applicationAmount: applicationAmount,
      missingPaidDateCount: missingPaidDateCount,
      futurePaidDateCount: futurePaidDateCount,
      warnings: warnings,
    };

    const amount1El = document.getElementById("f1-amount1");
    const amount2El = document.getElementById("f1-amount2");
    const amount3El = document.getElementById("f1-amount3");
    if (amount1El) {
      amount1El.value = approvedAmount || 0;
      amount1El.readOnly = true;
    }
    if (amount2El) {
      amount2El.value = grantReceived || 0;
      amount2El.readOnly = true;
    }
    if (amount3El) {
      amount3El.value = applicationAmount || 0;
      amount3El.readOnly = true;
    }

    renderSummary(result);
    return result;
  }

  /**
   * 交付申請額の差額（④ ＝ ① － ② － ③）の自動計算
   */
  function calc() {
    return calculate();
  }

  /**
   * Word (.doc) 形式でのファイル出力
   */
  function exportWord() {
    bindControls();
    const org = Storage && Storage.getOrg ? Storage.getOrg() : {};
    const settings =
      Storage && Storage.getSettings ? Storage.getSettings() : {};
    const year = settings.year || "";
    const amounts = calc();
    const times = amounts.applicationRound || 1;
    const docno = getVal("f1-docno") || "";
    if (amounts.warnings.length) {
      const proceed = confirm(
        amounts.warnings.join("\n") + "\n\nこのまま Word を出力しますか？",
      );
      if (!proceed) return;
    }

    const todayStr = warekiDate(new Date());
    const title =
      "令和" +
      (year ? year : "X") +
      "年度漁場生産力・水産多面的機能強化対策事業の<br>交付金に係る交付申請について（第" +
      times +
      "回）";

    const attachments = [
      "・交付金執行状況報告書",
      "・金銭出納簿",
      "・活動記録簿（または活動記録日誌）",
      "・作業写真整理帳",
      "・支出関係書類（領収書、振込振替記録、契約書、見積書等）",
      "・活動計画書（※見込額で請求する場合）",
    ]
      .map(function (a) {
        return (
          '<p style="margin:0; padding:0; margin-left: 2em;">' + a + "</p>"
        );
      })
      .join("");

    const formatYen = function (n) {
      return Calc && Calc.yen ? Calc.yen(n) : (n || 0).toLocaleString("ja-JP");
    };

    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
      'xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8">' +
      "<style>" +
      "@page { size: 210mm 297mm; margin: 8mm 15mm; }" +
      'body { font-family: "ＭＳ 明朝", "MS Mincho", serif; font-size: 8pt; line-height: 1.05; max-width: 182mm; margin: 0 auto; }' +
      "p { margin: 0; padding: 0; margin-bottom: 0.12em; page-break-inside: avoid; }" +
      ".right { text-align: right; }" +
      ".left { text-align: left; }" +
      ".center { text-align: center; }" +
      ".title { text-align: center; font-size: 9pt; margin-top: 0.25em; margin-bottom: 0.25em; line-height: 1.05; font-weight: bold; page-break-inside: avoid; }" +
      "table { border-collapse: collapse; margin: 0 auto; width: 86%; font-size: 8pt; page-break-inside: avoid; }" +
      "td, th { border: 1px solid #000; padding: 1px 4px; vertical-align: middle; }" +
      ".indent { margin-left: 1.5em; page-break-inside: avoid; }" +
      ".compact { margin-bottom: 0.08em; }" +
      "</style></head>" +
      "<body>" +
      '<p class="left">（参考様式第１号）</p>' +
      '<p class="right">' +
      (docno ? "番 号 " + docno : "番 号 ") +
      "</p>" +
      '<p class="right">' +
      todayStr +
      "</p>" +
      "<p>大分県漁場生産力・水産多面的機能強化対策協議会<br>" +
      "会 長 " +
      (settings.councilChairName || "") +
      " 殿</p>" +
      "<br>" +
      '<p class="right">' +
      (org.addr || "") +
      "</p>" +
      '<p class="right">' +
      (org.orgName || "活動組織名") +
      "代表</p>" +
      '<p class="right">代表者氏名 ' +
      (settings.councilChairName || settings.chairman || org.repName || "") +
      "</p>" +
      '<div class="title">' +
      title +
      "</div>" +
      '<p class="indent">漁場生産力・水産多面的機能強化対策事業に係る業務方法書第６条に基づき、下記のとおり交付金の交付を申請する。</p>' +
      '<p class="center" style="margin-top:0.6em; margin-bottom:0.6em;">記</p>' +
      "<p><b>１．交付申請額（③）</b></p>" +
      '<p class="center" style="font-size: 12pt; font-weight: bold; margin-bottom: 0.6em;">' +
      formatYen(amounts.applicationAmount) +
      " 円" +
      "</p>" +
      "<p><b>２．交付申請額内訳</b></p>" +
      '<table style="margin-bottom: 0.8em;">' +
      '<tr><th style="text-align:center; width:60%;">項 目</th><th style="text-align:center; width:40%;">金 額</th></tr>' +
      '<tr><td style="padding:1px 6px; vertical-align:middle;">採択決定額　①</td>' +
      '<td style="text-align:right; padding:1px 6px; vertical-align:middle;">' +
      formatYen(amounts.approvedAmount) +
      " 円</td></tr>" +
      '<tr><td style="padding:1px 6px; vertical-align:middle;">既交付額　　②</td>' +
      '<td style="text-align:right; padding:1px 6px; vertical-align:middle;">' +
      formatYen(amounts.grantReceived) +
      " 円</td></tr>" +
      '<tr><td style="padding:1px 6px; vertical-align:middle;">交付申請額　③</td>' +
      '<td style="text-align:right; padding:1px 6px; vertical-align:middle;">' +
      formatYen(amounts.applicationAmount) +
      " 円</td></tr>" +
      '<tr><td style="padding:1px 6px; vertical-align:middle;">採択決定額との差額　④＝①－②－③</td>' +
      '<td style="text-align:right; padding:1px 6px; vertical-align:middle;">' +
      formatYen(
        amounts.approvedAmount -
          amounts.grantReceived -
          amounts.applicationAmount,
      ) +
      " 円</td></tr>" +
      "</table>" +
      "<p><b>３．振込先</b></p>" +
      (function () {
        const bank = getOrgBankAccount(org);
        return (
          '<p class="indent">金融機関名及び店舗名 ：' +
          [bank.bankName, bank.branchName].filter(Boolean).join(" / ") +
          "</p>" +
          '<p class="indent">預貯金種別口座番号  ：' +
          [bank.accountType, bank.accountNo].filter(Boolean).join(" ") +
          "</p>" +
          '<p class="indent">口座名義人（ふりがな）：' +
          (bank.accountHolder || "") +
          " （ " +
          (bank.accountHolderKana || "") +
          " ）</p>" +
          '<p class="indent compact" style="margin-bottom: 0.8em;">口座名義人の住所   ：' +
          (org.addr || "") +
          "</p>"
        );
      })() +
      "<p>（添付書類）</p>" +
      attachments +
      "</body></html>";

    downloadDoc(html, "様式1_交付申請書_第" + times + "回.doc");
  }

  function downloadDoc(html, filename) {
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
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
    calc: calc,
    exportWord: exportWord,
    warekiDate: warekiDate,
    roundDown1000: roundDown1000,
  };
})();
