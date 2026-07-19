# P0 技术验证记录

验证日期：2026-07-19  
验证环境：Windows、Node.js 20.19.3、npm 10.8.2、Kepler.gl 3.2.6

## 结论

既有自动化 P0、生产构建、Kepler reducer 集成、六类 Dataset、六个固定图层、四维 Trip 与三维视角证据见下表；支持 public、local、mapbox 的改造后自动化结果待本次最终复跑。无 Token 时的公共模式和本地 XYZ 的浏览器验收尚待 Task5，不提前记为通过。当前工作区未配置有效的 `VITE_MAPBOX_TOKEN`，因此真实卫星瓦片、真实 Token 下的 Trip 播放和 Chrome/Edge 完整手工验收仍标记为待执行，不将占位 Token 的结果冒充真实底图通过。

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
| `npm run data:validate` | 最近证据 | 164 POI、154 上下文、12 条带、3 架 UAV；边界、来源与安全契约通过 |
| `npm run lint` | 待本次最终复跑 | 不沿用改造前结果作为当前通过结论 |
| `npm run typecheck` | 待本次最终复跑 | 不沿用改造前结果作为当前通过结论 |
| `npm run test:run` | 待本次最终复跑 | 不虚构改造后的测试文件或测试数量 |
| `npm run build` | 待本次最终复跑 | 不沿用改造前构建结果作为当前通过结论 |

改造后的自动化测试已覆盖 public、local、mapbox 的配置解析、显式模式错误、本地 Style 加载与取消、provider 感知的标签/归属，以及 Kepler 自定义样式接入；最终完整命令结果仍待 Task5 复跑记录。数据与既有 P0 测试历史还覆盖 HTTP 错误、非法 JSON、schema、OSM 规范化与 XML 回退、模拟标记、坐标顺序、时间单调性、3 架 UAV、12 条条带、摘要一致性、Trip CSV BOM 回归、Kepler 六 Dataset/六图层注入、加载失败重试、UAV 选择、视角重置、底图切换、快捷键和永久声明。

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

以下为改造前已观察到的浏览器证据；旧的 Token 缺失页已被新的启动流程取代，不能作为当前验收项：

- 两档页面均无白屏、横向溢出或说明截断
- 占位 Token 下完整工作台成功渲染真实上下文、模拟任务区、12 条带、三架航迹、Trip 时间轴和 Kepler 图例
- 无效 Token 按预期进入可重试错误态
- 错误态仍常驻显示固定图例、真实/模拟数据边界与归属
- 1366×768 保持 230/自适应/300 的压缩三栏结构和底部阶段条
- 浏览器控制台未发现应用级 error 日志

占位 Token 只能证明组件、数据、WebGL/Deck 渲染链和错误处理可运行，不能证明真实 Mapbox 卫星底图鉴权成功。

Task5 待执行：

- [ ] 无 `VITE_MAPBOX_TOKEN` 的公共模式：CARTO Voyager、OSM 切换、动态归属与无配置页启动（技术验收不替代 CARTO/OSM 服务许可、用途与容量核实）
- [ ] 本地 Style JSON：初始 fetch 失败显示可操作错误并可重试
- [ ] 本地 XYZ：瓦片请求、本地归属、公共备用；服务停止时仅以浏览器网络/画面确认瓦片不可用，不作为应用级失败/重试验收

## 待有效 Token 后执行

- [ ] 卫星底图清晰加载并定位日月湾
- [ ] 简洁底图切换成功
- [ ] 六层数据同时可见且样式区分明确
- [ ] Trip 播放、暂停、重置及 1500 s 长尾迹
- [ ] 高度、旋转、缩放和重置三维视角
- [ ] 真实 POI Tooltip 展示 OSM 类型/ID/抓取时间
- [ ] 模拟 Tooltip 显示“不可用于真实飞行”
- [ ] 1920×1080 与 1366×768 的真实底图截图验收
- [ ] Chrome 与 Edge
- [ ] 慢网、连续刷新 10 次、内存稳定性

配置步骤：复制 `.env.example` 为未提交的 `.env.local`，填写 `VITE_MAPBOX_TOKEN`，重新启动开发服务，然后逐项勾选以上清单。

## 已知依赖说明

Kepler.gl 3.2.6 的传递依赖 `react-palm@3.3.11`、`react-sortable-hoc` 和 `react-vis` 仍声明 React 16 peer。应用实际固定并成功构建于 React 18.2.0；为避免 React Palm 多实例造成异步 Dataset 任务队列分裂，项目显式固定单实例 `react-palm@3.3.11`。安装使用：

```powershell
npm ci --legacy-peer-deps --registry=<本次可用的临时镜像>
```

`npm ls` 会因上述上游 peer 元数据返回 `ELSPROBLEMS`，但运行时版本检查、自动化测试和生产构建可以独立验证。不要执行 `npm audit fix --force`，以免自动升级或替换固定的 Kepler 3.2.6 依赖线。
