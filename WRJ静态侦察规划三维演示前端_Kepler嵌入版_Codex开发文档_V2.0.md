# WRJ 静态侦察规划三维演示前端
# Kepler.gl 嵌入版详细开发文档（Codex 直接执行版）

**文档版本：** V2.0  
**编制日期：** 2026-07-18  
**项目名称：** `wrj-recon-kepler-demo`  
**项目定位：** 单页面、固定算例、三维航迹、成果汇报演示前端  
**目标读者：** Codex 或其他代码开发 Agent  
**前置结论：** 不 Fork Kepler.gl Demo；在自主 React 页面中嵌入 Kepler.gl 组件  
**首要任务：** 必须先完成 P0 技术验证，通过后再继续完整页面开发  

---

# 0. Codex 总执行指令

Codex 读取本文档后，直接创建并开发完整项目，不再询问技术选型、页面数量、数据来源、视觉风格或是否需要后端。

必须遵守以下规则：

1. 在当前目录新建 `wrj-recon-kepler-demo/`。
2. 使用 React 18、TypeScript、Vite、Redux 和 Kepler.gl。
3. 使用 Kepler.gl `3.2.6` 稳定版本线，所有 `@kepler.gl/*` 包版本必须一致。
4. Node.js 使用 `20.x`，推荐 `20.19.x` 或更高的 Node 20 版本。
5. 不使用 Kepler.gl `3.3.0-alpha.*`。
6. 不 Fork Kepler.gl 官方 Demo，不通过 iframe 嵌入网站。
7. Kepler.gl 只负责地图、图层、三维视角和 Trip 动画。
8. WRJ 自己负责标题、算例切换、指标、无人机列表、详情和演示说明。
9. 第一版不开发登录、数据库、WebSocket、实时无人机通信、飞控控制或三维无人机模型。
10. 演示数据全部从 `public/data/` 自动加载，用户不需要手动上传文件。
11. 主页面默认只读，隐藏 Kepler.gl 数据上传和复杂分析面板。
12. 调试模式允许临时打开 Kepler.gl 侧边栏，用于配置图层并导出固定配置。
13. 使用现有日月湾三维多无人机航迹数据作为 P0 和第一版演示数据。
14. 地理位置是真实日月湾附近；任务边界和航迹是演示模拟，页面必须显示免责声明。
15. 所有 Mapbox Token 通过环境变量读取，禁止硬编码。
16. 缺少 Token 时必须显示明确错误页面，不能静默白屏。
17. 完成开发后必须执行：
    - `npm run lint`
    - `npm run typecheck`
    - `npm run test:run`
    - `npm run build`
18. 不允许只创建项目骨架，必须完成 P0、主页面、数据加载、图层、动画和测试。
19. 如果 P0 无法通过，停止后续开发，输出完整错误、复现步骤和已尝试解决方案。
20. 本文未说明的细节，采用“实现最少、依赖最少、演示最稳定”的方案。

---

# 1. 项目最终目标

开发一个独立的 WRJ 静态侦察规划三维演示页面，打开后自动加载固定算例，并显示：

- 真实卫星或地理底图；
- 日月湾附近的任务区域；
- 多架无人机负责的连续侦察条带；
- 曲线起飞爬升；
- 海上等待盘旋；
- 下降进入任务高度；
- 条带覆盖；
- 水滴形掉头；
- 曲线返航；
- 最终下降；
- 三架无人机不同的高度层；
- Trip 动画；
- 静态完整规划航迹；
- 已飞航迹或长尾迹；
- 任务指标和无人机信息。

目标展示效果：

```text
淡色完整任务规划线
+
高亮动态 Trip 航迹
+
三维高度变化
+
真实底图
+
WRJ 自己的指标、列表和说明面板
```

该项目仅用于项目汇报和算法效果演示，不用于真实飞行。

---

# 2. 页面范围

## 2.1 只开发一个主页面

页面结构：

