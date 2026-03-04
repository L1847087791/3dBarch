# HostMap 3D 可视化系统 - 概述与架构

## 一、项目意义

### 1.1 项目背景

在现代数据中心运维场景中，运维人员需要同时监控数百甚至数千台服务器的运行状态。传统的表格式监控界面存在以下问题：

- **信息密度低**：大量数据需要翻页查看，难以快速定位问题
- **缺乏直观性**：纯文字和数字难以快速感知整体健康状态
- **交互效率低**：需要多次点击才能查看详细信息

### 1.2 解决方案

HostMap 3D 可视化系统通过三维柱状图的形式，将数据中心的主机监控数据进行可视化展示：

- **全景概览**：一屏展示所有监控主机，支持 5000+ 主机同时渲染
- **实时状态**：通过颜色编码实时反映各主机及组件的健康状态
- **层级展示**：每个主机柱状图内部展示其运行的服务组件（1-80层）
- **双视图模式**：支持组件视图和指标视图切换
- **高效交互**：悬停、点击、聚焦等交互方式快速定位问题

### 1.3 核心价值

| 价值维度 | 传统方案 | HostMap 方案 |
|---------|---------|-------------|
| 信息密度 | 每页 20-50 条 | 单屏 5000+ 主机 |
| 状态感知 | 需逐条查看 | 颜色编码一目了然 |
| 问题定位 | 多次点击筛选 | 悬停即可查看详情 |
| 层级展示 | 需展开折叠 | 3D 堆叠直观展示 |

---

## 二、整体架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        React 组件层                              │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │   BarChart3D.jsx    │    │   BarChartContainer.jsx         │ │
│  │   (核心3D组件)       │    │   (容器组件/数据管理/UI控制)     │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      Three.js 3D 引擎层                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ ThreeScene   │ │BarCollection │ │ BarAnimationManager      │ │
│  │ (场景管理)    │ │Manager(柱管理)│ │ (动画管理)               │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │Interaction   │ │ CameraControls│ │ CameraAnimator          │ │
│  │Manager(交互) │ │ (相机控制)    │ │ (摄像机动画)             │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐                              │
│  │ViewMode      │ │GroupIndicator│                              │
│  │Manager(视图) │ │Manager(标签) │                              │
│  └──────────────┘ └──────────────┘                              │
├─────────────────────────────────────────────────────────────────┤
│                        数据转换层                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   DataTransformer.js                        ││
│  │              (后端数据 → 前端3D场景数据)                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 架构特点

#### 职责分离
每个工具类独立管理一个功能域，降低代码复杂度：
- `ThreeScene` - 只负责场景、相机、渲染器初始化
- `BarCollectionManager` - 只负责柱状图的创建和管理
- `InteractionManager` - 只负责用户交互处理

#### 解耦设计
模块间通过回调函数和依赖注入通信，避免直接依赖：
```javascript
// 通过回调函数通信
const callbacks = {
  onBarHover: (data) => { /* 处理悬停 */ },
  onBarClick: (data) => { /* 处理点击 */ }
};
new InteractionManager(camera, domElement, barManager, viewManager, callbacks);
```

#### 性能优先
使用 InstancedMesh 批量渲染，将 Draw Call 从数万次降低到个位数。

---

## 三、核心技术栈

### 3.1 Three.js

Three.js 是本项目的 3D 渲染核心，主要使用以下特性：

| 特性 | 用途 | 文件位置 |
|-----|------|---------|
| `InstancedMesh` | 批量渲染柱状图 | BarManager.js |
| `Raycaster` | 射线检测交互 | InteractionManager.js |
| `ShaderMaterial` | 自定义扫描光效 | BarManager.js |
| `CSS2DRenderer` | 区域文字标签 | ThreeScene.js |
| `PerspectiveCamera` | 透视相机 | ThreeScene.js |

### 3.2 React

React 负责组件生命周期管理和状态管理：

| 特性 | 用途 | 文件位置 |
|-----|------|---------|
| `useRef` | 持有 Three.js 对象引用 | BarChart3D.jsx |
| `useEffect` | 初始化和清理 3D 场景 | BarChart3D.jsx |
| `useImperativeHandle` | 暴露组件方法给父组件 | BarChart3D.jsx |
| `forwardRef` | 转发 ref 到子组件 | BarChart3D.jsx |

### 3.3 GSAP

GSAP (GreenSock Animation Platform) 负责所有动画效果：

| 特性 | 用途 | 文件位置 |
|-----|------|---------|
| `gsap.to()` | 柱状图高度动画 | BarAnimationManager.js |
| `gsap.timeline()` | 摄像机聚焦动画序列 | CameraAnimator.js |
| 缓动函数 | 平滑的动画过渡 | 各动画相关文件 |

---

## 四、文件结构详解

### 4.1 目录结构

