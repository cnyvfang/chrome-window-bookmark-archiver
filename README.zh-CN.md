<p align="center">
  <img src="assets/logo.png" width="96" height="96" alt="窗口页面归档收藏 logo">
</p>

<h1 align="center">窗口页面归档收藏</h1>

<p align="center">
  将拥挤的 Chrome 窗口归档到结构清晰的书签文件夹，并按需清理长期未访问的标签页。
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="chrome-window-bookmark-archiver-1.4.1.zip">下载 ZIP</a>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4">
  <img alt="No build" src="https://img.shields.io/badge/build-none-10B981">
  <img alt="Version" src="https://img.shields.io/badge/version-1.4.1-111827">
</p>

## 功能简介

窗口页面归档收藏是一个轻量 Chrome 扩展，用来整理拥挤的浏览器窗口。打开弹窗，选择备份模式，扩展会把当前窗口里的标签页保存到一个带时间戳的书签文件夹，并按网站域名自动分组。

它也可以定时清理长期未访问的标签页。开启后，扩展会按你选择的时间阈值归档过期标签页，并且只关闭已经成功收藏的标签页。

## 功能特点

- 备份当前 Chrome 窗口里的所有标签页。
- 按网站域名分组，例如 `github.com`、`google.com`。
- 每次备份都会创建一个新的带时间戳的顶层书签文件夹。
- 支持两种模式：只进行收藏备份，或备份并关闭标签页。
- 手动备份并关闭可以选择关闭全部标签页，或只关闭 1 小时到 30 天未访问的标签页。
- 弹窗中显示上一次成功备份时间。
- 可选定时清理 1 小时到 30 天未访问的标签页。
- 显示上一次自动清理时间和结果摘要。
- 自动清理会保护置顶、当前活动、正在播放、无痕和 Chrome 内部标签页。
- 扩展界面支持英文和中文，会根据 Chrome 浏览器语言自动切换。
- 完全本地运行，无服务器、无跟踪、无需构建步骤。

## 本地安装

1. 下载 [chrome-window-bookmark-archiver-1.4.1.zip](chrome-window-bookmark-archiver-1.4.1.zip)。
2. 解压该文件。
3. 打开 Chrome，进入 `chrome://extensions/`。
4. 打开右上角的 **开发者模式**。
5. 点击 **加载已解压的扩展程序**。
6. 选择解压后的 `chrome-window-bookmark-archiver` 文件夹。

不要把本地打包的 `.crx` 直接拖入 Chrome。当前 macOS 和 Windows 版 Chrome 会用 `CRX_REQUIRED_PROOF_MISSING` 拒绝自签名 CRX，因为它没有 Chrome Web Store 签名证明。

## 使用方式

点击扩展图标打开弹窗。

选择 **只进行收藏备份**，会保存当前窗口标签页，并保留所有标签页打开。

先选择 **备份并关闭范围**，再选择 **备份并关闭标签页**。

如果范围是 **全部标签页**，扩展会保存当前窗口标签页，打开一个新标签页，然后关闭该窗口原有标签页。

如果范围是未访问时间阈值，扩展只会保存并关闭当前窗口里符合条件的标签页。置顶、当前活动、正在播放、无痕和 Chrome 内部标签页会被跳过。

开启 **自动清理** 后，扩展会按所选阈值归档并关闭长期未访问的标签页。也可以点击 **立即清理一次**，立刻按同一规则执行一次。

自动清理依赖 Chrome 提供的标签页最近访问时间。如果某个 Chrome 版本没有提供这个时间，相关标签页会被跳过，不会被关闭。

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

自动清理会使用同样的网站分组方式，并创建类似下面的文件夹：

```text
自动页面归档 2026-06-05 18.00.00
+-- github.com
|   +-- Issue tracker
+-- developer.chrome.com
    +-- tabs API
```

## 隐私说明

扩展只使用 Chrome 的标签页、书签、定时任务和扩展本地存储 API，不会把浏览数据发送到任何外部服务。

上一次成功备份时间、手动关闭范围、自动清理设置和最近一次自动清理结果会保存在 `chrome.storage.local` 中，用于之后在弹窗里显示。

## 项目结构

```text
chrome-window-bookmark-archiver/
+-- assets/              扩展 logo 和 Chrome 图标尺寸
+-- _locales/            英文和中文 i18n 文案
+-- chrome-window-bookmark-archiver-1.4.1.zip
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
find . -maxdepth 1 -type f -name "chrome-window-bookmark-archiver-*.zip" -delete
staging=$(mktemp -d)
mkdir -p "$staging/chrome-window-bookmark-archiver"
rsync -a --exclude ".git" --exclude ".DS_Store" --exclude ".learnings" --exclude "*.zip" ./ "$staging/chrome-window-bookmark-archiver/"
COPYFILE_DISABLE=1 ditto -c -k --keepParent --norsrc "$staging/chrome-window-bookmark-archiver" chrome-window-bookmark-archiver-1.4.1.zip
rm -rf "$staging"
```
