# P0 技术验证记录

验证日期：2026-07-25
验证环境：Windows、Node.js 20.19.3、npm 10.8.2、Kepler.gl 3.2.6

## 结论

既有自动化 P0、生产构建、Kepler reducer 集成、六类 Dataset、六个固定图层、四维 Trip 与三维视角证据见下表；支持 public、local、mapbox 的改造后自动化已通过。无 Token 的公共模式和本地 XYZ 已取得浏览器实测证据；当前工作区仍未配置有效的 `VITE_MAPBOX_TOKEN`，因此真实 Mapbox 卫星底图、Chrome/Edge 完整跨浏览器、连续刷新与内存稳定性等手工验收继续标记为待执行。

当前默认入口已经演进为算法算例工作台，运行时主路径使用四个 Deck 任务图层和动态算例包，不再以早期“六个固定 Dataset/六个固定图层”作为界面验收口径。下文早期 P0 记录保留为历史技术证据；当前行为与最终结论以“2026-07-25 算法工作台基础浏览器验收”及 `docs/ALGORITHM_CASE_VALIDATION.md` 为准。

## 数据获取与真实性

- 查询范围：`18.6000,110.1800,18.6600,110.2700`
- Overpass 首轮结果：三个实例分别出现 504、超时和网络失败
- 已尝试方案：GET/POST 请求、三个公开实例、缩小请求验证
- 可重复回退：OpenStreetMap 主 API bbox，拆分为 6 个小块保存原始 XML
- 抓取时间：`2026-07-18T16:53:33.292Z`
- 真实公开地理点：164 个
- 真实上下文对象：154 个
- 总真实 Feature：318 个
- 来源声明：OpenStreetMap / ODbL / `© OpenStreetMap contributors`
- 完整来源记录：`public/data/riyue-3d/real/provenance.json`

回退并未生成或猜测任何“真实”对象。规范化 Feature 均保留 OSM 类型、ID、原始标签、抓取时间、几何来源与复核字段；仅保留带目标标签且全部几何坐标位于声明 bbox 内的对象。当前 `verifiedForDemo` 仍为 `false`，`provenance.json` 明确记录 `PENDING_VISUAL_REVIEW`，待有效 Mapbox Token 下进行底图目视复核。

模拟任务数据统一标记为 `SIMULATED_MISSION_DATA` 和 `operationalUseAllowed: false`。当前确定性结果为：

- 1 个海上任务区域
- 12 条侦察条带
- 3 架 UAV 静态路线与四维 Trip
- 总航程 63.23 km
- 并行完成时间 980 s
- Trip 每 2 秒采样，时间严格递增
- 四维坐标顺序 `[longitude, latitude, altitude, timestamp]`

## 自动化结果

| 检查 | 结果 | 实际输出摘要 |
|---|---|---|
| `npm run data:validate` | 通过 | 164 POI、154 上下文、12 条带、3 架 UAV；边界、来源与安全契约通过 |
| `npm run lint` | 通过 | ESLint 退出码 0，无错误输出 |
| `npm run typecheck` | 通过 | `tsc -b --pretty false` 退出码 0 |
| `npm run test:run` | 通过 | 18 个测试文件、144 个测试全部通过，0 失败 |
| `npm run build` | 通过 | 5246 个模块完成转换，Vite 生产构建成功（22.50 s）；保留既有依赖外部化和大 chunk 警告 |

2026-07-22 质量复核时重新执行完整 Vitest，最终原始汇总为 `Test Files 18 passed (18)`、`Tests 144 passed (144)`，退出码 0；测试数以该命令最终汇总为准。

改造后的自动化测试覆盖 public、local、mapbox 的配置解析、显式模式错误、本地 Style 加载与取消、provider 感知的标签/逐样式归属，以及 Kepler 自定义样式接入。数据与既有 P0 测试还覆盖 HTTP 错误、非法 JSON、schema、OSM 规范化与 XML 回退、模拟标记、坐标顺序、时间单调性、3 架 UAV、12 条条带、摘要一致性、Trip CSV BOM 回归、Kepler 六 Dataset/六图层注入、加载失败重试、UAV 选择、视角重置、底图切换、快捷键和永久声明。

## Kepler P0 集成

