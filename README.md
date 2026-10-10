# CloudTune

**本项目仅用于学习与技术研究，不用于商业用途。** CloudTune 是第三方学习项目，与网易云音乐官方无关联。音乐内容、商标及相关素材的权利属于原权利人。

参考网易云音乐 Windows 3.x 桌面布局，面向 Ubuntu / Linux 的第三方音乐客户端。使用 **Tauri 2 + React 19 + TypeScript**，原生 Rust 层直接请求网易云音乐 Web API。正式桌面版不需要 Node 服务或外部 API 部署。

![CloudTune 桌面界面](docs/screenshots/cloudtune-brand-0.1.2.png)

## 功能

- Windows 风格侧栏、渐变搜索框、顶部推荐区、推荐歌单和固定底部播放栏。
- 在线推荐、新歌、分类歌单、排行榜、单曲 / 歌单搜索与分页。
- 歌单完整歌曲 ID 列表分页加载，每页最多 100 首。
- 播放 / 暂停、上下曲、进度、音量、列表 / 单曲循环、随机、播放队列。
- 播放停滞时有限自动恢复；保留进度的“恢复声音”操作，主动暂停与切歌可取消恢复。
- 歌词播放页、时间同步与点击歌词跳转；系统媒体键通过 Web MediaSession 接入，取决于 WebKit / 桌面支持。
- 网易云 App 扫码登录、手机号短信验证码登录；个人歌单、喜欢列表与收藏操作；退出登录。
- 使用 Linux Secret Service（例如 GNOME Keyring）保存登录 Cookie，前端不接收 Cookie / token，也不保存密码。
- 未登录的本机收藏与最近播放、浅色 / 深色主题、标准 / 极高音质。
- 三档字号、90% / 100% / 110% / 125% 界面缩放，自动保存。中文优先使用本机 Noto Sans CJK。
- 系统托盘：显示窗口、播放 / 暂停、上下曲、当前曲目与退出。关闭窗口可收起到托盘；重复打开恢复已有窗口。
- 本地音频导入（本次会话内有效，实际格式由系统 GStreamer 编解码器决定）。

会员、付费及版权受限歌曲遵循网易云实际返回结果。试听片段会明确标记。客户端不提供绕过权限、破解或解锁音源。尚未实现下载管理、云盘上传、评论 / 社区、MPRIS D-Bus 服务与自动更新。

## 运行桌面版

