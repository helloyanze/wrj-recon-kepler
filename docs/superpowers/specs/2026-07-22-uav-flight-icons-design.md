# WRJ 三机飞行动画设计

## 目标

在现有 Kepler Trip 播放中同时显示 UAV-01、UAV-02、UAV-03 三架高速固定翼无人机图标。图标必须沿各自四维航迹移动、随航向旋转，并在地图缩放、旋转和俯仰时保持地理位置对齐。

## 视觉设计

- 创建一枚代码原生的俯视固定翼高速无人机 SVG 蒙版：清晰箭头式轮廓，无文字、无背景、无水印，不写死显示颜色。
- 三架无人机复用同一 SVG，由 Deck.gl `getColor` 使用 UAV-01、UAV-02、UAV-03 当前 Trip 色板逐架着色，图标颜色与对应航迹完全一致。
- 默认地图显示尺寸为 32 px，并在“模拟 Trip → 高级设置”提供 16–64 px 图标大小滑块；修改立即生效并持久化。
- 图标保持紧凑，不遮挡航迹、Tooltip 或 Trip 时间轴。

## 数据与动画

- 从算例包中 `wrj-simulated-trips` CSV 的 `_geojson` 字段提取三条四维坐标序列 `[longitude, latitude, altitude, timestamp]`。
- 以 `keplerGl["wrj-map"].visState.animationConfig.currentTime` 作为唯一播放时间来源。
- 在相邻采样点之间线性插值经纬度和高度；以相邻点计算航向。
- 时间为空时显示在各航迹起点；时间超出单架航迹范围时钳制到首尾点。
- 不创建独立计时器，不改变 Trip 播放速度、当前时间或数据集。

## Kepler 集成

- 通过 Kepler 3.2.6 `topMapContainerProps.deckRenderCallbacks.onDeckRender` 在现有 Deck.gl layers 后追加无人机图标与光环层。
- 不增加第七个业务 Dataset，不重新注入算例，不替换现有 Trip layer。
- 地图视口、投影、pitch 与 bearing 由同一个 Deck.gl 渲染上下文处理，避免 DOM 覆盖层的投影漂移。
- `wrj-trip-layer` 隐藏时无人机图标同时隐藏；恢复显示后按当前播放时间重新出现。
- 光环颜色读取 Trip 图层当前 `uav_id` ordinal 色带，用户修改 Trip 三机配色后同步更新。
- SVG 作为 `mask: true` 的图标资源使用，使 Deck.gl 能在不重新加载资产的情况下精确换色。

## 组件边界

- `flightPaths.ts`：从已加载 Trip 数据提取、校验和标准化三条路径。
- `flightInterpolation.ts`：纯函数完成时间钳制、位置插值与航向计算。
- `UavDeckOverlay`/Deck 回调：只把当前状态转换为 Deck.gl 图层，不管理业务时间。
- `Workspace`：加载成功后将 flight paths 传给地图组件。
- `WrjKeplerMap`：订阅当前时间、Trip 显隐和色板，并追加渲染层。
- 图层偏好：为 Trip 增加 `iconSize` 高级参数，限制为 16–64 px，并纳入现有版本化本地持久化和恢复默认流程。

## 错误与降级

- 单条路径非法或缺失时仅跳过对应无人机，不影响 Kepler 地图和其余两架。
- 图标资产加载失败时 Trip 航迹仍正常播放。
- 所有图标层关闭拾取，不干扰 Kepler Tooltip 和地图操作。

## 验收

- 三架无人机同时出现，分别沿各自航迹移动并正确旋转。
- 播放、暂停、拖动时间轴时图标与 Trip 同步，无额外重置。
- 地图缩放、旋转和俯仰后图标仍贴合航迹。
- Trip 显隐和三机配色修改即时同步。
- Trip 高级设置可在 16–64 px 内调整图标大小，刷新后恢复，恢复默认时回到 32 px。
- 1920×1080 与 1366×768 下图标清晰且不遮挡主控件。
- 单元测试覆盖路径解析、插值、边界时间、航向和非法数据；组件测试覆盖三机层、显隐、配色与动画时间传递。
