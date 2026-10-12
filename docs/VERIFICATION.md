# CloudTune 本机验收记录

日期：2026-10-12（含 2026-10-10 历史记录）。状态：部分验证；已通过本机开发、原生和打包检查，真实账号授权与其他发行版未覆盖。

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

- 最新包 `deliverables/CloudTune_0.1.5_ubuntu26.04_amd64.deb`，8,563,278 字节，约 8.17 MiB；0.1.0 至 0.1.4 保留作历史交付。
- 包名 `cloud-tune`，版本 `0.1.5`，架构 `amd64`；桌面显示名 / 窗口名 CloudTune；内部应用标识 `io.yunting.desktop` 保持不变，以保留原有账号与设置。
- 0.1.5 SHA256：`ee02b2d68454f939dc4a40864b21c512244288d811ed2c31857d850b3711694a`；历史版本摘要同时记录于 `deliverables/SHA256SUMS`。
- 无管理员权限的安装位置 `~/.local/share/yunting/yunting`；桌面入口 `~/.local/share/applications/io.yunting.desktop.desktop`。完整 `.deb` 系统安装尚未实际执行，已做依赖解析模拟。

## 0.1.3 声音中断与播放恢复

- 用户报告截图工具的提示音播放后，CloudTune 仍显示播放但没有声音。现场只读检查时，播放器 PipeWire 流与 USB 输出均 running、未静音、未 cork，左右声道 Link active，错误计数为 0；这些状态不能证明实际输出有声，尚未确认该触发条件的底层根因。
- 新控制器分开记录播放意图与媒体状态，监听缓冲 / 停滞 / 意外暂停；有播放意图但时间持续 6 秒不推进时，最多进行两次自动恢复。正常时钟、普通切换窗口、主动暂停、切歌或恢复取消不会触发无限重载或旧曲复活。正在请求歌曲 URL 的状态单独记录，避免旧媒体事件使取消按钮失效。
- 底部音量旁和设置 → 播放提供“恢复声音”，清空旧资源后重载同曲，保留进度、音量及静音状态；原本主动暂停时继续保持暂停。系统 MediaSession 的 play / pause 改为明确且幂等的动作。Audio 元素只在初始化时创建，不再每次 React 渲染都构造一个。
- Node 14 项测试通过（播放器 11 项、接口 3 项）；TypeScript / Vite 构建通过。Chromium 真正导入合成 WAV 的 6 项检查通过：重复系统 play、手动恢复的进度 / 音量、暂停期间恢复、意外暂停恢复、稳定 Audio 实例数、等待 URL 时暂停并忽略迟到返回；无外部网络请求。
- 原生 WebKit / Tauri smoke 通过，应用播放器恢复进度由 2.3 秒到 2.6 秒；主动暂停后再恢复保持 2.6 秒，按钮仍为播放。既有托盘、GTK 标识、隐藏音频、单实例、密钥环和缩放检查再次通过。此烟测的 PCM 为全零，仅证明状态和时钟，实际非零输出由下列独立探针验证。
- `scripts/audio-output-probe.py` 建立私有 D-Bus、PipeWire、Pulse、WirePlumber 和软件 null sink，不连接硬件，也不采集真实用户音频。WebKitGTK 2.52.6 播放非零 440 Hz PCM，44.1 / 48 kHz × 一次 / 三次 camera-shutter 音效，4 场景均测到音效瞬态及结束后的音乐信号；该私有软件输出场景没有复现持续失声。完整矩阵对合成录音按首次非零输出重新分析，另一次 fresh quick 验证退出 0；私有进程已清理，用户默认音频输出未改变。
- 本机证据：`.local/audio-interruption-system-state.json`、`.local/playback-ui-check-final.log` / `.local/playback-ui-check.json`、`.local/cloudtune-audio-native-final.log` / `.local/native-smoke.h0QAXp/report.json`、`.local/audio-output-probe-20261010-141911/report.json`、`.local/audio-output-probe-20261010-142132/report.json`。首轮原生检查因同任务 DOM click 后尚未等 React 提交而误读旧按钮；增加等待后完整重跑通过。私有音频初次固定测量窗覆盖冷启动静默的原报告保留，没有把未启动音频误当截图导致的失声。
- 0.1.3 最终 release / Debian 包已生成并安装到当前用户，正式进程 active；源与安装二进制一致，包内仅有 Tauri 将 bundle 标记 UNK 改为 DEB 的 3 字节差异，归一化标记后内容一致，ldd 无缺失库。证据 `.local/cloudtune-audio-release-final.log`、`.local/cloudtune-audio-bundle.log`、`.local/cloudtune-audio-installed.json`。
- 更新并重启 0.1.3 后，用户在自己的桌面重新播放歌曲并截图，明确反馈“截图后仍正常播放”。该现场回归通过；未采集用户音频，也未单独核实这次歌曲与输出设备信息。
- 未覆盖：截图故障的底层根因、不同音源 / 输出设备与长时间重复截图的完整组合。时钟仍推进但输出无声时不会以时钟作为有声证据或盲目无限刷新，应使用手动恢复并进一步排查实际设备；此次用户回归通过不代表全部触发条件均已解决。

