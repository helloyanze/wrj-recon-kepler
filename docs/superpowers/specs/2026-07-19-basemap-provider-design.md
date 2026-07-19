# WRJ 多来源底图改造设计

## 目标

在不破坏六个固定 Dataset、Trip、三维视角和现有 Kepler 配置的前提下，移除 Mapbox Token 对应用启动的硬阻断，支持 Mapbox、无需用户 Key 的公共在线底图，以及本地地图服务。

## 选择策略

新增 `VITE_WRJ_BASEMAP_MODE`，允许 `auto`、`public`、`local`、`mapbox`，默认值为 `auto`。

`auto` 按以下顺序选择：

1. 配置了本地 Style JSON URL 或本地 XYZ URL 时使用本地地图。
2. 否则，存在 `VITE_MAPBOX_TOKEN` 时使用 Mapbox。
3. 否则使用无需用户 Key 的公共地图。

显式选择 `local` 或 `mapbox` 但缺少必要配置时，显示可诊断的配置错误，不静默改变用户选择。显式选择 `public` 时，即使存在 Mapbox Token 也使用公共地图。

## 环境变量

```env
VITE_WRJ_BASEMAP_MODE=auto
VITE_MAPBOX_TOKEN=
VITE_WRJ_LOCAL_STYLE_URL=
VITE_WRJ_LOCAL_TILE_URL=
VITE_WRJ_LOCAL_ATTRIBUTION=本地地图数据
VITE_WRJ_KEPLER_DEBUG=false
VITE_WRJ_DATA_BASE=/data
```

本地 Style JSON 与 XYZ URL 二选一；两者同时存在时优先 Style JSON。XYZ URL 必须包含 `{z}`、`{x}`、`{y}` 占位符。

## 架构

新增纯配置模块 `src/basemap/basemapConfig.ts`，负责：

- 校验环境配置；
- 实现 `auto` 优先级；
- 为公共地图和本地 XYZ 构造 Mapbox Style Specification v8 对象；
- 加载并校验本地 Style JSON；
- 输出统一的 `ResolvedBasemap`。

`ResolvedBasemap` 包含提供商类型、Mapbox Token、两个工作台按钮的标签、初始样式 ID、归属文本、可选的 Kepler `mapStyles` 以及 `mapStylesReplaceDefault`。

Kepler 内部继续使用 `satellite` 和 `light` 两个稳定样式 ID：

- Mapbox：沿用内置卫星和浅色样式；
- public：`satellite` 映射为 CARTO Voyager，`light` 映射为 OSM；
- local：`satellite` 映射为本地 Style/XYZ，`light` 映射为 OSM 公共备用。

保持稳定 ID 可以避免修改已固化的 `wrj-kepler-config.json`、底图切换动作和已有测试数据。

## 组件与数据流

`App` 在启动时解析底图配置：

1. 同步模式直接得到公共、Mapbox 或本地 XYZ 配置。
2. 本地 Style URL 通过可取消请求加载。
3. 加载期间显示底图配置准备状态。
4. 成功后将 `ResolvedBasemap` 传入 `Workspace` 和 `WrjKeplerMap`。
5. 失败时显示具体 URL、HTTP 状态或格式原因，并支持重试。

`WrjKeplerMap` 将解析结果传给 Kepler：Mapbox 模式传真实 Token；公共和本地模式传空字符串，并通过 `mapStyles` 与 `mapStylesReplaceDefault` 替换默认底图。

`Workspace` 使用解析后的按钮标签、提供商状态和归属信息，不再固定显示“Mapbox 已配置”或 `© Mapbox`。

## 公共地图

公共模式不依赖项目用户提供 Key：

- 主底图：CARTO Voyager XYZ；
- 简洁备用：OpenStreetMap XYZ。

两者均使用内联 raster Style v8，避免额外 Style JSON 请求。界面始终显示对应数据归属。公共服务受其服务政策和可用性约束；生产或高并发部署建议使用本地地图服务。

## 本地地图服务

支持两种输入：

- Style JSON URL：获取后要求根对象 `version: 8` 且包含 `sources` 和 `layers`；其 glyphs、sprites 和 tile URL 由该 Style 自行声明。
- XYZ raster：根据 URL 构造 256 像素 raster source 和 raster layer。

本地服务必须允许浏览器访问，并正确配置 CORS。首期不加入 WMS、WMTS、PMTiles 协议适配或地图服务管理界面。

## 错误处理

- 非法模式、缺失显式模式配置、XYZ 占位符不完整、本地 Style HTTP 错误、非法 JSON 和不兼容 Style 均返回中文可操作错误。
- 请求使用 `AbortController`，卸载和重试时取消旧请求。
- 公共模式不依赖本地 Style 请求；公共服务瓦片运行期错误由 Kepler 地图错误状态呈现。
- Mapbox 模式仍要求 Token，但只在用户显式选择 Mapbox 时阻断。

## 测试与验收

按 TDD 依次覆盖：

1. `auto` 的本地、Mapbox、公共优先级；
2. 显式模式覆盖与缺失配置错误；
3. 公共 raster Style 和本地 XYZ Style 契约；
4. 本地 Style 成功、HTTP 错误、非法 JSON、取消和结构校验；
5. 无 Token 时应用进入公共工作台；
6. Kepler 接收空 Token、自定义 `mapStyles` 和替换默认样式标记；
7. 工作台按钮标签、动作地址和动态归属；
8. 现有 35 项测试无回归；
9. `data:validate`、lint、typecheck、全量测试与生产构建通过。

浏览器验收至少覆盖无 Token 公共模式和本地 XYZ 模式；Mapbox 真实 Token 验收仍按原 P0 清单独立执行。
