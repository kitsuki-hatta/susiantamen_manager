/* =====================================================================
   backup.js ― バックアップ & 復元モジュール
   ===================================================================== */

window.App = window.App || {};

App.Backup = (function () {
  "use strict";

  const Storage = App.Storage;
  const Calc = App.Calc;
  const Const = App.Const;

  function organizationFileSuffix() {
    const organization = Storage.getActiveOrganization
      ? Storage.getActiveOrganization()
      : null;
    const label = organization && organization.name
      ? organization.name
      : (Storage.getOrg()?.orgName || "organization");
    return String(label).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "organization";
  }

  /**
   * フルバックアップ (JSON形式) をダウンロード出力
   */
  async function exportFullBackup() {
    let backupDirectory = null;
    try {
      if (App.DataStore && App.DataStore.isReady()) {
        backupDirectory = await App.DataStore.prepareBackupDirectory();
      }
      const keys = Storage.KEYS;
      const data = {};

      Object.keys(keys).forEach(function (k) {
        if (k === "lastBackup") return;
        const storageKey = keys[k];
        data[k] = Storage.getByKey(storageKey);
      });
      const indexedDBData =
        App.DataStore && App.DataStore.isReady()
          ? await App.DataStore.getBackupData()
          : null;

      const backupObj = {
        format: "moba_full_backup_v1",
        version: 1,
        app: "moba_higata_app",
        exportedAt: new Date().toISOString(),
        organization: {
          id: Storage.getActiveOrganizationId ? Storage.getActiveOrganizationId() : "default",
          name: Storage.getActiveOrganization
            ? (Storage.getActiveOrganization()?.name || Storage.getOrg()?.orgName || "")
            : (Storage.getOrg()?.orgName || ""),
        },
        data: data,
        indexedDBData: indexedDBData,
      };

      const jsonStr = JSON.stringify(backupObj, null, 2);
      const blob = new Blob(["\ufeff", jsonStr], {
        type: "application/json;charset=utf-8;",
      });
      const now = new Date();
      const stamp =
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        "_" +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0");

      const filename = "moba_full_backup_" + organizationFileSuffix() + "_" + stamp + ".json";
      if (backupDirectory) {
        await App.DataStore.writeBackupFile(backupDirectory, blob, filename);
      } else {
        downloadBlob(blob, filename);
      }

      Storage.setLastBackup(now.toISOString());
      return true;
    } catch (e) {
      console.error("フルバックアップ出力エラー:", e);
      alert("バックアップ作成中にエラーが発生しました: " + e.message);
      return false;
    }
  }

  /**
   * 軽量 CSV バックアップ（画像データ除外）を出力
   */
  async function exportCsvBackup() {
    let backupDirectory = null;
    try {
      if (App.DataStore && App.DataStore.isReady()) {
        backupDirectory = await App.DataStore.prepareBackupDirectory();
      }
      const recs = Calc.getTargetRecords ? Calc.getTargetRecords("all") : [];
      const areas = Storage.getAreas ? Storage.getAreas() || [] : [];
      const areasById = {};
      areas.forEach(function (a) {
        areasById[a.id] = a;
      });

      const headers = [
        "ID",
        "日付",
        "地区名",
        "活動項目コード",
        "活動項目名",
        "参加人数",
        "用船隻数",
        "車両台数",
        "潜水作業",
        "内容・備考",
        "領収書番号",
      ];
      const csvRows = [headers.join(",")];

      recs.forEach(function (r) {
        const area = areasById[r.areaId] || { name: r.areaId || "" };
        const act =
          Const && Const.activityItems
            ? Const.activityItems.find(function (item) {
                return item.code === r.activityCode;
              })
            : null;
        const actLabel = act ? act.label : r.activityCode || "";

        const row = [
          escCsv(r.id),
          escCsv(r.date),
          escCsv(area.name),
          escCsv(r.activityCode),
          escCsv(actLabel),
          r.people || 0,
          r.boat || 0,
          r.car || 0,
          escCsv(r.diving || "no"),
          escCsv((r.content || "") + (r.note ? " " + r.note : "")),
          escCsv(r.receiptNo || ""),
        ];
        csvRows.push(row.join(","));
      });

      const csvContent = csvRows.join("\r\n");
      const blob = new Blob(["\ufeff", csvContent], {
        type: "text/csv;charset=utf-8;",
      });

      const now = new Date();
      const stamp =
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        "_" +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0");

      const filename = "moba_csv_backup_" + organizationFileSuffix() + "_" + stamp + ".csv";
      if (backupDirectory) {
        await App.DataStore.writeBackupFile(backupDirectory, blob, filename);
      } else {
        downloadBlob(blob, filename);
      }

      return true;
    } catch (e) {
      console.error("CSVバックアップ出力エラー:", e);
      alert("CSVバックアップ作成中にエラーが発生しました: " + e.message);
      return false;
    }
  }

  /**
   * JSONバックアップファイルからのデータ復元
   * @param {string|Object} inputData - JSON文字列またはオブジェクト
   * @returns {boolean} 成功判定
   */
  async function importBackup(inputData) {
    try {
      let backupObj = null;
      if (typeof inputData === "string") {
        backupObj = JSON.parse(inputData.replace(/^\uFEFF/, ""));
      } else {
        backupObj = inputData;
      }

      if (!backupObj || typeof backupObj !== "object") {
        throw new Error("バックアップデータが無効な形式です。");
      }

      // format 識別子の厳密チェック（moba_ プレフィックス必須）
      const format = String(backupObj.format || "");
      if (!format || format.indexOf("moba_") !== 0) {
        alert(
          "復元エラー: 他のアプリのファイル（アサリ版等）または未対応の形式です。\n" +
            "(format: " +
            (format || "未定義") +
            ")",
        );
        return false;
      }

      const data = backupObj.data;
      if (!data || typeof data !== "object") {
        throw new Error("バックアップ内のデータ構造が見つかりません。");
      }
      const currentOrganization = Storage.getActiveOrganization
        ? Storage.getActiveOrganization()
        : null;
      if (backupObj.organization && currentOrganization &&
          backupObj.organization.name && backupObj.organization.name !== currentOrganization.name) {
        throw new Error("このバックアップは「" + backupObj.organization.name +
          "」のデータです。復元先の活動組織を切り替えてください。");
      }

      const keys = Storage.KEYS;
      Object.keys(keys).forEach(function (k) {
        if (k === "lastBackup") return;
        const storageKey = keys[k];
        if (data[k] !== undefined) {
          Storage.setByKey(storageKey, data[k]);
        }
      });
      if (backupObj.indexedDBData && App.DataStore && App.DataStore.isReady()) {
        await App.DataStore.restoreBackupData(backupObj.indexedDBData);
      } else if (App.DataStore && App.DataStore.isReady()) {
        await App.DataStore.rebuildFromLegacyData();
      }

      const now = new Date().toISOString();
      Storage.setLastBackup(now);

      // ★ 復元完了後にリロードして全モジュールに反映
      alert("データの復元が完了しました。\nページを再読み込みします。");
      location.reload();

      return true;
    } catch (e) {
      console.error("バックアップ復元エラー:", e);
      alert("データの復元に失敗しました: " + e.message);
      return false;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escCsv(val) {
    const str = String(val || "").replace(/"/g, '""');
    return '"' + str + '"';
  }

  return {
    exportFullBackup: exportFullBackup,
    exportCsvBackup: exportCsvBackup,
    importBackup: importBackup,
  };
})();
