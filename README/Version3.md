# Version 3 - 双视图模式架构

## 概述

本版本实现了**组件视图**和**指标视图**的双模式切换功能，重构了架构以实现功能分离和降低耦合度。

## 架构变更

### 文件变更清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/utils/ViewModeManager.js` | 新增 | 独立的视图模式管理器 |
| `src/utils/BarManager.js` | 修改 | 移除视图模式逻辑，只负责组件视图渲染 |
| `src/utils/InteractionManager.js` | 修改 | 支持 ViewModeManager，区分两种模式的交互 |
| `src/components/BarChart3D.jsx` | 修改 | 集成 ViewModeManager，暴露指标数据接口 |
| `src/components/BarChartContainer.jsx` | 修改 | 添加模式切换UI和模拟数据接口 |

### 新架构图

```
BarChartContainer (应用层)
    │
    ├── 视图模式切换 (Switch)
    ├── 模拟指标数据生成
    │
    └── BarChart3D (ref)
            │
            ├── BarCollectionManager    # 组件视图渲染
            ├── ViewModeManager         # 视图模式管理 (新增)
            └── InteractionManager      # 交互管理
```

## ViewModeManager 核心类

```javascript
// 视图模式常量
export const ViewMode = {
  COMPONENT: 'component',  // 组件视图：内层纵向堆叠
  METRIC: 'metric'         // 指标视图：5层水平并排
};

// 指标视图配置
export const MetricViewConfig = {
  layerCount: 5,  // 固定5层
  defaultMetricIds: ['cpu', 'memory', 'disk', 'network', 'io']
};
```

### 主要方法

| 方法 | 说明 |
|------|------|
| `initialize()` | 初始化指标视图 InstancedMesh |
| `switchViewMode(mode)` | 切换视图模式（带 GSAP 动画） |
| `setMetricData(metricsArray)` | 设置部分柱状图的指标数据 |
| `setAllMetricData(allMetrics)` | 批量设置所有柱状图的指标数据 |
| `getMetricData(barIndex)` | 获取指定柱状图的指标数据 |
| `getViewMode()` | 获取当前视图模式 |

## 使用方法

### 1. 基本切换

```jsx
const barChart3DRef = useRef(null);

// 切换到指标视图
barChart3DRef.current.switchViewMode(ViewMode.METRIC);

// 切换回组件视图
barChart3DRef.current.switchViewMode(ViewMode.COMPONENT);
```

### 2. 设置指标数据（实时更新）

**方式一：批量设置所有柱状图**

```javascript
// 数据格式：二维数组，每个柱状图5个指标
const allMetrics = [
  // 柱状图0
  [
    { id: 'cpu', value: 0.75, color: 'info' },
    { id: 'memory', value: 0.60, color: 'normal' },
    { id: 'disk', value: 0.45, color: 'warning' },
    { id: 'network', value: 0.30, color: 'error' },
    { id: 'io', value: 0.85, color: 'critical' }
  ],
  // 柱状图1...
];

barChart3DRef.current.setAllMetricData(allMetrics);
```

**方式二：更新部分柱状图**

```javascript
// 只更新指定柱状图的指标
const metricsArray = [
  {
    barIndex: 0,
    metrics: [
      { id: 'cpu', value: 0.90, color: 'error' },
      // ... 其他4个指标
    ]
  },
  {
    barIndex: 5,
    metrics: [...]
  }
];

barChart3DRef.current.setMetricData(metricsArray);
```

### 3. 指标数据格式

```typescript
interface Metric {
  id: string;      // 指标ID: 'cpu' | 'memory' | 'disk' | 'network' | 'io'
  value: number;   // 高度百分比: 0-1 (相对于外层高度)
  color: string;   // 颜色: 'normal' | 'info' | 'warning' | 'error' | 'critical'
}
```

### 4. 完整示例

```jsx
const BarChartContainer = () => {
  const barChart3DRef = useRef(null);
  const [viewMode, setViewMode] = useState(ViewMode.COMPONENT);

  // 切换视图模式
  const handleViewModeChange = (checked) => {
    const newMode = checked ? ViewMode.METRIC : ViewMode.COMPONENT;

    // 切换到指标视图时设置数据
    if (newMode === ViewMode.METRIC) {
      const mockData = generateMockMetricData(barCount);
      barChart3DRef.current.setAllMetricData(mockData);
    }

    barChart3DRef.current.switchViewMode(newMode);
    setViewMode(newMode);
  };

  // 实时更新（如 WebSocket 推送）
  useEffect(() => {
    const ws = new WebSocket('ws://...');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      barChart3DRef.current.setMetricData(data.metrics);
    };
    return () => ws.close();
  }, []);

  return (
    <BarChart3D
      ref={barChart3DRef}
      barSceneData={barSceneData}
      onMetricHover={handleMetricHover}
      onMetricLeave={handleMetricLeave}
    />
  );
};
```

## 交互差异

| 功能 | 组件视图 | 指标视图 |
|------|----------|----------|
| 外层悬停 | 显示主机信息 | 显示主机+5个指标百分比 |
| 外层点击 | 选中柱状图，进入内层交互 | 无效果 |
| 内层悬停 | 显示内层UUID | - |
| 内层点击 | 打开详情抽屉 | - |

## 后续扩展

1. **实时高度动画更新**：当前 `setMetricData` 是立即更新，可扩展为带 GSAP 动画的平滑过渡
2. **指标层数可配置**：当前固定5层，可扩展为动态配置
3. **指标视图点击支持**：在 `InteractionManager._onMouseClick` 中添加处理逻辑

## 可能遇到的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 切换动画卡顿 | 大量柱状图时计算量大 | 减少动画帧率或使用 Web Worker |
| 指标数据未显示 | 未在切换前设置数据 | 确保先调用 `setAllMetricData` |
| 内存泄漏 | 未正确销毁 ViewModeManager | 确保 `clearSceneContent` 中先销毁 |
| 颜色不生效 | color 值无效 | 使用有效键：normal/info/warning/error/critical |
