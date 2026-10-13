/* ============================================================
   constants.js
   要綱で固定される定義を管理するモジュール。
   ============================================================ */

window.App = window.App || {};

App.Const = (function () {
  "use strict";

  const activityItems = [
    // 藻場の保全（14項目）
    { code: "moba_01", category: "moba", label: "母藻の設置" },
    { code: "moba_02", category: "moba", label: "海藻の種苗生産" },
    { code: "moba_03", category: "moba", label: "海藻の種苗投入" },
    { code: "moba_04", category: "moba", label: "アマモの移植及び播種" },
    { code: "moba_05", category: "moba", label: "食害生物の除去（ウニ類）" },
    { code: "moba_06", category: "moba", label: "食害生物の除去（魚類）" },
    { code: "moba_07", category: "moba", label: "保護区域の設定" },
    { code: "moba_08", category: "moba", label: "ウニの密度管理" },
    { code: "moba_09", category: "moba", label: "栄養塩類の供給" },
    { code: "moba_10", category: "moba", label: "岩盤清掃" },
    { code: "moba_11", category: "moba", label: "流域における植林" },
    { code: "moba_12", category: "moba", label: "浮遊・堆積物の除去" },
    { code: "moba_13", category: "moba", label: "その他の特認活動" },
    { code: "moba_14", category: "moba", label: "モニタリング" },

    // 干潟等の保全（16項目）
    { code: "higata_01", category: "higata", label: "砂泥の移動防止" },
    { code: "higata_02", category: "higata", label: "客土" },
    { code: "higata_03", category: "higata", label: "耕うん" },
    { code: "higata_04", category: "higata", label: "死殻の除去" },
    { code: "higata_05", category: "higata", label: "機能低下を招く生物の除去（腹足類）" },
    { code: "higata_06", category: "higata", label: "機能低下を招く生物の除去（魚類）" },
    { code: "higata_07", category: "higata", label: "機能低下を招く生物の除去（節足類）" },
    { code: "higata_08", category: "higata", label: "機能低下を招く生物の除去（その他）" },
    { code: "higata_09", category: "higata", label: "保護区域の設定" },
    { code: "higata_10", category: "higata", label: "稚貝等の沈着促進" },
    { code: "higata_11", category: "higata", label: "稚貝の密度管理" },
    { code: "higata_12", category: "higata", label: "機能強化のための生物移植" },
    { code: "higata_13", category: "higata", label: "流域における植林" },
    { code: "higata_14", category: "higata", label: "浮遊・堆積物の除去" },
    { code: "higata_15", category: "higata", label: "その他の特認活動" },
    { code: "higata_16", category: "higata", label: "モニタリング" },
  ];

  const expenseItems = [
    { code: "①", key: "jinken", name: "日当" },
    { code: "②", key: "shakin", name: "謝金" },
    { code: "③", key: "yousen", name: "傭船料" },
    { code: "④", key: "shizai", name: "資材費" },
    { code: "⑤", key: "kizai", name: "機材費" },
    { code: "⑥", key: "lease", name: "リース費" },
    { code: "⑦", key: "kotsu", name: "交通費" },
    { code: "⑧", key: "unpan", name: "運搬費" },
    { code: "⑨", key: "itaku", name: "委託費" },
    { code: "⑩", key: "keihatsu", name: "啓発普及費" },
    { code: "⑪", key: "kyozai", name: "教材費" },
    { code: "⑫", key: "shisetsu", name: "施設利用料" },
    { code: "⑬", key: "haiki", name: "廃棄物等処理費" },
    { code: "⑭", key: "shubyo", name: "種苗購入費" },
    { code: "⑮", key: "sonota", name: "その他対策事業に必要な経費" },
  ];

  const periods = [
    { id: 1, label: "第1回", range: "4-6月", months: [4, 5, 6] },
    { id: 2, label: "第2回", range: "7-10月", months: [7, 8, 9, 10] },
    { id: 3, label: "第3回", range: "11-2月", months: [11, 12, 1, 2] },
  ];

  const allocationRules = [
    { target: "jinken", type: "perPerson", unitKey: "wage" },
    { target: "yousen", type: "perBoat", unitKey: "yousen" },
    { target: "kotsu", type: "perCar", unitKey: "sharyo" },
    // 資材費は入庫ログ(type="in")の購入行を集計する。
    { target: "shizai", type: "inventoryIn", source: "moba_inv_log" },
  ];

  return {
    activityItems: activityItems,
    expenseItems: expenseItems,
    periods: periods,
    allocationRules: allocationRules,
  };
})();
