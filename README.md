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

默认 `.env.local`（仓库内置离线底图，无外网依赖）：

```env
VITE_WRJ_BASEMAP_MODE=local
VITE_MAPBOX_TOKEN=
VITE_WRJ_LOCAL_STYLE_URL=/offline-basemap/style-dark.json
VITE_WRJ_LOCAL_TILE_URL=
VITE_WRJ_LOCAL_LIGHT_STYLE_URL=/offline-basemap/style-light.json
VITE_WRJ_LOCAL_ATTRIBUTION=© OpenStreetMap contributors · Protomaps
VITE_WRJ_KEPLER_DEBUG=false
VITE_WRJ_DATA_BASE=/data
```

如需直接使用在线底图，可将 `VITE_WRJ_BASEMAP_MODE` 改为 `auto` 或 `public`；配置 Mapbox Token 后可用 `mapbox` 模式。

启动开发服务器：

```powershell
npm run dev
```

`VITE_WRJ_KEPLER_DEBUG=true` 时开放 Kepler 图层配置界面；默认模式保持只读。

### 拷贝到其他电脑

- 目标机需要 **Node.js 20.x**（22/24 实测也可运行，但 npm 会给出 `EBADENGINE` 警告）和 npm 10+。
- 直接整目录拷贝时，必须包含 `public/data`、`public/offline-basemap`、`src`、`scripts`、`package.json`、`package-lock.json`、`vite.config.ts`、`index.html`。`data/integration-validation` 只用于重新生成算例，运行时可以不带（约 51 MB）。
- 如果拷贝时带上了 `node_modules`，且目标机同为 Windows x64、Node 版本接近，可直接运行；更稳妥的做法是删除 `node_modules`，在目标机执行 `npm ci --legacy-peer-deps` 后运行 `npm run dev`。
- 完全离线、连 npm 安装都不做的演示机：直接拷贝构建好的 `dist/`，在 `dist` 根目录用任意静态 HTTP 服务托管（`npm run preview`、`npx serve` 或 `python -m http.server`），**不要用 `file://` 直接打开**。`dist` 已包含 24 个算例和离线底图，运行时不需要外网。
- 若通过 Git 或遵守 `.gitignore` 的压缩包传递，`node_modules`、`dist`、`.env.local` 不会带上。请先在目标机安装依赖，再把 `.env.example` 复制为 `.env.local`（当前默认就是离线配置），并确认 `public/offline-basemap` 一起拷贝/提交。
- 页面必须从 HTTP 服务的**根路径**访问；部署到子路径需要重新配置 Vite `base`，否则 `/data` 和 `/offline-basemap` 会 404。
- 中文地名依赖系统字体（MapLibre 本地字形渲染）：Windows/macOS 自带中文字体；精简版 Linux 需安装 Noto CJK 等字体。地图渲染还需要浏览器支持 WebGL。
- Windows PowerShell 若报 `npm.ps1 禁止运行`，使用 `npm.cmd run dev`、Git Bash，或执行 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。

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

### 离线底图（仓库内置）

仓库已包含日月湾演示区域的离线矢量底图：`public/offline-basemap/`，含 z4–z14 共 1157 个 Protomaps 矢量瓦片、深色/亮色两套带地名标注的样式、本地字形切片和 `provenance.json`。启用方式（当前 `.env.local` 已按此配置）：

```env
VITE_WRJ_BASEMAP_MODE=local
VITE_WRJ_LOCAL_STYLE_URL=/offline-basemap/style-dark.json
VITE_WRJ_LOCAL_LIGHT_STYLE_URL=/offline-basemap/style-light.json
VITE_WRJ_LOCAL_ATTRIBUTION=© OpenStreetMap contributors · Protomaps
```

`VITE_WRJ_LOCAL_LIGHT_STYLE_URL` 可选；配置后深浅两种底图都只请求本站资源，不再访问 CARTO、OpenStreetMap 或 Mapbox。样式包含国家、省/州、市、县、乡镇、村庄以及海湾、水库、河流的名称标注；中文汉字由 MapLibre 使用系统字体本地渲染（`localIdeographFontFamily` 默认 `sans-serif`），Latin、越南语和标点字形使用本地 Noto Sans 切片（`public/offline-basemap/glyphs/`，SIL OFL 1.1）。样式中的根相对瓦片和字形地址会在浏览器启动时补全为页面 origin（MapLibre 在 Worker 内无法解析相对 URL）。覆盖范围分级：z4–z8 覆盖 `105–116°E, 14–23°N` 的广域视角，z9–z11 覆盖任务周边，z12–z14 覆盖算例区域 `109.92–110.55°E, 18.38–18.87°N`；超出范围的区域显示样式背景色。

重新生成需要联网一次，向 Protomaps 每日构建按 bbox 提取 OpenStreetMap 数据（ODbL），并从 MapLibre 演示字体服务下载 Noto Sans 字形切片：

```powershell
npm run data:build-offline-basemap
```

只调整样式或标注、复用已有瓦片时：

```powershell
npm run data:styles-offline-basemap
```

默认数据源为 `https://build.protomaps.com/20240624.pmtiles`，可用环境变量 `PROTOMAPS_PMTILES_URL` 覆盖。脚本会重写 `public/offline-basemap/` 下的瓦片、样式、字形和来源记录。离线运行不需要外网，但页面仍需通过 HTTP 服务访问（`npm run dev` 或 `npm run preview`）。

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

### Task 2 动态重规划场景

仓库提交了四个可离线使用的真实算法场景：无人机失联、低油量返航、临时新增侦察区和硬截止安全回退。启动应用后，使用顶部“任务二 动态重规划”切换进入演示；场景默认暂停，点击播放后才开始推进。

重新生成数据时，必须显式提供 Task 1 源仓库和 Task 2 源版本：

```powershell
$env:WRJ_TASK1_ROOT = "D:\path\to\wrj-task1"
$env:WRJ_TASK2_COMMIT = "Task 2 的真实 Git 提交号"
if ([string]::IsNullOrWhiteSpace($env:WRJ_TASK1_ROOT)) {
  throw "WRJ_TASK1_ROOT is required"
}
if ([string]::IsNullOrWhiteSpace($env:WRJ_TASK2_COMMIT)) {
  throw "WRJ_TASK2_COMMIT is required"
}

Push-Location ..\wrj-t2-main
task2-replan export-demo-scenes `
  --baseline-run tests/contract/R01-BASELINE-01 `
  --source-case "$env:WRJ_TASK1_ROOT/input/cases/R01-BASELINE-01" `
  --output ../wrj-recon-kepler/.generated/task2-scenes `
  --task2-commit $env:WRJ_TASK2_COMMIT `
  --generated-at 2026-07-30T00:00:00Z
Pop-Location

npm run data:prepare-task2 -- --input .generated/task2-scenes
npm run data:check-task2 -- --input .generated/task2-scenes
```

若拿到的是不含 `.git` 的源码归档，应把 `WRJ_TASK2_COMMIT` 设为明确的归档版本标识（例如本次导入使用的 `unversioned-wrj-t2-main`），不要伪造提交号。导出命令中的 `demoTimeSec` 会生成 `SIMULATED` 运行快照，仅用于可复现演示，不代表实时遥测。

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
