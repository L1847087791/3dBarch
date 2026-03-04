# HostMap 3D 可视化系统

> 一个基于 Three.js + React + GSAP 的高性能 3D 柱状图可视化系统，用于数据中心/主机监控场景。

## 项目需求背景

### 问题

在现代数据中心运维场景中，运维人员需要同时监控数百甚至数千台服务器的运行状态。传统的表格式监控界面存在以下问题：

- **信息密度低**：大量数据需要翻页查看，难以快速定位问题
- **缺乏直观性**：纯文字和数字难以快速感知整体健康状态
- **交互效率低**：需要多次点击才能查看详细信息
- **层级展示困难**：难以展示主机与其运行组件的关系

### 解决方案

HostMap 3D 可视化系统通过三维柱状图的形式，将数据中心的主机监控数据进行可视化展示：

- **全景概览**：一屏展示所有监控主机，支持 5000+ 主机同时渲染
- **实时状态**：通过颜色编码实时反映各主机及组件的健康状态
- **层级展示**：每个主机柱状图内部展示其运行的服务组件（1-80层）
- **双视图模式**：支持组件视图和指标视图切换
- **高效交互**：悬停、点击、聚焦等交互方式快速定位问题

---

## 功能介绍

### 核心功能

#### 1. 组件视图
展示每个主机及其运行的服务组件。

**特点**：
- 每个柱状图代表一个主机
- 柱状图内部的层代表该主机运行的服务组件
- 颜色编码表示告警等级（正常/次要/主要/严重）
- 支持悬停查看详情、点击选中、聚焦查看内层详情

**告警等级颜色**：
- 🟦 浅灰蓝（#e8eef5）：正常
- 🟨 浅黄（#ffcd3d）：次要告警
- 🟧 浅粉（#ff8c3d）：主要告警
- 🟥 浅红（#ff4849）：严重告警

#### 2. 指标视图
展示每个主机的关键性能指标。

**特点**：
- 每个柱状图代表一个主机
- 柱状图内部的 5 层分别代表 5 个关键指标（CPU、内存、磁盘、网络、IO）
- 层的高度表示指标值的百分比
- 支持实时更新指标数据

**指标颜色**：
- 🟩 绿色（#6cad7c）：CPU
- 🟦 蓝色（#4A90D9）：内存
- 🟧 橙色（#F5A623）：磁盘
- 🟪 紫色（#e975b4）：网络
- 🟨 黄色（#fff500）：IO

#### 3. 交互功能

**悬停交互**：
- 悬停主机柱 → 显示主机信息 Tooltip
- 悬停内层组件 → 显示组件信息 Tooltip

**点击交互**：
- 点击主机柱 → 选中该主机，禁用其他柱交互
- 点击内层组件 → 显示组件详情

**聚焦功能**：
- 点击主机后可聚焦查看内层详情
- 摄像机平滑动画移动到主机位置
- 显示内层组件的文字标签

**相机控制**：
- 左键拖拽 → 旋转视角
- 滚轮 → 缩放距离
- 支持自由旋转和缩放

#### 4. 区域指示器

- 显示主机分组的边框和标签
- 支持点击区域标签聚焦到该区域
- 拖拽时自动隐藏标签，提升交互流畅度

---

## 功能使用说明

### 基础使用

#### 1. 初始化组件

```javascript
import BarChart3D from './components/BarChart3D';
import DataTransformer from './utils/DataTransformer';

function App() {
  const barChart3DRef = useRef(null);

  // 转换后端数据
  const { sceneData, groupIndicatorInfo } = DataTransformer.transformComponentViewData(
    backendData,
    {
      hostSpacing: 40,
      regionGap: 100,
      hostsPerRow: 10,
      regionsPerRow: 6,
      barWidth: 10,
      baseLayerCount: 5
    }
  );

  return (
    <BarChart3D
      ref={barChart3DRef}
      barSceneData={sceneData}
      groupIndicatorInfo={groupIndicatorInfo}
      onBarHover={(data) => console.log('悬停主机:', data.uuid)}
      onBarClick={(data) => console.log('点击主机:', data.uuid)}
      onLayerHover={(data) => console.log('悬停组件:', data.layerUuid)}
      onLayerClick={(data) => console.log('点击组件:', data.layerUuid)}
    />
  );
}
```

#### 2. 切换视图模式

```javascript
// 切换到指标视图
await barChart3DRef.current.switchViewMode('metric');

// 切换回组件视图
await barChart3DRef.current.switchViewMode('component');

// 获取当前视图模式
const mode = barChart3DRef.current.getViewMode();
```

