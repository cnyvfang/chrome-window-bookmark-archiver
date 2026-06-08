const STORAGE_KEYS = {
  lastBackupAt: "lastBackupAt",
  manualCleanupScope: "manualCleanupScope"
};

const ALLOWED_MANUAL_CLEANUP_SCOPES = new Set(["all", "60", "360", "720", "1440", "4320", "10080", "43200"]);
const ARCHIVE_FOLDER_MODES = new Set(["dated", "single"]);

const DEFAULT_AUTO_CLEANUP_SETTINGS = {
  enabled: false,
  intervalMinutes: 60,
  thresholdMinutes: 1440
};

const FALLBACK_MESSAGES = {
  archiveFolderModeDated: "New dated folder",
  archiveFolderModeLabel: "Folder mode",
  archiveFolderModeSingle: "Single folder",
  archiveFolderSummary: "$1 folders, $2 saved pages.",
  archiveFolderSummaryFoldersOnly: "$1 folders.",
  archiveOptionsSubtitle: "Choose how bookmark folders are stored",
  archiveOptionsTitle: "Archive folders",
  autoCleanupDisabledStatus: "Automatic cleanup is off.",
  autoCleanupEnabledStatus: "Automatic cleanup is on.",
  autoCleanupIntervalLabel: "Check every",
  autoCleanupDuplicatesClosedStatus: "Automatic cleanup closed $1 tabs that were already saved.",
  autoCleanupNoBookmarkableStatus: "Found $1 stale tabs, but none could be archived.",
  autoCleanupNothingStatus: "No stale tabs matched the current rule.",
  autoCleanupProtectionNote: "Pinned, active, audible, incognito, and internal Chrome tabs are protected. Discarded or unloaded tabs are eligible for cleanup.",
  autoCleanupRunningStatus: "Running automatic cleanup...",
  autoCleanupSavedAndClosedStatus: "Automatic cleanup saved $1 pages and closed $2 tabs.",
  autoCleanupSavedDuplicatesAndClosedStatus: "Automatic cleanup saved $1 pages, skipped $2 duplicates, and closed $3 tabs.",
  autoCleanupSavedDuplicatesStatus: "Automatic cleanup saved $1 pages and skipped $2 duplicates.",
  autoCleanupSavedStatus: "Automatic cleanup saved $1 pages.",
  autoCleanupSavingStatus: "Saving automatic cleanup settings...",
  autoCleanupSettingsSavedStatus: "Automatic cleanup settings saved.",
  autoCleanupSubtitle: "Archive and close stale tabs on a schedule",
  autoCleanupThresholdLabel: "Close tabs inactive for",
  autoCleanupTitle: "Automatic cleanup",
  autoCleanupToggleLabel: "Enable automatic cleanup",
  backupCloseButton: "Backup and close tabs",
  backupCloseHint: "Save tabs in the selected close range, then close them",
  backupOnlyButton: "Backup only",
  backupOnlyHint: "Save tabs without closing them",
  dedupeArchiveFoldersButton: "Deduplicate",
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
  lastAutoCleanupSummary: "Matched $4 stale tabs. Saved $1, duplicates $5, closed $2, skipped $3.",
  lastBackupLabel: "Last backup",
  lastBackupNever: "Never",
  manualCleanupScopeAll: "All tabs",
  manualCleanupScopeLabel: "Backup and close range",
  manualCleanupScopeOneDay: "Tabs inactive for 1 day",
  manualCleanupScopeOneHour: "Tabs inactive for 1 hour",
  manualCleanupScopeSevenDays: "Tabs inactive for 7 days",
  manualCleanupScopeSixHours: "Tabs inactive for 6 hours",
  manualCleanupScopeThirtyDays: "Tabs inactive for 30 days",
  manualCleanupScopeThreeDays: "Tabs inactive for 3 days",
  manualCleanupScopeTwelveHours: "Tabs inactive for 12 hours",
  popupSubtitle: "Archive the current window",
  popupTitle: "Window Bookmark Archiver",
  mergeArchiveFoldersButton: "Merge dated folders",
  noSavedFoldersOption: "No saved folders",
  openArchiveFolderButton: "Open folder",
  runAutoCleanupButton: "Run cleanup now",
  savedArchiveFolderLabel: "Saved folder",
  statusArchiving: "Archiving...",
  statusArchiveSettingsSaved: "Archive folder mode saved.",
  statusDedupingArchiveFolders: "Removing duplicate saved pages...",
  statusDedupeComplete: "Removed $1 duplicate pages.",
  statusDedupeNothing: "No duplicate saved pages found.",
  statusDuplicatesOnly: "$1 pages were already saved.",
  statusDuplicatesOnlyAndClosed: "$1 pages were already saved; closed $2 tabs.",
  statusFailed: "Backup failed.",
  statusMergeComplete: "Merged $1 folders and moved $2 pages.",
  statusMergeNothing: "No dated archive folders to merge.",
  statusMergingArchiveFolders: "Merging archive folders...",
  statusManualCleanupNoMatch: "No tabs matched the selected cleanup range.",
  statusNoSavedFolder: "No saved archive folder selected.",
  statusNoWindow: "Could not find the current window.",
  statusNothingToBackup: "There are no pages to back up in this window.",
  statusOpenFolderComplete: "Opened $1 pages from the saved folder.",
  statusOpeningArchiveFolder: "Opening saved folder...",
  statusReady: "Choose an action.",
  statusSaved: "Saved $1 pages.",
  statusSavedAndClosed: "Saved $1 pages and closed $2 tabs.",
  statusSavedWithDuplicates: "Saved $1 pages and skipped $2 duplicates.",
  statusSavedWithDuplicatesAndClosed: "Saved $1 pages, skipped $2 duplicates, and closed $3 tabs.",
  statusSavedWithSkipped: "Saved $1 pages and skipped $2 pages.",
  statusSavedWithSkippedAndClosed: "Saved $1 pages, skipped $2 pages, and closed $3 tabs."
};

