const AUTO_CLEANUP_ALARM_NAME = "auto-cleanup-stale-tabs";

const DEFAULT_AUTO_CLEANUP_SETTINGS = {
  enabled: false,
  intervalMinutes: 60,
  thresholdMinutes: 1440
};

const FALLBACK_MESSAGES = {
  archiveFailedTitle: "归档失败：请打开扩展的背景页控制台查看错误。",
  archiveInProgressTitle: "正在归档当前窗口页面...",
  autoCleanupCompletedTitle: "已自动归档 $COUNT$ 个页面，并关闭 $CLOSED$ 个标签页。",
  autoTopFolderPrefix: "自动页面归档",
  emptyBadge: "空",
  emptyWindowTitle: "当前窗口没有可收藏的页面。",
  errorBadge: "失败",
  localFilesFolder: "本地文件",
  otherFolder: "其他",
  savedTitle: "已收藏 $COUNT$ 个页面。",
  savedAndClosedTitle: "已收藏 $COUNT$ 个页面，已关闭 $CLOSED$ 个标签页。",
  savedWithSkippedTitle: "已收藏 $COUNT$ 个页面，跳过 $SKIPPED$ 个页面。",
  savedWithSkippedAndClosedTitle: "已收藏 $COUNT$ 个页面，跳过 $SKIPPED$ 个页面，已关闭 $CLOSED$ 个标签页。",
  skippedBookmarkWarning: "无法收藏页面：$URL$",
  topFolderPrefix: "窗口页面归档"
};

const STORAGE_KEYS = {
  autoCleanupSettings: "autoCleanupSettings",
  lastAutoCleanupAt: "lastAutoCleanupAt",
  lastAutoCleanupResult: "lastAutoCleanupResult",
  lastBackupAt: "lastBackupAt"
};

