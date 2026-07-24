# 算法算例三维工作台验证记录

验证日期：2026-07-24
验证分支：`codex/algorithm-case-3d`
验证环境：Windows、Node.js v20.19.3、npm 10.8.2

## 验证结论

算法输出到浏览器算例包的离线链路通过自动化验收。提交目录包含 11 个有效算例，默认算例为 `R10-LONG-TRANSIT-01`；R10 的运行时 schema、任务指标、出动顺序、条带归属、四维时间单调性和无人机动画状态均由集成测试直接读取提交的数据文件验证。

本记录不声称已完成人工浏览器视觉验收。三维画面、交互手感、两档分辨率和 Chrome/Edge 行为仍由主代理在本地预览中确认。

## 数据路径与生成一致性

- 原始算法输出（只读）：`D:\UserData\Desktop\wrj-recon-kepler-demo\data\integration-validation`
- 前端提交数据：`public/data/integration-cases`
- 目录：`public/data/integration-cases/catalog.json`
- 默认数据包：`public/data/integration-cases/R10-LONG-TRANSIT-01/bundle.json`
- 数据检查使用显式 `--input-root`、`--output-root` 和 `--default-case`，未依赖工作树中不存在的默认原始数据目录。

执行的检查命令：

```powershell
npm run data:check-algorithm -- --input-root "D:\UserData\Desktop\wrj-recon-kepler-demo\data\integration-validation" --output-root "D:\UserData\Desktop\wrj-recon-kepler-demo\.worktrees\algorithm-case-3d\public\data\integration-cases" --default-case R10-LONG-TRANSIT-01
```

实际结果：11 个有效算例、12 个生成文件、默认 R10，退出码 0。脚本报告 8 条诊断：

- 5 条旧运行或无效算例被跳过：R01 两个无效运行、R08、R09、R10 的旧重叠运行。
- 3 条 R06 同一 UAV 的轻微时序重叠警告被保留；生成器未擅自改写算法时间。

有效算例为 R01、R02、R03、R04、R05、R06、R07、R10、R11、R13 和 R14，共 11 个。

## R10 权威指标

| 项目 | 验证值 |
|---|---:|
| 物理 UAV | 2 |
| 架次 | 5 |
| 批次 | 3 |
| 侦察条带 | 20 |
| 任务完成时间 | 3598.1854630795783 s（界面三位小数为 3598.185 s） |
| 批次启动时间 | 0、1206.8012326151713、2415.7880691465657 s |
| 最大真实高度 | 2900 m |
| 最大算法速度 | 223.702 m/s |

集成测试还确认：

- 20 个条带 ID 唯一，每个条带恰好属于一个架次及其对应 UAV。
- 每个架次的最后分段不超过 makespan `1e-3 s` 容差。
- 所有分段的四维 `timedPath` 时间非递减。
- `CaseBundleV2` 完整运行时 schema 校验通过，`validation.valid` 为 `true` 且无 failure code。
- 动画在 0 秒显示首批 2 架次；1206.8 秒处于批次间隔；按原始完整精度到达第二批启动时显示 2 架次，到达第三批启动时显示 1 架次。
- 最终无人机进入 3 秒 `landed` 淡出窗口，随后转为 `completed` 并隐藏。
- 速度直接使用算法分段的 `speedMps`，不由播放倍速或屏幕位移反算。

首次 RED 测试使用三位小数作严格相等比较，暴露出原始算法保留的更高时间精度。最终测试以完整精度驱动动画边界，以三位小数作展示近似。最后分段结束时间与汇总 makespan 的差异约为 `4.55e-13 s`，属于浮点计算精度，边界测试使用分段自身的精确结束时间。

## 坐标与三维表达边界

算法坐标是本地平面米制坐标，不包含真实地理配准。转换器在不改变相对距离和执行顺序的前提下，将数据中心锚定到：

- 经度：110.235
- 纬度：18.625
- X 轴：向东
- Y 轴：向北

这意味着底图位置是演示锚定，不可解释为算法输出的真实经纬度，也不可用于真实飞行。

Deck 图层以真实算法高度绘制路线、Trip 和三角无人机，支持 `1×`、`2×`、`4×` 垂直夸张；任务区与条带保持海平面高度。初始视角使用 `pitch: 55`、`bearing: -18`，因此航迹和高度可三维观察。

当前公共/本地底图仍是平面瓦片或样式底图，不包含地形高程模型、建筑挤出或地表碰撞。这里的“三维”指带 Z 高度的 Deck 航迹、尾迹和无人机标记叠加在可倾斜地图上，不等同于真实地形仿真。

## 自动化矩阵

| 检查 | 实际结果 |
|---|---|
| 显式原始数据检查 | 通过；11 cases、12 files、8 diagnostics |
| `npm run lint` | 通过；退出码 0 |
| `npm run typecheck` | 通过；退出码 0 |
| `npm run test:run` | 通过；33 个测试文件、401 个测试、0 失败，10.76 s |
| `npm run build` | 通过；5247 个模块，28.73 s |

主要生产产物：

- 主 JS：11669.30 kB，gzip 3084.77 kB
- 导入 Worker：102.92 kB
- CSS：16.02 kB，gzip 3.78 kB
- Parquet WASM：5493.39 kB

构建保留以下非阻断警告：

- Kepler 传递依赖中的 Node `assert` 和 `events` 被 Vite externalize。
- `react-virtualized` 的模块级 Flow 指令被忽略。
- 主 chunk 超过 500 kB，Vite 建议后续按需拆包。

这些警告未导致类型、测试或构建失败，但主包体积较大，内部部署时应确认静态服务器压缩和缓存配置。

## 待主代理浏览器验收

- [ ] 默认打开 R10，算例选择器列出 11 个内置有效算例。
- [ ] 首批、第二批、第三批按原始时间依次出现，无人机方向随航向变化。
- [ ] 三角标记颜色与对应路线、Trip 一致，降落后 3 秒淡出。
- [ ] 暂停、继续、拖动时间轴和 1×/10×/30×/60× 播放不改变算法速度读数。
- [ ] 1×/2×/4× 高度比例、地图倾斜、旋转、缩放和重置视角正常。
- [ ] 区域、条带、路线和 Trip 的显隐、透明度、宽度及颜色修改即时生效。
- [ ] 上传符合固定格式的 ZIP 后可加载、切换和删除导入算例。
- [ ] 1920×1080 与 1366×768 布局无关键控件遮挡。
- [ ] Chrome 与 Edge 的 WebGL/Deck 渲染正常。
