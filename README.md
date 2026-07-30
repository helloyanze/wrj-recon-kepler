# WRJ Kepler 三维静态侦察演示

React 18 + TypeScript + Vite + Kepler.gl 3.2.6 单页面工作台。项目自动加载日月湾附近的真实公开地理数据，以及确定性生成的任务区域、12 条侦察条带和 3 架 UAV 四维 Trip 航迹。

> 底图和公共地理对象来自真实地图数据；任务区域、条带和无人机航迹为模拟规划数据；本演示不构成真实飞行计划或空域信息。

## 环境要求

- Node.js 20.x（开发验证版本：20.19.3）
- npm 10.x

Mapbox Access Token 为可选项。默认 `auto` 模式会依次选择：本地 Style JSON/XYZ 配置、Mapbox Token、无需 Key 的公共地图。

Kepler.gl 3.2.6 的部分传递依赖仍声明 React 16 peer，安装时需要 `--legacy-peer-deps`。按当前可用镜像选择一个临时 registry，不修改全局 npm 配置：

```powershell
npm ci --legacy-peer-deps --registry=https://registry.npmmirror.com
```

如该镜像不可用，可临时切换为 `https://registry.npmjs.org`。

## 启动

复制环境变量示例：

```powershell
Copy-Item .env.example .env.local
```

默认 `.env.local`：

```env
VITE_WRJ_BASEMAP_MODE=auto
VITE_MAPBOX_TOKEN=
VITE_WRJ_LOCAL_STYLE_URL=
VITE_WRJ_LOCAL_TILE_URL=
VITE_WRJ_LOCAL_ATTRIBUTION=本地地图数据
VITE_WRJ_KEPLER_DEBUG=false
VITE_WRJ_DATA_BASE=/data
```

启动开发服务器：

```powershell
npm run dev
```

`VITE_WRJ_KEPLER_DEBUG=true` 时开放 Kepler 图层配置界面；默认模式保持只读。

### 底图模式

- `auto`（默认）：优先本地 Style JSON 或 XYZ；其次使用 `VITE_MAPBOX_TOKEN`；均未配置时使用公共地图。
- `public`：始终使用无需用户 Key 的公共地图，即使已配置 Mapbox Token。
- `local`：要求配置本地 Style JSON URL 或本地 XYZ URL；缺少配置会显示明确的可操作错误。
- `mapbox`：要求配置 `VITE_MAPBOX_TOKEN`；缺少 Token 会显示明确的可操作错误。

公共模式使用 CARTO Dark Matter 和 Positron 矢量样式，地名、道路和 POI 名称按中文、默认名称、英文的顺序回退。启动时会并行加载两份样式；任一加载失败都会进入可重试的底图配置错误页，不会静默切换为英文栅格底图。技术上不需要用户填写 API key，但这不等于没有许可、用途或可用性约束。部署前必须核实 [CARTO Basemaps 的许可/授权与用途条款](https://docs.carto.com/faqs/carto-basemaps)；不要假定公共模式适合所有演示或商业用途，生产和高并发部署应使用已核实许可与容量的受控地图服务。界面保留 OpenStreetMap 与 CARTO 数据归属。

本地 XYZ 栅格服务示例（URL 必须保留 `{z}`、`{x}`、`{y}`）：

```env
VITE_WRJ_BASEMAP_MODE=local
VITE_WRJ_LOCAL_TILE_URL=https://maps.example.internal/tiles/{z}/{x}/{y}.png
VITE_WRJ_LOCAL_ATTRIBUTION=© 示例地图服务
```

本地 Style JSON 示例：

```env
VITE_WRJ_BASEMAP_MODE=local
VITE_WRJ_LOCAL_STYLE_URL=https://maps.example.internal/styles/base/style.json
VITE_WRJ_LOCAL_ATTRIBUTION=© 示例地图服务
```

两者同时配置时，Style JSON 优先。应用会对本地 Style JSON 中可识别的名称标注尽力应用相同的中文优先回退；本地 XYZ 栅格保持服务提供方原有文字。Style JSON 必须符合 Mapbox Style Specification v8；其 glyph URL、sprite URL、tiles URL 及其派生资源 URL 都必须能被浏览器解析（建议使用绝对 URL）和访问，并分别配置允许应用来源的 CORS。本地 XYZ 瓦片服务同样必须配置 CORS。

本地 Style JSON 在应用启动时加载失败，会进入可操作的配置错误页并可重试；XYZ URL 仅在启动时同步构造样式，后续瓦片服务不可用属于运行期地图/网络问题，应通过浏览器网络和画面诊断，不会触发应用级配置重试。

只有显式 `mapbox` 模式，或 `auto` 实际选中 Mapbox 时，才需要 Token：

```env
VITE_WRJ_BASEMAP_MODE=mapbox
VITE_MAPBOX_TOKEN=pk.你的公开访问令牌
```

不要将 Token 提交到仓库。公开 Token 仍应在 Mapbox 控制台限制允许的 URL、权限范围与使用配额。

## 数据

固定算例清单位于 `public/data/riyue-3d/case-manifest.json`，包含六个稳定 Dataset ID：

- `wrj-real-pois`：真实公开地理点
- `wrj-real-context`：真实地理上下文
- `wrj-simulated-region`：模拟任务区域
- `wrj-simulated-strips`：模拟侦察条带
- `wrj-simulated-planned-routes`：模拟静态完整航迹
- `wrj-simulated-trips`：模拟四维 Trip

真实数据抓取会优先请求三个 Overpass 实例；均不可用时，脚本回退至 OpenStreetMap 主 API 的分片 bbox 下载，并在 `provenance.json` 中完整记录来源和失败原因。已有数据快照可直接运行演示，不依赖浏览器实时请求 OSM。

```powershell
npm run data:fetch-real
npm run data:normalize-real
npm run data:generate-simulated
npm run data:validate
```

`data:normalize-real` 可在不联网的情况下从已保存的原始响应重建真实图层，仅保留带目标 OSM 标签且全部几何坐标位于声明 bbox 内的对象。`VITE_WRJ_DATA_BASE` 会同时重定位清单、摘要和六个 Dataset，便于使用临时数据镜像。

模拟生成器为确定性几何与指标管线，每 2 秒采样 Trip，四维坐标顺序为 `[longitude, latitude, altitude, timestamp]`。每次生成会同步更新 GeoJSON、CSV、摘要指标和清单。

## 验证

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
```

P0 实测结果、已通过项和 Token 相关待验收项见 [docs/P0_VALIDATION.md](docs/P0_VALIDATION.md)。

## 操作

- 点击 UAV 卡片：查看该机条带、高度、航程和时间
- `Escape`：返回任务总览
- `R`：重置日月湾三维视角
- 顶部两个底图按钮：切换两个固定样式；标签会随当前 provider 变化
- 图层侧栏：每条侦察条带可单独配色；扫描区、静态航迹、动态尾迹和无人机图标均按 UAV 独立配色
- Trip 播放：使用地图底部时间控制；“已扫描区域”会随覆盖航段累计铺开，拖动或倒放时按当前任务时间重新计算
