const STORAGE_KEYS = {
  lastBackupAt: "lastBackupAt"
};

const DEFAULT_AUTO_CLEANUP_SETTINGS = {
  enabled: false,
  intervalMinutes: 60,
  thresholdMinutes: 1440
};

const FALLBACK_MESSAGES = {
  autoCleanupDisabledStatus: "Automatic cleanup is off.",
  autoCleanupEnabledStatus: "Automatic cleanup is on.",
  autoCleanupIntervalLabel: "Check every",
  autoCleanupNoBookmarkableStatus: "Found $1 stale tabs, but none could be archived.",
  autoCleanupNothingStatus: "No stale tabs matched the current rule.",
  autoCleanupProtectionNote: "Pinned, active, audible, incognito, and internal Chrome tabs are protected.",
  autoCleanupRunningStatus: "Running automatic cleanup...",
  autoCleanupSavedAndClosedStatus: "Automatic cleanup saved $1 pages and closed $2 tabs.",
  autoCleanupSavedStatus: "Automatic cleanup saved $1 pages.",
  autoCleanupSavingStatus: "Saving automatic cleanup settings...",
  autoCleanupSettingsSavedStatus: "Automatic cleanup settings saved.",
  autoCleanupSubtitle: "Archive and close stale tabs on a schedule",
  autoCleanupThresholdLabel: "Close tabs inactive for",
  autoCleanupTitle: "Automatic cleanup",
  autoCleanupToggleLabel: "Enable automatic cleanup",
  backupCloseButton: "Backup and close tabs",
  backupCloseHint: "Open a new tab, then close current tabs",
  backupOnlyButton: "Backup only",
  backupOnlyHint: "Save tabs without closing them",
  durationOneDay: "1 day",
  durationOneHour: "1 hour",
  durationSixHours: "6 hours",
  durationSevenDays: "7 days",
  durationThirtyDays: "30 days",
  durationThreeDays: "3 days",
  durationTwelveHours: "12 hours",
  intervalOneHour: "1 hour",
  intervalThirtyMinutes: "30 minutes",
  intervalSixHours: "6 hours",
  intervalTwelveHours: "12 hours",
  lastAutoCleanupLabel: "Last automatic cleanup",
  lastAutoCleanupSummary: "Matched $4 stale tabs. Saved $1, closed $2, skipped $3.",
  lastBackupLabel: "Last backup",
  lastBackupNever: "Never",
  popupSubtitle: "Archive the current window",
  popupTitle: "Window Bookmark Archiver",
  runAutoCleanupButton: "Run cleanup now",
  statusArchiving: "Archiving...",
  statusFailed: "Backup failed.",
  statusNoWindow: "Could not find the current window.",
  statusNothingToBackup: "There are no pages to back up in this window.",
  statusReady: "Choose an action.",
  statusSaved: "Saved $1 pages.",
  statusSavedAndClosed: "Saved $1 pages and closed $2 tabs.",
  statusSavedWithSkipped: "Saved $1 pages and skipped $2 pages.",
  statusSavedWithSkippedAndClosed: "Saved $1 pages, skipped $2 pages, and closed $3 tabs."
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  localizeDocument();
  bindEvents();

  await renderLastBackup();
  await loadAutoCleanupState();
});

function cacheElements() {
  elements.autoCleanupEnabled = document.getElementById("autoCleanupEnabled");
  elements.autoCleanupInterval = document.getElementById("autoCleanupInterval");
  elements.autoCleanupThreshold = document.getElementById("autoCleanupThreshold");
  elements.backupOnlyButton = document.getElementById("backupOnlyButton");
  elements.backupCloseButton = document.getElementById("backupCloseButton");
  elements.lastAutoCleanupSummary = document.getElementById("lastAutoCleanupSummary");
  elements.lastAutoCleanupTime = document.getElementById("lastAutoCleanupTime");
  elements.lastBackupTime = document.getElementById("lastBackupTime");
  elements.runAutoCleanupButton = document.getElementById("runAutoCleanupButton");
  elements.status = document.getElementById("status");
}

function bindEvents() {
  elements.backupOnlyButton.addEventListener("click", () => runBackup(false));
  elements.backupCloseButton.addEventListener("click", () => runBackup(true));
  elements.autoCleanupEnabled.addEventListener("change", saveAutoCleanupSettings);
  elements.autoCleanupThreshold.addEventListener("change", saveAutoCleanupSettings);
  elements.autoCleanupInterval.addEventListener("change", saveAutoCleanupSettings);
  elements.runAutoCleanupButton.addEventListener("click", runAutoCleanupNow);
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

  renderTimestamp(elements.lastBackupTime, lastBackupAt);
}

