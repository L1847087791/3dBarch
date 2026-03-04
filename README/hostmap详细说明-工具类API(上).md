# HostMap 3D 可视化系统 - 工具类API(上)

## 一、DataTransformer.js - 数据转换工具

### 1.1 职责
将后端 API 响应数据转换为前端 3D 场景所需的格式。

### 1.2 核心函数

#### generatePositionsFromGroups(groups, config)
**功能**：根据分组信息生成 3D 位置坐标

**参数**：
```javascript
groups: Array<{
  fz: string,           // 分组名称
  zylb: Array<{         // 主机列表
    id: string,
    mc: string,
    ip: string,
    zylx: string,
    gjdj: number,
    zj: Array            // 组件列表
  }>
}>

config: {
  hostSpacing: 40,      // 主机间距
  regionGap: 100,       // 分区间隔
  hostsPerRow: 10,      // 每行主机数
  regionsPerRow: 6,     // 每行分区数
  barWidth: 10          // 柱状图宽度
}
```

**返回值**：
```javascript
{
  positions: Array<{x, y, z}>,  // 每个主机的位置
  groupInfo: Array<{            // 分组信息
    centerX, centerZ,
    width, depth,
    label: string
  }>
}
```

#### transformComponentViewData(backendData, config)
**功能**：转换组件视图数据（主要使用）

**参数**：
```javascript
backendData: {
  code: 200,
  data: {
    total: number,
    fzs: Array  // 分组数组
  }
}

config: {
  hostSpacing: 40,
  regionGap: 100,
  hostsPerRow: 10,
  regionsPerRow: 6,
  barWidth: 10,
  baseLayerCount: 5     // 基准层数
}
```

**返回值**：
```javascript
{
  sceneData: {
    bars: Array<{
      position: {x, y, z},
      groupName: string,
      height: number,           // 初始高度
      outerColor: string,       // 'normal'
      uuid: string,             // 主机ID
      layers: Array<{           // 内层数据
        color: number,          // 0-3 告警等级
        uuid: string,           // 组件ID
        componentData: Object
      }>,
      hostData: Object          // 主机完整数据
    }>
  },
  groupIndicatorInfo: Array,    // 区域指示器信息
  rawData: Object               // 原始后端数据
}
```

#### transformMetricViewData(backendData)
**功能**：转换指标视图数据

**参数**：后端数据

**返回值**：
```javascript
{
  metricsArray: Array<{
    barIndex: number,
    metrics: Array<{
      id: string,
      value: number,            // 0-1 范围
      color: string,            // metric1-metric5
      metricData: Object
    }>
  }>,
  rawData: Object
}
```

#### generateGroupIndicators(groupInfo)
**功能**：生成分组指示器信息

**参数**：分组信息数组

**返回值**：指示器配置数组

### 1.3 使用规范

```javascript
import DataTransformer from './utils/DataTransformer';

// 转换组件视图数据
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

// 传入 BarChart3D 组件
<BarChart3D
  barSceneData={sceneData}
  groupIndicatorInfo={groupIndicatorInfo}
/>
```

---

## 二、ThreeScene.js - 场景管理

### 2.1 职责
初始化 Three.js 场景、相机、渲染器、灯光系统。

### 2.2 类定义

```javascript
class ThreeScene {
  constructor(container: HTMLElement)

  // 核心属性
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  labelRenderer: CSS2DRenderer
  lights: Array<THREE.Light>

  // 方法
  init(): void
  setupLights(): void
  createDynamicLights(): void
  onWindowResize(): void
  render(): void
  clearSceneContent(excludeTypes?: Array): void
  dispose(): void
}
```

### 2.3 初始化配置

**场景配置**：
```javascript
scene.background = new THREE.Color(0x2a2e35);  // 深灰色背景
scene.fog = new THREE.Fog(0x2a2e35, 800, 2500);  // 雾效
```

**相机配置**：
```javascript
camera = new THREE.PerspectiveCamera(
  60,                    // FOV
  width / height,        // 宽高比
  1,                     // 近裁剪面
  5000                   // 远裁剪面
);
camera.position.set(138, 423, 0);
```

**渲染器配置**：
```javascript
renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

### 2.4 灯光系统

| 灯光类型 | 强度 | 位置 | 用途 |
|---------|------|------|------|
| 环境光 | 0.6 | - | 基础照明 |
| 主光源 | 1.5 | (100, 200, 100) | 顶部照明 |
| 补光 | 1.0 | (-100, 100, -100) | 冷白色补光 |
| 聚光灯 | 1.8 | (0, 300, 0) | 增强立体感 |
| 点光源×4 | 0.6 | 四个角 | 柔和氛围 |

### 2.5 使用规范

```javascript
import ThreeScene from './utils/ThreeScene';

const threeScene = new ThreeScene(containerElement);
threeScene.init();

// 获取场景对象
const { scene, camera, renderer, labelRenderer } = threeScene;

// 窗口大小变化时
window.addEventListener('resize', () => {
  threeScene.onWindowResize();
});

// 清理资源
threeScene.dispose();
```

---

## 三、BarManager.js - 柱状图管理

### 3.1 职责
管理单个柱状图和柱状图集合的创建、更新、动画。

### 3.2 BarManager 类（单个柱）

```javascript
class BarManager {
  constructor(
    scene: THREE.Scene,
    position: {x, y, z},
    barWidth: number,
    initHeight: number,
    layersData: Array,
    barIndex: number,
    groupName: string,
    baseLayerHeight: number,
    outerColor: string,
    uuid: string,
    layerGap: number,
    hostData: Object
  )