chrome.runtime.onInstalled.addListener(() => {
  syncAutoCleanupAlarm().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  syncAutoCleanupAlarm().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_CLEANUP_ALARM_NAME) {
    return;
  }

  runAutoCleanup().catch((error) => {
    console.error(error);
    setActionFeedback(t("errorBadge"), "#b3261e", t("archiveFailedTitle"));
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "archive-window") {
    archiveCurrentWindow({
      closeOriginalTabs: Boolean(message.closeOriginalTabs),
      windowId: message.windowId
    }).then((result) => {
      sendResponse({ ok: true, result });
    }).catch((error) => {
      console.error(error);
      setActionFeedback(t("errorBadge"), "#b3261e", t("archiveFailedTitle"));
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  }

  if (message?.type === "get-auto-cleanup-state") {
    getAutoCleanupState().then((state) => {
      sendResponse({ ok: true, state });
    }).catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  }

  if (message?.type === "update-auto-cleanup-settings") {
    updateAutoCleanupSettings(message.settings).then((state) => {
      sendResponse({ ok: true, state });
    }).catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  }

  if (message?.type === "run-auto-cleanup-now") {
    runAutoCleanup({ force: true }).then((result) => {
      sendResponse({ ok: true, result });
    }).catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  }

  return false;
});

async function archiveCurrentWindow(options = {}) {
  const { closeOriginalTabs = false, windowId } = options;

  setActionFeedback("...", "#5f6368", t("archiveInProgressTitle"));

  const queryInfo = Number.isInteger(windowId) ? { windowId } : { currentWindow: true };
  const tabs = await queryTabs(queryInfo);
  const originalTabs = sortTabs(tabs);
  const archiveResult = await archiveTabs(originalTabs, {
    recordLastBackup: true,
    topFolderPrefixMessageName: "topFolderPrefix"
  });

  if (archiveResult.savedCount === 0 && archiveResult.skippedCount === 0) {
    setActionFeedback(t("emptyBadge"), "#5f6368", t("emptyWindowTitle"));
    return {
      ...archiveResult,
      closedCount: 0
    };
  }

  const closedCount = closeOriginalTabs
    ? await openNewTabAndCloseTabs(originalTabs)
    : 0;

  const resultTitle = getResultTitle(archiveResult.savedCount, archiveResult.skippedCount, closedCount);
  setActionFeedback(String(archiveResult.savedCount), archiveResult.skippedCount ? "#f29900" : "#137333", resultTitle);

  return {
    ...archiveResult,
    closedCount
  };
}

async function archiveTabs(tabs, options = {}) {
  const {
    recordLastBackup = true,
    topFolderPrefixMessageName = "topFolderPrefix"
  } = options;

  const bookmarkableTabs = sortTabs(tabs).filter((tab) => tab.url);

  if (bookmarkableTabs.length === 0) {
    return {
      lastBackupAt: null,
      savedCount: 0,
      savedTabIds: [],
      skippedCount: 0,
      topFolderId: null,
      topFolderTitle: null
    };
  }

  const parentId = await findBookmarksBarId();
  const topFolderTitle = `${t(topFolderPrefixMessageName)} ${formatTimestamp(new Date())}`;
  const topFolder = await createBookmark({
    parentId,
    title: topFolderTitle
  });

  const foldersBySite = new Map();
  const savedTabIds = [];
  const skipped = [];
  let savedCount = 0;

  for (const tab of bookmarkableTabs) {
    const siteName = getSiteFolderName(tab.url);

    if (!foldersBySite.has(siteName)) {
      const siteFolder = await createBookmark({
        parentId: topFolder.id,
        title: siteName
      });
      foldersBySite.set(siteName, siteFolder.id);
    }

    try {
      await createBookmark({
        parentId: foldersBySite.get(siteName),
        title: getBookmarkTitle(tab),
        url: tab.url
      });
      savedCount += 1;

      if (Number.isInteger(tab.id)) {
        savedTabIds.push(tab.id);
      }
    } catch (error) {
      skipped.push({ tab, error });
      console.warn(t("skippedBookmarkWarning", tab.url), error);
    }
  }

  const lastBackupAt = savedCount > 0 ? Date.now() : null;
  if (recordLastBackup && lastBackupAt !== null) {
    await setStorage({ [STORAGE_KEYS.lastBackupAt]: lastBackupAt });
  }

  return {
    lastBackupAt,
    savedCount,
    savedTabIds,
    skippedCount: skipped.length,
    topFolderId: topFolder.id,
    topFolderTitle
  };
}

async function runAutoCleanup(options = {}) {
  const { force = false } = options;
  const settings = await getAutoCleanupSettings();

  if (!settings.enabled && !force) {
    return {
      closedCount: 0,
      enabled: false,
      lastAutoCleanupAt: null,
      savedCount: 0,
      skippedCount: 0,
      staleCount: 0
    };
  }

  const allTabs = await queryTabs({ windowType: "normal" });
  const staleTabs = getStaleTabs(allTabs, settings.thresholdMinutes);
  const archiveResult = await archiveTabs(staleTabs, {
    recordLastBackup: true,
    topFolderPrefixMessageName: "autoTopFolderPrefix"
  });

  const closedCount = archiveResult.savedTabIds.length > 0
    ? await removeTabsSafely(archiveResult.savedTabIds)
    : 0;

  const lastAutoCleanupAt = Date.now();
  const result = {
    closedCount,
    intervalMinutes: settings.intervalMinutes,
    lastAutoCleanupAt,
    savedCount: archiveResult.savedCount,
    skippedCount: archiveResult.skippedCount,
    staleCount: staleTabs.length,
    thresholdMinutes: settings.thresholdMinutes
  };

  await setStorage({
    [STORAGE_KEYS.lastAutoCleanupAt]: lastAutoCleanupAt,
    [STORAGE_KEYS.lastAutoCleanupResult]: result
  });

  if (closedCount > 0) {
    setActionFeedback(
      String(closedCount),
      "#137333",
      t("autoCleanupCompletedTitle", [String(archiveResult.savedCount), String(closedCount)])
    );
  }

  return result;
}

function getStaleTabs(tabs, thresholdMinutes) {
  const cutoff = Date.now() - thresholdMinutes * 60 * 1000;

  return sortTabs(tabs).filter((tab) => {
    if (!Number.isInteger(tab.id) || !tab.url || !Number.isFinite(tab.lastAccessed)) {
      return false;
    }

    if (tab.active || tab.pinned || tab.audible || tab.incognito) {
      return false;
    }

    if (!isAutoCleanupUrl(tab.url)) {
      return false;
    }

    return tab.lastAccessed <= cutoff;
  });
}

function isAutoCleanupUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
  }
}

async function getAutoCleanupState() {
  const values = await getStorage([
    STORAGE_KEYS.lastAutoCleanupAt,
    STORAGE_KEYS.lastAutoCleanupResult
  ]);
  const settings = await getAutoCleanupSettings();

  return {
    lastAutoCleanupAt: values[STORAGE_KEYS.lastAutoCleanupAt] || null,
    lastAutoCleanupResult: values[STORAGE_KEYS.lastAutoCleanupResult] || null,
    settings
  };
}

async function getAutoCleanupSettings() {
  const values = await getStorage(STORAGE_KEYS.autoCleanupSettings);
  return normalizeAutoCleanupSettings(values[STORAGE_KEYS.autoCleanupSettings]);
}

async function updateAutoCleanupSettings(settings) {
  const normalized = normalizeAutoCleanupSettings(settings);
  await setStorage({ [STORAGE_KEYS.autoCleanupSettings]: normalized });
  await syncAutoCleanupAlarm(normalized);
  return getAutoCleanupState();
}