const elements = {};
let archiveFolders = [];
let isBusy = false;

document.addEventListener("DOMContentLoaded", () => {
  initializePopup().catch((error) => {
    console.error(error);
    if (elements.status) {
      setStatus(error?.message || t("statusFailed"), "error");
    }
  });
});

async function initializePopup() {
  cacheElements();
  localizeDocument();
  bindEvents();

  await renderLastBackup().catch((error) => {
    setStatus(error?.message || t("statusFailed"), "error");
  });
  await loadArchiveState();
  await loadManualCleanupScope();
  await loadAutoCleanupState();
}

function cacheElements() {
  elements.archiveFolderMode = document.getElementById("archiveFolderMode");
  elements.archiveFolderSummary = document.getElementById("archiveFolderSummary");
  elements.autoCleanupEnabled = document.getElementById("autoCleanupEnabled");
  elements.autoCleanupInterval = document.getElementById("autoCleanupInterval");
  elements.autoCleanupThreshold = document.getElementById("autoCleanupThreshold");
  elements.backupOnlyButton = document.getElementById("backupOnlyButton");
  elements.backupCloseButton = document.getElementById("backupCloseButton");
  elements.dedupeArchiveFoldersButton = document.getElementById("dedupeArchiveFoldersButton");
  elements.lastAutoCleanupSummary = document.getElementById("lastAutoCleanupSummary");
  elements.lastAutoCleanupTime = document.getElementById("lastAutoCleanupTime");
  elements.lastBackupTime = document.getElementById("lastBackupTime");
  elements.manualCleanupScope = document.getElementById("manualCleanupScope");
  elements.mergeArchiveFoldersButton = document.getElementById("mergeArchiveFoldersButton");
  elements.openArchiveFolderButton = document.getElementById("openArchiveFolderButton");
  elements.runAutoCleanupButton = document.getElementById("runAutoCleanupButton");
  elements.savedArchiveFolder = document.getElementById("savedArchiveFolder");
  elements.status = document.getElementById("status");
}

function bindEvents() {
  elements.archiveFolderMode.addEventListener("change", saveArchiveSettings);
  elements.backupOnlyButton.addEventListener("click", () => runBackup(false));
  elements.backupCloseButton.addEventListener("click", () => runBackup(true));
  elements.dedupeArchiveFoldersButton.addEventListener("click", dedupeArchiveFolders);
  elements.manualCleanupScope.addEventListener("change", saveManualCleanupScope);
  elements.mergeArchiveFoldersButton.addEventListener("click", mergeArchiveFolders);
  elements.openArchiveFolderButton.addEventListener("click", openSavedArchiveFolder);
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

async function loadArchiveState() {
  try {
    const response = await sendMessage({ type: "get-archive-state" });
    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    renderArchiveState(response.state);
  } catch (error) {
    archiveFolders = [];
    renderArchiveFolderOptions();
    setStatus(error?.message || t("statusFailed"), "error");
  }
}

function renderArchiveState(state) {
  const settings = normalizeArchiveSettings(state?.settings);
  archiveFolders = Array.isArray(state?.folders) ? state.folders : [];

  elements.archiveFolderMode.value = settings.folderMode;
  renderArchiveFolderOptions();
}

function renderArchiveFolderOptions() {
  const selectedFolderId = elements.savedArchiveFolder.value;
  elements.savedArchiveFolder.textContent = "";

  if (archiveFolders.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("noSavedFoldersOption");
    elements.savedArchiveFolder.append(option);
  } else {
    archiveFolders.forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = formatArchiveFolderOption(folder);
      elements.savedArchiveFolder.append(option);
    });

    if (archiveFolders.some((folder) => folder.id === selectedFolderId)) {
      elements.savedArchiveFolder.value = selectedFolderId;
    }
  }

  const countedFolders = archiveFolders.filter((folder) => Number.isFinite(folder.urlCount));
  if (countedFolders.length === archiveFolders.length) {
    const urlCount = archiveFolders.reduce((count, folder) => count + folder.urlCount, 0);
    elements.archiveFolderSummary.textContent = t("archiveFolderSummary", [
      String(archiveFolders.length),
      String(urlCount)
    ]);
  } else {
    elements.archiveFolderSummary.textContent = t("archiveFolderSummaryFoldersOnly", String(archiveFolders.length));
  }

  renderArchiveFolderControls();
}

