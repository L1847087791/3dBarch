# HostMap 3D 可视化系统 - 工具类API(下)

## 一、ViewModeManager.js - 视图模式切换

### 1.1 职责
管理组件视图和指标视图的切换，支持平滑动画过渡。

### 1.2 类定义

```javascript
class ViewModeManager {
  constructor(scene: THREE.Scene, barCollectionManager: BarCollectionManager)

  // 属性
  viewMode: 'component' | 'metric'
  isTransitioning: boolean
  metricLayerInstancedMesh: THREE.InstancedMesh
  metricData: Map<barIndex, metrics[]>
  metricLayerWidth: number
  metricLayerDepth: number
  metricColumns: number
  metricRows: number
  metricOffsets: Array

  // 方法
  initialize(): void
  switchViewMode(mode: 'component' | 'metric', options?: Object): Promise
  setMetricData(metricsArray: Array): void
  setAllMetricData(allMetrics: Array): void
  setAllMetricDataAnimated(allMetrics: Array, options?: Object): Promise
  getMetricData(barIndex: number): Array
  getViewMode(): string | null
  dispose(): void
}
```

### 1.3 视图模式对比

| 特性 | 组件视图 | 指标视图 |
|------|---------|---------|
| 内层排列 | 纵向堆叠 | 水平并排（2列×3行） |
| 内层数量 | 可变（1-80） | 固定5层 |
| 颜色含义 | 告警等级 | 指标类型 |
| 高度含义 | 组件数量 | 指标值百分比 |
| 交互 | 点击选中 | 仅悬停 |

### 1.4 指标视图配置

```javascript
export const MetricViewConfig = {
  layerCount: 5,
  defaultMetricIds: ['cpu', 'memory', 'disk', 'network', 'io'],
  defaultColors: ['metric1', 'metric2', 'metric3', 'metric4', 'metric5']
};

// 颜色映射
colorMap = {
  metric1: '#6cad7c',   // 绿色
  metric2: '#4A90D9',   // 蓝色
  metric3: '#F5A623',   // 橙色
  metric4: '#e975b4',   // 紫色
  metric5: '#fff500'    // 黄色
};
```

### 1.5 指标布局

```javascript
// 2列×3行布局（5个指标）
// 指标0: 左上
// 指标1: 右上
// 指标2: 左中
// 指标3: 右中
// 指标4: 左下

_getMetricLayoutOffset(metricIndex) {
  const col = metricIndex % 2;
  const row = Math.floor(metricIndex / 2);
  return {
    offsetX: startX + col * metricLayerWidth,
    offsetZ: startZ + row * metricLayerDepth
  };
}
```

### 1.6 使用规范

```javascript
import ViewModeManager from './utils/ViewModeManager';

const viewModeManager = new ViewModeManager(scene, barCollectionManager);
viewModeManager.initialize();

// 切换到指标视图
await viewModeManager.switchViewMode('metric', {
  duration: 0.8,
  ease: 'power2.inOut'
});

// 切换回组件视图
await viewModeManager.switchViewMode('component', {
  duration: 0.8,
  ease: 'power2.inOut'
});

// 设置指标数据
viewModeManager.setAllMetricData([
  {
    barIndex: 0,
    metrics: [
      { id: 'cpu', value: 0.75, color: 'metric1' },
      { id: 'memory', value: 0.60, color: 'metric2' }
    ]
  },
  // ...
]);

// 带动画的设置指标数据
await viewModeManager.setAllMetricDataAnimated(allMetrics, {
  duration: 0.6,
  ease: 'power2.out'
});

// 获取当前视图模式
const mode = viewModeManager.getViewMode();  // 'component' | 'metric'

// 清理资源
viewModeManager.dispose();
```

---

## 二、InteractionManager.js - 交互管理

### 2.1 职责
处理所有用户交互：悬停、点击、拖拽、光标动画。

### 2.2 类定义

