# UAV 动画图标与航迹线宽控制设计

## 背景与目标

当前动态 Trip 已能计算 UAV-01、UAV-02、UAV-03 在各自四维航迹上的实时位置，并通过独立的 Deck.gl `IconLayer` 叠加无人机标记。运行时图层、坐标、颜色和尺寸状态均正常，但图标纹理为空，地图上只能看到 Trip 的高亮头部和尾迹。

本次改动实现两个目标：

1. 修复三架无人机图标不可见的问题，保持图标颜色与对应 Trip 航迹一致，并继续支持运行时缩放。
2. 让模拟侦察条带、模拟规划航迹和模拟 Trip 的线宽更容易发现和调整，修改即时生效且刷新后恢复。

## 官方能力边界

Kepler.gl Trip 图层负责按时间播放路径，公开配置仅包含颜色、线宽、尾迹长度和动画速度等属性，并不提供“路径头部图标”。Icon 图层是独立的点数据图层，也不会自动追踪 Trip 当前时间。因此项目继续采用现有方案：Kepler Trip 负责航迹动画，独立 Deck.gl `IconLayer` 根据同一时间状态计算并绘制三架 UAV。

World Flights 示例的官方配置只包含 Trip 和静态 GeoJSON 路径，并使用 additive blending；其明亮的轨迹头部是渲染效果，不是飞机图标。

## 图标修复设计

保留 `public/assets/uav-fixed-wing-mask.svg` 作为单一白色蒙版资源。SVG 根元素增加显式的 `width="64"` 和 `height="64"`，同时保留 `viewBox="0 0 64 64"`。这使 Deck.gl 的图像加载器能稳定确定固有尺寸并生成非空的自动图集纹理。

`IconLayer` 继续使用：

- `mask: true`，由 `getColor` 在运行时为 UAV-01、UAV-02、UAV-03 分别着色；
- 像素单位和 billboard 朝向，使图标在三维地图旋转时仍清晰可见；
- 当前 Trip 时间与现有插值函数，保证三架图标沿各自航迹同步移动；
- 已有图标大小偏好，不引入第二套尺寸状态。

不把 SVG 转为固定彩色位图，也不修改六个 Kepler Dataset 或重新注入数据。

## 线宽交互设计

三类线图层的展开编辑器直接显示线宽控件：

- 模拟侦察条带；
- 模拟规划航迹；
- 模拟 Trip。

线宽从折叠的“高级设置”移到“基础”设置区，使用范围滑块，范围为 `0.5–20 px`、步长为 `0.5 px`，旁边显示当前数值。颜色、不透明度和线宽构成常用视觉设置；Trip 尾迹长度、区域填充/描边、点半径等低频能力继续留在高级设置。

控件不创建独立地图状态。变更继续通过现有类型安全 Kepler action 更新目标图层的 `visConfig.thickness`，随后沿用 `wrj-layer-preferences:v1:riyue-3d` 偏好管线保存。调整线宽不得重新注入 Dataset、重置视角或中断 Trip 播放。

为了避免现有旧偏好产生越界 UI，展示值限制在 `0.5–20 px`；用户通过新控件写入的值始终位于该范围。其他高级数值的既有持久化契约不改变。

## 组件和数据流

`LayerSidebar` 根据每个 `LayerViewModel.definition.capabilities` 判断是否支持 `thickness`。支持时在基础设置区渲染通用线宽控件，并通过现有 `onLayerChange(layerId, {thickness})` 回调上报。

数据流保持为：

1. 用户移动线宽滑块；
2. `LayerSidebar` 上报目标 Layer ID 和 thickness；
3. Workspace 现有适配器分发 Kepler `layerVisConfigChange`；
4. Kepler Redux 状态和地图画布即时更新；
5. 经过校验的偏好写入本地存储。

图标的数据流保持为 Trip 时间状态到 UAV 位置插值，再到 Deck.gl `IconLayer`；本次仅修复资源可加载性。

## 错误处理与兼容性

- SVG 仍为无脚本、无 `foreignObject` 的本地静态资源；加载失败不会影响 Kepler Trip 本身播放。
- 无效、非有限或超出范围的线宽不向 Kepler 分发。
- 不改变偏好版本、Dataset ID、Layer ID、Trip 时间单位转换或 UAV 配色映射。
- 普通模式和调试模式使用同一侧栏线宽控制；调试模式仍可使用 Kepler 原生高级配置。

## 测试与验收

实施遵循测试驱动流程：

1. 先增加 SVG 固有宽高断言并确认测试因缺少属性失败，再补充 SVG 属性使其通过。
2. 先增加三类线图层均在基础区域显示线宽滑块、范围正确并分发数值的组件测试，再修改组件。
3. 保留并运行现有 Kepler action、偏好持久化、时间插值和三 UAV 配色测试。
4. 执行 `npm run lint`、`npm run typecheck`、`npm run test:run` 和 `npm run build`。
5. 在浏览器中确认三架不同颜色的无人机图标同时可见并随各自航迹移动；分别调整条带、规划航迹和 Trip 线宽，确认即时生效、刷新恢复且动画不中断。

## 非目标

- 不修改 Kepler.gl 或 Deck.gl 源码。
- 不把 World Flights 的高亮头部误作可配置图标能力。
- 不新增 UAV 模型、姿态仿真、飞控接口或任务编辑功能。
- 不改变图层顺序、数据格式、地图底图和详情抽屉结构。
