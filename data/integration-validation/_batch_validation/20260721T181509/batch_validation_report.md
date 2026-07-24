# WRJ 任务一剩余场景批量验证报告

- 开始时间：2026-07-21T18:15:09+08:00
- 执行场景数：11
- PASS：0
- CHECK：0
- FAIL：11
- 默认跳过：R02-CONVEX-STANDARD-01, R08-TRANSIT-OBSTACLE-01, R12-DYNAMIC-ENTRY-OBSTACLE-01

> 已知限制：本次检查位置连续性，但不检查转场段与覆盖段连接处的航向连续性；该问题留待完整航迹组装阶段处理。

## 汇总

| 场景 | 状态 | 可行 | 分数 | 分配/轨迹 | 阵地 | ENTRY 段/弧 | RETURN 段/弧 | 位置断点 | 出动重叠 | 错误码 |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| R03-CONVEX-ROTATED-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R04-CONVEX-LONG-NARROW-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R05-CONVEX-WIDE-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R06-CIRCLE-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R07-MULTI-BASE-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R09-MULTI-OBSTACLE-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R10-LONG-TRANSIT-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R11-LARGE-REGION-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R12-RETURN-RANDOM-OBSTACLES-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R13-DUAL-BASE-ENTRY-OBSTACLES-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |
| R14-ELLIPSE-VERTICAL-RIGHT-10-01 | FAIL |  |  | 0/0 |  | 0/0 | 0/0 | 0 | 0 |  |

## 需要处理的场景

### R03-CONVEX-ROTATED-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R03-CONVEX-ROTATED-01.log`

### R04-CONVEX-LONG-NARROW-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R04-CONVEX-LONG-NARROW-01.log`

### R05-CONVEX-WIDE-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R05-CONVEX-WIDE-01.log`

### R06-CIRCLE-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R06-CIRCLE-01.log`

### R07-MULTI-BASE-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R07-MULTI-BASE-01.log`

### R09-MULTI-OBSTACLE-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R09-MULTI-OBSTACLE-01.log`

### R10-LONG-TRANSIT-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R10-LONG-TRANSIT-01.log`

### R11-LARGE-REGION-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R11-LARGE-REGION-01.log`

### R12-RETURN-RANDOM-OBSTACLES-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R12-RETURN-RANDOM-OBSTACLES-01.log`

### R13-DUAL-BASE-ENTRY-OBSTACLES-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R13-DUAL-BASE-ENTRY-OBSTACLES-01.log`

### R14-ELLIPSE-VERTICAL-RIGHT-10-01 — FAIL

- 错误码：无
- 说明：ModuleNotFoundError: No module named 'common'
- 日志：`C:\Users\zxysg\Desktop\wrj_static_recon_demo_task1_v1.0\wrj_static_recon_demo\output\integration-validation\_batch_validation\20260721T181509\logs\R14-ELLIPSE-VERTICAL-RIGHT-10-01.log`

## 判定口径

- PASS：主流程返回 0、任务可行、存在轨迹、无无效航段、位置连续、同机出动不重叠。
- CHECK：主流程成功，但结构检查存在需人工确认的项目。
- FAIL：主流程异常退出、没有生成 mission_plan.json，或结果无法解析。
