/* ============================================================
   calc.js
   金額計算・費目振分・期別集計・出納簿明細行の生成を行う計算エンジン。
   ============================================================ */

window.App = window.App || {};

App.Calc = (function () {
  "use strict";

  const Storage = App.Storage;
  const Utils = App.Utils;
  const Const = App.Const;

  /**
   * 1実績レコードの費目別金額を算出します。
   * @param {Object} rec - 実績レコード（正規化済み）
   * @returns {Object} 費目別の金額マッピング（{ jinken: X, yousen: Y, kotsu: Z, ... , total: T }）
   */
  function allocateRecord(rec) {
    const result = {};
    // 全費目を0で初期化
    Const.expenseItems.forEach(function (it) {
      result[it.key] = 0;
    });

    const master = Storage.getMaster();
    const settings = Storage.getSettings();

    const people = Number(rec.people) || 0;
    const boat = Number(rec.boat) || 0;
    const car = Number(rec.car) || 0;

    // 1. 人件費 (jinken) の計算
    let jinken = 0;
    if (settings.wageMode === "hourly") {
      const baseUnit = Number(master.wageHourly) || 0;
      // workHours が未設定の場合は start/end から算出、それもない場合は defaultHours を使用
      const workHours = Number(rec.workHours) || Utils.calcHourDiff(rec.start, rec.end, settings.defaultHours);

      // specialPay適用
      let specialCount = 0;
      let specialUnit = 0;
      if (rec.specialPay && rec.specialPay.mode === "hourly") {
        specialUnit = Number(rec.specialPay.unit) || 0;
        specialCount = Array.isArray(rec.specialPay.members) ? rec.specialPay.members.length : 0;
      }

      const generalCount = Math.max(0, people - specialCount);
      jinken = (generalCount * baseUnit * workHours) + (specialCount * specialUnit * workHours);
    } else {
      const baseUnit = Number(master.wageDaily) || 0;

      // specialPay適用
      let specialCount = 0;
      let specialUnit = 0;
      if (rec.specialPay && rec.specialPay.mode === "daily") {
        specialUnit = Number(rec.specialPay.unit) || 0;
        specialCount = Array.isArray(rec.specialPay.members) ? rec.specialPay.members.length : 0;
      }

      const generalCount = Math.max(0, people - specialCount);
      jinken = (generalCount * baseUnit) + (specialCount * specialUnit);
    }
    result.jinken = jinken;

    // 2. 用船料 (yousen)
    result.yousen = boat * (Number(master.yousen) || 0);

    // 3. 交通費・車両代 (kotsu)
    result.kotsu = car * (Number(master.sharyo) || 0);

    // 4. 合計
    result.total = Const.expenseItems.reduce(function (s, it) {
      return s + (result[it.key] || 0);
    }, 0);

    return result;
  }

  /**
   * 時刻に時間を加算します（24時間循環）。
   * @param {string} hhmm - "HH:MM" 形式の文字列
   * @param {number} hours - 加算する時間（小数対応）
   * @returns {string} 加算後の "HH:MM" 形式 of 文字列
   */
  function addHours(hhmm, hours) {
    if (!hhmm) return "";
    const parts = hhmm.split(":");
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return hhmm;

    let total = h * 60 + m + Math.round(hours * 60);
    total = ((total % 1440) + 1440) % 1440; // 24時間循環
    const nh = String(Math.floor(total / 60)).padStart(2, "0");
    const nm = String(total % 60).padStart(2, "0");
    return nh + ":" + nm;
  }

  /**
   * 実施時間（時間・小数）を算出します。
   * @param {string} start - 開始時刻 "HH:MM"
   * @param {string} end - 終了時刻 "HH:MM"
   * @param {number} defaultHours - 時刻未入力時のデフォルト活動時間
   * @returns {number} 算出した時間
   */
  function durationHours(start, end, defaultHours) {
    return Utils.calcHourDiff(start, end, defaultHours);
  }

  /**
   * 日付から期IDを算出します。
   * @param {string} dateStr - 日付文字列 "YYYY-MM-DD"
   * @returns {number|null} 期ID (1: 第1回, 2: 第2回, 3: 第3回, その他: null)
   */
  function periodOf(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split("-");
    const m = parseInt(parts[1], 10);
    if (isNaN(m)) return null;
    return Utils.periodOf(m);
  }

  /**
   * 指定した期に対象の日付が含まれているか判定します。
   * @param {string} dateStr - 日付文字列 "YYYY-MM-DD"
   * @param {number|string} periodId - 期ID
   * @returns {boolean} 含まれる場合は true
   */
  function inPeriod(dateStr, periodId) {
    if (periodId === "all" || periodId == null) return true;
    const p = Const.periods.find(function (x) {
      return x.id === parseInt(periodId, 10);
    });
    if (!p || !p.months) return true;

    const parts = (dateStr || "").split("-");
    const m = parseInt(parts[1], 10);
    if (isNaN(m)) return true;

    return p.months.indexOf(m) >= 0;
  }

  /**
   * 時刻補完・期判定等のメタデータを付与した対象実績レコードリストを日付順に返します。
   * @param {number|string} periodId - 期ID ("all" または ID)
   * @returns {Array<Object>} 補完済みの実績レコードリスト
   */
  function getTargetRecords(periodId) {
    const records = App.Record && App.Record.list ? App.Record.list() : [];
    const settings = Storage.getSettings();
    const defaultHours = Number(settings.defaultHours) || 3.5;
    const plans = Storage.getPlan() || [];

    let results = records.map(function (rec) {
      // 計画からの時刻補完
      const plan = plans.find(function (p) {
        return p.id === rec.planId;
      });
      let start = rec.start || (plan ? plan.start : "") || "";
      let end = rec.end || (plan ? plan.end : "") || "";

      let needInput = false;
      if (!start) {
        needInput = true;
      } else if (!end) {
        end = addHours(start, defaultHours);
      }

      const hours = Utils.calcHourDiff(start, end, defaultHours);
      const period = periodOf(rec.date);

      return Object.assign({}, rec, {
        _start: start,
        _end: end,
        _hours: hours,
        _needInput: needInput,
        _period: period,
      });
    });

    // 日付順ソート
    results.sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    });

    if (periodId && periodId !== "all") {
      const pid = Number(periodId);
      results = results.filter(function (r) {
        return r._period === pid;
      });
    }

    return results;
  }

  /**
   * 出納簿用の資材費計上用の資材購入行を抽出します。
   * @returns {Array<Object>} 資材購入行のリスト
   */
  function getMaterialPurchases() {
    const logs = Storage.getInvLog() || [];
    const items = Storage.getInventory() || [];
    const itemsById = {};
    items.forEach(function (item) {
      itemsById[item.id] = item;
    });

    const filtered = logs.filter(function (e) {
      if (e.type !== "in") return false;
      // 費用が発生しているものを抽出
      return e.totalCost > 0 || (e.unitPrice * e.qty + e.extraCost) > 0;
    });

    return filtered.map(function (e, idx) {
      const item = itemsById[e.itemId];
      const inferredUnitPrice = e.unitPrice || (item ? item.budgetUnit : 0) || 0;
      const inferredAmount = e.totalCost || (inferredUnitPrice * e.qty + e.extraCost) || 0;

      const date = e.date || "";

      return {
        sourceId: e.id || null,
        sourceIndex: idx,
        date: date,
        name: e.itemName || (item ? item.name : "") || "資材",
        qty: e.qty || 0,
        unit: (item ? item.unit : "") || "",
        qty2: 0,
        unit2: "",
        unitPrice: inferredUnitPrice,
        extraCost: e.extraCost || 0,
        amount: inferredAmount,
        supplier: e.memo || "",
        activityItem: "", // 資材購入には活動項目は原則入らない
        diving: "",
        receiptNo: e.receiptNo || "",
        payerDate: e.payerDate || "",
        payerName: e.payerName || "",
        storagePlace: e.place || (item ? item.place : "") || "",
        summary: (e.itemName || (item ? item.name : "") || "資材") + "購入（" + e.qty + ((item ? item.unit : "") || "") + "）",
      };
    }).sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });
  }

  /**
   * 支払実績 (moba_budget_expense) から、活動実績IDごとの支払日・支払先情報を抽出します。
   * @returns {Object} recordId をキーとし、支払情報を持つオブジェクト
   */
  function buildPaymentInfoByRecordId() {
    const map = {};
    const entries = App.Budget && App.Budget.listBudgetExpense ? App.Budget.listBudgetExpense() : [];

    entries.forEach(function (e) {
      if (!e || !e.date) return;
      const ids = Array.isArray(e.recordIds) ? e.recordIds : [];
      ids.forEach(function (id) {
        const key = String(id);
        if (!map[key]) {
          map[key] = { dates: [], payers: [] };
        }
        const obj = map[key];
        obj.dates.push(e.date);
        if (e.payer) obj.payers.push(e.payer);
      });
    });

    Object.keys(map).forEach(function (key) {
      const obj = map[key];
      // 重複排除
      const uniqDates = obj.dates.filter(function (x, i, self) {
        return self.indexOf(x) === i;
      }).sort();
      const uniqPayers = obj.payers.filter(function (x, i, self) {
        return self.indexOf(x) === i;
      });
      map[key] = { dates: uniqDates, payers: uniqPayers };
    });

    return map;
  }

  /**
   * 出納簿用の活動詳細テキストを生成します。
   * @param {Object} r - 実績レコード
   * @returns {string} 詳細テキスト
   */
  function buildActivityDetail(r) {
    if (!r) return "日当（支払）";
    const master = Storage.getMaster();
    const settings = Storage.getSettings();
    const unitJinken = settings.wageMode === "hourly"
      ? (Number(master.wageHourly) || 0)
      : (Number(master.wageDaily) || 0);
    const unitYousen = Number(master.yousen) || 0;
    const unitSharyo = Number(master.sharyo) || 0;

    const parts = [r.content || "作業"];
    if ((r.people || 0) > 0) {
      parts.push(unitJinken + "円×" + r.people + "人");
    }
    if ((r.boat || 0) > 0) {
      parts.push("用船：" + unitYousen + "円×" + r.boat + "隻");
    }
    if ((r.car || 0) > 0) {
      parts.push("車両：" + unitSharyo + "円×" + r.car + "台");
    }
    return "日当（" + parts.join("、") + "）";
  }

  /**
   * 活動実績と資材購入ログを統合し、日付順ソートおよび通し番号・累積残高を再計算した出納簿明細行を生成します。
   * @param {number|string} periodId - 期ID
   * @returns {Array<Object>} 統合された出納簿明細行
   */
  function buildLedgerRows(periodId) {
    const recs = getTargetRecords(periodId);
    const grantEntries =
      App.Budget && typeof App.Budget.listGrantFlow === "function"
        ? App.Budget.listGrantFlow()
        : [];
    const areas = Storage.getAreas() || [];
    const areasById = {};
    areas.forEach(function (a) {
      areasById[a.id] = a;
    });

    const paymentInfoByRecordId = buildPaymentInfoByRecordId();

    // 1. 活動行の生成
    const activityRows = recs.map(function (r) {
      const alloc = allocateRecord(r);
      const area = areasById[r.areaId] || { name: r.areaId || "" };

      // 活動項目ラベルの取得
      const act = Const.activityItems.find(function (item) {
        return item.code === r.activityCode;
      });
      const activityItemLabel = act ? act.label : (r.activityCode || "");

      const detailText = buildActivityDetail(r);
      const info = paymentInfoByRecordId[String(r.id)] || { dates: [], payers: [] };
      const joinedPaymentDates = (info.dates || []).join("\n");
      const joinedPayers = (info.payers || []).join("\n");

      return {
        _sortDate: r.date,
        sourceType: "record",
        sourceId: r.id,
        date: r.date,
        txDate: joinedPaymentDates || r.txDate || "",
        activityCode: r.activityCode,
        activityItem: activityItemLabel,
        diving: r.diving || "",
        content: r.content,
        detailText: detailText,
        area: area.name,
        people: r.people || 0,
        boat: r.boat || 0,
        car: r.car || 0,
        start: r._start,
        end: r._end,
        hours: r._hours,
        needInput: r._needInput,
        alloc: alloc,
        expense: alloc.total,
        income: r.income || 0,
        receiptNo: r.receiptNo || "",
        payerDate: joinedPaymentDates || r.payerDate || "",
        payerName: joinedPayers || r.payerName || "",
        storagePlace: r.storagePlace || "",
        itemNote: r.itemNote || "",
        period: r._period,
        isPurchase: false,
      };
    });

    // 2. 資材購入行の生成
    const purchases = getMaterialPurchases();
    const purchaseRows = purchases
      .filter(function (p) {
        return inPeriod(p.date, periodId);
      })
      .map(function (p) {
        const alloc = {};
        Const.expenseItems.forEach(function (it) {
          alloc[it.key] = 0;
        });
        alloc.shizai = p.amount; // 全て資材費（shizai）に計上
        alloc.total = p.amount;

        return {
          _sortDate: p.date,
          sourceType: "invLog",
          sourceId: p.sourceId,
          sourceIndex: p.sourceIndex,
          date: p.date,
          txDate: p.date || "",
          activityItem: p.activityItem || "",
          diving: p.diving || "",
          content: p.name || "",
          detailText: p.summary,
          area: "",
          people: 0,
          boat: 0,
          car: 0,
          start: "",
          end: "",
          hours: 0,
          needInput: false,
          alloc: alloc,
          expense: p.amount,
          income: 0,
          unitPrice: p.unitPrice || 0,
          qty1: p.qty || 0,
          unit1: p.unit || "",
          qty2: p.qty2 || 0,
          unit2: p.unit2 || "",
          receiptNo: p.receiptNo || "",
          payerDate: p.payerDate || p.date || "",
          payerName: p.payerName || "",
          storagePlace: p.storagePlace || "",
          itemNote: p.unitPrice
            ? "@" + p.unitPrice + "円×" + p.qty + p.unit + (p.extraCost ? " ＋諸経費" + p.extraCost + "円" : "")
            : "",
          period: null,
          isPurchase: true,
        };
      });

    // 3. 協議会から組織への交付金収入行
    const incomeRows = grantEntries
      .filter(function (entry) {
        return (
          String(entry.type || entry.stage || "") === "council_to_org" &&
          entry.date &&
          inPeriod(entry.date, periodId)
        );
      })
      .map(function (entry) {
        const alloc = {};
        Const.expenseItems.forEach(function (item) {
          alloc[item.key] = 0;
        });
        alloc.total = 0;
        return {
          _sortDate: entry.date,
          sourceType: "grantFlow",
          sourceId: entry.id,
          date: entry.date,
          txDate: entry.date,
          activityItem: "交付金収入（協議会→組織）",
          diving: "",
          content: "交付金収入",
          detailText: "交付金収入（協議会→組織）",
          area: "",
          people: 0,
          boat: 0,
          car: 0,
          start: "",
          end: "",
          hours: 0,
          needInput: false,
          alloc: alloc,
          income: Number(entry.amount) || 0,
          expense: 0,
          receiptNo: "",
          payerDate: "",
          payerName: "",
          storagePlace: "",
          itemNote: "",
          period: periodOf(entry.date),
          isPurchase: false,
          isIncome: true,
        };
      });

    // 4. 日付順にマージしてソート（同日なら収入を支出より先に表示）
    const merged = activityRows.concat(purchaseRows, incomeRows).sort(function (a, b) {
      const c = (a._sortDate || "").localeCompare(b._sortDate || "");
      if (c !== 0) return c;
      if (a.isIncome !== b.isIncome) return a.isIncome ? -1 : 1;
      return a.isPurchase === b.isPurchase ? 0 : (a.isPurchase ? 1 : -1);
    });

    // 5. 残高の再計算
    let balance = 0;
    merged.forEach(function (row, i) {
      row.no = i + 1;
      balance += (row.income || 0) - (row.expense || 0);
      row.balance = balance;
    });

    return merged;
  }

  /**
   * 期別集計（様式2等で使用）を算出します。
   * @returns {Object} 期ごとの集計データ、総計、採択予算、執行率などの統計情報
   */
  function summarizeByPeriod() {
    const result = {};
    let grandTotal = 0;

    Const.periods.forEach(function (p) {
      const rows = buildLedgerRows(p.id);
      const sum = rows.reduce(function (s, r) {
        return s + r.expense;
      }, 0);

      // 費目別合計
      const byItem = {};
      Const.expenseItems.forEach(function (it) {
        byItem[it.key] = 0;
      });

      rows.forEach(function (r) {
        Const.expenseItems.forEach(function (it) {
          byItem[it.key] += (r.alloc[it.key] || 0);
        });
      });

      result[p.id] = {
        label: p.label,
        range: p.range,
        count: rows.length,
        executed: sum,
        byItem: byItem,
      };
      grandTotal += sum;
    });

    // 予算額
    const budget = App.Budget && App.Budget.getBudget ? App.Budget.getBudget() : { amount: 0 };
    const approved = budget.amount;

    return {
      periods: result,
      grandTotal: grandTotal,
      approved: approved,
      remaining: approved - grandTotal,
      executionRate: approved ? Math.round((grandTotal / approved) * 1000) / 10 : 0,
    };
  }

  /**
   * 出納簿用の費目別総合計行を算出します。
   * @param {Array<Object>} rows - 明細行
   * @returns {Object} 費目別合計
   */
  function totalByItem(rows) {
    const t = {};
    Const.expenseItems.forEach(function (it) {
      t[it.key] = 0;
    });
    let total = 0;
    let income = 0;

    rows.forEach(function (r) {
      Const.expenseItems.forEach(function (it) {
        t[it.key] += (r.alloc[it.key] || 0);
      });
      total += r.expense;
      income += Number(r.income) || 0;
    });

    return {
      byItem: t,
      total: total,
      income: income,
    };
  }

  /**
   * 金額を ja-JP 3桁カンマ区切りの文字列に整形します。
   * @param {number} n - 数値
   * @returns {string} 整形された文字列
   */
  function yen(n) {
    return (n || 0).toLocaleString("ja-JP");
  }

  /**
   * 計画・実績・支払の充足状況および未払い額（按分計算含む）を算出します。
   */
  function calcFulfillmentAndUnpaid() {
    const plans = Storage.getPlan ? (Storage.getPlan() || []) : [];
    const records = Storage.getRecord ? (Storage.getRecord() || []) : [];
    const expenses = Storage.getBudgetExpense ? (Storage.getBudgetExpense() || []) : [];

    // 実績のある計画IDのセット
    const planWithRecordSet = new Set();
    const recCostMap = {};
    records.forEach(function (r) {
      if (r.planId) planWithRecordSet.add(String(r.planId));
      const alloc = allocateRecord(r);
      recCostMap[String(r.id)] = alloc.total || 0;
    });

    // 既支払額の按分算出
    const paidByRecId = {};
    expenses.forEach(function (exp) {
      const recIds = (exp.recordIds || []).map(String).filter(Boolean);
      if (!recIds.length) return;
      if (recIds.length === 1) {
        paidByRecId[recIds[0]] = (paidByRecId[recIds[0]] || 0) + (exp.amount || 0);
        return;
      }
      // 複数実績に紐づく場合は算出費用比率で按分（比率合計0は均等割）
      const totalWeight = recIds.reduce(function (sum, id) { return sum + (recCostMap[id] || 0); }, 0);
      recIds.forEach(function (id) {
        const weight = totalWeight > 0 ? (recCostMap[id] || 0) / totalWeight : 1 / recIds.length;
        paidByRecId[id] = (paidByRecId[id] || 0) + ((exp.amount || 0) * weight);
      });
    });

    // 各実績の未払い額
    const recordUnpaidMap = {};
    let totalUnpaid = 0;
    let paidCount = 0;

    records.forEach(function (r) {
      const idStr = String(r.id);
      const cost = recCostMap[idStr] || 0;
      const paid = paidByRecId[idStr] || 0;
      const unpaid = Math.max(0, cost - paid);
      recordUnpaidMap[idStr] = unpaid;
      totalUnpaid += unpaid;
      if (paid > 0) paidCount++;
    });

    return {
      plansCount: plans.length,
      recordsCount: records.length,
      planWithRecordCount: planWithRecordSet.size,
      paidRecordCount: paidCount,
      totalUnpaid: Math.round(totalUnpaid),
      recordUnpaidMap: recordUnpaidMap,
      paidByRecId: paidByRecId
    };
  }

  return {
    allocateRecord: allocateRecord,
    durationHours: durationHours,
    periodOf: periodOf,
    inPeriod: inPeriod,
    getTargetRecords: getTargetRecords,
    getMaterialPurchases: getMaterialPurchases,
    buildLedgerRows: buildLedgerRows,
    summarizeByPeriod: summarizeByPeriod,
    totalByItem: totalByItem,
    calcFulfillmentAndUnpaid: calcFulfillmentAndUnpaid,
    yen: yen,
  };
})();
