/* ============================================================
   storage.js
   localStorage のキー管理・初期値・読み書きラッパー。
   ============================================================ */

window.App = window.App || {};

App.Storage = (function () {
  "use strict";

  const KEYS = {
    org: "moba_org",
    meta: "moba_meta",
    settings: "moba_settings",
    budget: "moba_budget",
    grantFlow: "moba_grant_flow",
    budgetExpense: "moba_budget_expense",
    master: "moba_master",
    areas: "moba_areas",
    members: "moba_members",
    activities: "moba_activities",
    plan: "moba_plan",
    record: "moba_record",
    inventory: "moba_inventory",
    invLog: "moba_inv_log",
    tideRecord: "moba_tide_record",
    tideData: "moba_tide_data",
    form5: "moba_form5",
    form6: "moba_form6",
    lastBackup: "moba_last_backup",
  };
  const ORGANIZATIONS_KEY = "moba_organizations_v1";
  const ACTIVE_ORGANIZATION_KEY = "moba_active_organization_id";
  let activeOrganizationId = null;
  let organizations = [];

  function scopedKey(key) {
    if (!activeOrganizationId || activeOrganizationId === "default") return key;
    const prefix = "moba_";
    return key.indexOf(prefix) === 0
      ? prefix + activeOrganizationId + "_" + key.slice(prefix.length)
      : key;
  }

  function readOrganizationRegistry() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ORGANIZATIONS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("活動組織一覧の読み込みに失敗しました:", error);
      return [];
    }
  }

  function saveOrganizationRegistry() {
    localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(organizations));
  }

  function initOrganizations() {
    organizations = readOrganizationRegistry();
    if (!organizations.length) {
      organizations = [{
        id: "default",
        name: "活動組織1",
        createdAt: new Date().toISOString(),
      }];
      saveOrganizationRegistry();
    }
    activeOrganizationId = localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
    if (!organizations.some(function (item) { return item.id === activeOrganizationId; })) {
      activeOrganizationId = organizations[0].id;
      localStorage.setItem(ACTIVE_ORGANIZATION_KEY, activeOrganizationId);
    }
    const current = organizations.find(function (item) { return item.id === activeOrganizationId; });
    if (current && activeOrganizationId === "default") {
      const orgData = load(KEYS.org, getDefaultByKey(KEYS.org));
      if (orgData.orgName) current.name = orgData.orgName;
      saveOrganizationRegistry();
    }
    return getOrganizations();
  }

  function getOrganizations() {
    return organizations.map(function (item) { return Object.assign({}, item); });
  }

  function getActiveOrganizationId() {
    return activeOrganizationId || "default";
  }

  function getActiveOrganization() {
    return organizations.find(function (item) { return item.id === getActiveOrganizationId(); }) || null;
  }

  function switchOrganization(id) {
    if (!organizations.some(function (item) { return item.id === id; })) {
      throw new Error("選択した活動組織が見つかりません。");
    }
    localStorage.setItem(ACTIVE_ORGANIZATION_KEY, id);
    activeOrganizationId = id;
  }

  function createOrganization(name) {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("活動組織名を入力してください。");
    if (organizations.some(function (item) { return item.name === cleanName; })) {
      throw new Error("同じ名前の活動組織が既に登録されています。");
    }
    const id = "org-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8);
    organizations.push({ id: id, name: cleanName, createdAt: new Date().toISOString() });
    saveOrganizationRegistry();
    switchOrganization(id);
    const defaults = getDefaults();
    Object.keys(defaults).forEach(function (key) {
      save(key, defaults[key]);
    });
    setOrg({ orgName: cleanName });
    setMeta({ seeded: true, debugSeed: false, seededAt: null, clearedAt: null });
    return id;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultActivities() {
    if (window.App && App.Const && Array.isArray(App.Const.activityItems)) {
      return App.Const.activityItems.map(function (item) {
        return {
          code: item.code,
          category: item.category,
          label: item.label,
          enabled: false,
        };
      });
    }
    return [];
  }

  function getDefaults() {
    return {
      [KEYS.org]: {
        orgName: "",
        bankAccount: {
          bankName: "",
          branchName: "",
          accountType: "",
          accountNo: "",
          accountHolder: "",
          accountHolderKana: ""
        },
      },
      [KEYS.meta]: {
        seeded: false,
        debugSeed: false,
        seededAt: null,
        clearedAt: null,
      },
      [KEYS.settings]: {
        wageMode: "daily",
        year: null,
        defaultHours: 3.5,
        chairman: "",
        councilChairName: "",
        calendarColorBasis: "activity",
        municipality: null,
        mapTileMode: "online",
        activityArea: null
      },
      [KEYS.budget]: {
        amount: 0,
        approvedAmount: 0,
        planByPeriod: { 1: 0, 2: 0, 3: 0 }
      },
      [KEYS.grantFlow]: {
        entries: [],
      },
      [KEYS.budgetExpense]: [],
      [KEYS.master]: {
        wageDaily: 0,
        wageHourly: 0,
        yousen: 0,
        sharyo: 0,
      },
      [KEYS.areas]: [],
      [KEYS.members]: {},
      [KEYS.activities]: defaultActivities(),
      [KEYS.plan]: [],
      [KEYS.record]: [],
      [KEYS.inventory]: [],
      [KEYS.invLog]: [],
      [KEYS.tideRecord]: [],
      [KEYS.tideData]: {},
      [KEYS.form5]: {},
      [KEYS.form6]: {},
      [KEYS.lastBackup]: null,
    };
  }

  function getDefaultByKey(key) {
    const defaults = getDefaults();
    if (Object.prototype.hasOwnProperty.call(defaults, key)) {
      return clone(defaults[key]);
    }
    return null;
  }

  function save(key, data) {
    try {
      localStorage.setItem(scopedKey(key), JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("Failed to save data:", key, error);
      return false;
    }
  }

  function load(key, fallback) {
    const raw = localStorage.getItem(scopedKey(key));
    if (raw === null) {
      return clone(fallback);
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("Failed to parse data:", key, error);
      return clone(fallback);
    }
  }

  function getByKey(key) {
    return load(key, getDefaultByKey(key));
  }

  function setByKey(key, value) {
    const saved = save(key, value);
    if (saved && key === KEYS.org && value && String(value.orgName || "").trim()) {
      const current = getActiveOrganization();
      if (current) {
        current.name = String(value.orgName).trim();
        saveOrganizationRegistry();
      }
    }
    return saved;
  }

  function getOrg() { return getByKey(KEYS.org); }
  function setOrg(value) {
    return setByKey(KEYS.org, value);
  }

  function getMeta() { return getByKey(KEYS.meta); }
  function setMeta(value) { return setByKey(KEYS.meta, value); }

  function getSettings() { return getByKey(KEYS.settings); }
  function setSettings(value) { return setByKey(KEYS.settings, value); }

  function getBudget() { return getByKey(KEYS.budget); }
  function setBudget(value) { return setByKey(KEYS.budget, value); }

  function getGrantFlow() { return getByKey(KEYS.grantFlow); }
  function setGrantFlow(value) { return setByKey(KEYS.grantFlow, value); }

  function getBudgetExpense() { return getByKey(KEYS.budgetExpense); }
  function setBudgetExpense(value) { return setByKey(KEYS.budgetExpense, value); }

  function getMaster() { return getByKey(KEYS.master); }
  function setMaster(value) { return setByKey(KEYS.master, value); }

  function getAreas() { return getByKey(KEYS.areas); }
  function setAreas(value) { return setByKey(KEYS.areas, value); }

  function getMembers() { return getByKey(KEYS.members); }
  function setMembers(value) { return setByKey(KEYS.members, value); }

  function getActivities() { return getByKey(KEYS.activities); }
  function setActivities(value) { return setByKey(KEYS.activities, value); }

  function getPlan() { return getByKey(KEYS.plan); }
  function setPlan(value) { return setByKey(KEYS.plan, value); }

  function getRecord() { return getByKey(KEYS.record); }
  function setRecord(value) {
    const saved = setByKey(KEYS.record, value);
    if (saved && App.DataStore && App.DataStore.isReady()) {
      App.DataStore.saveRecords(value);
    }
    return saved;
  }

  function getInventory() { return getByKey(KEYS.inventory); }
  function setInventory(value) { return setByKey(KEYS.inventory, value); }

  function getInvLog() { return getByKey(KEYS.invLog); }
  function setInvLog(value) { return setByKey(KEYS.invLog, value); }

  function getTideRecord() { return getByKey(KEYS.tideRecord); }
  function setTideRecord(value) { return setByKey(KEYS.tideRecord, value); }

  function getTideData() { return getByKey(KEYS.tideData); }
  function setTideData(value) { return setByKey(KEYS.tideData, value); }

  function getForm5() {
    const value = getByKey(KEYS.form5);
    return App.DataStore && App.DataStore.isReady()
      ? App.DataStore.hydrateForm5(value)
      : value;
  }
  function setForm5(value) {
    if (App.DataStore && App.DataStore.isReady()) {
      const saved = setByKey(KEYS.form5, App.DataStore.stageForm5(value));
      if (saved) App.DataStore.saveForm5(value);
      return saved;
    }
    const saved = setByKey(KEYS.form5, value);
    return saved;
  }

  function getForm6() {
    const value = getByKey(KEYS.form6);
    return App.DataStore && App.DataStore.isReady()
      ? App.DataStore.hydrateForm6(value)
      : value;
  }
  function setForm6(value) {
    if (App.DataStore && App.DataStore.isReady()) {
      const saved = setByKey(KEYS.form6, App.DataStore.stageForm6(value));
      if (saved) App.DataStore.saveForm6(value);
      return saved;
    }
    const saved = setByKey(KEYS.form6, value);
    return saved;
  }

  function getLastBackup() { return getByKey(KEYS.lastBackup); }
  function setLastBackup(value) { return setByKey(KEYS.lastBackup, value); }

  function hasAnyMobaData() {
    return Object.keys(KEYS).some(function (k) {
      if (k === "lastBackup" || k === "meta") return false;
      return localStorage.getItem(scopedKey(KEYS[k])) !== null;
    });
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function buildDebugSeedData() {
    const now = new Date();
    const today = formatDateISO(now);
    const yesterday = formatDateISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const activityItems = (window.App && App.Const && Array.isArray(App.Const.activityItems)) ? App.Const.activityItems : [];
    const firstActivity = activityItems.find(function (a) { return a.category === "moba"; }) || activityItems[0] || { code: "demo-act", category: "moba", label: "デモ活動" };
    const secondActivity = activityItems.find(function (a) { return a.category === "higata"; }) || activityItems[1] || { code: "demo-act-2", category: "higata", label: "デモ活動2" };

    const areaId = "demo-area-1";
    const planId = "demo-plan-1";
    const recordId = "demo-record-1";
    const itemId = "demo-item-1";

    const data = getDefaults();
    data[KEYS.meta] = {
      seeded: true,
      debugSeed: true,
      seededAt: now.toISOString(),
      clearedAt: null,
    };
    data[KEYS.org] = {
      orgName: "デバッグ用サンプル組織",
      repName: "サンプル代表",
      addr: "大分県サンプル市",
      bank: "サンプル銀行",
      account: "普通 1234567",
      holder: "サンプル組織",
      holderKana: "サンプルソシキ",
      bankAccount: {
        bankName: "サンプル銀行",
        branchName: "本店",
        accountType: "普通",
        accountNo: "1234567",
        accountHolder: "サンプル組織",
        accountHolderKana: "サンプルソシキ"
      }
    };
    data[KEYS.settings] = Object.assign({}, data[KEYS.settings], {
      year: 8,
      defaultHours: 3.5,
      chairman: "サンプル会長",
      councilChairName: "サンプル会長",
      calendarColorBasis: "activity",
      municipality: { code: "44201", name: "大分市", lat: 33.2382, lng: 131.6126 },
      mapTileMode: "online"
    });
    data[KEYS.budget] = { amount: 1000000, approvedAmount: 1000000, planByPeriod: { 1: 300000, 2: 400000, 3: 300000 } };
    data[KEYS.grantFlow] = { entries: [{ id: "demo-grant-1", type: "council_to_org", stage: "council_to_org", date: yesterday, amount: 500000 }] };
    data[KEYS.budgetExpense] = [{ id: "demo-exp-1", date: today, paidDate: today, amount: 12000, payer: "デバッグ支払先", recordIds: [recordId], inventoryLogIds: ["demo-log-2"], slipNo: "領収書-1" }];
    data[KEYS.master] = { wageDaily: 12000, wageHourly: 1500, yousen: 3000, sharyo: 1000 };
    data[KEYS.areas] = [{ id: areaId, name: "デモ地区", standardPeople: 4, color: "#27ae60", pattern: "solid" }];
    data[KEYS.members] = { [areaId]: ["佐藤太郎", "鈴木花子", "田中一郎", "高橋愛"] };
    data[KEYS.activities] = activityItems.length ? activityItems.map(function (a, idx) {
      const base = idx % 2 === 0 ? "#27ae60" : "#e67e22";
      return Object.assign({}, a, { enabled: idx < 2, color: a.color || base, pattern: a.pattern || (idx % 3 === 0 ? "stripe" : "solid") });
    }) : [
      { code: firstActivity.code, category: firstActivity.category, label: firstActivity.label, enabled: true, color: "#27ae60", pattern: "solid" },
      { code: secondActivity.code, category: secondActivity.category, label: secondActivity.label, enabled: true, color: "#e67e22", pattern: "stripe" }
    ];
    data[KEYS.plan] = [{ id: planId, date: today, areaId: areaId, activityCode: firstActivity.code, start: "09:00", end: "12:00", content: "デバッグ計画", people: 3, boat: 1, car: 1 }];
    data[KEYS.record] = [{
      id: recordId,
      planId: planId,
      date: today,
      areaId: areaId,
      activityCode: firstActivity.code,
      content: "デバッグ実績",
      participants: ["佐藤太郎", "鈴木花子"],
      vesselProviders: ["田中一郎"],
      vehicleProviders: ["高橋愛"],
      volunteerCount: 1,
      legacyBoatCount: 1,
      legacyCarCount: 1,
      usedItems: [{ itemId: itemId, name: "デバッグ資材", qty: 2, unit: "袋" }],
      diving: "no",
      weather: "晴れ",
      tideLevel: 120,
      tideNote: "満潮前",
      note: "デバッグ用の作業実績",
      start: "09:00",
      end: "12:00",
      workHours: 3,
      receiptNo: "R-001",
      specialPay: null,
      members: ["佐藤太郎", "鈴木花子"],
      boatOwners: ["田中一郎"],
      carOwners: ["高橋愛"],
      people: 3,
      boat: 1,
      car: 1
    }];
    data[KEYS.inventory] = [{ id: itemId, name: "デバッグ資材", category: "shomohin", qty: 8, unit: "袋", place: "倉庫A", min: 2, memo: "デバッグ用", budgetUnit: 500 }];
    data[KEYS.invLog] = [
      { id: "demo-log-1", itemId: itemId, itemName: "デバッグ資材", type: "in", qty: 10, date: yesterday, memo: "デバッグ購入", source: "manual", unitPrice: 500, extraCost: 0, totalCost: 5000, place: "倉庫A", receiptNo: "R-001", slipNo: "領収書-1" },
      { id: "demo-log-2", itemId: itemId, itemName: "デバッグ資材", type: "out", qty: 2, date: today, memo: "record:" + recordId, source: "record", unitPrice: 0, extraCost: 0, totalCost: 0, place: "", receiptNo: "R-001", slipNo: "領収書-1" }
    ];
    data[KEYS.tideData] = {
      [today]: new Array(24).fill(0).map(function (_, i) { return 100 + (i < 12 ? i * 3 : (23 - i) * 3); }),
      [yesterday]: new Array(24).fill(0).map(function (_, i) { return 95 + (i < 12 ? i * 2 : (23 - i) * 2); })
    };
    data[KEYS.form5] = {};
    data[KEYS.form6] = {};
    data[KEYS.tideRecord] = [];
    return data;
  }

  function bootstrapDemoData(force) {
    const meta = getMeta();
    if (meta && meta.seeded && !force) return false;
    if (force) {
      Object.keys(KEYS).forEach(function (k) {
        if (k === "lastBackup") return;
        localStorage.removeItem(scopedKey(KEYS[k]));
      });
    }
    if (hasAnyMobaData()) {
      if (!force) {
        if (!meta.seeded) setMeta(Object.assign({}, meta, { seeded: true }));
        return false;
      }
    }
    const data = buildDebugSeedData();
    Object.keys(KEYS).forEach(function (k) {
      if (k === "lastBackup") return;
      const storageKey = KEYS[k];
      if (data[storageKey] !== undefined) {
        save(storageKey, data[storageKey]);
      }
    });
    setMeta(data[KEYS.meta]);
    if (App.DataStore && App.DataStore.isReady()) {
      App.DataStore.saveRecords(data[KEYS.record]);
    }
    return true;
  }

  function clearAllMobaData() {
    Object.keys(KEYS).forEach(function (k) {
      localStorage.removeItem(scopedKey(KEYS[k]));
    });
    setMeta({ seeded: true, debugSeed: false, seededAt: null, clearedAt: new Date().toISOString() });
    if (App.DataStore && App.DataStore.isReady()) {
      localStorage.removeItem(scopedKey("moba_indexeddb_migrated_v1"));
      App.DataStore.clearAll().catch(function (error) {
        console.error("IndexedDBデータ削除エラー:", error);
        alert("IndexedDBの作業データ削除に失敗しました。\n" + error.message);
      });
    }
    return true;
  }

  return {
    KEYS: KEYS,
    initOrganizations: initOrganizations,
    getOrganizations: getOrganizations,
    getActiveOrganizationId: getActiveOrganizationId,
    getActiveOrganization: getActiveOrganization,
    switchOrganization: switchOrganization,
    createOrganization: createOrganization,
    getScopedStorageKey: scopedKey,
    getDefaults: getDefaults,
    getDefaultByKey: getDefaultByKey,
    save: save,
    load: load,
    getByKey: getByKey,
    setByKey: setByKey,

    getOrg: getOrg,
    setOrg: setOrg,
    getMeta: getMeta,
    setMeta: setMeta,
    getSettings: getSettings,
    setSettings: setSettings,
    getBudget: getBudget,
    setBudget: setBudget,
    getGrantFlow: getGrantFlow,
    setGrantFlow: setGrantFlow,
    getBudgetExpense: getBudgetExpense,
    setBudgetExpense: setBudgetExpense,
    getMaster: getMaster,
    setMaster: setMaster,
    getAreas: getAreas,
    setAreas: setAreas,
    getMembers: getMembers,
    setMembers: setMembers,
    getActivities: getActivities,
    setActivities: setActivities,
    getPlan: getPlan,
    setPlan: setPlan,
    getRecord: getRecord,
    setRecord: setRecord,
    getInventory: getInventory,
    setInventory: setInventory,
    getInvLog: getInvLog,
    setInvLog: setInvLog,
    getTideRecord: getTideRecord,
    setTideRecord: setTideRecord,
    getTideData: getTideData,
    setTideData: setTideData,
    getForm5: getForm5,
    setForm5: setForm5,
    getForm6: getForm6,
    setForm6: setForm6,
    getLastBackup: getLastBackup,
    setLastBackup: setLastBackup,
    hasAnyMobaData: hasAnyMobaData,
    bootstrapDemoData: bootstrapDemoData,
    clearAllMobaData: clearAllMobaData,
  };
})();
