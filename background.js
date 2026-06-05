const FALLBACK_MESSAGES = {
  archiveFailedTitle: "归档失败：请打开扩展的背景页控制台查看错误。",
  archiveInProgressTitle: "正在归档当前窗口页面...",
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
  lastBackupAt: "lastBackupAt"
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "archive-window") {
    return false;
  }

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
});

async function archiveCurrentWindow(options = {}) {
  const { closeOriginalTabs = false, windowId } = options;

  setActionFeedback("...", "#5f6368", t("archiveInProgressTitle"));

  const queryInfo = Number.isInteger(windowId) ? { windowId } : { currentWindow: true };
  const tabs = await queryTabs(queryInfo);
  const originalTabs = tabs.sort((a, b) => a.index - b.index);
  const bookmarkableTabs = tabs
    .filter((tab) => tab.url)
    .sort((a, b) => a.index - b.index);

  if (bookmarkableTabs.length === 0) {
    setActionFeedback(t("emptyBadge"), "#5f6368", t("emptyWindowTitle"));
    return {
      closedCount: 0,
      lastBackupAt: null,
      savedCount: 0,
      skippedCount: 0
    };
  }

  const parentId = await findBookmarksBarId();
  const topFolderTitle = `${t("topFolderPrefix")} ${formatTimestamp(new Date())}`;
  const topFolder = await createBookmark({
    parentId,
    title: topFolderTitle
  });

  const foldersBySite = new Map();
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
    } catch (error) {
      skipped.push({ tab, error });
      console.warn(t("skippedBookmarkWarning", tab.url), error);
    }
  }

  const lastBackupAt = Date.now();
  await setStorage({ [STORAGE_KEYS.lastBackupAt]: lastBackupAt });

  const closedCount = closeOriginalTabs
    ? await openNewTabAndCloseTabs(originalTabs)
    : 0;

  const resultTitle = getResultTitle(savedCount, skipped.length, closedCount);
  setActionFeedback(String(savedCount), skipped.length ? "#f29900" : "#137333", resultTitle);

  return {
    closedCount,
    lastBackupAt,
    savedCount,
    skippedCount: skipped.length,
    topFolderId: topFolder.id,
    topFolderTitle
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
