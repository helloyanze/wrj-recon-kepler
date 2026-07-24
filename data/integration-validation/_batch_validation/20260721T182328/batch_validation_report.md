# WRJ 任务一剩余场景批量验证报告

- 开始时间：2026-07-21T18:23:28+08:00
- 执行场景数：9
- PASS：6
- CHECK：1
- FAIL：2
- 默认跳过：R02-CONVEX-STANDARD-01, R03-CONVEX-ROTATED-01, R08-TRANSIT-OBSTACLE-01, R12-RETURN-RANDOM-OBSTACLES-01

> 已知限制：本次检查位置连续性，但不检查转场段与覆盖段连接处的航向连续性；该问题留待完整航迹组装阶段处理。

## 汇总

| 场景 | 状态 | 可行 | 分数 | 分配/轨迹 | 阵地 | ENTRY 段/弧 | RETURN 段/弧 | 位置断点 | 出动重叠 | 错误码 |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| R04-CONVEX-LONG-NARROW-01 | PASS | True | 14.024420756964444 | 2/2 | BASE-01 | 2/0 | 2/0 | 0 | 0 |  |
| R05-CONVEX-WIDE-01 | PASS | True | 12.128120934518819 | 5/5 | BASE-01 | 5/0 | 5/0 | 0 | 0 |  |
| R06-CIRCLE-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R07-MULTI-BASE-01 | PASS | True | 11.94033990210406 | 4/4 | BASE-02 | 4/0 | 4/0 | 0 | 0 |  |
| R09-MULTI-OBSTACLE-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 | E509_TRANSIT_NO_DETOUR_PATH |
| R10-LONG-TRANSIT-01 | CHECK | True | 12.782548502372869 | 5/5 | BASE-01 | 5/0 | 5/0 | 0 | 3 |  |
| R11-LARGE-REGION-01 | PASS | True | 14.488956464172288 | 6/6 | BASE-02 | 6/0 | 6/0 | 0 | 0 |  |
| R13-DUAL-BASE-ENTRY-OBSTACLES-01 | PASS | True | 12.138334090192473 | 5/5 | BASE-02 | 17/9 | 23/9 | 0 | 0 |  |
| R14-ELLIPSE-VERTICAL-RIGHT-10-01 | PASS | True | 14.214822701240193 | 4/4 | BASE-01 | 4/0 | 4/0 | 0 | 0 |  |

## 需要处理的场景

### R06-CIRCLE-01 — FAIL

- 错误码：无
- 说明：AttributeError: 'Point2D' object has no attribute 'x'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T182328\logs\R06-CIRCLE-01.log`

### R09-MULTI-OBSTACLE-01 — FAIL

- 错误码：E509_TRANSIT_NO_DETOUR_PATH
- 说明：E509_TRANSIT_NO_DETOUR_PATH: No visibility-graph path between transit endpoints; details={'start': {'xM': 5000.0, 'yM': 5000.0}, 'goal': {'xM': 37000.47465079103, 'yM': 21260.8228385422}, 'obstacleIds': ['OBS-001', 'OBS-002', 'OBS-003'], 'minimumClearanceM': 300.0}
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T182328\logs\R09-MULTI-OBSTACLE-01.log`

### R10-LONG-TRANSIT-01 — CHECK

- 错误码：无
- 说明：结构检查未完全通过
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T182328\logs\R10-LONG-TRANSIT-01.log`

## 判定口径

- PASS：主流程返回 0、任务可行、存在轨迹、无无效航段、位置连续、同机出动不重叠。
- CHECK：主流程成功，但结构检查存在需人工确认的项目。
- FAIL：主流程异常退出、没有生成 mission_plan.json，或结果无法解析。