## 0.1.4：进度停滞与跳转超时补充

- 用户在 0.1.3 继续反馈：某些歌曲约 2 分多钟停住，时间不再推进，但看起来仍在播放；未记下具体歌曲。此前“截图后仍正常播放”的人工结果保留，不能将它扩展为所有播放故障均已修复。
- 确认控制器缺陷：`seeking=true` 时 watchdog 每秒重置进度计时；重复 `playing` 事件也会掩盖冻结的时钟；首次加载失败后第二次恢复取到了 `load()` 清零的位置。旧版失败用例与真实 WebKit HTTP Range 断流均复现了相应边界。
- 修复后普通跳转只获得一次宽限；停滞超过 6 秒可进入有限恢复。在线曲目重新获取同一歌曲的授权地址，本地音频保持原 URL；多次恢复沿用最初位置。恢复必须等跳转结束且时间实际推进至少 0.025 秒才成功，各等待阶段均有超时，暂停、切歌和退出可取消。
- 页面显示“正在缓冲 / 正在恢复播放 / 播放中断”，恢复失败后保持明确停止；正常缓存内跳转完成或时间恢复推进会清除缓冲，避免没有额外 `playing` 事件时错误保持加载状态。
- Node 23 项通过（播放器 20、接口 3）；TypeScript / Vite 构建通过。Chromium 实际 App 的 7 项检查通过，包含在线恢复重新请求授权地址并保留时间；没有外部请求。Tauri / WebKit 原生 smoke 的恢复、暂停、后台音频、托盘、GTK 身份、单实例和缩放全部通过。
- 隔离 WebKitGTK 2.52.6 + 私有软件音频输出：180 秒合成 WAV 跳至 135 秒，旧版在 Range 无数据时一直 seeking、不恢复；新版重新获取完整 Range 地址后从 135 秒继续到约 147 秒，真实推进前保持恢复状态。永久断流时两次尝试后约 37 秒明确失败并暂停，保留 135 秒，不再重复尝试。零硬件、无用户音频采集，真实默认音频目标未变。
- 最终 release / Debian 包构建通过并安装到当前用户，正式进程 active，ldd 无缺失库；源与安装二进制一致，包内仅 Tauri UNK → DEB 标记的 3 字节差异，归一化后内容一致。所有 5 个历史交付物的 SHA256 检查通过。
- 证据：`.local/stall-probe/summary-final.json`（控制器摘要与最终源码一致）、`.local/cloudtune-stall-ui-renewal-final.log` / `.local/playback-ui-check-0.1.4.json`、`.local/cloudtune-stall-native-verified.log` / `.local/native-smoke.1GShnL/report.json`、`.local/cloudtune-stall-release.log`、`.local/cloudtune-stall-bundle.log`、`.local/cloudtune-stall-installed.json`。首轮 UI / 原生启动因 Vite 监控大量 `.local` 文件而 EMFILE；忽略该目录、Rust target 与 deliverables 后完整重跑通过，未修改系统 inotify 限制。
- 未覆盖：用户未提供的具体歌曲及其 CDN 响应、实际格式或权限根因；此修复验证了已复现的控制器缺陷。用户表示暂时没空测试，新版本的用户歌曲人工回归保持待验证。

## 0.1.5：首页与后台界面性能