async function loadAutoCleanupState() {
  try {
    const response = await sendMessage({ type: "get-auto-cleanup-state" });
    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    renderAutoCleanupState(response.state);
  } catch (error) {
    renderAutoCleanupState({
      lastAutoCleanupAt: null,
      lastAutoCleanupResult: null,
      settings: DEFAULT_AUTO_CLEANUP_SETTINGS
    });
    setStatus(error?.message || t("statusFailed"), "error");
  }
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

async function saveAutoCleanupSettings() {
  const settings = readAutoCleanupSettings();
  renderAutoCleanupControls(settings);
  setStatus(t("autoCleanupSavingStatus"));

  try {
    const response = await sendMessage({
      settings,
      type: "update-auto-cleanup-settings"
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    renderAutoCleanupState(response.state);
    setStatus(
      settings.enabled ? t("autoCleanupEnabledStatus") : t("autoCleanupDisabledStatus"),
      "success"
    );
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  }
}

async function runAutoCleanupNow() {
  setBusy(true);
  setStatus(t("autoCleanupRunningStatus"));

  try {
    const response = await sendMessage({ type: "run-auto-cleanup-now" });
    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    const result = response.result;
    renderAutoCleanupState({
      lastAutoCleanupAt: result.lastAutoCleanupAt,
      lastAutoCleanupResult: result,
      settings: readAutoCleanupSettings()
    });
    setStatus(getAutoCleanupStatus(result), result.savedCount > 0 ? "success" : "");
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  } finally {
    setBusy(false);
    renderAutoCleanupControls(readAutoCleanupSettings());
  }
}

function renderAutoCleanupState(state) {
  const settings = normalizeAutoCleanupSettings(state?.settings);

  elements.autoCleanupEnabled.checked = settings.enabled;
  elements.autoCleanupThreshold.value = String(settings.thresholdMinutes);
  elements.autoCleanupInterval.value = String(settings.intervalMinutes);
  renderAutoCleanupControls(settings);
  renderTimestamp(elements.lastAutoCleanupTime, state?.lastAutoCleanupAt);
  renderAutoCleanupSummary(state?.lastAutoCleanupResult);
}

function renderAutoCleanupControls(settings) {
  const enabled = Boolean(settings?.enabled);
  elements.autoCleanupThreshold.disabled = !enabled;
  elements.autoCleanupInterval.disabled = !enabled;
}

function renderTimestamp(element, timestamp) {
  if (!timestamp) {
    element.textContent = t("lastBackupNever");
    element.removeAttribute("title");
    return;
  }

  const date = new Date(timestamp);
  element.textContent = formatDateTime(date);
  element.title = date.toISOString();
}

function renderAutoCleanupSummary(result) {
  if (!result) {
    elements.lastAutoCleanupSummary.textContent = "";
    return;
  }

  elements.lastAutoCleanupSummary.textContent = t("lastAutoCleanupSummary", [
    String(result.savedCount || 0),
    String(result.closedCount || 0),
    String(result.skippedCount || 0),
    String(result.staleCount || 0)
  ]);
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

function readAutoCleanupSettings() {
  return normalizeAutoCleanupSettings({
    enabled: elements.autoCleanupEnabled.checked,
    intervalMinutes: elements.autoCleanupInterval.value,
    thresholdMinutes: elements.autoCleanupThreshold.value
  });
}

function normalizeAutoCleanupSettings(settings) {
  const allowedIntervals = new Set([30, 60, 360, 720]);
  const allowedThresholds = new Set([60, 360, 720, 1440, 4320, 10080, 43200]);
  const intervalMinutes = Number(settings?.intervalMinutes);
  const thresholdMinutes = Number(settings?.thresholdMinutes);

  return {
    enabled: Boolean(settings?.enabled),
    intervalMinutes: allowedIntervals.has(intervalMinutes)
      ? intervalMinutes
      : DEFAULT_AUTO_CLEANUP_SETTINGS.intervalMinutes,
    thresholdMinutes: allowedThresholds.has(thresholdMinutes)
      ? thresholdMinutes
      : DEFAULT_AUTO_CLEANUP_SETTINGS.thresholdMinutes
  };
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

function getAutoCleanupStatus(result) {
  if (result.staleCount === 0) {
    return t("autoCleanupNothingStatus");
  }

  if (result.savedCount > 0 && result.closedCount > 0) {
    return t("autoCleanupSavedAndClosedStatus", [
      String(result.savedCount),
      String(result.closedCount)
    ]);
  }

  if (result.savedCount > 0) {
    return t("autoCleanupSavedStatus", String(result.savedCount));
  }

  return t("autoCleanupNoBookmarkableStatus", String(result.staleCount || 0));
}

function setBusy(isBusy) {
  elements.backupOnlyButton.disabled = isBusy;
  elements.backupCloseButton.disabled = isBusy;
  elements.runAutoCleanupButton.disabled = isBusy;
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
    values.forEach((value, index) => {
      fallback = fallback.replaceAll(`$${index + 1}`, value || "");
    });
  }

  return localized || fallback;
}