```javascript
class InteractionManager {
  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    barCollectionManager: BarCollectionManager,
    viewModeManager: ViewModeManager,
    callbacks: Object
  )

  // 属性
  selectedBarIndex: number | null
  hoveredBarIndex: number | null
  hoveredLayerIndex: number | null
  isDragging: boolean
  selectionCursor: THREE.Group
  cursorRotationSpeed: number
  cursorFloatSpeed: number

  // 方法
  updateCursorAnimate(): void
  clearSelection(): void
  dispose(): void
}
```

### 2.3 回调函数集合

```javascript
callbacks = {
  onBarHover: (data) => {},        // 外层悬停
  onBarLeave: (data) => {},        // 外层离开
  onBarClick: (data) => {},        // 外层点击
  onLayerHover: (data) => {},      // 内层悬停
  onLayerLeave: (data) => {},      // 内层离开
  onLayerClick: (data) => {},      // 内层点击
  onMetricHover: (data) => {},     // 指标悬停
  onMetricLeave: (data) => {},     // 指标离开
  onHideRegionLabels: () => {},    // 隐藏区域标签
  onShowRegionLabels: () => {}     // 显示区域标签
}
```

### 2.4 回调数据格式

**外层悬停 (onBarHover)**：
```javascript
{
  type: 'outer',
  barIndex: number,
  uuid: string,
  groupName: string,
  screenPosition: {x, y},
  bar: BarManager
}
```

**内层悬停 (onLayerHover)**：
```javascript
{
  type: 'inner',
  barIndex: number,
  layerIndex: number,
  barUuid: string,
  layerUuid: string,
  groupName: string,
  screenPosition: {x, y},
  bar: BarManager
}
```

**指标悬停 (onMetricHover)**：
```javascript
{
  type: 'metric',
  barIndex: number,
  uuid: string,
  groupName: string,
  metrics: Array<{
    id: string,
    value: number,
    color: string,
    metricData: Object
  }>,
  screenPosition: {x, y},
  bar: BarManager
}
```

### 2.5 交互流程

1. **外层悬停** → 缩放1.5倍 → 触发 `onBarHover` 回调
2. **外层点击** → 选中该柱 → 禁用外层射线检测 → 创建选中光标 → 虚化其他柱
3. **内层悬停** → 闪烁动画（200ms间隔） → 触发 `onLayerHover` 回调
4. **内层点击** → 触发 `onLayerClick` 回调

### 2.6 拖拽检测

```javascript
dragThreshold: 5px              // 移动距离阈值
clickTimeThreshold: 200ms       // 按下时间阈值
```

### 2.7 使用规范

```javascript
import InteractionManager from './utils/InteractionManager';

const interactionManager = new InteractionManager(
  camera,
  domElement,
  barCollectionManager,
  viewModeManager,
  {
    onBarHover: (data) => {
      console.log('悬停主机:', data.uuid);
      showTooltip(data);
    },
    onBarClick: (data) => {
      console.log('点击主机:', data.uuid);
      showDetail(data);
    },
    onLayerHover: (data) => {
      console.log('悬停组件:', data.layerUuid);
    },
    onLayerClick: (data) => {
      console.log('点击组件:', data.layerUuid);
    },
    onHideRegionLabels: () => {
      groupIndicatorManager.hideLabels();
    },
    onShowRegionLabels: () => {
      groupIndicatorManager.showLabels();
    }
  }
);

// 每帧更新光标动画
function animate() {
  interactionManager.updateCursorAnimate();
  renderer.render(scene, camera);
}

// 清除选中状态
interactionManager.clearSelection();

// 清理资源
interactionManager.dispose();
```

---

## 三、CameraControls.js - 相机控制

### 3.1 职责
处理相机视角控制（旋转、缩放），类似 OrbitControls。

### 3.2 类定义

```javascript
class CameraControls {
  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    target: {x, y, z},
    callbacks?: Object
  )

  // 属性
  radius: number
  theta: number
  phi: number
  minRadius: number
  maxRadius: number
  minPhi: number
  maxPhi: number
  rotateSpeed: number
  zoomSpeed: number

  // 方法
  updateCameraPosition(): void
  setTarget(x: number, y: number, z: number): void
  dispose(): void
}
```

### 3.3 球坐标转换