- 用户反馈首页或收起到托盘时 CPU 偏高。确认截图中的 WebKit 进程归属 CloudTune；10 秒只读采样得到主进程约 22.3%、WebKit 约 41.3%。CPU 的 100% 表示一个逻辑核，现场负载没有同步采集，不能直接与后续合成测试相减。
- 进度移至独立显示 store / 组件；主界面歌词订阅只在行号变化时更新。隐藏窗口暂停显示通知与 CSS 装饰动画，重显补齐最新位置；真实媒体事件、自动恢复与托盘播放控制继续工作。设置只在初始化读取，喜欢列表按依赖缓存。等高器使用缩放和每 1.4 秒 4 步的低频动画，歌词唱片约 10 Hz 旋转；歌词页打开时暂停被覆盖的等高器。
- `npm test` 26 项与 TypeScript / Vite 生产构建通过。新增 3 项检查覆盖快照引用、订阅清理、隐藏期间保留时间、重显单次通知、重复时间歌词与前后跳转；既有 20 项播放器及 3 项 API 测试再次通过，媒体控制器未修改。
- 隔离原生生产基线：首页可见播放 12 秒出现 46 次 App 提交与 230 次设置读取；隐藏窗口后 `document.hidden=true`，仍有 48 次 App 提交与 240 次设置读取，真实音频时间推进 11.99 秒。稳态 native IPC 为 0。该基线确认周期性界面工作，但不把它当作已完成的 CPU 优化收益。
- Chromium 生产界面 8 项回归通过：进度推进与稳定 Audio、拖动跳转、歌词前后跳转、收藏、队列删除、手动恢复、暂停后跳转 / 恢复、模拟隐藏与重显；无外部请求或页面错误。模拟隐藏只证明显示逻辑，原生可见性另行验证。版本角标随后改为从 package 元数据读取，TypeScript / Vite 再次通过。
- 新前端与未改变的原生桌面代码再次通过 `test:native`：恢复时进度 2.3 → 2.5 秒，主动暂停后的恢复保持 2.6 秒；关闭隐藏、后台音频、托盘菜单 / 唯一托盘、单实例恢复、GTK ID、密钥环与缩放通过。这轮复用 0.1.4 debug 二进制加载当前 0.1.5 开发前端，不将它描述为重新编译的 0.1.5 原生 release；生产性能与最终安装包另有验证。证据 `.local/cloudtune-perf-native.log` / `.local/native-smoke.dBGiYM/report.json`。
- 对比探针只使用私有 D-Bus / XDG / Xvfb、合成歌单和 180 秒零 PCM；不采集用户音频，不改用户音频路由。先隔离进度且改为连续 transform 后，首页 WebKit 只下降约 6%；同一生产二进制、同一持续播放的动画消融中，连续等高器 93.777%、低频等高器 12.167%、静态 4.667%，定位到装饰动画仍有显著绘制开销。选择低频动画保留播放标识的动态效果，最终全场景对比另行记录。
- 测试过程保留失败证据：早期阶段文件事件丢失导致部分 CPU 样本缺失；旧候选末尾退出过快导致最后一个样本无 WebKit。最终探针使用 FIFO 与退出屏障，并要求每个样本存在 WebKit。UI 初次合成媒体服务未实现 Range，恢复后跳转错误；正确返回 206 / Content-Range 后重跑通过。不能把测试夹具问题当成播放器回归，也不能用缺失样本报告完整通过。
- 最终生产副本的七阶段原生检查全部通过，CPU 样本均有存活的 WebKit 子进程。首页可见播放每 12 秒仍有 48 次进度组件提交，直接插入 App 函数入口的计数为 0，设置读取 / 稳态 API / IPC 均为 0；没有将“顶层 App 隔离”写成“前台所有 React 停止刷新”。实际隐藏时 `document.hidden=true`、12 秒音频时间推进 11.988 秒，界面位置保持 15.3 秒，React 提交和 DOM 变化均为 0，动画 paused；显示后音频约 30.247 秒、界面 30.0 秒继续播放。歌词页仅换行更新，暂停后真实时钟稳定。
- 最终首页可见暂停 / 播放、首页隐藏播放 / 暂停、100 首列表播放、歌词播放、列表暂停的 WebKit CPU 分别为 0.750 / 13.247 / 1.917 / 1.334 / 10.919 / 27.750 / 0%；对应原生主进程为 0.083 / 2.249 / 0 / 0 / 2.750 / 2.833 / 0%。每阶段预热 2.5 秒、采样 12 秒，100% 表示一个逻辑核。低占用阶段的 0% 是采样分辨率结果，不是资源消耗恒为零。Xvfb 和用户 Wayland 绘制路径不同，数值仅代表这一合成负载。
- 同轮旧 / 新核心配对 `baseline-05` → `final-02`：首页播放主进程 13.494 → 2.416%（下降约 82%），WebKit 92.210 → 13.830%（约 85%）；隐藏播放 WebKit 3.416 → 2.083%（约 39%），主进程均约 0.083%。两次最终测量首页 WebKit 13.247–13.830%，隐藏 1.917–2.083%；暂停阶段在采样噪声附近，不据此主张收益。配对报告是明确的三阶段范围，不冒充完整七阶段报告。
- 正式 0.1.5 release / Debian 包构建通过，APT 模拟依赖解析通过，六个交付物 SHA256 检查通过。当前用户应用已更新并重启，正式进程 active；GTK 应用总线与单实例总线均归属新进程，当前 GNOME 注册唯一 CloudTune 托盘及控制菜单，应用入口和暖色图标实际解析通过。源与安装二进制一致，包内仅 Tauri UNK → DEB 标记有 3 字节差异，归一化后一致；ldd 无缺失运行库，也不依赖项目隔离 SDK 路径。安装核验探针初次未兼容 GNOME 的 service@path / 纯总线名格式及播放中的“暂停”标签，修正探针后通过，未改产品代码或用户播放状态。
- 证据目录 `.local/perf-probe/`；现场采样 `user-process-baseline.json`、生产旧版行为 `baseline-03/js-report.json`、动画消融 `motion-ablation-01/report.json`、最终原生 `final-01/report.json` / `harness-dist/app-instrumentation.json`、配对 `baseline-05/report.json` / `final-02/report.json`、汇总 `comparison-final.json`、UI `ui-regression.json`、单测 `.local/cloudtune-perf-final-tests.log`；构建 / 打包 / 安装证据 `.local/cloudtune-perf-release.log`、`.local/cloudtune-perf-bundle.log`、`.local/cloudtune-perf-apt-simulation.log`、`.local/cloudtune-perf-installed.json`。最终未插桩产品 JS SHA256 为 `9a955233f26ff6bb16fd0b1a807dbb0af45c8166b63a3ed934e30cd8932d15e9`，计数只写入独立探针副本。

