/* =========================================
   QEDEV CONFIRM ENGINE
   Reusable Dialog & Notification Module
========================================= */

(function (window, document) {
  "use strict";

  // Hindari inisialisasi ganda.
  if (window.ConfirmEngine) return;

  const ConfirmEngine = {};

  let activeModal = null;
  let previousFocus = null;
  let previousOverflow = "";

  const CONFIG = {
    animationDuration: 160,
    defaultTitle: "Informasi",
    defaultConfirmText: "Ya, Lanjutkan",
    defaultCancelText: "Batal",
    defaultOkText: "Mengerti",
  };

  const ICONS = {
    success: "✓",
    error: "✕",
    warning: "!",
    info: "i",
    confirm: "?",
  };

  /* =====================================
     01. INJECT STYLES
  ===================================== */

  function injectStyles() {
    if (document.getElementById("qedev-confirm-styles")) return;

    const style = document.createElement("style");
    style.id = "qedev-confirm-styles";

    style.textContent = `
      .qe-confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgb(15 23 42 / 55%);
        backdrop-filter: blur(3px);
        opacity: 0;
        transition: opacity 160ms ease;
      }

      .qe-confirm-overlay.qe-confirm-visible {
        opacity: 1;
      }

      .qe-confirm-dialog {
        width: 100%;
        max-width: 410px;
        max-height: calc(100dvh - 40px);
        overflow-y: auto;
        padding: 28px 24px 22px;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 20px 60px rgb(15 23 42 / 20%);
        color: #172b4d;
        text-align: center;
        transform: translateY(8px) scale(.98);
        transition: transform 160ms ease;
        font-family: inherit;
      }

      .qe-confirm-visible .qe-confirm-dialog {
        transform: translateY(0) scale(1);
      }

      .qe-confirm-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        margin: 0 auto 16px;
        border-radius: 50%;
        background: #e8eef8;
        color: #17345f;
        font-size: 25px;
        font-weight: 700;
      }

      .qe-confirm-icon.success {
        background: #dcfce7;
        color: #15803d;
      }

      .qe-confirm-icon.error {
        background: #fee2e2;
        color: #b91c1c;
      }

      .qe-confirm-icon.warning {
        background: #fef3c7;
        color: #b45309;
      }

      .qe-confirm-icon.confirm {
        background: #dbeafe;
        color: #1d4ed8;
      }

      .qe-confirm-title {
        margin: 0 0 10px;
        color: #172b4d;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.4;
      }

      .qe-confirm-message {
        margin: 0;
        color: #64748b;
        font-size: 13px;
        line-height: 1.7;
        overflow-wrap: anywhere;
        white-space: pre-line;
      }

      .qe-confirm-actions {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 24px;
      }

      .qe-confirm-button {
        min-height: 42px;
        padding: 10px 18px;
        border: 1px solid transparent;
        border-radius: 9px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 120ms ease,
          transform 120ms ease;
      }

      .qe-confirm-button:focus-visible {
        outline: 3px solid #93c5fd;
        outline-offset: 2px;
      }

      .qe-confirm-button:active {
        transform: scale(.98);
      }

      .qe-confirm-primary {
        background: #142b4d;
        color: #fff;
      }

      .qe-confirm-primary:hover {
        background: #203f6b;
      }

      .qe-confirm-secondary {
        border-color: #e2e8f0;
        background: #f1f5f9;
        color: #334155;
      }

      .qe-confirm-secondary:hover {
        background: #e2e8f0;
      }

      @media (max-width: 480px) {
        .qe-confirm-overlay {
          padding: 16px;
        }

        .qe-confirm-dialog {
          padding: 24px 18px 18px;
          border-radius: 14px;
        }

        .qe-confirm-actions {
          flex-direction: column-reverse;
        }

        .qe-confirm-button {
          width: 100%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .qe-confirm-overlay,
        .qe-confirm-dialog,
        .qe-confirm-button {
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* =====================================
     02. CLOSE ACTIVE DIALOG
  ===================================== */

  function close(result) {
    if (!activeModal) return;

    const modal = activeModal;
    const resolvePromise = modal.resolve;
    const restoreFocus = previousFocus;

    activeModal = null;
    previousFocus = null;

    document.removeEventListener("keydown", handleKeydown, true);

    document.body.style.overflow = previousOverflow;

    modal.overlay.remove();
    previousOverflow = "";

    if (restoreFocus && restoreFocus.isConnected) {
      restoreFocus.focus({ preventScroll: true });
    }

    if (typeof resolvePromise === "function") {
      resolvePromise(result);
    }
  }

  /* =====================================
     03. KEYBOARD HANDLING
  ===================================== */

  function handleKeydown(event) {
    if (!activeModal) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();

      if (activeModal.type === "confirm") {
        close(false);
      } else {
        close(true);
      }

      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      activeModal.overlay.querySelectorAll(
        "button:not(:disabled), [href], input:not(:disabled), " +
          "select:not(:disabled), textarea:not(:disabled), " +
          '[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.getClientRects().length > 0);

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* =====================================
     04. CREATE DIALOG
  ===================================== */

  function open(options) {
    injectStyles();

    const settings = options || {};
    const type = settings.type || "info";
    const isConfirm = settings.mode === "confirm";

    // Tutup dialog sebelumnya agar tidak bertumpuk.
    if (activeModal) {
      close(false);
    }

    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;

    const overlay = document.createElement("div");
    overlay.className = "qe-confirm-overlay";

    const dialog = document.createElement("div");
    dialog.className = "qe-confirm-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "qe-confirm-title");
    dialog.setAttribute("aria-describedby", "qe-confirm-message");
    dialog.setAttribute("tabindex", "-1");

    const icon = document.createElement("div");
    icon.className = "qe-confirm-icon " + type;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ICONS[type] || ICONS.info;

    const title = document.createElement("h3");
    title.className = "qe-confirm-title";
    title.id = "qe-confirm-title";
    title.textContent = settings.title || CONFIG.defaultTitle;

    const message = document.createElement("p");
    message.className = "qe-confirm-message";
    message.id = "qe-confirm-message";
    message.textContent = settings.message || "";

    const actions = document.createElement("div");
    actions.className = "qe-confirm-actions";

    let resolvePromise;

    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    function makeButton(label, className, callback) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "qe-confirm-button " + className;
      button.textContent = label;
      button.addEventListener("click", callback);
      return button;
    }

    if (isConfirm) {
      const cancelButton = makeButton(
        settings.cancelText || CONFIG.defaultCancelText,
        "qe-confirm-secondary",
        () => close(false),
      );

      const confirmButton = makeButton(
        settings.confirmText || CONFIG.defaultConfirmText,
        "qe-confirm-primary",
        () => close(true),
      );

      actions.append(cancelButton, confirmButton);
    } else {
      const okButton = makeButton(
        settings.okText || CONFIG.defaultOkText,
        "qe-confirm-primary",
        () => close(true),
      );

      actions.appendChild(okButton);
    }

    dialog.append(icon, title, message, actions);
    overlay.appendChild(dialog);

    // Klik backdrop menutup dialog.
    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;

      close(isConfirm ? false : true);
    });

    activeModal = {
      overlay,
      type: isConfirm ? "confirm" : type,
      resolve: resolvePromise,
    };

    document.body.style.overflow = "hidden";
    document.body.appendChild(overlay);

    document.addEventListener("keydown", handleKeydown, true);

    requestAnimationFrame(() => {
      if (!activeModal || activeModal.overlay !== overlay) return;

      overlay.classList.add("qe-confirm-visible");

      const buttons = overlay.querySelectorAll("button");
      const target = isConfirm ? buttons[buttons.length - 1] : buttons[0];

      target.focus();
    });

    return promise;
  }

  /* =====================================
     05. PUBLIC API
  ===================================== */

  ConfirmEngine.alert = function (options) {
    return open({
      ...options,
      mode: "alert",
    });
  };

  ConfirmEngine.confirm = function (options) {
    return open({
      ...options,
      mode: "confirm",
      type: options?.type || "confirm",
    });
  };

  ConfirmEngine.success = function (options) {
    return open({
      ...options,
      mode: "alert",
      type: "success",
      title: options?.title || "Berhasil",
    });
  };

  ConfirmEngine.error = function (options) {
    return open({
      ...options,
      mode: "alert",
      type: "error",
      title: options?.title || "Terjadi Kesalahan",
    });
  };

  ConfirmEngine.warning = function (options) {
    return open({
      ...options,
      mode: "alert",
      type: "warning",
      title: options?.title || "Perhatian",
    });
  };

  ConfirmEngine.close = function () {
    close(false);
  };

  ConfirmEngine.version = "1.0.0";

  // Daftarkan engine secara global.
  window.ConfirmEngine = ConfirmEngine;
})(window, document);
