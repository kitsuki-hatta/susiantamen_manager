/* =====================================================================
   main.js ― アプリケーションメインエントリーポイント & イベント統括
   ===================================================================== */

window.App = window.App || {};

(function () {
  "use strict";

  const Storage = App.Storage;
  const Navigation = App.Navigation;

  /**
   * ヘッダーの組織・年度・代表者表示を更新
   */
  function refreshHeaderInfo() {
    const org = Storage.getOrg ? Storage.getOrg() : {};
    const settings = Storage.getSettings ? Storage.getSettings() : {};

    const orgNameEl = document.getElementById("header-org-name");
    const yearEl = document.getElementById("header-year");
    const orgPicker = document.getElementById("header-org-switcher");

    if (orgNameEl) {
      orgNameEl.textContent =
        org.orgName || "未設定（組織初期設定を行ってください）";
    }
    if (yearEl) {
      const y = settings.year || "";
      yearEl.textContent = y ? "令和" + y + "年度" : "";
    }
    if (orgPicker && Storage.getOrganizations) {
      const activeId = Storage.getActiveOrganizationId();
      orgPicker.replaceChildren();
      Storage.getOrganizations().forEach(function (organization) {
        const option = document.createElement("option");
        option.value = organization.id;
        option.textContent = organization.name;
        option.selected = organization.id === activeId;
        orgPicker.appendChild(option);
      });
    }
  }

  /**
   * 初回起動チェック（組織情報が未設定ならモーダルダイアログ表示）
   */
  function checkFirstLaunch() {
    const org = Storage.getOrg ? Storage.getOrg() : {};
    if (!org || !org.orgName) {
      const modal = document.getElementById("modal-first-setup");
      if (modal) {
        modal.style.display = "flex";
      }
    }
  }

  /**
   * 様式4から様式5/6への連携ジャンプ処理
   * @param {string|number} recordId
   */
  App.jumpToDetailEdit = function (recordId) {
    if (!recordId) return;

    // 報告書ビューへ切り替え
    if (Navigation && typeof Navigation.switchView === "function") {
      Navigation.switchView("report");
    }

    // 様式5・6タブへ切り替え
    const f56Tab = document.querySelector(
      '.subtab-btn[data-panel="report-panel-f56"]',
    );
    if (f56Tab) f56Tab.click();

    // 一覧テーブルを再描画してから対象行へスクロール
    if (App.Form5 && typeof App.Form5.renderTable === "function") {
      App.Form5.renderTable();
    }

    // 対象行へスクロール
    setTimeout(function () {
      const row = document.querySelector(
        '#f56-activity-tbody tr[data-rec-id="' + recordId + '"]',
      );
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        // 一時的にハイライト
        row.style.outline = "2px solid #8b5cf6";
        setTimeout(function () {
          row.style.outline = "";
        }, 2000);
      }
    }, 300);
  };

  /**
   * データ変更後の全モジュール再描画
   */
  function refreshAfterDataChange() {
    refreshHeaderInfo();

    if (App.Master && typeof App.Master.render === "function")
      App.Master.render();
    if (App.Budget && typeof App.Budget.render === "function")
      App.Budget.render();
    if (App.Inventory && typeof App.Inventory.render === "function")
      App.Inventory.render();
    if (App.Plan && typeof App.Plan.render === "function") App.Plan.render();
    if (App.Record && typeof App.Record.render === "function")
      App.Record.render();
    if (App.Payment && typeof App.Payment.render === "function")
      App.Payment.render();
    if (App.Dashboard && typeof App.Dashboard.render === "function")
      App.Dashboard.render();
    if (App.TideRecord && typeof App.TideRecord.render === "function")
      App.TideRecord.render();

    // 様式5・6 一覧テーブルも再描画
    if (App.Form5 && typeof App.Form5.refreshAreaFilter === "function") {
      App.Form5.refreshAreaFilter();
    }
    if (App.Form5 && typeof App.Form5.renderTable === "function") {
      App.Form5.renderTable();
    }
  }

  /**
   * イベントハンドラーのセットアップ
   */
  function setupEventListeners() {
    // デバッグデータ投入
    const btnSeedDemo = document.getElementById("btn-seed-demo-data");
    if (btnSeedDemo && !btnSeedDemo.dataset.bound) {
      btnSeedDemo.dataset.bound = "1";
      btnSeedDemo.addEventListener("click", function () {
        if (!Storage.bootstrapDemoData) return;
        if (
          !confirm(
            "デバッグ用データを投入すると現在のデータは上書きされます。続行しますか？",
          )
        )
          return;
        const seeded = Storage.bootstrapDemoData(true);
        if (seeded) {
          refreshAfterDataChange();
          alert("デバッグ用データを投入しました。");
        } else {
          alert("デバッグ用データはすでに投入済みです。");
        }
      });
    }

    // 全データ削除
    const btnClearAll = document.getElementById("btn-clear-all-data");
    if (btnClearAll && !btnClearAll.dataset.bound) {
      btnClearAll.dataset.bound = "1";
      btnClearAll.addEventListener("click", function () {
        if (!Storage.clearAllMobaData) return;
        if (
          !confirm(
            "すべての moba データを削除します。バックアップを取っていない場合は元に戻せません。続行しますか？",
          )
        )
          return;
        Storage.clearAllMobaData();
        refreshAfterDataChange();
        alert("すべてのデータを削除しました。");
      });
    }

    // 組織初期設定ダイアログの保存
    const btnSaveInit = document.getElementById("btn-save-init-org");
    if (btnSaveInit) {
      btnSaveInit.addEventListener("click", function () {
        const name = document.getElementById("init-org-name")?.value || "";
        const year =
          parseInt(document.getElementById("init-year")?.value, 10) || 8;
        const mode =
          document.getElementById("init-wage-mode")?.value || "daily";

        if (!name.trim()) {
          alert("組織名を入力してください。");
          return;
        }

        Storage.setOrg({ orgName: name });
        Storage.setSettings({
          year: year,
          wageMode: mode,
          defaultHours: 3.5,
        });

        refreshHeaderInfo();

        const modal = document.getElementById("modal-first-setup");
        if (modal) modal.style.display = "none";

        alert("組織初期設定が完了しました！");
        if (Navigation) Navigation.switchView("dashboard");
      });
    }

    // ヘッダーの組織設定編集ボタン
    const btnEditHeaderOrg = document.getElementById("btn-edit-header-org");
    if (btnEditHeaderOrg) {
      btnEditHeaderOrg.addEventListener("click", function () {
        if (Navigation) Navigation.switchView("settings");
      });
    }

    const orgSwitcher = document.getElementById("header-org-switcher");
    orgSwitcher?.addEventListener("change", async function () {
      const nextId = orgSwitcher.value;
      if (nextId === Storage.getActiveOrganizationId()) return;
      if (!confirm("活動組織を切り替えます。未保存の内容がないことを確認してください。続行しますか？")) {
        refreshHeaderInfo();
        return;
      }
      try {
        if (App.DataStore) await App.DataStore.flush();
        Storage.switchOrganization(nextId);
        location.reload();
      } catch (error) {
        console.error("活動組織の切り替えに失敗しました:", error);
        alert("活動組織を切り替えられませんでした。\n" + error.message);
        refreshHeaderInfo();
      }
    });

    document.getElementById("btn-add-organization")?.addEventListener("click", async function () {
      const name = prompt("追加する活動組織の名称を入力してください:");
      if (name === null) return;
      try {
        if (App.DataStore) await App.DataStore.flush();
        Storage.createOrganization(name);
        location.reload();
      } catch (error) {
        console.error("活動組織の追加に失敗しました:", error);
        alert("活動組織を追加できませんでした。\n" + error.message);
      }
    });

    // バックアップファイルのインポート処理
    const inputBackup = document.getElementById("input-backup-file");
    if (inputBackup) {
      inputBackup.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm("現在のデータを上書きしてバックアップを復元しますか？")) {
          inputBackup.value = "";
          return;
        }

        const reader = new FileReader();
        reader.onload = async function (ev) {
          if (App.Backup && typeof App.Backup.importBackup === "function") {
            const ok = await App.Backup.importBackup(ev.target.result);
            if (ok) {
              refreshAfterDataChange();
              alert("データの復元が正常に完了しました！");
              if (Navigation) Navigation.switchView("dashboard");
            }
          }
          inputBackup.value = "";
        };
        reader.readAsText(file);
      });
    }
  }

  // -------------------------------------------------------
  // アプリ起動時の DOMContentLoaded 処理
  // -------------------------------------------------------
  window.addEventListener("DOMContentLoaded", async function () {
    if (Storage && typeof Storage.initOrganizations === "function") {
      Storage.initOrganizations();
    }
    if (App.DataStore && typeof App.DataStore.init === "function") {
      try {
        await App.DataStore.init();
      } catch (error) {
        console.error("作業データストレージを初期化できませんでした:", error);
      }
    }
    if (App.AnnualApplication && typeof App.AnnualApplication.init === "function") {
      App.AnnualApplication.init();
    }

    // ナビゲーション初期化
    if (Navigation && typeof Navigation.init === "function") {
      Navigation.init();
    }

    // 潮汐データモジュール初期化
    if (App.TideData && typeof App.TideData.setup === "function") {
      App.TideData.setup();
    }

    // デモデータ初期投入（初回のみ）
    if (Storage && typeof Storage.bootstrapDemoData === "function") {
      Storage.bootstrapDemoData(false);
    }

    // イベントバインド
    setupEventListeners();

    // ヘッダー更新
    refreshHeaderInfo();

    // 初回起動チェック
    checkFirstLaunch();

    // -------------------------------------------------------
    // 様式5・6 の初期化
    // -------------------------------------------------------
    if (App.Form5 && typeof App.Form5.init === "function") {
      App.Form5.init();
    }
    if (App.Form6 && typeof App.Form6.init === "function") {
      App.Form6.init();
    }
    // 初期表示ビュー
    if (Navigation && typeof Navigation.switchView === "function") {
      Navigation.switchView("dashboard");
    }
    bindStorageManagement();
  });

  function bindStorageManagement() {
    const refresh = function () {
      if (App.DataStore) {
        App.DataStore.refreshPanel().catch(function (error) {
          console.error("ストレージ情報の更新に失敗しました:", error);
          alert("ストレージ情報を更新できませんでした。\n" + error.message);
        });
      }
    };
    document.getElementById("btn-export-work-data")?.addEventListener("click", function () {
      App.DataStore.exportBackup().catch(function (error) {
        console.error("作業データの出力に失敗しました:", error);
        alert("作業データを出力できませんでした。\n" + error.message);
      });
    });
    document.getElementById("btn-configure-backup-directory")?.addEventListener("click", async function () {
      try {
        const name = await App.DataStore.configureBackupDirectory();
        App.DataStore.updateBackupDirectoryLabel({ configured: true, name: name });
        alert("バックアップ保存先を設定しました。\n" + name);
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("バックアップ保存先の設定に失敗しました:", error);
        alert("バックアップ保存先を設定できませんでした。\n" + error.message);
      }
    });
    document.getElementById("btn-refresh-storage")?.addEventListener("click", refresh);
    document.getElementById("storage-sort")?.addEventListener("change", refresh);
    document.getElementById("btn-delete-selected-work-data")?.addEventListener("click", async function () {
      const selected = Array.from(document.querySelectorAll("#storage-record-list input:checked"))
        .map(function (input) { return input.value; });
      if (!selected.length) {
        alert("削除する日付を選択してください。");
        return;
      }
      if (!confirm(selected.length + "日分の作業実績と関連する写真・位置図を削除します。元に戻せません。続行しますか？")) {
        return;
      }
      try {
        const count = await App.DataStore.deleteDates(selected);
        refreshAfterDataChange();
        await App.DataStore.refreshPanel();
        alert("作業実績を削除しました。削除件数: " + count);
      } catch (error) {
        console.error("作業データの削除に失敗しました:", error);
        alert("作業データを削除できませんでした。\n" + error.message);
      }
    });
    document.getElementById("input-import-work-data")?.addEventListener("change", async function (event) {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) return;
      if (!confirm("IndexedDBの作業データをバックアップ内容で置き換えます。続行しますか？")) {
        input.value = "";
        return;
      }
      try {
        await App.DataStore.importBackup(await file.text());
        refreshAfterDataChange();
        await App.DataStore.refreshPanel();
        alert("作業データを復元しました。");
      } catch (error) {
        console.error("作業データの復元に失敗しました:", error);
        alert("作業データを復元できませんでした。\n" + error.message);
      } finally {
        input.value = "";
      }
    });
    refresh();
    App.DataStore?.refreshBackupDirectoryLabel().catch(function (error) {
      console.error("バックアップ保存先の確認に失敗しました:", error);
    });
  }

  // 外部から利用できる関数を App.main として公開
  App.main = {
    refreshHeaderInfo: refreshHeaderInfo,
    refreshAfterDataChange: refreshAfterDataChange,
  };
})();
