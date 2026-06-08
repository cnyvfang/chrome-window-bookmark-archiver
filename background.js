const AUTO_CLEANUP_ALARM_NAME = "auto-cleanup-stale-tabs";

const ALLOWED_CLEANUP_THRESHOLDS = new Set([60, 360, 720, 1440, 4320, 10080, 43200]);
const ARCHIVE_FOLDER_MODES = new Set(["dated", "single"]);
const ARCHIVE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}$/;
const TAB_CLOSE_BATCH_DELAY_MS = 30;
const TAB_CLOSE_BATCH_SIZE = 25;
const TAB_OPEN_DELAY_MS = 25;

const ARCHIVE_PREFIX_DEFINITIONS = [
  {
    knownTitles: ["Window Bookmark Archive", "窗口页面归档"],
    messageName: "topFolderPrefix",
    type: "manual"
  },
  {
    knownTitles: ["Automatic Tab Archive", "自动页面归档"],
    messageName: "autoTopFolderPrefix",
    type: "auto"
  }
];

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
  manualCleanupNoMatchTitle: "没有符合所选清理范围的标签页。",
  otherFolder: "其他",
  savedTitle: "已收藏 $COUNT$ 个页面。",
  savedAndClosedTitle: "已收藏 $COUNT$ 个页面，已关闭 $CLOSED$ 个标签页。",
  savedWithSkippedTitle: "已收藏 $COUNT$ 个页面，跳过 $SKIPPED$ 个页面。",
  savedWithSkippedAndClosedTitle: "已收藏 $COUNT$ 个页面，跳过 $SKIPPED$ 个页面，已关闭 $CLOSED$ 个标签页。",
  skippedBookmarkWarning: "无法收藏页面：$URL$",
  topFolderPrefix: "窗口页面归档"
};