- 地图实例 ID：`wrj-map`
- reducer 挂载点：`keplerGl`
- 实际导出确认：`enhanceReduxMiddleware` 来自 `@kepler.gl/reducers`，`wrapTo` 来自 `@kepler.gl/actions`
- 注入方式：`processCsvData` / `processGeojson` + `resetMapConfig` + `addDataToMap`
- Dataset：6/6 注入成功
- 固定图层：6/6 恢复成功
- Trip：`wrj-trip-layer` 恢复成功，长尾迹 1500 s
- 静态完整路线：常驻可见
- 初始视角：纬度 18.625、经度 110.235、zoom 12.7、pitch 52、bearing -18

曾发现 Trip 图层缺失。根因是生成器向 CSV 首字段写入 BOM，Kepler 将字段识别为 `﻿_geojson`，与配置的 `_geojson` 不匹配。现已移除 BOM，并增加序列化和六图层集成回归测试。

## 浏览器验证

### 2026-07-22 简化工作台与三机动画验收

- [x] Chrome Headless 以无 Token 的公共底图模式打开生产预览，1920×1080 与 1366×768 均正常渲染紧凑顶栏、300 px 图层侧栏、全幅地图、Trip 时间轴和 UAV 列表，无横向滚动或白屏。
- [x] `wrj-uav-flight-markers` 已作为第八个 Deck 图层注入现有 Kepler 画布；浏览器成功加载 `/assets/uav-fixed-wing-mask.svg`，同一帧存在 UAV-01、UAV-02、UAV-03 三条 marker。
- [x] 播放 8 秒后时间轴从 01:00:00 推进到 01:01:52；三架 marker 分别位于不同经纬度与高度，航向随相邻采样点更新。
- [x] Trip 的 UAV-01/UAV-02/UAV-03 色带与 marker RGBA 严格对应蓝、橙、绿；更改色带无需重新注入 Dataset，Trip `currentTime` 保持不变。
- [x] Trip 高级设置的“无人机图标大小”可在 16–64 px 调整；浏览器实测设为 64 px 后立即生效，并写入 `wrj-layer-preferences:v1:riyue-3d`。
- [x] 隐藏 Trip 时不创建无人机 marker 图层；恢复显示后按当前时间继续，不重置播放进度。

浏览器验收期间发现 Kepler `animationConfig.currentTime` 使用 Unix 毫秒，而生成的四维 Trip 坐标按规范保存 Unix 秒。修复前会把三架图标钳制在各自终点；现已在 Deck marker 边界按路径时间单位归一化，并增加“毫秒动画时间对应秒级路径中点”的回归测试。运行时证据显示修复后 UAV-01 在 `1784509312699.9944 ms` 对应位置为 `[110.22072552712939, 18.624583904803753, 122]`，不再停留于终点。

以下为改造前已观察到的浏览器证据；旧的 Token 缺失页已被新的启动流程取代，不能作为当前验收项：

- 两档页面均无白屏、横向溢出或说明截断
- 占位 Token 下完整工作台成功渲染真实上下文、模拟任务区、12 条带、三架航迹、Trip 时间轴和 Kepler 图例
- 无效 Token 按预期进入可重试错误态
- 错误态仍常驻显示固定图例、真实/模拟数据边界与归属
- 1366×768 保持 230/自适应/300 的压缩三栏结构和底部阶段条
- 浏览器控制台未发现应用级 error 日志

占位 Token 只能证明组件、数据、WebGL/Deck 渲染链和错误处理可运行，不能证明真实 Mapbox 卫星底图鉴权成功。

本次 Task5 实际证据：

