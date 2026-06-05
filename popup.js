const STORAGE_KEYS = {
  lastBackupAt: "lastBackupAt"
};

const FALLBACK_MESSAGES = {
  backupCloseButton: "Backup and close tabs",
  backupCloseHint: "Open a new tab, then close current tabs",
  backupOnlyButton: "Backup only",
  backupOnlyHint: "Save tabs without closing them",
  lastBackupLabel: "Last backup",
  lastBackupNever: "Never",
  popupSubtitle: "Archive the current window",
  popupTitle: "Window Bookmark Archiver",
  statusArchiving: "Archiving...",
  statusFailed: "Backup failed.",
  statusNoWindow: "Could not find the current window.",
  statusNothingToBackup: "There are no pages to back up in this window.",
  statusReady: "Choose an action.",
  statusSaved: "Saved $COUNT$ pages.",
  statusSavedAndClosed: "Saved $COUNT$ pages and closed $CLOSED$ tabs.",
  statusSavedWithSkipped: "Saved $COUNT$ pages and skipped $SKIPPED$ pages.",
  statusSavedWithSkippedAndClosed: "Saved $COUNT$ pages, skipped $SKIPPED$ pages, and closed $CLOSED$ tabs."
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  localizeDocument();
  await renderLastBackup();

  elements.backupOnlyButton.addEventListener("click", () => runBackup(false));
  elements.backupCloseButton.addEventListener("click", () => runBackup(true));
});

function cacheElements() {
  elements.backupOnlyButton = document.getElementById("backupOnlyButton");
  elements.backupCloseButton = document.getElementById("backupCloseButton");
  elements.lastBackupTime = document.getElementById("lastBackupTime");
  elements.status = document.getElementById("status");
}

function localizeDocument() {
  document.documentElement.lang = chrome.i18n?.getUILanguage?.() || "en";

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    node.textContent = t(key);
  });
}

async function renderLastBackup(timestamp) {
  const lastBackupAt = timestamp ?? (await getStorage(STORAGE_KEYS.lastBackupAt))[STORAGE_KEYS.lastBackupAt];

  if (!lastBackupAt) {
    elements.lastBackupTime.textContent = t("lastBackupNever");
    elements.lastBackupTime.removeAttribute("title");
    return;
  }

  const date = new Date(lastBackupAt);
  elements.lastBackupTime.textContent = formatDateTime(date);
  elements.lastBackupTime.title = date.toISOString();
}

async function runBackup(closeOriginalTabs) {
  setBusy(true);
  setStatus(t("statusArchiving"));

  try {
    const windowId = await getCurrentWindowId();
    const response = await sendMessage({
      closeOriginalTabs,
      type: "archive-window",
      windowId
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    const result = response.result;
    await renderLastBackup(result.lastBackupAt);
    setStatus(getSuccessStatus(result), "success");
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  } finally {
    setBusy(false);
  }
}

function getCurrentWindowId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      const windowId = tabs[0]?.windowId;
      if (!Number.isInteger(windowId)) {
        reject(new Error(t("statusNoWindow")));
        return;
      }

      resolve(windowId);
    });
  });
}

function getStorage(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (values) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(values);
    });
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function getSuccessStatus(result) {
  if (result.lastBackupAt === null) {
    return t("statusNothingToBackup");
  }

  const savedCount = String(result.savedCount || 0);
  const skippedCount = String(result.skippedCount || 0);
  const closedCount = String(result.closedCount || 0);

  if (result.closedCount > 0 && result.skippedCount > 0) {
    return t("statusSavedWithSkippedAndClosed", [savedCount, skippedCount, closedCount]);
  }

  if (result.closedCount > 0) {
    return t("statusSavedAndClosed", [savedCount, closedCount]);
  }

  if (result.skippedCount > 0) {
    return t("statusSavedWithSkipped", [savedCount, skippedCount]);
  }

  return t("statusSaved", savedCount);
}

function setBusy(isBusy) {
  elements.backupOnlyButton.disabled = isBusy;
  elements.backupCloseButton.disabled = isBusy;
}

function setStatus(message, type = "") {
  elements.status.textContent = message;
  elements.status.className = type ? `status ${type}` : "status";
}

function formatDateTime(date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function t(messageName, substitutions) {
  const localized = chrome.i18n?.getMessage(messageName, substitutions);
  let fallback = FALLBACK_MESSAGES[messageName] || messageName;

  if (substitutions !== undefined) {
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    const closedValue = values.length > 2 ? values[2] : values[1];
    fallback = fallback
      .replaceAll("$COUNT$", values[0] || "")
      .replaceAll("$SKIPPED$", values[1] || "")
      .replaceAll("$CLOSED$", closedValue || "");
  }

  return localized || fallback;
}
