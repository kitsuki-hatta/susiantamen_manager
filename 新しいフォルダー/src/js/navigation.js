/* =====================================================================
   navigation.js ― タブナビゲーション・サブタブ・ビュー切替制御
   ===================================================================== */

window.App = window.App || {};

App.Navigation = (function () {
  "use strict";

  /** メインビューを切り替え */
  function switchView(viewId) {
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === viewId);
    });
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === "view-" + viewId);
    });
    try {
      onViewActivated(viewId);
    } catch (e) {
      console.error("[Nav] " + viewId + ":", e);
    }
  }

  /** サブタブを切り替え */
  function switchSubtab(group, panelId) {
    document
      .querySelectorAll(".subtab-btn[data-subtab='" + group + "']")
      .forEach(function (b) {
        b.classList.toggle("active", b.dataset.panel === panelId);
      });
    document
      .querySelectorAll("[id^='" + group + "-panel-']")
      .forEach(function (p) {
        p.classList.toggle("active", p.id === panelId);
      });
  }

  /** モーダルを開く */
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "flex";
    // モーダル本文を一番上にリセット
    const body = el.querySelector(".modal-body");
    if (body) body.scrollTop = 0;
  }

  /** モーダルを閉じる */
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  /** サブタブのクリックイベントを全設定 */
  function initSubtabs() {
    document.querySelectorAll(".subtab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchSubtab(btn.dataset.subtab, btn.dataset.panel);
      });
    });
  }

  /** モーダル閉じるボタンの全設定 */
  function initModalClose() {
    // data-close 属性を持つボタン
    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeModal(btn.dataset.close);
      });
    });
    // Escキー押下で一番前面のモーダルを閉じる
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        const modals = Array.from(document.querySelectorAll(".modal-backdrop"));
        const visibleModal = modals.reverse().find(function (m) {
          return (
            m.style.display === "flex" || getComputedStyle(m).display === "flex"
          );
        });
        if (visibleModal && visibleModal.id !== "modal-first-setup") {
          closeModal(visibleModal.id);
        }
      }
    });
  }

  /** メインナビゲーションのクリックイベントを全設定 */
  function init() {
    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.view) switchView(btn.dataset.view);
      });
    });
    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const guideButton = target.closest("[data-guide-view]");
      if (guideButton && guideButton.dataset.guideView) {
        switchView(guideButton.dataset.guideView);
        return;
      }
      const triggerButton = target.closest("[data-guide-trigger]");
      if (triggerButton && triggerButton.dataset.guideTrigger) {
        const action = document.getElementById(triggerButton.dataset.guideTrigger);
        if (action) action.click();
      }
    });
    initSubtabs();
    initModalClose();
  }

  function onViewActivated(viewId) {
    if (viewId === "dashboard") {
      if (App.Dashboard && App.Dashboard.render) App.Dashboard.render();
    } else if (viewId === "budget") {
      if (App.Budget && App.Budget.render) App.Budget.render();
    } else if (viewId === "settings") {
      if (App.Master && App.Master.render) App.Master.render();
    } else if (viewId === "inventory") {
      if (App.Inventory && App.Inventory.render) App.Inventory.render();
    } else if (viewId === "plan") {
      if (App.Plan && App.Plan.render) App.Plan.render();
    } else if (viewId === "record") {
      if (App.Record && App.Record.render) App.Record.render();
    } else if (viewId === "payment") {
      if (App.Payment && App.Payment.render) App.Payment.render();
    } else if (viewId === "report") {
      if (App.FormLedger && App.FormLedger.render) App.FormLedger.render();
      if (App.Form2 && App.Form2.render) App.Form2.render();
      if (App.Form4 && App.Form4.render) App.Form4.render();
      if (App.Form1 && App.Form1.calc) App.Form1.calc();
      if (App.Form5 && App.Form5.initSelect) App.Form5.initSelect();
    }
  }

  return {
    init: init,
    switchView: switchView,
    switchSubtab: switchSubtab,
    openModal: openModal,
    closeModal: closeModal,
  };
})();