- [x] 显式 `public`、无 `VITE_MAPBOX_TOKEN` 的 Vite 开发服务可在 `127.0.0.1:4173` 启动；`GET /` 返回 HTTP 200，HTML 含 `#root` 与 `/src/main.tsx`
- [x] 公共模式在 Codex 应用内浏览器真实打开，未出现 Token 阻断页；DOM 含 6 项指标、3 架 UAV、六类固定图例、Trip 时间轴、地图 canvas 以及真实/模拟数据声明
- [x] 公共主底图真实请求 CARTO 的 `a`、`b`、`c`、`d` 四个子域（`https://{a,b,c,d}.basemaps.cartocdn.com/rastertiles/voyager/...`），按钮“公共地图”为 active，页脚同时显示 OSM 与 CARTO 归属；切换“OSM 简洁图”后真实请求 `https://tile.openstreetmap.org/...`，按钮为 active，页脚仅显示 OSM 归属；切回公共主底图也已验证
- [x] Trip 播放时进度条从 `width: 0%` 推进到 `21.1667%`，图标由 play 变为 pause；停止后恢复，证明播放时间实际推进
- [x] 1920×1080 下文档 `scroll/client` 均为 1920×1080，左栏 230 px、右栏 300 px、地图区 1390 px，6 项指标均在视口；1366×768 下文档 `scroll/client` 均为 1366×768，左栏 230 px、右栏 300 px、地图区 836 px，6 项指标均在视口
- [x] 本地 XYZ 模式在 `127.0.0.1:4174` 打开，标题为“本地底图”，按钮为“本地地图/公共备用”；浏览器资源清单观察到多条 `http://127.0.0.1:4190/14/...png` 请求，页脚显示“本地验收瓦片”。切换公共备用后 OSM 按钮为 active、归属仅 OSM，切回后恢复本地归属
- [x] 停止本地瓦片服务后刷新，工作台仍正常加载，未出现“底图配置失败”或应用级“重试”状态；这只验证 XYZ 断线不会被误判为启动配置失败，不声称已经取得网络错误日志

自定义视口的截图 API 出现左上区域取样异常，因此两档分辨率只按 DOM 尺寸、无滚动和元素可见性记为通过，不将其表述为完整人工视觉像素审查。浏览器控制台观察到 Kepler 无 Token 警告和 `events` externalized 警告；本次功能路径仍可运行，二者记录为已知非阻断警告。

仍待执行：

- [ ] CARTO/OSM 服务许可、用途、容量与生产适用性核实；本次技术验收不替代服务政策审查
- [ ] 本地 Style JSON：初始 fetch 失败显示可操作错误并可重试
- [ ] 本地 XYZ 服务停止后的网络错误日志与地图画面人工诊断；本次只确认工作台未进入应用级配置失败/重试状态

## 待有效 Token 或完整手工环境后执行

- [ ] 有效 Token 下的 Mapbox 卫星底图清晰加载并定位日月湾
- [ ] 有效 Token 下的 Mapbox 简洁底图切换成功
- [ ] 六层数据在真实底图上同时可见且样式区分明确
- [ ] Trip 暂停、重置及 1500 s 长尾迹的完整人工视觉验收（本次已验证播放进度实际推进）
- [ ] 高度、旋转、缩放和重置三维视角
- [ ] 真实 POI Tooltip 展示 OSM 类型/ID/抓取时间
- [ ] 模拟 Tooltip 显示“不可用于真实飞行”
- [ ] 1920×1080 与 1366×768 的完整人工视觉像素审查
- [ ] Chrome 与 Edge
- [ ] 慢网、连续刷新 10 次、内存稳定性

本次真实浏览器为 Codex 应用内浏览器，不能替代 Chrome 与 Edge 跨浏览器验收。

配置步骤：复制 `.env.example` 为未提交的 `.env.local`，填写 `VITE_MAPBOX_TOKEN`，重新启动开发服务，然后逐项勾选以上清单。

## 2026-07-24 算法三维工作台自动化补充

算法工作台分支已完成离线自动化验收。本节数据取自本次最终命令输出，并替代上文早期阶段的测试数量；详细证据见 `docs/ALGORITHM_CASE_VALIDATION.md`。

- [x] 显式使用主目录只读原始输入执行 `data:check-algorithm`：11 个有效算例、12 个生成文件，默认 `R10-LONG-TRANSIT-01`，退出码 0。
- [x] R10 数据包通过 `CaseBundleV2` 运行时 schema；指标为 2 架物理 UAV、5 个架次、3 个批次、20 个条带，makespan 为 3598.1854630795783 s。
- [x] R10 三批启动时间、20 条带唯一归属、所有四维路径时间单调性、架次结束边界和三角无人机显示状态均由提交数据集成测试覆盖。
- [x] `npm run lint` 与 `npm run typecheck` 退出码均为 0。
- [x] `npm run test:run`：33 个测试文件、401 个测试全部通过，0 失败。
- [x] `npm run build`：5247 个模块转换完成，生产构建成功（28.73 s）；主 JS 11669.30 kB、gzip 3084.77 kB。
- [x] 三维实现自动化覆盖带真实算法高度的 Route、Trips 和三角标记，以及 1×/2×/4× 垂直夸张；区域和条带保持海平面。

