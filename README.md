<p align="center">
  <img src="assets/logo.png" width="96" height="96" alt="Window Bookmark Archiver logo">
</p>

<h1 align="center">Window Bookmark Archiver</h1>

<p align="center">
  Archive crowded Chrome windows into organized bookmark folders, then clean up stale tabs when you choose.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
  ·
  <a href="chrome-window-bookmark-archiver-1.4.1.zip">Download ZIP</a>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4">
  <img alt="No build" src="https://img.shields.io/badge/build-none-10B981">
  <img alt="Version" src="https://img.shields.io/badge/version-1.4.1-111827">
</p>

## What It Does

Window Bookmark Archiver is a small Chrome extension for cleaning up crowded browser windows without losing context. Open the popup, choose a backup mode, and the extension saves the current window's tabs into a timestamped bookmark folder grouped by website.

It can also run scheduled cleanup for stale tabs. When enabled, it archives tabs that have not been accessed for your chosen amount of time, then closes only the tabs that were successfully saved.

## Features

- Backs up all tabs in the current Chrome window.
- Groups bookmarks by website domain, such as `github.com` or `google.com`.
- Creates a new timestamped top-level bookmark folder for each backup.
- Offers two modes: backup only, or backup and close tabs.
- Manual backup-and-close can close all tabs or only tabs inactive for 1 hour to 30 days.
- Shows the last successful backup time in the popup.
- Optional scheduled cleanup for tabs that have not been accessed for 1 hour to 30 days.
- Shows the last automatic cleanup time and result summary.
- Protects pinned, active, audible, incognito, and internal Chrome tabs from automatic cleanup.
- Supports English and Chinese UI text through Chrome i18n.
- Runs locally with no server, no tracking, and no build step.

## Install Locally

1. Download [chrome-window-bookmark-archiver-1.4.1.zip](chrome-window-bookmark-archiver-1.4.1.zip).
2. Unzip the file.
3. Open Chrome and go to `chrome://extensions/`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `chrome-window-bookmark-archiver` folder.

Do not drag a locally packed `.crx` into Chrome. Current Chrome builds on macOS and Windows reject self-packed CRX files with `CRX_REQUIRED_PROOF_MISSING` because they are not signed by the Chrome Web Store.

## Usage

Click the extension icon to open the popup.

Choose **Backup only** to save the current window tabs while keeping them open.

Choose a **Backup and close range**, then choose **Backup and close tabs**.

If the range is **All tabs**, the extension saves the current window tabs, opens a new tab, and closes the original tabs in that window.

If the range is an inactivity threshold, the extension saves and closes only matching tabs in the current window. Pinned, active, audible, incognito, and internal Chrome tabs are skipped for threshold-based cleanup.

Turn on **Automatic cleanup** to archive and close tabs that have not been accessed for the selected threshold. You can also click **Run cleanup now** to apply the same rule immediately.

Automatic cleanup depends on Chrome's tab last-accessed timestamp. If a Chrome build does not expose that timestamp, affected tabs are skipped instead of being closed.

After backup, the bookmarks bar will contain a structure similar to:

```text
Window Bookmark Archive 2026-06-05 16.30.00
+-- google.com
|   +-- Google
|   +-- Google Docs
+-- github.com
|   +-- Pull requests
+-- Local files
    +-- report.html
```

Automatic cleanup uses the same site grouping under a folder such as:

```text
Automatic Tab Archive 2026-06-05 18.00.00
+-- github.com
|   +-- Issue tracker
+-- developer.chrome.com
    +-- tabs API
```

## Privacy

The extension only uses Chrome extension APIs for tabs, bookmarks, alarms, and local extension storage. It does not send browsing data to any external service.

The last successful backup time, manual close range, automatic cleanup settings, and latest automatic cleanup result are stored in `chrome.storage.local` so the popup can show them later.

## Project Structure

```text
chrome-window-bookmark-archiver/
+-- assets/              Extension logo and Chrome icon sizes
+-- _locales/            English and Chinese i18n messages
+-- chrome-window-bookmark-archiver-1.4.1.zip
|                       Local install ZIP package
+-- background.js        Bookmark backup and tab closing logic
+-- popup.html           Extension popup markup
+-- popup.css            Popup styles
+-- popup.js             Popup interaction logic
+-- manifest.json        Chrome Manifest V3 config
+-- README.md            English README
+-- README.zh-CN.md      Chinese README
```

## Development

This extension has no build step. Edit the source files directly, then reload the extension from `chrome://extensions/`.

To make a local install ZIP from the repository root:

```bash
find . -maxdepth 1 -type f -name "chrome-window-bookmark-archiver-*.zip" -delete
staging=$(mktemp -d)
mkdir -p "$staging/chrome-window-bookmark-archiver"
rsync -a --exclude ".git" --exclude ".DS_Store" --exclude ".learnings" --exclude "*.zip" ./ "$staging/chrome-window-bookmark-archiver/"
COPYFILE_DISABLE=1 ditto -c -k --keepParent --norsrc "$staging/chrome-window-bookmark-archiver" chrome-window-bookmark-archiver-1.4.1.zip
rm -rf "$staging"
```
