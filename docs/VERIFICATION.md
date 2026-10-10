# CloudTune 本机验收记录

日期：2026-10-10。状态：部分验证；已通过本机开发、原生和打包检查，真实账号授权与其他发行版未覆盖。

## 环境

- Ubuntu 26.04.1 LTS x86_64，GNOME / Wayland；隔离原生烟测使用 Xvfb / X11。
- Node 24.21.0，React 19.3，TypeScript 5.9.3，Vite 7.3.7。
- Tauri 2.12.2，CLI 2.12.1，single-instance 2.5.2；WebKitGTK 4.1 运行库 2.52.6。
- 用户 Rust 环境已通过官方 rustup 安装到 `~/.cargo` 和 `~/.rustup`：rustc / cargo 1.99.0，含 rustfmt / clippy；新登录 shell 验证并编译运行了独立 Rust 示例。
- 当前项目使用本机已有的隔离 SDK、Rust 1.93.0 构建，以复用 GTK / WebKit 开发依赖；未修改其他项目代码或系统开发包。

## 已通过

1. `npm test`：3 项，包括操作白名单、参数与加密传输格式、取消登录后旧二维码轮询失效。
2. `cargo test`：3 项，包括 WEAPI AES / RSA、接口边界、登录代次与 Cookie jar 隔离。
3. `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、TypeScript / Vite 生产构建。
4. 原生 debug WebView：推荐、搜索、歌单、歌曲详情、音源、歌词、二维码生成及未授权轮询；无 Cookie 泄露；任意 URL 被拒绝。实际在线音频播放时间推进。
5. Secret Service：隔离 D-Bus + GNOME Keyring 中的合成凭据写入、读取、删除。没有用真实账号或短信做测试。
6. 托盘：隔离合成 StatusNotifierWatcher 接收到一个托盘注册，D-Bus 菜单包含显示、播放、上下曲和退出。
7. 关闭偏好可修改；关闭事件被拦截，窗口实际隐藏；第二次启动恢复原有窗口，并且托盘仍只有一个。
8. 隐藏播放：使用音量 0.5 的静音 PCM WAV 测试，页面 `document.hidden=true` 时进度由 0.252 秒推进到 2.060 秒，未暂停。这样排除远端 CDN 缓冲和音量为零对测试的干扰，不会发出可听见的测试声音。
9. 原生 1280×820 无全局溢出；125% WebView 缩放后视口为 1024×656，文档宽高与视口一致。
10. 浏览器交互：搜索、试听 / 完整歌曲、登录表单校验、二维码、游客收藏、歌单加载及 75 首队列、清空队列、歌词和局部滚动。未发送短信。
11. 字号三档与缩放四档可选择并保存；1280×720、720×500 及大字号 / 125% 组合检查无文档溢出。侧栏适配字号；歌单标题保留两行截断；登录弹窗内容可滚动。中文优先使用本机 Noto Sans CJK。
12. release 已构建，`.deb` 元数据可被 `dpkg-deb` 正确解析；APT 模拟安装能解析依赖；`ldd` 无缺失运行库。
13. 已安装到当前用户应用菜单，名称为 CloudTune；正式应用已启动。当前 GNOME 的实际 StatusNotifierWatcher 可读到 CloudTune 托盘与上述菜单。未设置开机自启。
14. 修复 Dock 默认齿轮：启用 `enableGTKAppId`，将 `.deb` 可见入口统一为 `io.yunting.desktop.desktop`，安装同名图标，并将 `StartupWMClass` 改为实测 `Yunting`。Xvfb 读取主窗口 `_GTK_APPLICATION_ID=io.yunting.desktop`、`WM_CLASS=[yunting,Yunting]`；Gio / Gtk 实际解析到可见 CloudTune 入口及对应 PNG。启用 GTK ID 后关闭隐藏、后台音频、单实例恢复和唯一托盘均再次通过。当前用户应用已更新并重启，GTK 应用总线与单实例总线归属于同一正式进程，用户入口与图标解析通过。
15. 0.1.1 调整侧栏滚动条：滚动槽位于右侧留白，默认透明，悬停及键盘焦点时淡显，保持原有局部滚动。Chromium 隔离合成账号的 0 / 11 / 40 歌单 × 1280×820 / 720×500（后者字号与预览缩放均 125%）共 99 项布局检查通过：滚轮及逐次 Tab 可达最后歌单，主内容不会跟随滚动，品牌 / 底部状态 / 播放栏位置稳定，悬停不改变按钮宽度，无横向溢出；常规字号“我喜欢的音乐”保持单行。另有 4 项鼠标 / 键盘焦点检查通过：鼠标点击后移出透明，键盘进入淡显，悬停淡显，移出透明。用 `:has(:focus-visible)` 区分键盘与鼠标焦点，避免 `focus-within` 使点击后滚动条持续显示。外部网络请求为零，没有使用真实账号。原生既有 smoke 再次通过，包括 GTK 身份、托盘、隐藏音频、单实例恢复和缩放。
16. 0.1.2 使用 CloudTune 自己的云朵音符标志，最终配色为暖珊瑚橙至玫红。手绘 SVG 为唯一源，侧栏 / 关于 / 登录共用图片，favicon 引用相同文件，Tauri CLI 生成桌面及托盘尺寸。Chromium 浅 / 深主题 × 100% / 125% 字号的 12 处品牌图检查通过，无原红色底圈、无裁切；最后仅换暖色后又目视复看浅 / 深主题。0.1.2 原生既有 smoke 通过；最终暖色 release 重建并重新安装，实际 GNOME 注册托盘的 32×32 PNG 像素与新图完全一致，Gio / Gtk 解析的用户桌面图标和包内 256 PNG 与源文件一致，GTK / 单实例总线归属新进程，正式进程 active。

本机日志位于 `.local/cloudtune-native.log`、`.local/cloudtune-delivery.log`；原生 JSON 报告位于 `.local/native-smoke.*/report.json`。日志中的 Xvfb EGL / portal / PipeWire 提示不代表音频或托盘测试成功，成功依据是报告各项检查与进度值。

Dock 修复的构建与回归日志：`.local/cloudtune-icon-debug.log`、`.local/cloudtune-icon-delivery.log`、`.local/cloudtune-icon-native.log`；通过报告位于 `.local/native-smoke.cFbg9t/report.json`。身份探针通过后输出 `desktopIdentity=true`，另有原生报告 `singleInstanceRestore=true` 和 `singleTray=true`。首次身份探针把 GLib 保留引号的 `get_executable()` 与裸路径比较而失败，随后改为解析 `Exec` 命令参数，完整重跑通过；不是程序启动失败。

截图：`docs/screenshots/home.png`、`docs/screenshots/settings.png`。截图是浏览器预览，不作为原生托盘视觉证据。

侧栏检查证据：`.local/sidebar-check.json`、`docs/screenshots/sidebar-0.1.1.png`（合成账号，Chromium）；原生和构建日志 `.local/cloudtune-sidebar-0.1.1.log`，最终安装包构建日志 `.local/cloudtune-sidebar-0.1.1-delivery.log`。初次细滚动槽重复占用宽度导致收藏标题换行，经截图复查发现；移除额外右 padding 后按钮恢复旧宽度 143px、标题单行，再跑检查通过。

新标志证据：`public/icon.svg`、`src-tauri/icons/`、`docs/screenshots/cloudtune-brand-0.1.2.png`（隔离游客浏览器预览），`.local/brand-check.json` / `.local/brand-check.log`、`.local/cloudtune-brand-0.1.2.log`、最终暖色构建日志 `.local/cloudtune-brand-0.1.2-warm.log` 及实际会话检查 `.local/cloudtune-brand-0.1.2-installed.json`。品牌预览外部网络请求为零，未使用真实账号或发送短信。

## 交付物

- 最新包 `deliverables/CloudTune_0.1.2_ubuntu26.04_amd64.deb`，约 8.17 MiB；0.1.0 / 0.1.1 保留作历史交付。
- 包名 `cloud-tune`，版本 `0.1.2`，架构 `amd64`；桌面显示名 / 窗口名 CloudTune；内部应用标识 `io.yunting.desktop` 保持不变，以保留原有账号与设置。
- 0.1.2 SHA256：`b378cc7d46682916c5e998cab2e304f4b3e3fd8d0b19d9b6066e2c0ae2311cc7`；历史版本摘要同时记录于 `deliverables/SHA256SUMS`。
- 无管理员权限的安装位置 `~/.local/share/yunting/yunting`；桌面入口 `~/.local/share/applications/io.yunting.desktop.desktop`。完整 `.deb` 系统安装尚未实际执行，已做依赖解析模拟。

## 未覆盖与边界

- 没有完成真实账号扫码授权、短信发送 / 验证、登录后的个人歌单 / 喜欢同步回归。相关功能已实现，仍需用户实际账号验证；额外风控取决于服务端。
- Ubuntu 24.04 CI 只配置、未执行；其他发行版 / 架构没有实测。本机新 glibc 产物只能按 Ubuntu 26.04 的包交付。
- 托盘原生菜单的显示和注册有证据；未对物理桌面逐一人工点击所有托盘播放操作。自动隐藏音频检验采用可控 PCM，长时间在线流媒体连续换曲未覆盖。
- 早期应用菜单和托盘注册成功未证明 Dock 身份正确；用户截图暴露了缺少 GTK 应用 ID 的默认齿轮问题。此次已验证真实窗口属性、启动器 / 图标解析与正式应用总线注册，未取得修复后物理 Dock 的截图。
- 浏览器预览缩放不会改变媒体查询的 CSS 视口，不能替代原生缩放的小窗口证明。另测等效 576×400 CSS 视口时，既有紧凑侧栏规则会隐藏歌单；该场景没有计作长歌单可达通过。新滚动条的鼠标 / 键盘细节在 Chromium 检查，原生 smoke 不包含物理鼠标逐项视觉验证。
- Secret Service 的合成测试不能替代真实账号会话跨重启验证。没有密钥环时仅临时登录，不写明文凭据。
- 无托盘宿主时的最小化回退已经实现，未在所有桌面 / 窗口管理器上验证。
- 会员、版权、编解码支持依赖账号、网易返回结果与本机 GStreamer。