```javascript
// 笛卡尔坐标 = 球坐标
camera.position.x = target.x + radius * sin(phi) * sin(theta)
camera.position.y = target.y + radius * cos(phi)
camera.position.z = target.z + radius * sin(phi) * cos(theta)
```

### 3.4 交互方式

- **左键拖拽**：旋转视角（theta 和 phi）
- **滚轮**：缩放距离（radius）
- **右键**：禁用（preventDefault）

### 3.5 使用规范

```javascript
import CameraControls from './utils/CameraControls';

const cameraControls = new CameraControls(
  camera,
  domElement,
  {x: 0, y: 0, z: 0},
  {
    onDragStart: () => {
      // 拖拽开始时禁用标签交互
      groupIndicatorManager.disableInteraction();
    },
    onDragEnd: () => {
      // 拖拽结束时启用标签交互
      groupIndicatorManager.enableInteraction();
    }
  }
);

// 改变目标点
cameraControls.setTarget(100, 50, 100);

// 清理资源
cameraControls.dispose();
```

---

## 四、CameraAnimator.js - 摄像机动画

### 4.1 职责
处理摄像机聚焦动画和内层文字标签显示。

### 4.2 类定义

```javascript
class CameraAnimator {
  constructor(
    camera: THREE.PerspectiveCamera,
    cameraControls: CameraControls,
    scene: THREE.Scene,
    options?: Object
  )

  // 属性
  cameraOffsetX: number
  cameraOffsetZ: number
  cameraOffsetY: number
  animationDuration: number
  labelAnimationDelay: number
  textSize: number
  textOffsetX: number
  focusedBarIndex: number | null
  focusedBar: Object
  innerLayerLabels: Array
  isAnimating: boolean

  // 方法
  focusOnBar(bar: BarManager, barIndex: number, onHideRegionLabels?: Function): Promise
  resetCamera(onShowRegionLabels?: Function): Promise
  focusOnRegion(regionInfo: Object, onHideRegionLabels?: Function): Promise
  clearFocus(): void
  hasFocus(): boolean
  dispose(): void
}
```

### 4.3 聚焦流程

1. **计算目标位置**：
   ```javascript
   targetPosition = {
     x: bar.position.x + cameraOffsetX,
     y: bar.currentHeight + cameraOffsetY,
     z: bar.position.z + cameraOffsetZ
   }
   ```

2. **GSAP 动画**：
   - 同时动画相机位置和 lookAt 目标
   - 缓动函数：`power2.inOut`
   - 时长：1.2 秒

3. **创建内层文字**：
   - 使用 Canvas 生成文字纹理
   - 创建 PlaneGeometry 显示
   - 自下而上淡入（stagger 动画）

4. **重置摄像机**：
   - 平滑过渡回初始位置
   - 显示区域标签

### 4.4 内层文字生成

```javascript
// 使用 Canvas 创建纹理
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
context.font = 'bold 48px Arial';
context.fillText(componentName, 30, canvas.height / 2);

// 创建纹理和平面
const texture = new THREE.CanvasTexture(canvas);
const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
const material = new THREE.MeshBasicMaterial({
  map: texture,
  transparent: true,
  opacity: 0,
  depthTest: false,
  depthWrite: false
});
```

### 4.5 使用规范

```javascript
import CameraAnimator from './utils/CameraAnimator';

const cameraAnimator = new CameraAnimator(
  camera,
  cameraControls,
  scene,
  {
    cameraOffsetX: 30,
    cameraOffsetZ: 30,
    cameraOffsetY: 10,
    animationDuration: 1.2,
    labelAnimationDelay: 0.3,
    textSize: 2
  }
);

// 聚焦到某个柱
await cameraAnimator.focusOnBar(bar, barIndex, () => {
  groupIndicatorManager.hideLabels();
});

// 聚焦到某个区域
await cameraAnimator.focusOnRegion(regionInfo, () => {
  groupIndicatorManager.hideLabels();
});

// 重置摄像机
await cameraAnimator.resetCamera(() => {
  groupIndicatorManager.showLabels();
});

// 检查是否有聚焦
if (cameraAnimator.hasFocus()) {
  console.log('当前有聚焦');
}

// 清除聚焦状态
cameraAnimator.clearFocus();

// 清理资源
cameraAnimator.dispose();
```