从 [GitHub Releases](https://github.com/wanghao9103/CloudTune/releases/latest) 下载桌面安装包。当前 **v0.1.3** 安装包针对 **Ubuntu 26.04 x86_64**，Ubuntu 24.04 CI 已构建通过，但未做该系统的桌面实测；此下载包仍限定 Ubuntu 26.04。源码构建的安装包输出到 `src-tauri/target/release/bundle/deb/`；二进制安装包不纳入源码仓库。

在下载目录中安装：

```bash
sudo apt install ./CloudTune_0.1.3_ubuntu26.04_amd64.deb
```

安装后从应用菜单打开「CloudTune」，或运行 `yunting`。请在已解锁的桌面登录会话中运行，以便访问 GNOME Keyring。密钥环不可用时仍能临时登录，但重启后不会保留；界面会明确提示，绝不降级到明文文件。

无需管理员权限也可从构建目录运行 `./src-tauri/target/release/yunting`；需要系统已具备 GTK 3、WebKitGTK 4.1 和音频编解码运行库。

无需管理员权限的用户安装：构建完成后执行 `bash scripts/install-user.sh`，会安装到 `~/.local/share/yunting/` 并创建应用菜单入口。

设置 → 显示与桌面可调整字号、缩放和关闭行为。默认关闭窗口会收起到托盘并继续播放，彻底退出请在托盘菜单选择「退出CloudTune」。Linux 托盘使用菜单恢复窗口，不依赖双击事件。GNOME 需要 AppIndicator 扩展，例如 Ubuntu AppIndicators。没有托盘区域时自动最小化，保留任务栏入口；再次从应用菜单打开也会恢复窗口。

## 本地开发

按照 [Tauri 官方 Linux 前置依赖](https://v2.tauri.app/start/prerequisites/) 安装 Rust 与 GTK / WebKitGTK 开发包。Rust 最低 1.90，推荐当前 stable；Node 22.12+ / 24。

```bash
sudo apt install build-essential libwebkit2gtk-4.1-dev libssl-dev librsvg2-dev libxdo-dev libayatana-appindicator3-dev \
  gnome-keyring fonts-noto-cjk gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav
npm ci
npm run tauri dev
```

`npm run dev` 仅用于浏览器预览，监听 `127.0.0.1:1431`；开发适配器在 Node 内存中保存会话，重启开发服务会退出登录。浏览器预览成功不能证明原生 WebView、密钥环或打包成功。独立端口用于避免与其他 Tauri 项目的默认 1420 端口冲突。

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build
```

原生集成烟测需要 Xvfb、D-Bus、GNOME Keyring，以及 debug 可执行文件、Python dbus / PyGObject：`npm run test:native`。烟测会在 1431 服务未运行时自动准备并清理开发服务。使用隔离的 D-Bus 与 XDG 目录与合成托盘宿主，检查关闭后隐藏、后台音频持续、单实例恢复、托盘菜单导出及 WebView 缩放；只访问公开音乐和未授权二维码，不发送短信、不登录真实账号。报告仅在 debug 构建中启用，release 完全排除。

[首次 Ubuntu 24.04 CI](https://github.com/wanghao9103/CloudTune/actions/runs/38028899951) 的测试与桌面打包通过，尚未在 Ubuntu 24.04 桌面实测。当前验证范围见 [验收记录](docs/VERIFICATION.md)。

## 结构与接口

- `src/App.tsx`：页面、登录、播放器和队列。
- `src/api.ts`：类型转换，自动选择原生 IPC 或开发服务。
- `src/playback.ts`：媒体状态、播放意图与取消代次、有限停滞恢复和同曲进度保留。
- `src-tauri/src/desktop.rs`：托盘、关闭行为、单实例恢复、界面缩放。
- `src-tauri/src/api.rs`：操作白名单、WEAPI AES-CBC / RSA、公用 HTTP 客户端、系统密钥环与会话代次。
- `scripts/web-api.mjs`：仅用于开发预览的 Node 实现。会话只在服务进程内存中，接口拒绝跨站访问。

只允许固定音乐操作，不能通过 IPC 代理任意 URL。登录请求使用独立 Cookie jar，取消、换二维码、换登录方式和退出会使旧请求失效，避免迟到的登录响应重新建立会话。

API 协议与参数参考 [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) 的公开实现，并独立适配到 Rust。该 Web 接口非稳定官方开放平台，接口变更、风控及额外验证可能使登录失败；需要额外验证时可使用 App 扫码。未使用或引入音源解锁服务。

界面参考 [Windows 3.0.5 公开截图](https://secure.mydown.com/soft/19/473302519.shtml)。默认备用海岸图来自 [Unsplash](https://images.unsplash.com/photo-1475924156734-496f6cac6ec1)，歌单和歌曲封面由网易云接口返回。应用名为「CloudTune」，不是网易官方 Linux 客户端。

夜晚卡片月亮图片来自 [Wikimedia Commons 的 FullMoon2010](https://commons.wikimedia.org/wiki/File:FullMoon2010.jpg)。

托盘与单实例实现参考 [Tauri 系统托盘](https://v2.tauri.app/learn/system-tray/) 和 [单实例插件](https://v2.tauri.app/plugin/single-instance/)。

内部应用标识仍为 `io.yunting.desktop`，用于沿用已有账号密钥环与设置；显示名称为 CloudTune。

CloudTune 使用自己的暖珊瑚色云朵音符标志。可编辑源文件为 `public/icon.svg`，侧栏、关于页、登录弹窗与 favicon 共用该文件；桌面及托盘 PNG 由 `npx tauri icon public/icon.svg --output src-tauri/icons` 生成。修改图标后应重新构建、安装并刷新图标缓存。

Linux Dock 图标通过 `app.enableGTKAppId` 关联到 `io.yunting.desktop.desktop`；该入口和同名图标同时提供给用户安装和 `.deb`。X11 窗口类为 `Yunting`，与入口的 `StartupWMClass` 一致。Tauri 自动生成的 `CloudTune.desktop` 作为隐藏兼容入口保留，应用菜单只有一个可见入口。机制参见 [Tauri GTK 应用标识说明](https://v2.tauri.app/reference/config/#enablegtkappid)。原生烟测会读取真实窗口属性，并用 Gio / Gtk 验证启动器及图标解析。