#### 3. 更新指标数据

```javascript
// 批量设置指标数据
barChart3DRef.current.setAllMetricData([
  {
    barIndex: 0,
    metrics: [
      { id: 'cpu', value: 0.75, color: 'metric1' },
      { id: 'memory', value: 0.60, color: 'metric2' }
    ]
  },
  // ...
]);

// 带动画的更新
await barChart3DRef.current.setAllMetricDataAnimated(allMetrics, {
  duration: 0.8,
  ease: 'power2.inOut'
});
```

---

## 接口规范

### 后端数据格式

#### 组件视图数据

```javascript
{
  code: 200,
  data: {
    total: 160,                    // 主机总数
    fzs: [                         // 分组数组
      {
        fz: "APP：手机银行_1",      // 分组名称
        zylb: [                    // 主机列表
          {
            id: "host-0-0",        // 主机 ID
            mc: "server-0-0",      // 主机名
            ip: "192.168.0.1",     // IP 地址
            zylx: "Linux",         // 主机类型
            gjdj: 0,               // 告警等级 (0-3)
            zj: [                  // 组件列表
              {
                id: "comp-host-0-0-0",  // 组件 ID
                mc: "MySQL-1",          // 组件名
                zylx: "MySQL",          // 组件类型
                gjdj: 0                 // 告警等级 (0-3)
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### 组件 Props

| Props | 类型 | 必需 | 说明 |
|-------|------|------|------|
| `barSceneData` | Object | ✓ | 柱状图场景数据 |
| `groupIndicatorInfo` | Array | ✓ | 区域指示器信息 |
| `onBarHover` | Function | | 主机悬停回调 |
| `onBarClick` | Function | | 主机点击回调 |
| `onLayerHover` | Function | | 组件悬停回调 |
| `onLayerClick` | Function | | 组件点击回调 |

### 组件 Ref 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `switchViewMode` | mode: 'component' \| 'metric' | Promise | 切换视图模式 |
| `getViewMode` | - | string \| null | 获取当前视图模式 |
| `setAllMetricDataAnimated` | allMetrics, options | Promise | 带动画的批量设置指标数据 |

---

## 快速开始

### 1. 安装依赖

```bash
npm install three gsap
```

### 2. 导入组件

```javascript
import BarChart3D from './components/BarChart3D';
import DataTransformer from './utils/DataTransformer';
```

### 3. 准备数据

```javascript
// 从后端 API 获取数据
const response = await fetch('/api/hostmap/data');
const backendData = await response.json();

// 转换数据格式
const { sceneData, groupIndicatorInfo } = DataTransformer.transformComponentViewData(
  backendData,
  {
    hostSpacing: 40,
    regionGap: 100,
    hostsPerRow: 10,
    regionsPerRow: 6,
    barWidth: 10,
    baseLayerCount: 5
  }
);
```

### 4. 渲染组件

```javascript
<BarChart3D
  barSceneData={sceneData}
  groupIndicatorInfo={groupIndicatorInfo}
  onBarHover={(data) => handleBarHover(data)}
  onBarClick={(data) => handleBarClick(data)}
  onLayerClick={(data) => handleLayerClick(data)}
/>
```

---

## 性能指标

| 指标 | 值 |
|------|-----|
| 最大主机数 | 5000+ |
| 每主机最大组件数 | 80 |
| 平均 FPS | 60 |
| Draw Call 数 | 3-5 |
| 内存占用 | 50-300MB |

---

## 文档导航

- [hostmap详细说明-概述与架构.md](./hostmap详细说明-概述与架构.md) - 项目架构和设计原则
- [hostmap详细说明-工具类API(上).md](./hostmap详细说明-工具类API(上).md) - 数据转换、场景管理、柱状图管理、动画管理
- [hostmap详细说明-工具类API(下).md](./hostmap详细说明-工具类API(下).md) - 视图管理、交互管理、相机控制、摄像机动画、区域指示器
- [hostmap详细说明-组件接口与优化.md](./hostmap详细说明-组件接口与优化.md) - 组件接口、性能优化、最佳实践

---

## 常见问题

**Q: 如何处理大数据量（5000+主机）？**

A: 系统已使用 InstancedMesh 批量渲染优化，支持 5000+ 主机同时渲染。

**Q: 如何自定义颜色？**

A: 修改 `BarManager.js` 中的 `ColorMap` 对象，或通过 `setInnerLayerColor()` 方法动态更新。

**Q: 支持哪些浏览器？**

A: 支持所有现代浏览器（Chrome、Firefox、Safari、Edge）。

---


