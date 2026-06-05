<p align="center">
  <img src="assets/logo.png" width="96" height="96" alt="Window Bookmark Archiver logo">
</p>

<h1 align="center">Window Bookmark Archiver</h1>

<p align="center">
  Archive every tab in the current Chrome window into organized bookmark folders.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
  ·
  <a href="chrome-window-bookmark-archiver-1.3.4.zip">Download ZIP</a>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4">
  <img alt="No build" src="https://img.shields.io/badge/build-none-10B981">
  <img alt="Version" src="https://img.shields.io/badge/version-1.3.4-111827">
</p>

## What It Does

Window Bookmark Archiver is a small Chrome extension for cleaning up crowded browser windows without losing context. Open the popup, choose a backup mode, and the extension saves the current window's tabs into a timestamped bookmark folder grouped by website.

It is useful when you want to preserve a research session, reset a messy tab window, or keep project tabs grouped for later.

## Features

- Backs up all tabs in the current Chrome window.
- Groups bookmarks by website domain, such as `github.com` or `google.com`.
- Creates a new timestamped top-level bookmark folder for each backup.
- Offers two modes: backup only, or backup and close original tabs after opening a new tab.
- Shows the last successful backup time in the popup.
- Supports English and Chinese UI text through Chrome i18n.
- Runs locally with no server, no tracking, and no build step.

## Install Locally

1. Download [chrome-window-bookmark-archiver-1.3.4.zip](chrome-window-bookmark-archiver-1.3.4.zip).
2. Unzip the file.
3. Open Chrome and go to `chrome://extensions/`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `chrome-window-bookmark-archiver` folder.

Do not drag a locally packed `.crx` into Chrome. Current Chrome builds on macOS and Windows reject self-packed CRX files with `CRX_REQUIRED_PROOF_MISSING` because they are not signed by the Chrome Web Store.

## Usage

Click the extension icon to open the popup.

Choose **Backup only** to save the current window tabs while keeping them open.

Choose **Backup and close tabs** to save the current window tabs, open a new tab, and close the original tabs in that window.

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

## Privacy

The extension only uses Chrome extension APIs for tabs, bookmarks, and local extension storage. It does not send browsing data to any external service.

The last successful backup time is stored in `chrome.storage.local` so the popup can show it later.

## Project Structure

```text
chrome-window-bookmark-archiver/
+-- assets/              Extension logo and Chrome icon sizes
+-- _locales/            English and Chinese i18n messages
+-- chrome-window-bookmark-archiver-1.3.4.zip
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
rm -f chrome-window-bookmark-archiver-*.zip
staging=$(mktemp -d)
mkdir -p "$staging/chrome-window-bookmark-archiver"
rsync -a --exclude ".git" --exclude ".DS_Store" --exclude ".learnings" --exclude "*.zip" ./ "$staging/chrome-window-bookmark-archiver/"
COPYFILE_DISABLE=1 ditto -c -k --keepParent --norsrc "$staging/chrome-window-bookmark-archiver" chrome-window-bookmark-archiver-1.3.4.zip
rm -rf "$staging"
```