```
src/
├── App.jsx                          # 应用入口
├── main.jsx                         # React 启动文件
├── components/
│   ├── BarChart3D.jsx              # 核心 3D 组件
│   ├── BarChartContainer.jsx       # 容器组件（使用示例）
│   ├── CanvasOverlay.jsx           # Canvas 覆盖层
│   └── HeaderSource.jsx            # 头部资源组件
└── utils/
    ├── DataTransformer.js          # 数据转换工具
    ├── ThreeScene.js               # 场景管理
    ├── BarManager.js               # 柱状图管理（核心）
    ├── BarAnimationManager.js      # 动画管理
    ├── ViewModeManager.js          # 视图模式切换
    ├── InteractionManager.js       # 交互管理
    ├── CameraControls.js           # 相机控制
    ├── CameraAnimator.js           # 摄像机动画
    └── GroupIndicatorManager.js    # 区域指示器
```

### 4.2 文件职责说明

| 文件 | 职责 | 代码行数 |
|-----|------|---------|
| `BarChart3D.jsx` | 核心组件，管理 3D 场景生命周期 | ~420 行 |
| `BarChartContainer.jsx` | 使用示例，展示如何集成组件 | ~300 行 |
| `DataTransformer.js` | 后端数据格式转换为前端格式 | ~320 行 |
| `ThreeScene.js` | 场景、相机、渲染器、灯光初始化 | ~320 行 |
| `BarManager.js` | 柱状图创建、InstancedMesh 管理 | ~760 行 |
| `BarAnimationManager.js` | GSAP 动画控制 | ~270 行 |
| `ViewModeManager.js` | 组件视图/指标视图切换 | ~650 行 |
| `InteractionManager.js` | 悬停、点击、拖拽交互处理 | ~1070 行 |
| `CameraControls.js` | 相机旋转、缩放控制 | ~160 行 |
| `CameraAnimator.js` | 摄像机聚焦动画、内层文字标签 | ~510 行 |
| `GroupIndicatorManager.js` | 区域边框和文字标签 | ~240 行 |

---

## 五、数据流向

### 5.1 初始化数据流

```
后端 API 响应
    │
    ▼
DataTransformer.transformComponentViewData()
    │
    ├── sceneData (柱状图数据)
    │       │
    │       ▼
    │   BarChart3D.jsx (props.barSceneData)
    │       │
    │       ▼
    │   BarCollectionManager.createBars()
    │       │
    │       ▼
    │   InstancedMesh 渲染
    │
    └── groupIndicatorInfo (区域指示器数据)
            │
            ▼
        BarChart3D.jsx (props.groupIndicatorInfo)
            │
            ▼
        GroupIndicatorManager.createAllIndicators()
            │
            ▼
        区域边框和标签渲染
```

### 5.2 交互数据流

```
用户鼠标事件
    │
    ▼
InteractionManager._onMouseMove() / _onMouseClick()
    │
    ▼
Raycaster 射线检测
    │
    ├── 命中外层 ──► onBarHover / onBarClick 回调
    │                    │
    │                    ▼
    │               BarChartContainer 处理
    │                    │
    │                    ▼
    │               更新 UI（Tooltip、详情面板等）
    │
    └── 命中内层 ──► onLayerHover / onLayerClick 回调
                         │
                         ▼
                    BarChartContainer 处理
```

### 5.3 视图切换数据流

```
用户点击切换按钮
    │
    ▼
BarChart3D.switchViewMode('metric')
    │
    ▼
ViewModeManager.switchViewMode()
    │
    ├── 捕获当前状态
    │
    ├── 计算目标状态
    │
    └── GSAP 动画过渡
            │
            ▼
        更新 InstancedMesh 矩阵
            │
            ▼
        渲染新视图
```

---

## 六、设计原则

### 6.1 单一职责原则

每个工具类只负责一个功能域，便于维护和测试：

```javascript
// 好的设计：职责单一
class CameraControls { /* 只负责相机控制 */ }
class CameraAnimator { /* 只负责摄像机动画 */ }

// 避免：职责混杂
class CameraManager { /* 同时负责控制和动画 */ }
```

### 6.2 依赖注入原则

通过构造函数注入依赖，而非内部创建：

```javascript
// 好的设计：依赖注入
class InteractionManager {
  constructor(camera, domElement, barManager, viewManager, callbacks) {
    this.camera = camera;
    this.barManager = barManager;
    // ...
  }
}

// 避免：内部创建依赖
class InteractionManager {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(); // 不好
  }
}
```

### 6.3 回调函数通信

模块间通过回调函数通信，降低耦合度：

```javascript
// 好的设计：回调函数通信
const callbacks = {
  onBarHover: (data) => updateTooltip(data),
  onBarClick: (data) => showDetail(data)
};
new InteractionManager(..., callbacks);

// 避免：直接调用
class InteractionManager {
  _onHover() {
    tooltip.update(data); // 直接依赖 tooltip 对象
  }
}
```

---

## 七、下一步阅读

- [hostmap详细说明-工具类API.md](./hostmap详细说明-工具类API.md) - 各工具类的详细 API 文档
- [hostmap详细说明-组件接口与优化.md](./hostmap详细说明-组件接口与优化.md) - 组件接口和性能优化详解