const STORAGE_KEYS = {
  archiveSettings: "archiveSettings",
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
      closeThresholdMinutes: message.closeThresholdMinutes,
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

  if (message?.type === "get-archive-state") {
    getArchiveState().then((state) => {
      sendResponse({ ok: true, state });
    }).catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  }

  if (message?.type === "update-archive-settings") {
    updateArchiveSettings(message.settings).then((state) => {
      sendResponse({ ok: true, state });
    }).catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  }

  if (message?.type === "merge-archive-folders") {
    mergeArchiveFolders().then((result) => {
      sendResponse({ ok: true, result });
    }).catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  }

  if (message?.type === "open-archive-folder") {
    openArchiveFolder({
      folderId: message.folderId,
      windowId: message.windowId
    }).then((result) => {
      sendResponse({ ok: true, result });
    }).catch((error) => {
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
  const {
    closeOriginalTabs = false,
    windowId
  } = options;
  const closeThresholdMinutes = normalizeOptionalCleanupThreshold(options.closeThresholdMinutes);

  setActionFeedback("...", "#5f6368", t("archiveInProgressTitle"));

  const queryInfo = Number.isInteger(windowId) ? { windowId } : { currentWindow: true };
  const tabs = await queryTabs(queryInfo);
  const originalTabs = sortTabs(tabs);
  const tabsToArchive = closeOriginalTabs && closeThresholdMinutes !== null
    ? getStaleTabs(originalTabs, closeThresholdMinutes)
    : originalTabs;
  const archiveSettings = await getArchiveSettings();
  const archiveResult = await archiveTabs(tabsToArchive, {
    folderMode: archiveSettings.folderMode,
    recordLastBackup: true,
    topFolderPrefixMessageName: "topFolderPrefix"
  });

  if (archiveResult.savedCount === 0 && archiveResult.skippedCount === 0) {
    const emptyTitle = closeOriginalTabs && closeThresholdMinutes !== null
      ? t("manualCleanupNoMatchTitle")
      : t("emptyWindowTitle");
    setActionFeedback(t("emptyBadge"), "#5f6368", emptyTitle);
    return {
      ...archiveResult,
      closeOriginalTabs,
      closeThresholdMinutes,
      closedCount: 0,
      matchedCount: tabsToArchive.length
    };
  }

  let closedCount = 0;
  if (closeOriginalTabs && closeThresholdMinutes === null) {
    closedCount = await openNewTabAndCloseTabs(originalTabs);
  } else if (closeOriginalTabs) {
    closedCount = await removeTabsSafely(archiveResult.savedTabIds);
  }

  const resultTitle = getResultTitle(archiveResult.savedCount, archiveResult.skippedCount, closedCount);
  setActionFeedback(String(archiveResult.savedCount), archiveResult.skippedCount ? "#f29900" : "#137333", resultTitle);

  return {
    ...archiveResult,
    closeOriginalTabs,
    closeThresholdMinutes,
    closedCount,
    matchedCount: tabsToArchive.length
  };
}

async function archiveTabs(tabs, options = {}) {
  const {
    folderMode = "dated",
    recordLastBackup = true,
    topFolderPrefixMessageName = "topFolderPrefix"
  } = options;

  const bookmarkableTabs = sortTabs(tabs)
    .map((tab) => ({ ...tab, archiveUrl: getTabUrl(tab) }))
    .filter((tab) => tab.archiveUrl);

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

  const topFolder = await resolveTopArchiveFolder({
    folderMode,
    topFolderPrefixMessageName
  });

  const foldersBySite = new Map();
  const topFolderChildren = await getBookmarkChildren(topFolder.id);
  topFolderChildren.forEach((node) => {
    if (!node.url) {
      foldersBySite.set(node.title, node.id);
    }
  });

  const savedTabIds = [];
  const skipped = [];
  let savedCount = 0;

  for (const tab of bookmarkableTabs) {
    const siteName = getSiteFolderName(tab.archiveUrl);

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
        url: tab.archiveUrl
      });
      savedCount += 1;

      if (Number.isInteger(tab.id)) {
        savedTabIds.push(tab.id);
      }
    } catch (error) {
      skipped.push({ tab, error });
      console.warn(t("skippedBookmarkWarning", tab.archiveUrl), error);
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
    topFolderTitle: topFolder.title
  };
}

async function resolveTopArchiveFolder(options) {
  const { folderMode, topFolderPrefixMessageName } = options;
  const parentId = await findBookmarksBarId();
  const title = t(topFolderPrefixMessageName);

  if (folderMode === "single") {
    return findOrCreateArchiveSingleFolder(parentId, topFolderPrefixMessageName);
  }

  return createBookmark({
    parentId,
    title: `${title} ${formatTimestamp(new Date())}`
  });
}

async function getArchiveState() {
  const [settings, folders] = await Promise.all([
    getArchiveSettings(),
    listArchiveFolders()
  ]);

  return { folders, settings };
}

async function getArchiveSettings() {
  const values = await getStorage(STORAGE_KEYS.archiveSettings);
  return normalizeArchiveSettings(values[STORAGE_KEYS.archiveSettings]);
}

async function updateArchiveSettings(settings) {
  const normalized = normalizeArchiveSettings(settings);
  await setStorage({ [STORAGE_KEYS.archiveSettings]: normalized });
  return getArchiveState();
}

function normalizeArchiveSettings(settings) {
  const folderMode = String(settings?.folderMode || "dated");
  return {
    folderMode: ARCHIVE_FOLDER_MODES.has(folderMode) ? folderMode : "dated"
  };
}

async function listArchiveFolders() {
  const parentId = await findBookmarksBarId();
  const children = await getBookmarkChildren(parentId);
  const folders = children
    .filter((node) => !node.url)
    .map((node) => {
      const info = getArchiveFolderInfo(node.title);
      if (!info) {
        return null;
      }

      return {
        archiveType: info.type,
        id: node.id,
        isDated: info.isDated,
        title: node.title,
        urlCount: null
      };
    })
    .filter(Boolean);

  return folders.sort((a, b) => {
    if (a.isDated !== b.isDated) {
      return a.isDated ? 1 : -1;
    }

    if (a.archiveType !== b.archiveType) {
      return a.archiveType.localeCompare(b.archiveType);
    }

    return b.title.localeCompare(a.title);
  });
}

async function mergeArchiveFolders() {
  const parentId = await findBookmarksBarId();
  const children = await getBookmarkChildren(parentId);
  const datedFolders = children
    .filter((node) => !node.url)
    .map((node) => ({ info: getArchiveFolderInfo(node.title), node }))
    .filter((entry) => entry.info?.isDated);

  const result = {
    mergedFolderCount: 0,
    movedUrlCount: 0,
    targetFolderCount: 0
  };

  for (const definition of ARCHIVE_PREFIX_DEFINITIONS) {
    const foldersForType = datedFolders
      .filter((entry) => entry.info.type === definition.type)
      .map((entry) => entry.node);

    if (foldersForType.length === 0) {
      continue;
    }

    const targetFolder = await findOrCreateArchiveSingleFolder(parentId, definition.messageName);
    result.targetFolderCount += 1;

    for (const folder of foldersForType) {
      const [freshFolder] = await getBookmarkSubTree(folder.id);
      if (!freshFolder) {
        continue;
      }

      result.movedUrlCount += await mergeArchiveFolderIntoTarget(freshFolder, targetFolder.id);
      await removeBookmarkTree(folder.id);
      result.mergedFolderCount += 1;
    }
  }

  return result;
}

async function mergeArchiveFolderIntoTarget(sourceFolder, targetFolderId) {
  let movedUrlCount = 0;

  for (const child of sourceFolder.children || []) {
    if (child.url) {
      await moveBookmark(child.id, { parentId: targetFolderId });
      movedUrlCount += 1;
      continue;
    }

    const targetChildFolder = await findOrCreateChildFolder(targetFolderId, child.title || t("otherFolder"));
    movedUrlCount += await moveChildrenIntoFolder(child, targetChildFolder.id);
    await removeBookmarkTree(child.id);
  }

  return movedUrlCount;
}

async function moveChildrenIntoFolder(sourceFolder, targetFolderId) {
  let movedUrlCount = 0;

  for (const child of sourceFolder.children || []) {
    if (child.url) {
      await moveBookmark(child.id, { parentId: targetFolderId });
      movedUrlCount += 1;
      continue;
    }

    const nestedTargetFolder = await findOrCreateChildFolder(targetFolderId, child.title || t("otherFolder"));
    movedUrlCount += await moveChildrenIntoFolder(child, nestedTargetFolder.id);
    await removeBookmarkTree(child.id);
  }

  return movedUrlCount;
}

async function openArchiveFolder(options = {}) {
  const { folderId, windowId } = options;
  if (!folderId) {
    throw new Error("Missing archive folder id.");
  }

  const [folder] = await getBookmarkSubTree(String(folderId));
  if (!folder) {
    throw new Error("Archive folder was not found.");
  }

  const urls = collectBookmarkUrls(folder);
  let openedCount = 0;
  let skippedCount = 0;

  for (const url of urls) {
    try {
      await createTab({
        active: false,
        ...(Number.isInteger(windowId) ? { windowId } : {}),
        url
      });
      openedCount += 1;
    } catch (error) {
      console.warn(error);
      skippedCount += 1;
    }

    if (openedCount + skippedCount < urls.length) {
      await delay(TAB_OPEN_DELAY_MS);
    }
  }

  return {
    folderId: folder.id,
    openedCount,
    skippedCount,
    totalCount: urls.length
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
  const archiveSettings = await getArchiveSettings();
  const archiveResult = await archiveTabs(staleTabs, {
    folderMode: archiveSettings.folderMode,
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
    const url = getTabUrl(tab);
    if (!Number.isInteger(tab.id) || !url) {
      return false;
    }

    if (tab.active || tab.pinned || tab.audible || tab.incognito) {
      return false;
    }

    if (!isAutoCleanupUrl(url)) {
      return false;
    }

    if (isUnloadedTab(tab)) {
      return true;
    }

    if (!Number.isFinite(tab.lastAccessed)) {
      return false;
    }

    return tab.lastAccessed <= cutoff;
  });
}

function getTabUrl(tab) {
  return tab?.url || tab?.pendingUrl || "";
}

function isUnloadedTab(tab) {
  return Boolean(tab?.discarded) || tab?.status === "unloaded";
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
  const intervalMinutes = Number(settings?.intervalMinutes);
  const thresholdMinutes = Number(settings?.thresholdMinutes);

  return {
    enabled: Boolean(settings?.enabled),
    intervalMinutes: allowedIntervals.has(intervalMinutes)
      ? intervalMinutes
      : DEFAULT_AUTO_CLEANUP_SETTINGS.intervalMinutes,
    thresholdMinutes: ALLOWED_CLEANUP_THRESHOLDS.has(thresholdMinutes)
      ? thresholdMinutes
      : DEFAULT_AUTO_CLEANUP_SETTINGS.thresholdMinutes
  };
}

function normalizeOptionalCleanupThreshold(thresholdMinutes) {
  if (thresholdMinutes === null || thresholdMinutes === undefined || thresholdMinutes === "all") {
    return null;
  }

  const normalized = Number(thresholdMinutes);
  return ALLOWED_CLEANUP_THRESHOLDS.has(normalized) ? normalized : null;
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
  return closeTabsReliably(tabIds);
}

async function closeTabsReliably(tabIds) {
  const uniqueTabIds = [...new Set(tabIds.filter(Number.isInteger))];
  let closedCount = 0;

  for (let index = 0; index < uniqueTabIds.length; index += TAB_CLOSE_BATCH_SIZE) {
    const batch = uniqueTabIds.slice(index, index + TAB_CLOSE_BATCH_SIZE);

    try {
      await removeTabs(batch);
      closedCount += batch.length;
    } catch (error) {
      console.warn(error);
      closedCount += await closeTabsOneByOne(batch);
    }

    if (index + TAB_CLOSE_BATCH_SIZE < uniqueTabIds.length) {
      await delay(TAB_CLOSE_BATCH_DELAY_MS);
    }
  }

  return closedCount;
}

async function closeTabsOneByOne(tabIds) {
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

function getBookmarkSubTree(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getSubTree(id, (tree) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tree);
    });
  });
}