坐标限制：算法只提供本地平面米制坐标，当前以 110.235°E、18.625°N 为演示锚点，X 向东、Y 向北。底图是可倾斜的平面地图，不包含真实地形高程；三维效果来自 Deck 图层的 Z 高度，不可用于真实飞行定位。

以下项目未在本次离线任务中执行，不作通过声明：

- [ ] 默认 R10 和 11 算例选择器的浏览器人工检查
- [ ] 三批动画、三角航向、3 秒降落淡出的人工视觉检查
- [ ] 时间轴、播放倍率、图层样式及高度比例的连续交互检查
- [ ] ZIP 上传、切换、刷新恢复及删除的完整浏览器流程
- [ ] 1920×1080、1366×768、Chrome 和 Edge 验收

## 2026-07-25 算法工作台基础浏览器验收

本节只记录内部演示所需的基础可用性，不扩大为全部交互或生产级稳定性结论。

- [x] 当前功能工作树的 Vite 服务在 `127.0.0.1:4174` 可访问，`GET /` 返回 HTTP 200 且包含 `#root`。
- [x] 公共底图在启动时主动应用；浏览器复验确认不再黑屏或长期停留在 Kepler Loading。
- [x] 首次 R10 会应用算法算例视角，航迹与任务图层进入视野，不再停留在 Kepler 默认 San Francisco。
- [x] StrictMode 自动化回归确认启动底图和首次视角只应用一次；时钟帧和样式偏好修改不会重复重置视角，算例切换仍只重置一次。
- [x] Edge Headless 以 1366×768 打开最终页面并生成 `docs/validation-assets/algorithm-workspace-1366x768.png`。截图可见公共底图、默认 R10、“方案可行”、四个任务图层入口、两架 UAV/五个架次、航迹和时间轴，未见横向滚动或关键区域遮挡。
- [x] Chrome DevTools Protocol 实时会话在 1920 宽视口验证两架双色三角无人机同时显示；暂停并跳转到 1206.802 秒和 2415.789 秒后，页面分别进入第 2、3 批且架次状态按算法顺序更新。
- [x] Chrome 实时抽查 4× 高度、规划航迹线宽/透明度、条带显隐、恢复默认和任务概览抽屉，基础交互均可用且未重新注入数据。
- [x] 最新自动化复跑为 33 个测试文件、401 个测试全部通过；类型检查、ESLint 与生产构建均退出码 0，构建转换 5247 个模块。

Chrome 实际验收过程发现并推动修复了启动底图和初始视角问题；修复提交为 `f81ee55`、`d81e8f5`。Chrome 交互证据来自实时 DevTools Protocol 会话，最终仓库静态证据来自 Edge Headless，因此以下内容仍不作通过声明：

- [ ] Chrome 与 Edge 的完整交互对照。
- [ ] 三批动画全程播放和 3 秒降落淡出的人工视觉检查。
- [ ] 时间轴拖动、全部倍率、四层样式组合和高度比例的连续交互。
- [ ] ZIP 导入、刷新恢复、切换和删除的完整浏览器流程。
- [ ] 慢网、连续刷新 10 次和内存稳定性。

## 已知依赖说明

Kepler.gl 3.2.6 的传递依赖 `react-palm@3.3.11`、`react-sortable-hoc` 和 `react-vis` 仍声明 React 16 peer。应用实际固定并成功构建于 React 18.2.0；为避免 React Palm 多实例造成异步 Dataset 任务队列分裂，项目显式固定单实例 `react-palm@3.3.11`。安装使用：

```powershell
npm ci --legacy-peer-deps --registry=<本次可用的临时镜像>
```

`npm ls` 会因上述上游 peer 元数据返回 `ELSPROBLEMS`，但运行时版本检查、自动化测试和生产构建可以独立验证。不要执行 `npm audit fix --force`，以免自动升级或替换固定的 Kepler 3.2.6 依赖线。
