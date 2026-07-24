# WRJ 任务一剩余场景批量验证报告

- 开始时间：2026-07-21T18:22:12+08:00
- 执行场景数：1
- PASS：1
- CHECK：0
- FAIL：0
- 默认跳过：R02-CONVEX-STANDARD-01, R04-CONVEX-LONG-NARROW-01, R05-CONVEX-WIDE-01, R06-CIRCLE-01, R07-MULTI-BASE-01, R08-TRANSIT-OBSTACLE-01, R09-MULTI-OBSTACLE-01, R10-LONG-TRANSIT-01, R11-LARGE-REGION-01

> 已知限制：本次检查位置连续性，但不检查转场段与覆盖段连接处的航向连续性；该问题留待完整航迹组装阶段处理。

## 汇总

| 场景 | 状态 | 可行 | 分数 | 分配/轨迹 | 阵地 | ENTRY 段/弧 | RETURN 段/弧 | 位置断点 | 出动重叠 | 错误码 |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| R03-CONVEX-ROTATED-01 | PASS | True | 11.982182049291712 | 3/3 | BASE-01 | 3/0 | 3/0 | 0 | 0 |  |
## 判定口径

- PASS：主流程返回 0、任务可行、存在轨迹、无无效航段、位置连续、同机出动不重叠。
- CHECK：主流程成功，但结构检查存在需人工确认的项目。
- FAIL：主流程异常退出、没有生成 mission_plan.json，或结果无法解析。
