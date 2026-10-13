window.App = window.App || {};

App.Payment = (function () {
  "use strict";

  const Storage = App.Storage;

  function summarize(options) {
    const from = options && options.from ? String(options.from) : "";
    const to = options && options.to ? String(options.to) : "";

    const records = (App.Record && App.Record.list) ? App.Record.list() : (Storage.getRecord() || []);
    const filtered = records.filter(function (row) {
      if (from && row.date < from) return false;
      if (to && row.date > to) return false;
      return true;
    });

    const person = {};
    const area = {};
    const activity = {};
    const total = { jinken: 0, yousen: 0, kotsu: 0, overall: 0 };

    filtered.forEach(function (row) {
      const cost = App.Record.calcRecordCost(row);

      total.jinken += cost.jinken;
      total.yousen += cost.yousen;
      total.kotsu += cost.kotsu;
      total.overall += cost.total;

      const perHead = row.people > 0 ? cost.jinken / row.people : 0;
      const perBoat = row.boat > 0 ? cost.yousen / row.boat : 0;
      const perCar = row.car > 0 ? cost.kotsu / row.car : 0;

      ensure(area, row.areaId);
      area[row.areaId].jinken += cost.jinken;
      area[row.areaId].yousen += cost.yousen;
      area[row.areaId].kotsu += cost.kotsu;
      area[row.areaId].overall += cost.total;

      ensure(activity, row.activityCode);
      activity[row.activityCode].jinken += cost.jinken;
      activity[row.activityCode].yousen += cost.yousen;
      activity[row.activityCode].kotsu += cost.kotsu;
      activity[row.activityCode].overall += cost.total;

      (row.members || []).forEach(function (name) {
        ensure(person, name);
        person[name].jinken += perHead;
        person[name].overall += perHead;
      });

      (row.boatOwners || []).forEach(function (name) {
        ensure(person, name);
        person[name].yousen += perBoat;
        person[name].overall += perBoat;
      });

      (row.carOwners || []).forEach(function (name) {
        ensure(person, name);
        person[name].kotsu += perCar;
        person[name].overall += perCar;
      });
    });

    return {
      period: { from: from, to: to },
      person: person,
      area: area,
      activity: activity,
      total: total,
      count: filtered.length,
    };
  }

  function ensure(target, key) {
    const k = String(key || "").trim() || "unknown";
    if (!target[k]) {
      target[k] = {
        jinken: 0,
        yousen: 0,
        kotsu: 0,
        overall: 0,
      };
    }
  }

  /**
   * 支払先集計画面の描画処理
   */
  function render() {
    const container = document.getElementById("payment-summary");
    if (!container) return;

    const yen = function (n) { return (App.Calc && App.Calc.yen) ? App.Calc.yen(n) : (n || 0).toLocaleString(); };
    const Utils = App.Utils;
    const areas = App.Storage.getAreas ? App.Storage.getAreas() : [];
    const activities = (App.Master && App.Master.getActivities) ? App.Master.getActivities() : [];
    const areaMap = {};
    areas.forEach(function (a) { areaMap[a.id] = a.name; });
    const actMap = {};
    activities.forEach(function (a) { actMap[a.code] = a.label; });

    const data = summarize();

    // 個人別集計テーブル
    let personRows = "";
    Object.keys(data.person).sort().forEach(function (name) {
      const p = data.person[name];
      personRows += "<tr>" +
        "<td>" + Utils.esc(name) + "</td>" +
        "<td>" + yen(p.jinken) + "円</td>" +
        "<td>" + yen(p.yousen) + "円</td>" +
        "<td>" + yen(p.kotsu) + "円</td>" +
        "<td><strong>" + yen(p.overall) + "円</strong></td>" +
        "</tr>";
    });

    // 地区別集計テーブル
    let areaRows = "";
    Object.keys(data.area).forEach(function (areaId) {
      const a = data.area[areaId];
      areaRows += "<tr>" +
        "<td>" + Utils.esc(areaMap[areaId] || areaId) + "</td>" +
        "<td>" + yen(a.jinken) + "円</td>" +
        "<td>" + yen(a.yousen) + "円</td>" +
        "<td>" + yen(a.kotsu) + "円</td>" +
        "<td><strong>" + yen(a.overall) + "円</strong></td>" +
        "</tr>";
    });

    // 活動項目別集計テーブル
    let actRows = "";
    Object.keys(data.activity).forEach(function (code) {
      const a = data.activity[code];
      actRows += "<tr>" +
        "<td>[" + Utils.esc(code) + "] " + Utils.esc(actMap[code] || code) + "</td>" +
        "<td>" + yen(a.jinken) + "円</td>" +
        "<td>" + yen(a.yousen) + "円</td>" +
        "<td>" + yen(a.kotsu) + "円</td>" +
        "<td><strong>" + yen(a.overall) + "円</strong></td>" +
        "</tr>";
    });

    const thHtml = "<thead><tr><th>区分</th><th>人件費(日当)</th><th>傭船料</th><th>交通費</th><th>合計</th></tr></thead>";

    container.innerHTML =
      "<h3>合計</h3>" +
      "<table class=\"data-table\" style=\"margin-bottom:20px;\">" +
      "<thead><tr><th>人件費</th><th>傭船料</th><th>交通費</th><th>総合計</th><th>実績件数</th></tr></thead>" +
      "<tbody><tr>" +
      "<td>" + yen(data.total.jinken) + "円</td>" +
      "<td>" + yen(data.total.yousen) + "円</td>" +
      "<td>" + yen(data.total.kotsu) + "円</td>" +
      "<td><strong>" + yen(data.total.overall) + "円</strong></td>" +
      "<td>" + data.count + "件</td>" +
      "</tr></tbody></table>" +

      "<h3>個人別集計</h3>" +
      "<table class=\"data-table\" style=\"margin-bottom:20px;\">" + thHtml +
      "<tbody>" + (personRows || "<tr><td colspan=\"5\">データなし</td></tr>") + "</tbody></table>" +

      "<h3>地区別集計</h3>" +
      "<table class=\"data-table\" style=\"margin-bottom:20px;\">" + thHtml +
      "<tbody>" + (areaRows || "<tr><td colspan=\"5\">データなし</td></tr>") + "</tbody></table>" +

      "<h3>活動項目別集計</h3>" +
      "<table class=\"data-table\">" + thHtml +
      "<tbody>" + (actRows || "<tr><td colspan=\"5\">データなし</td></tr>") + "</tbody></table>";
  }

  return {
    summarize: summarize,
    render: render
  };
})();