function getBookmarkChildren(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(id, (children) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(children);
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

function moveBookmark(id, destination) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(id, destination, (node) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(node);
    });
  });
}

function removeBookmarkTree(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(id, () => {
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

  return closeTabsReliably(idsToClose);
}

async function findBookmarksBarId() {
  const rootChildren = await getBookmarkRootChildren();
  const bookmarksBar = findBookmarksBarNode(rootChildren);

  return bookmarksBar?.id || rootChildren[0]?.id || "1";
}

async function getBookmarkRootChildren() {
  try {
    return await getBookmarkChildren("0");
  } catch {
    const [root] = await getBookmarkTree();
    return root.children || [];
  }
}

function findBookmarksBarNode(rootOrChildren) {
  const children = Array.isArray(rootOrChildren) ? rootOrChildren : rootOrChildren.children || [];
  return children.find((node) => {
    const title = node.title.toLowerCase();
    return title.includes("bookmarks bar") || title.includes("书签栏") || title.includes("收藏夹栏");
  }) || children[0] || null;
}

async function findOrCreateChildFolder(parentId, title) {
  const children = await getBookmarkChildren(parentId);
  const existingFolder = children.find((node) => !node.url && node.title === title);

  if (existingFolder) {
    return existingFolder;
  }

  return createBookmark({ parentId, title });
}

async function findOrCreateArchiveSingleFolder(parentId, messageName) {
  const definition = ARCHIVE_PREFIX_DEFINITIONS.find((item) => item.messageName === messageName);
  const children = await getBookmarkChildren(parentId);

  if (definition) {
    const existingFolder = children.find((node) => {
      const info = !node.url ? getArchiveFolderInfo(node.title) : null;
      return info && !info.isDated && info.type === definition.type;
    });

    if (existingFolder) {
      return existingFolder;
    }
  }

  return createBookmark({
    parentId,
    title: t(messageName)
  });
}

function getArchiveFolderInfo(title) {
  for (const definition of ARCHIVE_PREFIX_DEFINITIONS) {
    for (const prefix of getArchivePrefixTitles(definition)) {
      if (title === prefix) {
        return {
          isDated: false,
          prefix,
          type: definition.type
        };
      }

      if (title.startsWith(`${prefix} `)) {
        const suffix = title.slice(prefix.length + 1);
        if (ARCHIVE_TIMESTAMP_PATTERN.test(suffix)) {
          return {
            isDated: true,
            prefix,
            type: definition.type
          };
        }
      }
    }
  }

  return null;
}

function getArchivePrefixTitles(definition) {
  return [...new Set([t(definition.messageName), ...definition.knownTitles])];
}

function collectBookmarkUrls(node) {
  if (node.url) {
    return [node.url];
  }

  return (node.children || []).flatMap(collectBookmarkUrls);
}

function getBookmarkTitle(tab) {
  const title = (tab.title || "").trim();
  if (title) {
    return title;
  }

  const url = getTabUrl(tab);
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
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

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
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