```text
┌─────────────────────────────────────────────────────────────────┐
│ WRJ 静态侦察规划     算例选择     播放状态     重置三维视角      │
├─────────────────────────────────────────────────────────────────┤
│ 方案状态 │ 无人机数 │ 条带数 │ 覆盖率 │ 完成时间 │ 总航程        │
├──────────────┬──────────────────────────────┬───────────────────┤
│ 无人机列表    │                              │ 任务详情          │
│              │      Kepler.gl 三维地图       │                   │
│ UAV-01       │                              │ 高度、速度、航程  │
│ UAV-02       │                              │ 条带范围、时间    │
│ UAV-03       │                              │ 当前说明          │
├──────────────┴──────────────────────────────┴───────────────────┤
│ 区域准备 → 条带分配 → 起飞转场 → 覆盖侦察 → 返航 → 完成          │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 第一版只保留一个算例

P0 和第一版使用：

```text
日月湾三维多无人机侦察演示
```

完成基础功能后，再增加：

```text
基础多机侦察
障碍绕飞
资源不足
```

不能为了算例切换阻塞 P0。

## 2.3 不开发的内容

禁止主动加入：

- 登录和权限；
- 任务编辑器；
- 地图绘制工具；
- 数据上传入口；
- SQL Explorer；
- AI Assistant；
- 图层自由创建；
- 自定义筛选器；
- 导出中心；
- 云端保存；
- 数据库；
- API 后端；
- WebSocket；
- 实时无人机状态；
- MAVLink；
- 三维 glTF 无人机模型；
- 动态重规划；
- 多机避碰；
- 飞行执行控制；
- 移动端专用界面。

---

# 3. 依赖版本

## 3.1 固定基础环境

```text
Node.js: 20.x
npm: 与 Node 20 配套版本
React: 18.2.0
React DOM: 18.2.0
TypeScript: 5.6.3
Vite: 5.4.21
@vitejs/plugin-react: 4.7.0
Kepler.gl: 3.2.6
Redux: 4.2.1
React Redux: 8.1.3
```

## 3.2 初始化方式

不要直接使用当前最新 React 模板，因为可能默认安装 React 19。

执行：

```bash
mkdir wrj-recon-kepler-demo
cd wrj-recon-kepler-demo
npm init -y
```

然后安装：

```bash
npm install \
  react@18.2.0 \
  react-dom@18.2.0 \
  redux@4.2.1 \
  react-redux@8.1.3 \
  @kepler.gl/components@3.2.6 \
  @kepler.gl/reducers@3.2.6 \
  @kepler.gl/actions@3.2.6 \
  @kepler.gl/processors@3.2.6 \
  @kepler.gl/schemas@3.2.6 \
  @kepler.gl/types@3.2.6 \
  zod@3.23.8
```

开发依赖：

```bash
npm install -D \
  typescript@5.6.3 \
  vite@5.4.21 \
  @vitejs/plugin-react@4.7.0 \
  @types/react@18.3.12 \
  @types/react-dom@18.3.1 \
  eslint@9.16.0 \
  @eslint/js@9.16.0 \
  typescript-eslint@8.17.0 \
  vitest@2.1.8 \
  jsdom@25.0.1 \
  @testing-library/react@16.1.0 \
  @testing-library/jest-dom@6.6.3