## 未覆盖与边界

- 没有完成真实账号扫码授权、短信发送 / 验证、登录后的个人歌单 / 喜欢同步回归。相关功能已实现，仍需用户实际账号验证；额外风控取决于服务端。
- [首次 Ubuntu 24.04 CI](https://github.com/wanghao9103/CloudTune/actions/runs/38028899951) 的测试、格式 / Clippy 检查和桌面打包成功；尚未在 Ubuntu 24.04 桌面实测，其他发行版 / 架构也没有实测。本机新 glibc 产物仍只能按 Ubuntu 26.04 的包交付。
- 托盘原生菜单的显示和注册有证据；未对物理桌面逐一人工点击所有托盘播放操作。自动隐藏音频检验采用可控 PCM，长时间在线流媒体连续换曲未覆盖。
- 早期应用菜单和托盘注册成功未证明 Dock 身份正确；用户截图暴露了缺少 GTK 应用 ID 的默认齿轮问题。此次已验证真实窗口属性、启动器 / 图标解析与正式应用总线注册，未取得修复后物理 Dock 的截图。
- 浏览器预览缩放不会改变媒体查询的 CSS 视口，不能替代原生缩放的小窗口证明。另测等效 576×400 CSS 视口时，既有紧凑侧栏规则会隐藏歌单；该场景没有计作长歌单可达通过。新滚动条的鼠标 / 键盘细节在 Chromium 检查，原生 smoke 不包含物理鼠标逐项视觉验证。
- Secret Service 的合成测试不能替代真实账号会话跨重启验证。没有密钥环时仅临时登录，不写明文凭据。
- 无托盘宿主时的最小化回退已经实现，未在所有桌面 / 窗口管理器上验证。
- 会员、版权、编解码支持依赖账号、网易返回结果与本机 GStreamer。