function renderArchiveFolderControls() {
  const hasFolders = archiveFolders.length > 0;
  const hasDatedFolders = archiveFolders.some((folder) => folder.isDated);

  elements.archiveFolderMode.disabled = isBusy;
  elements.savedArchiveFolder.disabled = isBusy || !hasFolders;
  elements.openArchiveFolderButton.disabled = isBusy || !hasFolders;
  elements.mergeArchiveFoldersButton.disabled = isBusy || !hasDatedFolders;
  elements.dedupeArchiveFoldersButton.disabled = isBusy || !hasFolders;
}

function formatArchiveFolderOption(folder) {
  const datedPrefix = folder.isDated ? "* " : "";
  const countSuffix = Number.isFinite(folder.urlCount) ? ` (${folder.urlCount})` : "";
  return `${datedPrefix}${folder.title}${countSuffix}`;
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
      closeThresholdMinutes: closeOriginalTabs ? readManualCleanupThreshold() : null,
      type: "archive-window",
      windowId
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    const result = response.result;
    await renderLastBackup(result.lastBackupAt);
    await loadArchiveState();
    setStatus(getSuccessStatus(result), "success");
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  } finally {
    setBusy(false);
  }
}

async function saveArchiveSettings() {
  const settings = readArchiveSettings();
  setStatus(t("statusArchiveSettingsSaved"));

  try {
    const response = await sendMessage({
      settings,
      type: "update-archive-settings"
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    renderArchiveState(response.state);
    setStatus(t("statusArchiveSettingsSaved"), "success");
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  }
}

async function mergeArchiveFolders() {
  setBusy(true);
  setStatus(t("statusMergingArchiveFolders"));

  try {
    const response = await sendMessage({ type: "merge-archive-folders" });
    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    await loadArchiveState();
    setStatus(getMergeStatus(response.result), "success");
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  } finally {
    setBusy(false);
  }
}

async function dedupeArchiveFolders() {
  setBusy(true);
  setStatus(t("statusDedupingArchiveFolders"));

  try {
    const response = await sendMessage({ type: "dedupe-archive-folders" });
    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    await loadArchiveState();
    setStatus(getDedupeStatus(response.result), "success");
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  } finally {
    setBusy(false);
  }
}

async function openSavedArchiveFolder() {
  const folderId = elements.savedArchiveFolder.value;
  if (!folderId) {
    setStatus(t("statusNoSavedFolder"), "error");
    return;
  }

  setBusy(true);
  setStatus(t("statusOpeningArchiveFolder"));

  try {
    const windowId = await getCurrentWindowId();
    const response = await sendMessage({
      folderId,
      type: "open-archive-folder",
      windowId
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("statusFailed"));
    }

    setStatus(getOpenFolderStatus(response.result), "success");
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
  } finally {
    setBusy(false);
  }
}

async function loadManualCleanupScope() {
  try {
    const values = await getStorage(STORAGE_KEYS.manualCleanupScope);
    elements.manualCleanupScope.value = normalizeManualCleanupScope(values[STORAGE_KEYS.manualCleanupScope]);
  } catch {
    elements.manualCleanupScope.value = "all";
  }
}

async function saveManualCleanupScope() {
  const scope = normalizeManualCleanupScope(elements.manualCleanupScope.value);
  elements.manualCleanupScope.value = scope;

  try {
    await setStorage({ [STORAGE_KEYS.manualCleanupScope]: scope });
  } catch (error) {
    setStatus(error?.message || t("statusFailed"), "error");
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
    await loadArchiveState();
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
    String(result.staleCount || 0),
    String(result.duplicateCount || 0)
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

function setStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
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

function readManualCleanupThreshold() {
  const scope = normalizeManualCleanupScope(elements.manualCleanupScope.value);
  return scope === "all" ? null : Number(scope);
}

function normalizeManualCleanupScope(scope) {
  const normalized = String(scope || "all");
  return ALLOWED_MANUAL_CLEANUP_SCOPES.has(normalized) ? normalized : "all";
}

function readArchiveSettings() {
  return normalizeArchiveSettings({
    folderMode: elements.archiveFolderMode.value
  });
}

function normalizeArchiveSettings(settings) {
  const folderMode = String(settings?.folderMode || "dated");
  return {
    folderMode: ARCHIVE_FOLDER_MODES.has(folderMode) ? folderMode : "dated"
  };
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
  if (
    result.closeOriginalTabs &&
    result.closeThresholdMinutes !== null &&
    result.matchedCount === 0
  ) {
    return t("statusManualCleanupNoMatch");
  }

  if (result.lastBackupAt === null) {
    return t("statusNothingToBackup");
  }

  const savedCount = String(result.savedCount || 0);
  const skippedCount = String(result.skippedCount || 0);
  const closedCount = String(result.closedCount || 0);
  const duplicateCount = String(result.duplicateCount || 0);

  if (result.closedCount > 0 && result.savedCount === 0 && result.duplicateCount > 0) {
    return t("statusDuplicatesOnlyAndClosed", [duplicateCount, closedCount]);
  }

  if (result.savedCount === 0 && result.duplicateCount > 0) {
    return t("statusDuplicatesOnly", duplicateCount);
  }

  if (result.closedCount > 0 && result.duplicateCount > 0) {
    return t("statusSavedWithDuplicatesAndClosed", [savedCount, duplicateCount, closedCount]);
  }

  if (result.closedCount > 0 && result.skippedCount > 0) {
    return t("statusSavedWithSkippedAndClosed", [savedCount, skippedCount, closedCount]);
  }

  if (result.closedCount > 0) {
    return t("statusSavedAndClosed", [savedCount, closedCount]);
  }

  if (result.skippedCount > 0) {
    return t("statusSavedWithSkipped", [savedCount, skippedCount]);
  }

  if (result.duplicateCount > 0) {
    return t("statusSavedWithDuplicates", [savedCount, duplicateCount]);
  }

  return t("statusSaved", savedCount);
}

function getAutoCleanupStatus(result) {
  if (result.staleCount === 0) {
    return t("autoCleanupNothingStatus");
  }

  if (result.savedCount > 0 && result.duplicateCount > 0 && result.closedCount > 0) {
    return t("autoCleanupSavedDuplicatesAndClosedStatus", [
      String(result.savedCount),
      String(result.duplicateCount),
      String(result.closedCount)
    ]);
  }

  if (result.savedCount === 0 && result.duplicateCount > 0 && result.closedCount > 0) {
    return t("autoCleanupDuplicatesClosedStatus", String(result.closedCount));
  }

  if (result.savedCount > 0 && result.closedCount > 0) {
    return t("autoCleanupSavedAndClosedStatus", [
      String(result.savedCount),
      String(result.closedCount)
    ]);
  }

  if (result.savedCount > 0 && result.duplicateCount > 0) {
    return t("autoCleanupSavedDuplicatesStatus", [
      String(result.savedCount),
      String(result.duplicateCount)
    ]);
  }

  if (result.savedCount > 0) {
    return t("autoCleanupSavedStatus", String(result.savedCount));
  }

  return t("autoCleanupNoBookmarkableStatus", String(result.staleCount || 0));
}

function getMergeStatus(result) {
  if (!result?.mergedFolderCount) {
    return t("statusMergeNothing");
  }

  return t("statusMergeComplete", [
    String(result.mergedFolderCount || 0),
    String(result.movedUrlCount || 0)
  ]);
}

function getDedupeStatus(result) {
  if (!result?.duplicateCount) {
    return t("statusDedupeNothing");
  }

  return t("statusDedupeComplete", String(result.duplicateCount));
}

function getOpenFolderStatus(result) {
  return t("statusOpenFolderComplete", String(result?.openedCount || 0));
}

function setBusy(nextBusy) {
  isBusy = Boolean(nextBusy);
  elements.backupOnlyButton.disabled = isBusy;
  elements.backupCloseButton.disabled = isBusy;
  elements.manualCleanupScope.disabled = isBusy;
  elements.runAutoCleanupButton.disabled = isBusy;
  elements.dedupeArchiveFoldersButton.disabled = isBusy;
  renderArchiveFolderControls();
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