```

安装完成后必须提交 `package-lock.json`。

---

# 4. package.json

至少包含：

```json
{
  "name": "wrj-recon-kepler-demo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "engines": {
    "node": ">=20 <21"
  }
}
```

---

# 5. 环境变量

项目根目录创建：

```text
.env.example
.env.local
```

`.env.example`：

```env
VITE_MAPBOX_TOKEN=
VITE_WRJ_KEPLER_DEBUG=false
VITE_WRJ_DATA_BASE=/data
```

读取规则：

```ts
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const debugMode = import.meta.env.VITE_WRJ_KEPLER_DEBUG === "true";
```

要求：

- `.env.local` 不提交；
- `.env.example` 提交；
- Token 缺失时显示 `TokenMissingPage`；
- 不允许将 Token 放进源代码或 JSON 配置；
- 生产构建通过部署平台环境变量注入 Token。

---

# 6. P0 技术验证

P0 是强制门槛。P0 通过前，不开发完整业务工作台。

## 6.1 P0 目标

完成一个最小页面，实现：

1. React 18 + Vite 正常启动；
2. Kepler.gl 组件嵌入成功；
3. Redux reducer 和中间件挂载成功；
4. 地图正常显示；
5. 自动加载一份三维无人机 Trip CSV；
6. 自动加载任务区域与参考条带 GeoJSON；
7. 地图自动定位到日月湾；
8. 能切换三维视角；
9. Trip 动画能播放；
10. 三架无人机按不同颜色显示；
11. 静态条带和 Trip 同时显示；
12. 页面刷新后无需用户上传文件；
13. 生产构建成功；
14. 缺失 Token 时显示错误说明而不是白屏。

## 6.2 P0 使用的数据

将以下两个文件复制到项目：

```text
public/data/riyue-3d/
├── trips.csv
└── support.geojson
```

文件来源：

```text
WRJ_日月湾三维多无人机航迹_Kepler航班示例格式.csv
WRJ_日月湾任务区域与参考条带.geojson
```

P0 加载 URL：

```text
/data/riyue-3d/trips.csv
/data/riyue-3d/support.geojson
```

## 6.3 P0 页面

P0 暂时允许显示 Kepler.gl 侧边栏，方便确认图层和导出配置。

页面仅包含：

```text
顶部：P0 状态、Token 状态、重新加载
主体：全屏 Kepler.gl
底部：数据加载错误
```

## 6.4 P0 通过标准

以下条件全部满足：

- [ ] 页面无白屏；
- [ ] 控制台没有未处理异常；
- [ ] 日月湾底图可见；
- [ ] 任务区域可见；
- [ ] 参考条带可见；
- [ ] 三架无人机 Trip 可见；
- [ ] Trip 动画可播放；
- [ ] 高度变化可在倾斜视角观察；
- [ ] 数据由程序自动加载；
- [ ] `npm run typecheck` 成功；
- [ ] `npm run build` 成功；
- [ ] 刷新页面后能够重新加载；
- [ ] Token 缺失页面正常；
- [ ] P0 结果记录在 `docs/P0_VALIDATION.md`。

## 6.5 P0 失败处理

如果出现以下情况，不继续 P1：

```text
Kepler.gl 与 Vite 无法构建
React 版本冲突
react-redux 重复版本导致 Provider 错误
Trip 图层无法识别
Mapbox Token 无法使用
数据加载后地图持续白屏
生产构建失败
```

必须在 `docs/P0_VALIDATION.md` 记录：

```text
错误现象
完整报错
Node/npm版本
依赖树
复现步骤
已尝试方案
最终结论
```

---

# 7. 项目目录

P0 通过后，项目调整为：

```text
wrj-recon-kepler-demo/
├── public/
│   ├── config/
│   │   └── wrj-kepler-config.json
│   └── data/
│       ├── cases.json
│       └── riyue-3d/
│           ├── trips.csv
│           ├── support.geojson
│           ├── planned-routes.geojson
│           └── summary.json
├── docs/
│   ├── P0_VALIDATION.md
│   ├── DATA_FORMAT.md
│   └── DEVELOPMENT_SPEC.md
├── src/
│   ├── app/
│   │   ├── store.ts
│   │   ├── rootReducer.ts
│   │   └── appTypes.ts
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── MetricGrid.tsx
│   │   ├── UavList.tsx
│   │   ├── WrjKeplerMap.tsx
│   │   ├── DetailPanel.tsx
│   │   ├── StepIndicator.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── DataNotice.tsx
│   │   ├── LoadingPanel.tsx
│   │   └── TokenMissingPage.tsx
│   ├── data/
│   │   ├── caseSchema.ts
│   │   ├── loadCase.ts
│   │   ├── loadText.ts
│   │   ├── loadJson.ts
│   │   └── types.ts
│   ├── kepler/
│   │   ├── constants.ts
│   │   ├── datasets.ts
│   │   ├── loadKeplerCase.ts
│   │   ├── keplerConfig.ts
│   │   ├── selectors.ts
│   │   └── mapActions.ts
│   ├── hooks/
│   │   ├── useContainerSize.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── utils/
│   │   ├── format.ts
│   │   ├── errors.ts
│   │   └── invariant.ts
│   ├── test/
│   │   └── setup.ts
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
├── tests/
│   ├── format.test.ts
│   ├── loaders.test.ts
│   ├── app.test.tsx
│   └── token.test.tsx
├── .env.example
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