  // 属性
  position: {x, y, z}
  barWidth: number
  initHeight: number
  currentHeight: number
  layersData: Array
  layerCount: number
  barIndex: number
  groupName: string
  baseLayerHeight: number
  outerColor: string
  uuid: string
  hostData: Object

  // 方法
  initLayerData(): void
  updateOuterHeight(newHeight: number): void
  getCurrentHeight(): number
  dispose(): void
}
```

### 3.3 BarCollectionManager 类（集合管理）

```javascript
class BarCollectionManager {
  constructor(scene: THREE.Scene, config: Object)

  // 属性
  bars: Array<BarManager>
  outerShellInstancedMesh: THREE.InstancedMesh
  innerLayerInstancedMesh: THREE.InstancedMesh
  totalLayerCount: number
  instanceIdToLayer: Map
  animationManager: BarAnimationManager
  scanningLights: Array

  // 核心方法
  createBars(sceneData, barWidth, initHeight, baseLayerCount): void
  updateAllHeights(heights: Array): void
  animateAllHeights(heights: Array, options?: Object): Promise
  setInnerLayerColor(barIndex, layerIndex, colorKey): void
  setOuterShellColor(barIndex, colorKey): void
  updateColors(colorUpdates: Array): void
  focusOnBar(barIndex: number): void
  unfocus(): void
  updateScanningAnimation(deltaTime: number): void
  dispose(): void
}
```

### 3.4 颜色映射

**内层颜色**（告警等级）：
```javascript
{
  0: '#e8eef5',    // 浅灰蓝（正常）
  1: '#ffcd3d',    // 浅黄（次要）
  2: '#ff8c3d',    // 浅粉（主要）
  3: '#ff4849'     // 浅红（严重）
}
```

**外层颜色**：
```javascript
{
  normal: '#f5f5f5'  // 浅灰白
}
```

### 3.5 内层数据结构

```javascript
{
  layerIndex: number,
  barIndex: number,
  groupName: string,
  baseHeight: number,
  scaleY: number,
  positionY: number,
  color: number,           // 0-3
  uuid: string,
  componentData: {
    id: string,
    mc: string,            // 组件名
    zylx: string,          // 组件类型
    gjdj: number           // 告警等级
  }
}
```

### 3.6 使用规范

```javascript
import BarCollectionManager from './utils/BarManager';

const barManager = new BarCollectionManager(scene, {
  barWidth: 10,
  initHeight: 20,
  baseLayerCount: 5,
  layerGap: 2
});

// 创建柱状图
barManager.createBars(sceneData, 10, 20, 5);

// 更新高度（立即）
barManager.updateAllHeights([15, 20, 25, ...]);

// 更新高度（动画）
await barManager.animateAllHeights([15, 20, 25, ...], {
  duration: 0.8,
  ease: 'power2.out'
});

// 更新颜色
barManager.updateColors([
  { barIndex: 0, layerIndex: 0, colorKey: 1 },
  { barIndex: 0, layerIndex: 1, colorKey: 2 }
]);

// 聚焦到某个柱
barManager.focusOnBar(0);

// 取消聚焦
barManager.unfocus();

// 清理资源
barManager.dispose();
```

---

## 四、BarAnimationManager.js - 动画管理

### 4.1 职责
使用 GSAP 库管理柱状图高度动画。

### 4.2 类定义

```javascript
class BarAnimationManager {
  constructor(barCollectionManager: BarCollectionManager)

  // 属性
  activeAnimations: Map<barIndex, tween>

  // 方法
  animateHeights(barsData: Array, options?: Object): Promise
  animateBarHeight(barIndex: number, targetHeight: number, options?: Object): Promise
  killAll(): void
  killBar(barIndex: number): void
  dispose(): void
}
```

### 4.3 动画参数

```javascript
options: {
  duration: number,      // 动画时长（秒），默认 0.8
  ease: string,          // 缓动函数，默认 'power2.out'
  delay: number,         // 延迟时间（秒），默认 0
  stagger: number        // 错开时间（秒），默认 0
}
```

### 4.4 高度计算逻辑

```javascript
// 基准层高度
baseLayerHeight = (initHeight - totalGap) / baseLayerCount

// 实际高度计算
totalGap = layerGap * (layerCount + 1)
availableHeight = targetHeight - totalGap
actualLayerHeight = availableHeight / layerCount
scaleY = actualLayerHeight / baseLayerHeight
```

### 4.5 使用规范

```javascript
import BarAnimationManager from './utils/BarAnimationManager';

const animationManager = new BarAnimationManager(barCollectionManager);

// 动画多个柱
await animationManager.animateHeights(
  [
    { barIndex: 0, targetHeight: 25 },
    { barIndex: 1, targetHeight: 30 },
    { barIndex: 2, targetHeight: 20 }
  ],
  {
    duration: 1.0,
    ease: 'power2.inOut',
    stagger: 0.1
  }
);

// 动画单个柱
await animationManager.animateBarHeight(0, 25, {
  duration: 0.8,
  ease: 'power2.out'
});

// 停止所有动画
animationManager.killAll();

// 停止单个柱的动画
animationManager.killBar(0);

// 清理资源
animationManager.dispose();
```

### 4.6 性能特点

- **自动帧率适配**：GSAP 自动适配不同设备的帧率
- **内存高效**：使用代理对象，避免频繁创建新对象
- **矩阵批量更新**：每帧一次性更新所有矩阵
- **Draw Call 优化**：InstancedMesh 只需 1 个 Draw Call

---

## 下一步阅读

- [hostmap详细说明-工具类API(下).md](./hostmap详细说明-工具类API(下).md) - 视图管理、交互、相机、指示器
