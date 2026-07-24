# WRJ 无 Key 深色/亮色底图设计

## 目标

在不配置 Mapbox Token 的公共底图模式下，将当前“公共地图 / OSM 简洁图”切换改为“深色地图 / 亮色地图”。深色视觉接近 Mapbox Dark，保持现有 Kepler、算法算例、三维航迹、动画时钟和图层偏好不变。

## 方案

公共模式使用 CARTO 的两套公开栅格底图：

- 深色地图：Dark Matter，瓦片样式 `dark_all`。
- 亮色地图：Positron，瓦片样式 `light_all`。

两套底图均通过 HTTPS XYZ 瓦片加载，不需要 Mapbox Key。界面继续显示 `© OpenStreetMap contributors · © CARTO`。

Kepler 内部继续保留稳定样式 ID：

- `satellite` 映射到深色地图；
- `light` 映射到亮色地图。

保留内部 ID 可以避免修改 Kepler action、已有配置和算例数据。工作台默认仍选择 `satellite`，因此公共模式默认进入深色地图。

## 范围

本次修改仅影响公共底图模式：

- 将 CARTO Voyager 替换为 Dark Matter；
- 将 OSM 标准瓦片替换为 CARTO Positron；
- 顶部按钮改为“深色地图”和“亮色地图”；
- 两种样式使用各自正确的 CARTO/OSM 归属；
- 更新底图单元测试、工作台组件测试和浏览器验收记录。

以下内容保持不变：

- Mapbox 模式；
- 本地 Style JSON / XYZ 模式；
- UI 面板自身的深色主题；
- 算法数据、航迹颜色、透明度、宽度和三维高度；
- 时间轴、三角无人机、算例导入和本地存储。

## 数据流

`resolveBasemap()` 在 `public` 模式返回两个内联 MapLibre Style v8。`Workspace` 继续通过 `mapStyleChange("satellite" | "light")` 切换样式，`WrjKeplerMap` 继续把 `mapStyles` 交给 Kepler。

样式切换只更新底图，不重新创建算法 Dataset、任务 Deck 图层或动画时钟。

## 错误与部署边界

CARTO 瓦片由最终用户浏览器直接访问，不经过 Vercel。外部瓦片不可用时，任务数据和工作台仍可加载，但底图可能为空；本次不增加代理、离线缓存或服务端瓦片回退。

Vercel 部署继续使用公共模式且无需设置 `VITE_MAPBOX_TOKEN`。如果以后需要受控或离线地图，沿用现有 `VITE_WRJ_BASEMAP_MODE=local` 接入本地 Style JSON 或 XYZ 服务。

## 测试与验收

- 先修改测试，确认旧 Voyager/OSM 配置产生预期失败。
- 验证公共模式返回 `dark_all` 与 `light_all` 两组 CARTO URL。
- 验证按钮显示“深色地图 / 亮色地图”并分发稳定样式 ID。
- 验证两种样式归属均为 OSM + CARTO。
- 验证切换底图不会重新加载算例或重置动画。
- 执行 lint、typecheck、全量测试和生产构建。
- 浏览器检查默认深色、切换亮色、切回深色，以及航迹和三角标记在两种背景上的辨识度。