---

# 8. Redux 与 Kepler.gl 初始化

## 8.1 store.ts

使用 Kepler.gl 提供的 reducer 和增强中间件。

```ts
import {
  applyMiddleware,
  combineReducers,
  compose,
  createStore
} from "redux";
import keplerGlReducer, {
  enhanceReduxMiddleware
} from "@kepler.gl/reducers";

const customizedKeplerReducer = keplerGlReducer.initialState({
  uiState: {
    readOnly: true,
    currentModal: null,
    mapControls: {
      visibleLayers: {
        show: false,
        active: false
      },
      mapLegend: {
        show: true,
        active: true
      },
      toggle3d: {
        show: true
      },
      splitMap: {
        show: false
      }
    }
  }
});

const rootReducer = combineReducers({
  keplerGl: customizedKeplerReducer
});

const middlewares = enhanceReduxMiddleware([]);
const enhancer = applyMiddleware(...middlewares);

export const store = createStore(
  rootReducer,
  {},
  compose(enhancer)
);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
```

调试模式需要不同的初始状态。建议创建：

```ts
function createKeplerReducer(debugMode: boolean) {
  return keplerGlReducer.initialState({
    uiState: {
      readOnly: !debugMode,
      currentModal: null,
      mapControls: {
        visibleLayers: {show: debugMode, active: false},
        mapLegend: {show: true, active: true},
        toggle3d: {show: true},
        splitMap: {show: false}
      }
    }
  });
}
```

注意：

- reducer 必须挂载在 `keplerGl`；
- 地图实例 ID 固定为 `wrj-map`；
- 如果 ID 改动，所有 `wrapTo` 调用和 selector 必须同步修改；
- 不能把业务页面状态全部放入 Kepler reducer；
- 第一版普通 React `useState` 足够管理业务状态。

---

# 9. main.tsx

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {Provider} from "react-redux";
import {store} from "./app/store";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
```

如果 React StrictMode 导致 P0 开发环境重复加载数据：

- 数据加载 Effect 必须可取消；
- 同一数据不能重复注入；
- 不允许直接删除 StrictMode 作为第一解决方案；
- 可通过 `loadedCaseRef` 或 Redux 当前 dataset 检查防止重复加载。

---

# 10. WrjKeplerMap

## 10.1 组件职责

`WrjKeplerMap.tsx` 只负责：

- 渲染 KeplerGl；
- 响应容器宽高；
- 传入 Token；
- 触发算例数据加载；
- 暴露地图加载状态。

不负责：

- 指标计算；
- 无人机业务逻辑；
- 错误码解释；
- 算例摘要。

## 10.2 组件示例

```tsx
import KeplerGl from "@kepler.gl/components";
import {useContainerSize} from "../hooks/useContainerSize";

interface WrjKeplerMapProps {
  mapboxToken: string;
}

export function WrjKeplerMap({
  mapboxToken
}: WrjKeplerMapProps) {
  const {ref, width, height} = useContainerSize<HTMLDivElement>();

  return (
    <div ref={ref} className="wrj-map-container">
      {width > 0 && height > 0 ? (
        <KeplerGl
          id="wrj-map"
          mapboxApiAccessToken={mapboxToken}
          width={width}
          height={height}
        />
      ) : null}
    </div>
  );
}
```

禁止使用固定窗口尺寸：

```ts
window.innerWidth
window.innerHeight
```

必须基于地图容器尺寸。

`useContainerSize` 使用 `ResizeObserver`。

---

# 11. 数据加载

## 11.1 固定 Dataset ID

在 `constants.ts`：

```ts
export const WRJ_MAP_ID = "wrj-map";

