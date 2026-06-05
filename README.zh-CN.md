<p align="center">
  <img src="assets/logo.png" width="96" height="96" alt="窗口页面归档收藏 logo">
</p>

<h1 align="center">窗口页面归档收藏</h1>

<p align="center">
  将当前 Chrome 窗口里的所有标签页一键归档到结构清晰的书签文件夹。
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="chrome-window-bookmark-archiver-1.3.4.zip">下载 ZIP</a>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4">
  <img alt="No build" src="https://img.shields.io/badge/build-none-10B981">
  <img alt="Version" src="https://img.shields.io/badge/version-1.3.4-111827">
</p>

## 功能简介

窗口页面归档收藏是一个轻量 Chrome 扩展，用来整理拥挤的浏览器窗口。打开弹窗，选择备份模式，扩展会把当前窗口里的标签页保存到一个带时间戳的书签文件夹，并按网站域名自动分组。

它适合保存研究资料、清理过多标签页、或者把某个项目相关页面留到以后继续处理。

## 功能特点

- 备份当前 Chrome 窗口里的所有标签页。
- 按网站域名分组，例如 `github.com`、`google.com`。
- 每次备份都会创建一个新的带时间戳的顶层书签文件夹。
- 支持两种模式：只进行收藏备份，或备份后打开一个新标签页并关闭原标签页。
- 弹窗中显示上一次成功备份时间。
- 扩展界面支持英文和中文，会根据 Chrome 浏览器语言自动切换。
- 完全本地运行，无服务器、无跟踪、无需构建步骤。

## 本地安装

1. 下载 [chrome-window-bookmark-archiver-1.3.4.zip](chrome-window-bookmark-archiver-1.3.4.zip)。
2. 解压该文件。
3. 打开 Chrome，进入 `chrome://extensions/`。
4. 打开右上角的 **开发者模式**。
5. 点击 **加载已解压的扩展程序**。
6. 选择解压后的 `chrome-window-bookmark-archiver` 文件夹。

不要把本地打包的 `.crx` 直接拖入 Chrome。当前 macOS 和 Windows 版 Chrome 会用 `CRX_REQUIRED_PROOF_MISSING` 拒绝自签名 CRX，因为它没有 Chrome Web Store 签名证明。

## 使用方式

点击扩展图标打开弹窗。

选择 **只进行收藏备份**，会保存当前窗口标签页，并保留所有标签页打开。

选择 **备份并关闭标签页**，会保存当前窗口标签页，打开一个新标签页，然后关闭该窗口原有标签页。

完成后，书签栏会出现类似下面的结构：

```text
窗口页面归档 2026-06-05 16.30.00
+-- google.com
|   +-- Google
|   +-- Google Docs
+-- github.com
|   +-- Pull requests
+-- 本地文件
    +-- report.html
```

## 隐私说明

扩展只使用 Chrome 的标签页、书签和扩展本地存储 API，不会把浏览数据发送到任何外部服务。

上一次成功备份时间会保存在 `chrome.storage.local` 中，用于之后在弹窗里显示。

## 项目结构

```text
chrome-window-bookmark-archiver/
+-- assets/              扩展 logo 和 Chrome 图标尺寸
+-- _locales/            英文和中文 i18n 文案
+-- chrome-window-bookmark-archiver-1.3.4.zip
|                       本地安装 ZIP 包
+-- background.js        书签备份和关闭标签页逻辑
+-- popup.html           扩展弹窗结构
+-- popup.css            弹窗样式
+-- popup.js             弹窗交互逻辑
+-- manifest.json        Chrome Manifest V3 配置
+-- README.md            英文 README
+-- README.zh-CN.md      中文 README
```

## 开发

这个扩展没有构建步骤。直接编辑源文件，然后在 `chrome://extensions/` 里重新加载扩展即可。

如果要从仓库根目录生成本地安装 ZIP：

```bash
rm -f chrome-window-bookmark-archiver-*.zip
staging=$(mktemp -d)
mkdir -p "$staging/chrome-window-bookmark-archiver"
rsync -a --exclude ".git" --exclude ".DS_Store" --exclude ".learnings" --exclude "*.zip" ./ "$staging/chrome-window-bookmark-archiver/"
COPYFILE_DISABLE=1 ditto -c -k --keepParent --norsrc "$staging/chrome-window-bookmark-archiver" chrome-window-bookmark-archiver-1.3.4.zip
rm -rf "$staging"
```

提交到这个仓库时，只包含本地安装 ZIP，不提交 Chrome Web Store 上传包。