---

## 五、GroupIndicatorManager.js - 区域指示器

### 5.1 职责
管理区域指示器（边框 + 标签），支持交互和显示/隐藏。

### 5.2 类定义

```javascript
class GroupIndicatorManager {
  constructor(scene: THREE.Scene, callbacks?: Object)

  // 属性
  indicators: Array

  // 方法
  createGroupIndicator(groupInfo: Object): void
  createBorderFrame(centerX, centerZ, width, depth): Object
  createTextLabel(text, x, y, z): CSS2DObject
  createAllIndicators(groupsInfo: Array): void
  hideLabels(): void
  showLabels(): void
  disableInteraction(): void
  enableInteraction(): void
  dispose(): void
}
```

### 5.3 指示器结构

```javascript
{
  borderFrame: {
    plane: THREE.Mesh,              // 透明平面
    edges: THREE.LineSegments       // 白色边框线
  },
  textLabel: CSS2DObject,            // CSS2D 文字标签
  regionData: Object                 // 区域信息
}
```

### 5.4 标签样式

```css
.group-label {
  color: #00ffff;                    /* 青色 */
  background: linear-gradient(135deg,
    rgba(0, 212, 255, 0.1) 0%,
    rgba(255, 0, 255, 0.1) 100%);   /* 渐变背景 */
  border: 1px solid rgba(0, 255, 255, 0.5);
  backdrop-filter: blur(10px);       /* 毛玻璃效果 */
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);  /* 发光 */
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.8);
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  white-space: nowrap;
}
```

### 5.5 使用规范

```javascript
import GroupIndicatorManager from './utils/GroupIndicatorManager';

const groupIndicatorManager = new GroupIndicatorManager(
  scene,
  {
    onRegionClick: (regionData) => {
      console.log('点击区域:', regionData);
      cameraAnimator.focusOnRegion(regionData);
    }
  }
);

// 创建所有指示器
groupIndicatorManager.createAllIndicators(groupIndicatorInfo);

// 隐藏所有标签
groupIndicatorManager.hideLabels();

// 显示所有标签
groupIndicatorManager.showLabels();

// 拖拽时禁用交互
groupIndicatorManager.disableInteraction();

// 拖拽结束时启用交互
groupIndicatorManager.enableInteraction();

// 清理资源
groupIndicatorManager.dispose();
```

---

## 六、工具类使用总结

### 初始化顺序

```javascript
// 1. 初始化场景
const threeScene = new ThreeScene(container);
threeScene.init();

// 2. 创建柱状图管理器
const barCollectionManager = new BarCollectionManager(scene, config);

// 3. 创建视图模式管理器
const viewModeManager = new ViewModeManager(scene, barCollectionManager);
viewModeManager.initialize();

// 4. 创建相机控制
const cameraControls = new CameraControls(camera, domElement, target);

// 5. 创建摄像机动画
const cameraAnimator = new CameraAnimator(camera, cameraControls, scene);

// 6. 创建交互管理器
const interactionManager = new InteractionManager(
  camera, domElement, barCollectionManager, viewModeManager, callbacks
);

// 7. 创建区域指示器管理器
const groupIndicatorManager = new GroupIndicatorManager(scene);

// 8. 创建柱状图
barCollectionManager.createBars(sceneData, barWidth, initHeight, baseLayerCount);

// 9. 创建区域指示器
groupIndicatorManager.createAllIndicators(groupIndicatorInfo);
```

### 清理顺序（与初始化相反）

```javascript
groupIndicatorManager.dispose();
interactionManager.dispose();
cameraAnimator.dispose();
cameraControls.dispose();
viewModeManager.dispose();
barCollectionManager.dispose();
threeScene.dispose();
```

---

## 下一步阅读

- [hostmap详细说明-组件接口与优化.md](./hostmap详细说明-组件接口与优化.md) - BarChart3D 组件接口和性能优化详解