export const DATASET_IDS = {
  trips: "wrj-trips",
  support: "wrj-support",
  plannedRoutes: "wrj-planned-routes"
} as const;
```

Dataset ID 不得随文件名或算例随机变化，因为 Kepler.gl 配置通过 `dataId` 匹配图层。

## 11.2 loadText

```ts
export async function loadText(
  url: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(url, {signal});

  if (!response.ok) {
    throw new Error(
      `加载文本失败：${response.status} ${response.statusText}`
    );
  }

  return response.text();
}
```

## 11.3 loadJson

```ts
export async function loadJson<T>(
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {signal});

  if (!response.ok) {
    throw new Error(
      `加载JSON失败：${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}
```

## 11.4 加载到 Kepler.gl

使用：

```ts
import {addDataToMap, resetMapConfig} from "@kepler.gl/actions";
import {processCsvData, processGeojson} from "@kepler.gl/processors";
import {wrapTo} from "@kepler.gl/actions";
```

如果当前版本 `wrapTo` 不是从 `@kepler.gl/actions` 导出，应通过包类型定义确认正确导出位置，不允许使用 `any` 绕过。

推荐流程：

```ts
dispatch(wrapTo(WRJ_MAP_ID, resetMapConfig()));

dispatch(
  wrapTo(
    WRJ_MAP_ID,
    addDataToMap({
      datasets: [
        {
          info: {
            id: DATASET_IDS.trips,
            label: "多无人机三维航迹"
          },
          data: processCsvData(tripCsvText)
        },
        {
          info: {
            id: DATASET_IDS.support,
            label: "任务区域与参考条带"
          },
          data: processGeojson(supportGeojson)
        }
      ],
      options: {
        centerMap: true,
        readOnly: !debugMode,
        keepExistingConfig: false
      },
      config: keplerConfig
    })
  )
);
```

注意：

- 正确字段名为 `options`；
- Dataset 可以是数组；
- 同一配置内的 `dataId` 必须与 `info.id` 一致；
- 算例切换前使用 `resetMapConfig()`；
- 避免重复加载；
- 加载失败必须反馈到 WRJ 外层页面。

---

# 12. Trip 数据格式

主 CSV 每一行代表一架无人机。

关键列：

```text
_geojson
uav_id
callsign
strip_range
total_distance_km
total_duration_min
coverage_altitude_agl_m
transit_altitude_agl_m
max_altitude_agl_m
status
```

`_geojson` 是字符串化 GeoJSON Feature：

```json
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [110.2156, 18.6298, 0, 1784509200],
      [110.2158, 18.6300, 12.3, 1784509202]
    ]
  },
  "properties": {
    "uav_id": "UAV-01"
  }
}
```

坐标严格为：

```text
[longitude, latitude, altitude, timestamp]
```

要求：

- 经度在前；
- 纬度在后；
- 高度单位为米；
- 时间戳统一使用 Unix 秒；
- 每条航迹至少两个点；
- 时间戳单调递增；
- 三架 UAV 时间范围允许重叠；
- CSV 使用 UTF-8 with BOM；
- `_geojson` 中的双引号必须正确转义。

---

# 13. Kepler.gl 固定配置

## 13.1 调试模式生成配置

第一次 P0 成功后：

1. 设置：

```env
VITE_WRJ_KEPLER_DEBUG=true
```

2. 打开 Kepler.gl 侧边栏；
3. 确认 Trip 图层；
4. 创建或调整以下图层：
   - Trip；
   - 任务区域；
   - 参考条带；
   - 静态完整规划航迹；
5. 设置颜色、透明度、Tooltip、三维视角；
6. 从 Kepler.gl 导出配置；
7. 保存为：

```text
public/config/wrj-kepler-config.json
```

8. 固定所有 Dataset ID；
9. 设置回：

```env
VITE_WRJ_KEPLER_DEBUG=false
```

## 13.2 默认图层顺序

从下到上：

```text
1. 任务区域
2. 参考侦察条带
3. 静态完整规划航迹
4. Trip 动态航迹
```

## 13.3 图层建议

### 任务区域

```text
类型：GeoJSON
填充透明度：0.16～0.24
边框：开启
高度：关闭
```

### 参考条带

```text
类型：GeoJSON
颜色：按 uav_id
线宽：1～2
透明度：0.45～0.65
高度：关闭
```

### 静态完整航迹

```text
类型：GeoJSON
颜色：按 uav_id
线宽：2～3
透明度：0.20～0.35
作用：始终显示完整路线
```

### Trip

```text
类型：Trip
颜色：按 uav_id
线宽：4～6
Trail Length：1500 秒
作用：动态飞行与已飞尾迹
```

## 13.4 UAV 固定颜色

```ts
export const UAV_COLORS = {
  "UAV-01": "#35C5FF",
  "UAV-02": "#FFB44D",
  "UAV-03": "#4ED6A0"
} as const;
```

配置中尽量保持颜色稳定，禁止每次刷新随机变化。

---

# 14. 三维视角

初始地图状态建议：

```ts
const DEFAULT_MAP_STATE = {
  latitude: 18.625,
  longitude: 110.235,
  zoom: 12.7,
  pitch: 52,
  bearing: -18
};
```

最终数值可在 P0 中按实际数据边界调整。

要求：

- 初始页面直接呈现三维视角；
- 提供“重置三维视角”按钮；
- 不强制锁死用户旋转和缩放；
- 地图重置时恢复 pitch、bearing、zoom 和中心点；
- 不将区域 Polygon 拉伸为立体墙；
- 只有 Trip 坐标使用真实高度；
- 静态参考线保持二维，避免画面混乱。

---

# 15. 播放策略

## 15.1 第一版

优先使用 Kepler.gl 自带 Trip 播放控制，避免重复开发动画系统。

WRJ 顶部只展示：

```text
动画状态：待播放 / 播放中 / 已结束
```

不强制第一版用自定义按钮直接驱动 Kepler 内部动画。

## 15.2 P2 可选增强

P0 和主页面稳定后，才开发 WRJ 自定义播放按钮。

可评估 Kepler.gl actions：

```text
updateAnimationTime
setAnimationConfig
toggleFilterAnimation
```

使用时必须：

- 对 `wrj-map` 使用转发 action；
- 不直接修改 Redux state；
- 不依赖未导出的内部组件；
- 为播放、暂停、重置编写测试；
- 不能破坏 Kepler 自带底部时间控制。

## 15.3 历史路径保留

第一版采用：

```text
静态完整规划航迹
+
Trip Trail Length = 1500 秒
```

这样：

- 完整规划线始终存在；
- Trip 显示动态过程；
- 已飞路径在整个演示中基本不会消失。

第一版不实现按当前时间动态生成 `flown-history.geojson`。

---

# 16. WRJ 外层业务数据

创建：

```text
public/data/riyue-3d/summary.json
```

格式：

```json
{
  "schemaVersion": "1.0",
  "caseId": "riyue-3d",
  "name": "日月湾三维多无人机静态侦察",
  "description": "三架轻型固定翼无人机协同完成近岸区域侦察。",
  "status": "FEASIBLE",
  "demoMock": true,
  "location": "海南省万宁市日月湾附近海域",
  "metrics": {
    "uavCount": 3,
    "stripCount": 12,
    "coverageRatio": 0.98,
    "missionMakespanSec": 1162,
    "totalDistanceKm": 57.71,
    "totalFuelKg": null
  },
  "uavs": [
    {
      "uavId": "UAV-01",
      "callsign": "WRJ01",
      "stripRange": "1-4",
      "distanceKm": 19.91,
      "durationMin": 17.6,
      "coverageAltitudeM": 92,
      "transitAltitudeM": 122,
      "maxAltitudeM": 133.5,
      "status": "VALID"
    },
    {
      "uavId": "UAV-02",
      "callsign": "WRJ02",
      "stripRange": "5-8",
      "distanceKm": 17.35,
      "durationMin": 15.6,
      "coverageAltitudeM": 100,
      "transitAltitudeM": 128,
      "maxAltitudeM": 139.5,
      "status": "VALID"
    },
    {
      "uavId": "UAV-03",
      "callsign": "WRJ03",
      "stripRange": "9-12",
      "distanceKm": 20.45,
      "durationMin": 17.7,
      "coverageAltitudeM": 108,
      "transitAltitudeM": 136,
      "maxAltitudeM": 147.5,
      "status": "VALID"
    }
  ],
  "notice": "地理位置真实，任务区、航迹、高度和时序为演示模拟，不能用于真实飞行。"
}
```

该文件用于 WRJ 外层指标，不从 Kepler reducer 反向计算。

---

# 17. 主页面组件

## 17.1 TopBar

包含：

- 项目名；
- 算例名称；
- `演示数据` 标记；
- Token 状态；
- 重置视角；
- 调试模式提示。

不包含复杂导航。

## 17.2 MetricGrid

显示：

```text
方案状态
无人机数量
条带数量
覆盖率
并行完成时间
总航程
```

不显示模拟油耗，除非后端提供可靠值。

## 17.3 UavList

每架 UAV 显示：

```text
UAV-01 / WRJ01
条带 1～4
覆盖高度 92 m
任务时间 17.6 min
```

第一版点击 UAV 只更新右侧详情，不要求控制 Kepler 图层筛选。

## 17.4 DetailPanel

默认显示：

- 地理位置；
- 数据说明；
- 飞行阶段；
- 图例；
- 当前选择提示。

选择 UAV 后显示：

- callsign；
- 条带；
- 航程；
- 时间；
- 覆盖高度；
- 转场高度；
- 最大高度；
- 状态。

## 17.5 StepIndicator

固定阶段：

```text
任务区域
条带分配
起飞爬升
等待盘旋
覆盖侦察
曲线返航
任务完成
```

第一版步骤条仅作讲解说明，不驱动 Kepler 数据变化。

---

# 18. 页面视觉

## 18.1 布局尺寸

```text
顶部栏：60px
指标区：86px
主内容：剩余高度
底部步骤：54px
```

主内容：

```text
左侧 UAV 列表：230px
中间地图：1fr
右侧详情：300px
```

1920×1080 是主要展示尺寸。

## 18.2 CSS 变量

```css
:root {
  --bg-page: #07111f;
  --bg-panel: #0c1a2b;
  --bg-panel-strong: #10243a;
  --bg-card: #112941;
  --border: rgba(126, 186, 224, 0.18);
  --border-strong: rgba(126, 186, 224, 0.34);
  --text: #eaf5ff;
  --text-secondary: #9db4c9;
  --accent: #35c5ff;
  --success: #4ed6a0;
  --warning: #ffb44d;
  --danger: #ff6b6b;
}
```

要求：

- 地图区域占最大面积；
- WRJ 面板不遮挡 Kepler 动画控制；
- 避免强烈发光；
- 不使用图片背景；
- 免责声明始终可见；
- Kepler 自带控件不能超出容器。

---

# 19. 数据加载状态

App 状态：

```ts
type LoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

interface AppState {
  loadStatus: LoadStatus;
  loadError: string | null;
  activeCaseId: string;
  selectedUavId: string | null;
  summary: CaseSummary | null;
}
```

加载顺序：

```text
检查 Token
→ 加载 summary.json
→ 加载 trips.csv
→ 加载 support.geojson
→ 加载固定配置
→ resetMapConfig
→ addDataToMap
→ 标记 ready
```

失败时：

- 地图区显示错误；
- 保留页面标题；
- 显示失败文件和原因；
- 提供“重新加载”按钮；
- 控制台输出原始错误；
- 不吞掉异常。

---

# 20. 键盘操作

只实现：

```text
R：重置三维视角
Escape：清除 UAV 选择
```

输入控件聚焦时不触发。

不自行绑定空格播放，避免和 Kepler 自带动画控制冲突。

---

# 21. 测试

## 21.1 单元测试

### format.test.ts

覆盖：

- 距离；
- 分钟；
- 百分比；
- null；
- NaN；
- Infinity。

### loaders.test.ts

Mock fetch，覆盖：

- CSV 成功；
- GeoJSON 成功；
- summary 成功；
- 404；
- 非法 JSON；
- AbortController 取消。

## 21.2 组件测试

Kepler.gl 组件在测试中 Mock，避免 jsdom WebGL 问题。

覆盖：

- Token 缺失；
- 加载中；
- 加载失败；
- 加载完成；
- UAV 选择；
- 重置视角事件；
- 免责声明显示。

## 21.3 P0 手工验证

必须在 Chrome 或 Edge 中验证：

- 1920×1080；
- 1366×768；
- 3D 倾斜；
- Trip 播放；
- 地图缩放；
- 地图旋转；
- 刷新；
- Token 缺失；
- 网络慢速；
- 连续刷新 10 次；
- 无重复图层；
- 无持续内存增长。

---

# 22. README

README 必须包含：

1. 项目定位；
2. 页面截图占位；
3. 技术栈；
4. Node 版本；
5. 安装命令；
6. Token 配置；
7. 启动命令；
8. 构建命令；
9. 数据目录；
10. Dataset ID；
11. Kepler 配置生成方式；
12. 调试模式；
13. P0 验证结果；
14. 常见错误：
    - Token 缺失；
    - 白屏；
    - React 版本冲突；
    - 数据重复；
    - Trip 未识别；
    - 地图未定位；
    - 生产构建失败；
15. 演示流程；
16. 免责声明。

---

# 23. 开发阶段

## 阶段 P0：Kepler.gl 嵌入验证

预计 0.5～1.5 天。

完成：

- 项目初始化；
- Redux；
- KeplerGl；
- Token；
- 自动数据加载；
- Trip；
- 3D；
- P0 文档；
- build。

## 阶段 P1：固定配置和主工作台

预计 1.5～2.5 天。

完成：

- 导出固定 Kepler 配置；
- readOnly；
- 标题；
- 指标；
- UAV 列表；
- 详情；
- 布局；
- 免责声明。

## 阶段 P2：交互和演示优化

预计 1～2 天。

完成：

- 重置视角；
- UAV 详情；
- 图例；
- 步骤条；
- 加载错误；
- 视觉优化；
- 演示流程。

## 阶段 P3：测试和交付

预计 1 天。

完成：

- 单测；
- 组件测试；
- lint；
- typecheck；
- build；
- README；
- 截图；
- 交付说明。

总工期：

```text
4～7 个开发日
```

---

# 24. 最终验收

## P0

- [ ] Kepler.gl 成功嵌入；
- [ ] 地图可见；
- [ ] Trip 可播放；
- [ ] 三维高度可见；
- [ ] 静态区域和条带可见；
- [ ] 数据自动加载；
- [ ] Token 错误正常；
- [ ] build 成功。

## 业务页面

- [ ] 单页面；
- [ ] 6 个指标；
- [ ] 3 架 UAV；
- [ ] UAV 详情；
- [ ] 三维地图占主体；
- [ ] 固定配置；
- [ ] 默认只读；
- [ ] 无上传入口；
- [ ] 无复杂侧边栏；
- [ ] 免责声明明确。

## 工程

- [ ] React 18；
- [ ] Kepler 3.2.6；
- [ ] 所有 Kepler 包版本一致；
- [ ] 无 React 19；
- [ ] 无 alpha 版本；
- [ ] 无 Token 硬编码；
- [ ] 无 TypeScript 错误；
- [ ] ESLint 通过；
- [ ] 测试通过；
- [ ] 生产构建通过；
- [ ] package-lock 已提交；
- [ ] README 完成；
- [ ] P0_VALIDATION 完成。

---

# 25. Codex 最终汇报

开发完成后必须输出：

```text
项目路径
Node/npm版本
依赖版本
P0是否通过
已实现功能
数据文件
Kepler Dataset ID
固定配置文件
Mapbox Token配置方式
测试结果
lint结果
typecheck结果
build结果
启动命令
生产预览命令
当前限制
后续建议
```

必须给出实际命令输出结果，不能只说“已通过”。

---

# 26. 默认决策

遇到本文未覆盖的问题时：

```text
优先保证P0可运行
优先使用官方公开API
优先使用Kepler自带能力
优先固定配置
优先只读模式
优先本地静态数据
优先不修改Kepler内部源码
优先不替换内部UI组件
优先减少依赖
优先稳定构建
```

不得为了视觉效果大规模修改 Kepler.gl 源码。

---

# 27. 完成定义

项目最终形态必须是：

> 一个 WRJ 自主单页面工作台，中间嵌入 Kepler.gl 三维地图。页面打开后自动加载日月湾任务区域、参考条带和三架无人机四维 Trip 航迹，能够以真实底图、不同高度层、曲线起降、等待盘旋、水滴掉头和曲线返航展示静态侦察规划结果，同时显示指标、无人机任务信息和演示免责声明。
