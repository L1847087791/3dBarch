# 3D 柱状图架构说明文档

## 一、项目概述

基于 Three.js + React 的高性能 3D 柱状图可视化组件，支持：
- 160+ 柱状图，每个 1-80 层内层
- 悬停缩放、点击选中、内层闪烁高亮
- 初始化升起动画（GSAP）
- 实例颜色控制

---

## 二、文件结构

```
src/
├── components/
│   └── BarChart3D.jsx        # 主组件（数据生成、生命周期管理）
├── utils/
│   ├── ThreeScene.js         # 场景管理（相机、渲染器、灯光）
│   ├── BarManager.js         # 柱状图管理（BarManager + BarCollectionManager）
│   ├── BarAnimationManager.js # GSAP 动画管理
│   ├── InteractionManager.js  # 交互管理（射线追踪、悬停、点击）
│   ├── CameraControls.js      # 相机控制（OrbitControls 封装）
│   └── GroupIndicatorManager.js # 分组指示器（边框、标签）
```

---

## 三、核心类职责

| 类 | 职责 |
|---|------|
| `ThreeScene` | 初始化 Scene、Camera、Renderer、灯光 |
| `BarManager` | 单个柱状图的数据管理（位置、高度、内层数据） |
| `BarCollectionManager` | 统一管理 InstancedMesh、创建/更新矩阵、动画调度 |
| `BarAnimationManager` | GSAP 动画控制，处理高度过渡 |
| `InteractionManager` | 射线追踪拾取、悬停缩放、点击选中、闪烁动画 |
| `CameraControls` | OrbitControls 封装，相机视角控制 |

---

## 四、快速使用

### 4.1 基本用法

```jsx
import ThreeScene from '../utils/ThreeScene';
import { BarCollectionManager } from '../utils/BarManager';
import InteractionManager from '../utils/InteractionManager';

// 1. 初始化场景
const threeScene = new ThreeScene(containerElement);
const scene = threeScene.getScene();
const camera = threeScene.getCamera();
const renderer = threeScene.getRenderer();

// 2. 创建柱状图
const barManager = new BarCollectionManager(scene);
barManager.createBars(sceneData, barWidth, initHeight);

// 3. 设置交互
const interaction = new InteractionManager(camera, renderer.domElement, barManager);

// 4. 渲染循环
function animate() {
  requestAnimationFrame(animate);
  interaction.updateCursorAnimate(); // 更新光标动画
  threeScene.render();
}
animate();
```

### 4.2 清理资源

```javascript
interaction.dispose();
barManager.dispose();
threeScene.dispose();
```

---

## 五、数据接口格式

```javascript
const sceneData = {
  bars: [
    {
      position: { x: 0, y: 0, z: 0 },  // 柱状图位置
      groupName: '数据集 A',            // 分组名称
      height: 40,                       // 目标高度
      outerColor: 'normal',             // 外层颜色标识
      uuid: 'bar-uuid-001',             // 外层唯一标识
      layers: [
        { color: 'normal', uuid: 'layer-001' },
        { color: 'warning', uuid: 'layer-002' }
      ]
    }
  ]
};

// 创建柱状图
barManager.createBars(sceneData, 8, 5);
// 参数：sceneData, barWidth=8, initHeight=5
```

### 颜色映射

| 类型 | 可用值 |
|------|--------|
| 内层 `color` | `normal`, `info`, `warning`, `error`, `critical` |
| 外层 `outerColor` | `normal`, `active`, `warning`, `error`, `offline`, `maintenance` |

---

## 六、动画效果

### 6.1 初始化动画

`createBars()` 时自动触发，柱状图从 `initHeight` 升起到目标 `height`。

### 6.2 动态更新

```javascript
// 带动画更新
barManager.animateAllHeights([50, 45, 40, ...], {
  duration: 0.8,
  ease: 'power2.out'
});

// 立即更新（无动画）
barManager.updateAllHeights([50, 45, 40, ...]);
```

### 6.3 颜色更新

```javascript
// 更新单个内层颜色
barManager.setInnerLayerColor(barIndex, layerIndex, 'warning');

// 更新外壳颜色
barManager.setOuterShellColor(barIndex, 'error');

// 批量更新
barManager.updateColors([
  { barIndex: 0, layerIndex: 5, innerColor: 'error' },
  { barIndex: 1, outerColor: 'warning' }
]);
```

---

## 七、性能优化策略

| 优化项 | 实现方式 | 效果 |
|--------|----------|------|
| 共享材质 | `SharedMaterials` 全局对象 | 减少材质切换 |
| 几何体缓存 | `GeometryCache` 按尺寸缓存 | 减少内存占用 |
| InstancedMesh | 外壳 1 个、内层 1 个 | Draw Call: 16160→3 |
| 合并边框 | `mergeGeometries` | 边框 1 次绘制 |

**性能指标：**
- 首屏加载：7-9s → <2s
- 帧率：<20fps → 60fps
- Draw Calls：16160 → 3

---

## 八、高度计算逻辑

```
几何体基准：initHeight（如 5）
外壳 scaleY = targetHeight / initHeight
内层 scaleY = actualLayerHeight / baseLayerHeight

baseLayerHeight = (initHeight - gaps) / baseLayerCount
actualLayerHeight = (targetHeight - gaps) / layerCount
```

---

## 九、架构优势

1. **职责分离**：数据管理、渲染、动画、交互各自独立
2. **高性能**：InstancedMesh 批量渲染，99.98% Draw Call 减少
3. **易扩展**：动画管理器独立，便于增加相机/UI动画
4. **数据驱动**：接口格式统一，适配后端数据源

---

## 十、已知问题与限制

| 问题 | 说明 | 解决方案 |
|------|------|----------|
| 边框更新开销 | 每次高度变化需重新合并 8000 个边框 | 考虑着色器实现 |
| InstancedMesh 固定 count | 无法动态增删柱状图 | 预分配或重建 |
| 材质个性化受限 | 共享材质，仅支持 `setColorAt` | 自定义着色器 |
| 动画期间边框不同步 | 边框在动画后延迟创建 | 可优化为实时更新 | (已解决，在gsap动画onComplete回调中创建)

---

## 十一、后续迭代方向

1. **相机动画**：步入式体验、场景切换过渡
2. **UI 动画**：悬停浮层、点击弹窗的淡入效果
3. **边框优化**：使用 InstancedBufferGeometry 或着色器
4. **动态增删**：支持运行时添加/移除柱状图

---

*更新日期：2025-12-30*
