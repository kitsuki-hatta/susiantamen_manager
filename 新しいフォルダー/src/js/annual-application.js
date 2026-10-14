/* =====================================================================
   annual-application.js ― 年度当初の採択申請情報
   ===================================================================== */

window.App = window.App || {};

App.AnnualApplication = (function () {
  "use strict";

  const Storage = App.Storage;
  const FIELD_NAMES = [
    "applicationDate",
    "contactName",
    "contactPhone",
    "contactEmail",
    "resourceArea",
    "currentIssues",
    "annualGoal",
    "activityPlan",
    "implementationSchedule",
    "expectedOutcomes",
    "implementationStructure",
    "safetyPlan",
    "notes",
  ];
  let loadedYear = "";
  let dirty = false;

  function getInput(id) {
    return document.getElementById("application-" + id);
  }

  function normalizeYear(value) {
    const year = Number(value);
    return Number.isInteger(year) && year > 0 ? String(year) : "";
  }

  function getStoredApplications() {
    const applications = Storage.getAnnualApplication();
    return applications && typeof applications === "object" && !Array.isArray(applications)
      ? applications
      : {};
  }

  function loadYear(year) {
    const record = getStoredApplications()[year] || {};
    FIELD_NAMES.forEach(function (name) {
      const input = getInput(name);
      if (input) input.value = record[name] || "";
    });
    loadedYear = year;
    dirty = false;
    const status = document.getElementById("application-save-status");
    if (status) {
      status.textContent = record.updatedAt
        ? "令和" + year + "年度の保存済み情報を読み込みました。"
        : "令和" + year + "年度の情報はまだ登録されていません。";
      status.className = "hint";
    }
  }

  function saveYear(yearOverride) {
    const year = yearOverride || normalizeYear(getInput("year").value);
    if (!year) {
      const status = document.getElementById("application-save-status");
      if (status) {
        status.textContent = "申請年度（令和）を正しく入力してください。";
        status.className = "msg error";
      }
      return false;
    }

    const applications = getStoredApplications();
    const record = {};
    FIELD_NAMES.forEach(function (name) {
      const input = getInput(name);
      record[name] = input ? input.value.trim() : "";
    });
    record.updatedAt = new Date().toISOString();
    applications[year] = record;
    if (!Storage.setAnnualApplication(applications)) {
      const status = document.getElementById("application-save-status");
      if (status) {
        status.textContent = "保存できませんでした。ブラウザーの保存容量を確認してください。";
        status.className = "msg error";
      }
      return false;
    }

    loadedYear = year;
    dirty = false;
    const status = document.getElementById("application-save-status");
    if (status) {
      status.textContent = "令和" + year + "年度の採択申請情報を保存しました。";
      status.className = "msg ok";
    }
    return true;
  }

  function bindEvents() {
    const yearInput = getInput("year");
    if (yearInput && !yearInput.dataset.bound) {
      yearInput.dataset.bound = "1";
      yearInput.addEventListener("change", function () {
        const nextYear = normalizeYear(yearInput.value);
        if (!nextYear) {
          yearInput.value = loadedYear;
          const status = document.getElementById("application-save-status");
          if (status) {
            status.textContent = "申請年度（令和）を正しく入力してください。";
            status.className = "msg error";
          }
          return;
        }
        if (dirty && !saveYear(loadedYear)) {
          yearInput.value = loadedYear;
          return;
        }
        loadYear(nextYear);
      });
    }

    FIELD_NAMES.forEach(function (name) {
      const input = getInput(name);
      if (!input || input.dataset.bound) return;
      input.dataset.bound = "1";
      input.addEventListener("input", function () {
        dirty = true;
      });
    });

    const saveButton = document.getElementById("btn-save-annual-application");
    if (saveButton && !saveButton.dataset.bound) {
      saveButton.dataset.bound = "1";
      saveButton.addEventListener("click", function () {
        saveYear();
      });
    }
  }

  function init() {
    bindEvents();
    const settings = Storage.getSettings() || {};
    const yearInput = getInput("year");
    const initialYear = normalizeYear(yearInput.value) || normalizeYear(settings.year) || "1";
    yearInput.value = initialYear;
    loadYear(initialYear);
  }

  return {
    init: init,
    loadYear: loadYear,
    save: saveYear,
  };
})();