async function syncAutoCleanupAlarm(settings) {
  const normalized = settings || await getAutoCleanupSettings();
  await clearAlarm(AUTO_CLEANUP_ALARM_NAME);

  if (!normalized.enabled) {
    return;
  }

  await createAlarm(AUTO_CLEANUP_ALARM_NAME, {
    delayInMinutes: Math.min(1, normalized.intervalMinutes),
    periodInMinutes: normalized.intervalMinutes
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

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs);
    });
  });
}

function createBookmark(bookmark) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(bookmark, (node) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(node);
    });
  });
}

function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

function removeTabs(tabIds) {
  return new Promise((resolve, reject) => {
    chrome.tabs.remove(tabIds, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function removeTabsSafely(tabIds) {
  let closedCount = 0;

  for (const tabId of tabIds) {
    try {
      await removeTabs([tabId]);
      closedCount += 1;
    } catch (error) {
      console.warn(error);
    }
  }

  return closedCount;
}

function getBookmarkTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((tree) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tree);
    });
  });
}

function getStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (values) => {
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

function createAlarm(name, alarmInfo) {
  return new Promise((resolve, reject) => {
    chrome.alarms.create(name, alarmInfo, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function clearAlarm(name) {
  return new Promise((resolve, reject) => {
    chrome.alarms.clear(name, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function openNewTabAndCloseTabs(originalTabs) {
  const tabIds = originalTabs
    .map((tab) => tab.id)
    .filter(Number.isInteger);

  if (tabIds.length === 0) {
    return 0;
  }

  const originalWindowId = originalTabs.find((tab) => Number.isInteger(tab.windowId))?.windowId;
  const createProperties = {
    active: true,
    url: "chrome://newtab/"
  };

  if (Number.isInteger(originalWindowId)) {
    createProperties.windowId = originalWindowId;
  }

  const newTab = await createTab(createProperties);
  const idsToClose = tabIds.filter((tabId) => tabId !== newTab.id);

  if (idsToClose.length === 0) {
    return 0;
  }

  await removeTabs(idsToClose);
  return idsToClose.length;
}

async function findBookmarksBarId() {
  const [root] = await getBookmarkTree();
  const children = root.children || [];
  const bookmarksBar = children.find((node) => {
    const title = node.title.toLowerCase();
    return title.includes("bookmarks bar") || title.includes("书签栏") || title.includes("收藏夹栏");
  });

  return bookmarksBar?.id || children[0]?.id || root.id;
}

function getBookmarkTitle(tab) {
  const title = (tab.title || "").trim();
  if (title) {
    return title;
  }

  try {
    return new URL(tab.url).hostname || tab.url;
  } catch {
    return tab.url;
  }
}

function getSiteFolderName(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return t("localFilesFolder");
    }

    if (!parsed.hostname) {
      return sanitizeTitle(parsed.protocol.replace(":", "") || t("otherFolder"));
    }

    return sanitizeTitle(getRegistrableDomain(parsed.hostname));
  } catch {
    return t("otherFolder");
  }
}

function getRegistrableDomain(hostname) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  const parts = normalized.split(".").filter(Boolean);

  if (parts.length <= 2 || isIpAddress(normalized)) {
    return normalized;
  }

  const lastTwo = parts.slice(-2).join(".");
  const commonSecondLevelSuffixes = new Set([
    "ac.cn",
    "ac.jp",
    "co.jp",
    "co.kr",
    "co.uk",
    "com.au",
    "com.br",
    "com.cn",
    "com.hk",
    "com.sg",
    "com.tw",
    "edu.cn",
    "gov.cn",
    "net.cn",
    "org.cn",
    "org.uk"
  ]);

  if (commonSecondLevelSuffixes.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return lastTwo;
}

function isIpAddress(hostname) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
}

function sanitizeTitle(title) {
  return title
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || t("otherFolder");
}

function sortTabs(tabs) {
  return [...tabs].sort((a, b) => {
    if (a.windowId !== b.windowId) {
      return (a.windowId || 0) - (b.windowId || 0);
    }
    return a.index - b.index;
  });
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(".");
}

function setActionFeedback(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title });
}

function getResultTitle(savedCount, skippedCount, closedCount) {
  if (closedCount > 0 && skippedCount > 0) {
    return t("savedWithSkippedAndClosedTitle", [
      String(savedCount),
      String(skippedCount),
      String(closedCount)
    ]);
  }

  if (closedCount > 0) {
    return t("savedAndClosedTitle", [
      String(savedCount),
      String(closedCount)
    ]);
  }

  if (skippedCount > 0) {
    return t("savedWithSkippedTitle", [
      String(savedCount),
      String(skippedCount)
    ]);
  }

  return t("savedTitle", String(savedCount));
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
      .replaceAll("$CLOSED$", closedValue || "")
      .replaceAll("$URL$", values[0] || "");
  }

  return localized || fallback;
}
