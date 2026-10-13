/* ============================================================
   data-store.js
   IndexedDB repository for dated work records and photo blobs.
   ============================================================ */

window.App = window.App || {};

App.DataStore = (function () {
  "use strict";

  const DB_NAME = "moba_work_data";
  const DB_VERSION = 2;
  const DAILY_STORE = "daily_data";
  const MEDIA_STORE = "media";
  const SETTINGS_STORE = "settings";
  const BACKUP_DIRECTORY_KEY = "backup_directory";
  const MIGRATION_KEY = "moba_indexeddb_migrated_v1";
  let db = null;
  let initialized = false;
  let backupDirectoryHandle = null;
  let operationQueue = Promise.resolve();
  const mediaDataUrls = new Map();

  function databaseName() {
    const orgId = App.Storage && App.Storage.getActiveOrganizationId
      ? App.Storage.getActiveOrganizationId()
      : "default";
    return orgId === "default" ? DB_NAME : DB_NAME + "_" + orgId;
  }

  function migrationKey() {
    return App.Storage && App.Storage.getScopedStorageKey
      ? App.Storage.getScopedStorageKey(MIGRATION_KEY)
      : MIGRATION_KEY;
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("このブラウザーでは IndexedDB を利用できません。"));
        return;
      }
      const request = indexedDB.open(databaseName(), DB_VERSION);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains(DAILY_STORE)) {
          database.createObjectStore(DAILY_STORE, { keyPath: "date" });
        }
        if (!database.objectStoreNames.contains(MEDIA_STORE)) {
          database.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
          database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        db = request.result;
        db.onversionchange = function () {
          db.close();
          db = null;
          initialized = false;
        };
        resolve(db);
      };
      request.onerror = function () {
        reject(request.error || new Error("IndexedDB を開けませんでした。"));
      };
    });
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(request.error || new Error("IndexedDB の読み書きに失敗しました。"));
      };
    });
  }

  function runTransaction(storeNames, mode, action) {
    return new Promise(function (resolve, reject) {
      if (!db) {
        reject(new Error("IndexedDB が初期化されていません。"));
        return;
      }
      const tx = db.transaction(storeNames, mode);
      let result;
      try {
        result = action(tx);
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = function () {
        reject(tx.error || new Error("IndexedDB のトランザクションに失敗しました。"));
      };
      tx.onabort = function () {
        reject(tx.error || new Error("IndexedDB のトランザクションが中断されました。"));
      };
    });
  }

  function readAll(storeName) {
    return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  }

  function getSetting(id) {
    return requestResult(db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(id));
  }

  function enqueue(operation) {
    operationQueue = operationQueue.catch(function () {}).then(operation);
    operationQueue.catch(function (error) {
      console.error("IndexedDB 保存エラー:", error);
      alert("IndexedDBへの保存に失敗しました。空き容量とブラウザーの設定を確認してください。\n" + error.message);
    });
    return operationQueue;
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    const match = parts[0].match(/data:([^;]+);base64/);
    if (!match || !parts[1]) throw new Error("画像データの形式が不正です。");
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error("画像を読み込めませんでした。")); };
      reader.readAsDataURL(blob);
    });
  }

  function mediaId(kind, parentId, field) {
    return [kind, String(parentId), String(field)].join(":");
  }

  async function saveMedia(id, dataUrl) {
    if (!dataUrl || String(dataUrl).indexOf("data:image/") !== 0) {
      throw new Error("画像データが有効な data URL ではありません。");
    }
    const blob = dataUrlToBlob(dataUrl);
    await runTransaction([MEDIA_STORE], "readwrite", function (tx) {
      tx.objectStore(MEDIA_STORE).put({
        id: id,
        blob: blob,
        type: blob.type,
        size: blob.size,
        updatedAt: new Date().toISOString(),
      });
    });
    mediaDataUrls.set(id, dataUrl);
  }

  async function loadMediaCache() {
    mediaDataUrls.clear();
    const items = await readAll(MEDIA_STORE);
    for (const item of items) {
      if (item.blob instanceof Blob) {
        mediaDataUrls.set(item.id, await blobToDataUrl(item.blob));
      }
    }
  }

  async function extractForm5(data) {
    const sanitized = JSON.parse(JSON.stringify(data || {}));
    for (const recId of Object.keys(sanitized)) {
      const entry = sanitized[recId];
      for (const pair of [["mapBgData", "_mapBgMediaId"], ["mapPreviewData", "_mapPreviewMediaId"]]) {
        const value = entry[pair[0]];
        const id = entry[pair[1]] || mediaId("form5", recId, pair[0]);
        if (value && String(value).indexOf("data:image/") === 0) {
          await saveMedia(id, value);
          entry[pair[1]] = id;
          delete entry[pair[0]];
        }
      }
    }
    return sanitized;
  }

  async function extractForm6(data) {
    const sanitized = JSON.parse(JSON.stringify(data || {}));
    for (const recId of Object.keys(sanitized)) {
      const photos = sanitized[recId].photos || [];
      for (let i = 0; i < photos.length; i += 1) {
        const photo = photos[i];
        const value = photo.dataUrl;
        const id = photo._mediaId || mediaId("form6", recId, i);
        if (value && String(value).indexOf("data:image/") === 0) {
          await saveMedia(id, value);
          photo._mediaId = id;
          delete photo.dataUrl;
        }
      }
    }
    return sanitized;
  }

  function hydrateForm5(data) {
    const hydrated = JSON.parse(JSON.stringify(data || {}));
    Object.keys(hydrated).forEach(function (recId) {
      const entry = hydrated[recId];
      [["mapBgData", "_mapBgMediaId"], ["mapPreviewData", "_mapPreviewMediaId"]].forEach(function (pair) {
        if (entry[pair[1]] && mediaDataUrls.has(entry[pair[1]])) {
          entry[pair[0]] = mediaDataUrls.get(entry[pair[1]]);
        }
      });
    });
    return hydrated;
  }

  function hydrateForm6(data) {
    const hydrated = JSON.parse(JSON.stringify(data || {}));
    Object.keys(hydrated).forEach(function (recId) {
      (hydrated[recId].photos || []).forEach(function (photo) {
        if (photo._mediaId && mediaDataUrls.has(photo._mediaId)) {
          photo.dataUrl = mediaDataUrls.get(photo._mediaId);
        }
      });
    });
    return hydrated;
  }

  function stageForm5(data) {
    const staged = JSON.parse(JSON.stringify(data || {}));
    Object.keys(staged).forEach(function (recId) {
      const entry = staged[recId];
      [["mapBgData", "_mapBgMediaId"], ["mapPreviewData", "_mapPreviewMediaId"]].forEach(function (pair) {
        if (entry[pair[0]] && String(entry[pair[0]]).indexOf("data:image/") === 0) {
          const id = entry[pair[1]] || mediaId("form5", recId, pair[0]);
          entry[pair[1]] = id;
          mediaDataUrls.set(id, entry[pair[0]]);
          delete entry[pair[0]];
        }
      });
    });
    return staged;
  }

  function stageForm6(data) {
    const staged = JSON.parse(JSON.stringify(data || {}));
    Object.keys(staged).forEach(function (recId) {
      (staged[recId].photos || []).forEach(function (photo, index) {
        if (photo.dataUrl && String(photo.dataUrl).indexOf("data:image/") === 0) {
          const id = photo._mediaId || mediaId("form6", recId, index);
          photo._mediaId = id;
          mediaDataUrls.set(id, photo.dataUrl);
          delete photo.dataUrl;
        }
      });
    });
    return staged;
  }

  async function persistRecords(records) {
    const grouped = new Map();
    (records || []).forEach(function (record) {
      if (!record || !record.date) return;
      if (!grouped.has(record.date)) grouped.set(record.date, []);
      grouped.get(record.date).push(record);
    });
    await runTransaction([DAILY_STORE], "readwrite", function (tx) {
      const store = tx.objectStore(DAILY_STORE);
      store.clear();
      grouped.forEach(function (items, date) {
        store.put({ date: date, records: items, updatedAt: new Date().toISOString() });
      });
    });
  }

  async function migrateLegacyData() {
    const Storage = App.Storage;
    let records;
    const localRecords = localStorage.getItem(Storage.KEYS.record);
    if (localRecords !== null) {
      records = Storage.getByKey(Storage.KEYS.record) || [];
    } else     if (localStorage.getItem(migrationKey()) === "1") {
      const days = await readAll(DAILY_STORE);
      records = days.flatMap(function (day) { return day.records || []; });
      Storage.setByKey(Storage.KEYS.record, records);
    } else {
      records = [];
    }
    const form5 = await extractForm5(Storage.getByKey(Storage.KEYS.form5) || {});
    const form6 = await extractForm6(Storage.getByKey(Storage.KEYS.form6) || {});
    Storage.setByKey(Storage.KEYS.form5, form5);
    Storage.setByKey(Storage.KEYS.form6, form6);
    await persistRecords(records);
    localStorage.setItem(migrationKey(), "1");
    await loadMediaCache();
  }

  async function rebuildFromLegacyData() {
    const Storage = App.Storage;
    const records = Storage.getByKey(Storage.KEYS.record) || [];
    await runTransaction([DAILY_STORE, MEDIA_STORE], "readwrite", function (tx) {
      tx.objectStore(DAILY_STORE).clear();
      tx.objectStore(MEDIA_STORE).clear();
    });
    const form5 = await extractForm5(Storage.getByKey(Storage.KEYS.form5) || {});
    const form6 = await extractForm6(Storage.getByKey(Storage.KEYS.form6) || {});
    await persistRecords(records);
    Storage.setByKey(Storage.KEYS.form5, form5);
    Storage.setByKey(Storage.KEYS.form6, form6);
    localStorage.setItem(migrationKey(), "1");
    await loadMediaCache();
  }

  async function init() {
    if (initialized) return;
    try {
      await openDatabase();
      await migrateLegacyData();
      const backupDirectory = await getSetting(BACKUP_DIRECTORY_KEY);
      backupDirectoryHandle = backupDirectory ? backupDirectory.handle : null;
      initialized = true;
    } catch (error) {
      console.error("IndexedDB 初期化エラー:", error);
      alert("IndexedDBを初期化できませんでした。作業データをIndexedDBへ保存できていません。\n" + error.message);
      throw error;
    }
  }

  function saveRecords(records) {
    if (!initialized) return Promise.resolve();
    return enqueue(function () { return persistRecords(records); });
  }

  function saveForm5(data) {
    if (!initialized) return Promise.resolve();
    return enqueue(async function () {
      try {
        const sanitized = await extractForm5(data);
        App.Storage.setByKey(App.Storage.KEYS.form5, sanitized);
      } catch (error) {
        App.Storage.setByKey(App.Storage.KEYS.form5, data);
        throw error;
      }
    });
  }

  function saveForm6(data) {
    if (!initialized) return Promise.resolve();
    return enqueue(async function () {
      try {
        const sanitized = await extractForm6(data);
        App.Storage.setByKey(App.Storage.KEYS.form6, sanitized);
      } catch (error) {
        App.Storage.setByKey(App.Storage.KEYS.form6, data);
        throw error;
      }
    });
  }

  async function listDays() {
    await operationQueue;
    return readAll(DAILY_STORE);
  }

  async function estimateStorage() {
    if (navigator.storage && typeof navigator.storage.estimate === "function") {
      return navigator.storage.estimate();
    }
    return null;
  }

  async function configureBackupDirectory() {
    if (typeof window.showDirectoryPicker !== "function") {
      throw new Error("このブラウザーはフォルダーへの直接保存に対応していません。Chrome または Edge の最新版をお使いください。");
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await runTransaction([SETTINGS_STORE], "readwrite", function (tx) {
      tx.objectStore(SETTINGS_STORE).put({ id: BACKUP_DIRECTORY_KEY, handle: handle });
    });
    backupDirectoryHandle = handle;
    return handle.name;
  }

  async function getBackupDirectoryInfo() {
    const saved = await getSetting(BACKUP_DIRECTORY_KEY);
    if (!saved || !saved.handle) return { configured: false, name: "" };
    return { configured: true, name: saved.handle.name || "選択済みフォルダー" };
  }

  async function prepareBackupDirectory() {
    const handle = backupDirectoryHandle;
    if (!handle) return null;
    if (typeof handle.requestPermission === "function") {
      const permission = await handle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") return null;
    } else if (typeof handle.queryPermission === "function") {
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") return null;
    } else {
      return null;
    }
    return handle;
  }

  async function writeBackupFile(handle, blob, filename) {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function updateBackupDirectoryLabel(info) {
    const label = document.getElementById("backup-directory-status");
    if (!label) return;
    label.textContent = info.configured
      ? "保存先: " + info.name + "（次回バックアップ時にアクセスを確認します）"
      : "保存先フォルダーは未設定です。";
  }

  async function refreshBackupDirectoryLabel() {
    const info = await getBackupDirectoryInfo();
    updateBackupDirectoryLabel(info);
  }

  async function removeUnreferencedMedia() {
    const form5 = App.Storage.getByKey(App.Storage.KEYS.form5) || {};
    const form6 = App.Storage.getByKey(App.Storage.KEYS.form6) || {};
    const used = new Set();
    Object.keys(form5).forEach(function (recId) {
      const entry = form5[recId];
      if (entry._mapBgMediaId) used.add(entry._mapBgMediaId);
      if (entry._mapPreviewMediaId) used.add(entry._mapPreviewMediaId);
    });
    Object.keys(form6).forEach(function (recId) {
      (form6[recId].photos || []).forEach(function (photo) {
        if (photo._mediaId) used.add(photo._mediaId);
      });
    });
    const media = await readAll(MEDIA_STORE);
    const unused = media.filter(function (item) { return !used.has(item.id); });
    if (unused.length) {
      await runTransaction([MEDIA_STORE], "readwrite", function (tx) {
        const store = tx.objectStore(MEDIA_STORE);
        unused.forEach(function (item) {
          store.delete(item.id);
          mediaDataUrls.delete(item.id);
        });
      });
    }
  }

  function pruneMedia() {
    return enqueue(removeUnreferencedMedia);
  }

  async function deleteDates(dates) {
    const dateSet = new Set(dates.map(String));
    const records = App.Storage.getRecord() || [];
    const deletedRecords = records.filter(function (record) { return dateSet.has(String(record.date)); });
    const deletedIds = new Set(deletedRecords.map(function (record) { return String(record.id); }));
    App.Storage.setRecord(records.filter(function (record) { return !dateSet.has(String(record.date)); }));

    const form5 = App.Storage.getForm5() || {};
    const form6 = App.Storage.getForm6() || {};
    deletedIds.forEach(function (id) {
      delete form5[id];
      delete form6[id];
    });
    App.Storage.setForm5(form5);
    App.Storage.setForm6(form6);
    await operationQueue;
    await removeUnreferencedMedia();
    return deletedRecords.length;
  }

  async function clearAll() {
    localStorage.removeItem(migrationKey());
    await runTransaction([DAILY_STORE, MEDIA_STORE], "readwrite", function (tx) {
      tx.objectStore(DAILY_STORE).clear();
      tx.objectStore(MEDIA_STORE).clear();
    });
    mediaDataUrls.clear();
    localStorage.setItem(migrationKey(), "1");
  }

  async function exportBackup() {
    let directory = null;
    try {
      directory = await prepareBackupDirectory();
    } catch (error) {
      console.warn("バックアップフォルダーの許可を取得できませんでした。通常のダウンロードを使用します。", error);
    }
    const bundle = await getBackupData();
    const date = new Date();
    const stamp = date.getFullYear() + String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0") + "_" +
      String(date.getHours()).padStart(2, "0") + String(date.getMinutes()).padStart(2, "0");
    const blob = new Blob(["\ufeff", JSON.stringify(bundle)], { type: "application/json;charset=utf-8" });
    const filename = "moba_work_data_" + organizationFileSuffix() + "_" + stamp + ".json";
    if (directory) {
      await writeBackupFile(directory, blob, filename);
      return;
    }
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function getBackupData() {
    await operationQueue;
    const days = await readAll(DAILY_STORE);
    const media = await readAll(MEDIA_STORE);
    const serializedMedia = [];
    for (const item of media) {
      serializedMedia.push({
        id: item.id,
        type: item.type || item.blob.type,
        dataUrl: await blobToDataUrl(item.blob),
      });
    }
    return {
      format: "moba_indexeddb_backup_v1",
      exportedAt: new Date().toISOString(),
      organization: {
        id: App.Storage.getActiveOrganizationId
          ? App.Storage.getActiveOrganizationId()
          : "default",
        name: App.Storage.getActiveOrganization
          ? (App.Storage.getActiveOrganization()?.name || "")
          : (App.Storage.getOrg()?.orgName || ""),
      },
      dailyData: days,
      media: serializedMedia,
      form5: App.Storage.getByKey(App.Storage.KEYS.form5) || {},
      form6: App.Storage.getByKey(App.Storage.KEYS.form6) || {},
    };
  }

  async function importBackup(input) {
    const bundle = typeof input === "string"
      ? JSON.parse(input.replace(/^\uFEFF/, ""))
      : input;
    if (!bundle || bundle.format !== "moba_indexeddb_backup_v1" ||
        !Array.isArray(bundle.dailyData) || !Array.isArray(bundle.media)) {
      throw new Error("IndexedDBバックアップの形式が正しくありません。");
    }
    const currentOrganization = App.Storage.getActiveOrganization
      ? App.Storage.getActiveOrganization()
      : null;
    if (bundle.organization && currentOrganization &&
        bundle.organization.name && bundle.organization.name !== currentOrganization.name) {
      throw new Error("このバックアップは「" + bundle.organization.name +
        "」のデータです。復元先の活動組織を切り替えてください。");
    }
    const allRecords = [];
    bundle.dailyData.forEach(function (day) {
      if (!day || typeof day.date !== "string" || !Array.isArray(day.records)) {
        throw new Error("日付別データの形式が正しくありません。");
      }
      day.records.forEach(function (record) { allRecords.push(record); });
    });
    bundle.media.forEach(function (item) {
      if (!item || typeof item.id !== "string" || typeof item.dataUrl !== "string") {
        throw new Error("バックアップ内の画像データが正しくありません。");
      }
    });
    await restoreBackupData(bundle, allRecords);
  }

  async function restoreBackupData(bundle, preparedRecords) {
    if (!bundle || !Array.isArray(bundle.dailyData) || !Array.isArray(bundle.media)) {
      throw new Error("IndexedDBバックアップの構造が正しくありません。");
    }
    bundle.dailyData.forEach(function (day) {
      if (!day || typeof day.date !== "string" || !Array.isArray(day.records)) {
        throw new Error("日付別データの形式が正しくありません。");
      }
    });
    bundle.media.forEach(function (item) {
      if (!item || typeof item.id !== "string" || typeof item.dataUrl !== "string") {
        throw new Error("バックアップ内の画像データが正しくありません。");
      }
    });
    const allRecords = preparedRecords || bundle.dailyData.flatMap(function (day) {
      return (day.records || []);
    });
    await runTransaction([DAILY_STORE, MEDIA_STORE], "readwrite", function (tx) {
      const days = tx.objectStore(DAILY_STORE);
      const media = tx.objectStore(MEDIA_STORE);
      days.clear();
      media.clear();
      bundle.dailyData.forEach(function (day) { days.put(day); });
      bundle.media.forEach(function (item) {
        const blob = dataUrlToBlob(item.dataUrl);
        media.put({ id: item.id, blob: blob, type: item.type || blob.type, size: blob.size });
      });
    });
    App.Storage.setRecord(allRecords);
    App.Storage.setByKey(App.Storage.KEYS.form5, bundle.form5 || {});
    App.Storage.setByKey(App.Storage.KEYS.form6, bundle.form6 || {});
    localStorage.setItem(migrationKey(), "1");
    await loadMediaCache();
    await operationQueue;
  }

  async function refreshPanel() {
    const summary = document.getElementById("storage-usage-summary");
    const list = document.getElementById("storage-record-list");
    const sort = document.getElementById("storage-sort");
    if (!summary || !list) return;
    const [estimate, days, media] = await Promise.all([
      estimateStorage(),
      listDays(),
      readAll(MEDIA_STORE),
    ]);
    const mediaSize = media.reduce(function (sum, item) { return sum + (item.size || item.blob.size || 0); }, 0);
    const usage = estimate && Number.isFinite(estimate.usage) ? estimate.usage : null;
    const quota = estimate && Number.isFinite(estimate.quota) ? estimate.quota : null;
    summary.textContent = usage === null
      ? "ブラウザーの使用量情報は取得できません。IndexedDB画像合計: " + formatBytes(mediaSize)
      : "ブラウザー使用量: " + formatBytes(usage) + (quota ? " / " + formatBytes(quota) : "") +
        "（画像データ: " + formatBytes(mediaSize) + "）";

    const mediaById = new Map(media.map(function (item) { return [item.id, item]; }));
    const forms5 = App.Storage.getByKey(App.Storage.KEYS.form5) || {};
    const forms6 = App.Storage.getByKey(App.Storage.KEYS.form6) || {};
    const rows = days.map(function (day) {
      const ids = new Set((day.records || []).map(function (record) { return String(record.id); }));
      let size = new Blob([JSON.stringify(day)]).size;
      ids.forEach(function (id) {
        const f5 = forms5[id] || {};
        [f5._mapBgMediaId, f5._mapPreviewMediaId].forEach(function (id) {
          const item = id && mediaById.get(id);
          if (item) size += item.size || item.blob.size || 0;
        });
        ((forms6[id] && forms6[id].photos) || []).forEach(function (photo) {
          const item = photo._mediaId && mediaById.get(photo._mediaId);
          if (item) size += item.size || item.blob.size || 0;
        });
      });
      return { date: day.date, count: (day.records || []).length, size: size };
    });
    rows.sort(sort && sort.value === "size" ?
      function (a, b) { return b.size - a.size || b.date.localeCompare(a.date); } :
      function (a, b) { return b.date.localeCompare(a.date); });
    list.innerHTML = rows.length ? rows.map(function (row) {
      return '<label class="storage-record-row"><input type="checkbox" value="' +
        App.Utils.esc(row.date) + '"><span>' + App.Utils.esc(row.date) +
        '</span><span>' + row.count + '件</span><span>' + formatBytes(row.size) + '</span></label>';
    }).join("") : '<p class="hint">IndexedDBに作業データはありません。</p>';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function organizationFileSuffix() {
    const organization = App.Storage.getActiveOrganization
      ? App.Storage.getActiveOrganization()
      : null;
    const label = organization && organization.name
      ? organization.name
      : (App.Storage.getOrg()?.orgName || "organization");
    return String(label).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "organization";
  }

  return {
    init: init,
    rebuildFromLegacyData: rebuildFromLegacyData,
    isReady: function () { return initialized; },
    saveRecords: saveRecords,
    saveForm5: saveForm5,
    saveForm6: saveForm6,
    hydrateForm5: hydrateForm5,
    hydrateForm6: hydrateForm6,
    stageForm5: stageForm5,
    stageForm6: stageForm6,
    listDays: listDays,
    estimateStorage: estimateStorage,
    configureBackupDirectory: configureBackupDirectory,
    getBackupDirectoryInfo: getBackupDirectoryInfo,
    prepareBackupDirectory: prepareBackupDirectory,
    writeBackupFile: writeBackupFile,
    updateBackupDirectoryLabel: updateBackupDirectoryLabel,
    refreshBackupDirectoryLabel: refreshBackupDirectoryLabel,
    deleteDates: deleteDates,
    clearAll: clearAll,
    pruneMedia: pruneMedia,
    exportBackup: exportBackup,
    getBackupData: getBackupData,
    importBackup: importBackup,
    restoreBackupData: restoreBackupData,
    refreshPanel: refreshPanel,
    flush: function () { return operationQueue; },
  };
})();
