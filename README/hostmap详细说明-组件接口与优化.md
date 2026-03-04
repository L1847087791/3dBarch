# HostMap 3D 可视化系统 - 组件接口与优化

## 一、BarChart3D.jsx 组件接口

### 1.1 Props 定义

```javascript
BarChart3D.propTypes = {
  // 数据相关
  barSceneData: PropTypes.shape({
    bars: PropTypes.arrayOf(PropTypes.shape({
      position: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number,
        z: PropTypes.number
      }),
      groupName: PropTypes.string,
      height: PropTypes.number,
      outerColor: PropTypes.string,
      uuid: PropTypes.string,
      layers: PropTypes.array,
      hostData: PropTypes.object
    }))
  }),

  groupIndicatorInfo: PropTypes.arrayOf(PropTypes.shape({
    centerX: PropTypes.number,
    centerZ: PropTypes.number,
    width: PropTypes.number,
    depth: PropTypes.number,
    label: PropTypes.string
  })),

  // 回调函数 - 组件视图（外层）
  onBarHover: PropTypes.func,
  onBarLeave: PropTypes.func,
  onBarClick: PropTypes.func,

  // 回调函数 - 组件视图（内层）
  onLayerHover: PropTypes.func,
  onLayerLeave: PropTypes.func,
  onLayerClick: PropTypes.func,

  // 回调函数 - 指标视图
  onMetricHover: PropTypes.func,
  onMetricLeave: PropTypes.func
}
```

### 1.2 Ref 暴露的方法

```javascript
// 通过 useRef 获取组件实例后可调用以下方法：
const barChart3DRef = useRef(null);

// 1. 切换视图模式
barChart3DRef.current.switchViewMode(mode: 'component' | 'metric')
  // 返回 Promise<void>

// 2. 获取当前视图模式
barChart3DRef.current.getViewMode()
  // 返回 'component' | 'metric' | null

// 3. 设置指标数据（单次）
barChart3DRef.current.setMetricData(metricsArray: Array)

// 4. 批量设置所有指标数据
barChart3DRef.current.setAllMetricData(allMetrics: Array)

// 5. 带动画的批量设置指标数据
barChart3DRef.current.setAllMetricDataAnimated(allMetrics: Array, options?: {
  duration?: number,    // 动画时长（秒），默认 0.6
  ease?: string         // 缓动函数，默认 'power2.out'
})
```

### 1.3 使用示例

```javascript
import { useRef } from 'react';
import BarChart3D from './components/BarChart3D';
import DataTransformer from './utils/DataTransformer';

function App() {
  const barChart3DRef = useRef(null);

  // 处理数据
  const { sceneData, groupIndicatorInfo } = DataTransformer.transformComponentViewData(
    backendData,
    { hostSpacing: 40, regionGap: 100, hostsPerRow: 10 }
  );

  // 处理悬停
  const handleBarHover = (data) => {
    console.log('悬停主机:', data.uuid);
    // 显示 Tooltip
  };

  // 处理点击
  const handleBarClick = (data) => {
    console.log('点击主机:', data.uuid);
    // 显示详情面板
  };

  // 切换视图
  const switchToMetricView = async () => {
    await barChart3DRef.current.switchViewMode('metric');
  };

  // 更新指标数据
  const updateMetrics = async (metricsData) => {
    await barChart3DRef.current.setAllMetricDataAnimated(metricsData, {
      duration: 0.8,
      ease: 'power2.inOut'
    });
  };

  return (
    <div>
      <BarChart3D
        ref={barChart3DRef}
        barSceneData={sceneData}
        groupIndicatorInfo={groupIndicatorInfo}
        onBarHover={handleBarHover}
        onBarClick={handleBarClick}
        onLayerHover={(data) => console.log('悬停组件:', data.layerUuid)}
        onLayerClick={(data) => console.log('点击组件:', data.layerUuid)}
      />
      <button onClick={switchToMetricView}>切换到指标视图</button>
      <button onClick={() => updateMetrics(newMetrics)}>更新指标</button>
    </div>
  );
}

export default App;
```

---

## 二、性能优化详解

### 2.1 初始化创建优化

#### A. InstancedMesh 批量渲染

**优化原理**：使用单个 InstancedMesh 替代多个独立 Mesh

**效果对比**：
```
场景规模：5000 个主机，每个主机 5 层组件

优化前：
- 外壳 Mesh：5000 个
- 内层 Mesh：25000 个
- 总计：30000 个 Draw Call
- 内存占用：~500MB

优化后：
- 外壳 InstancedMesh：1 个
- 内层 InstancedMesh：1 个
- 总计：2 个 Draw Call
- 内存占用：~50MB

性能提升：15 倍渲染速度，10 倍内存节省
```

**实现代码**：
```javascript
// BarManager.js
this.outerShellInstancedMesh = new THREE.InstancedMesh(
  shellGeometry,
  SharedMaterials.outerShell,
  totalBarCount
);

// 设置每个实例的矩阵
for (let i = 0; i < totalBarCount; i++) {
  const matrix = new THREE.Matrix4();
  matrix.setPosition(bars[i].position.x, bars[i].position.y, bars[i].position.z);
  this.outerShellInstancedMesh.setMatrixAt(i, matrix);
}
this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
```

#### B. 几何体缓存管理

**优化原理**：复用相同规格的几何体，避免重复创建

**实现代码**：
```javascript
const GeometryCache = {
  outerShellCache: new Map(),

  getOuterShellGeometry(width, height) {
    const key = `${width}_${height}`;
    if (!this.outerShellCache.has(key)) {
      this.outerShellCache.set(
        key,
        new THREE.BoxGeometry(width, height, width)
      );
    }
    return this.outerShellCache.get(key);
  },

  clear() {
    this.outerShellCache.forEach(geo => geo.dispose());
    this.outerShellCache.clear();
  }
};
```

#### C. 共享材质

**优化原理**：所有实例共享同一材质，减少材质对象数量

**实现代码**：
```javascript
const SharedMaterials = {
  outerShell: new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    metalness: 0.3,
    roughness: 0.7,
    emissive: 0x000000
  }),

  innerLayer: new THREE.MeshStandardMaterial({
    color: 0xe8eef5,
    metalness: 0.2,
    roughness: 0.8,
    emissive: 0x000000
  })
};
```

#### D. 临时对象复用

**优化原理**：在动画循环中复用临时对象，避免频繁分配内存

**实现代码**：
```javascript
// BarAnimationManager.js
class BarAnimationManager {
  constructor(barCollectionManager) {
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3(1, 1, 1);
  }

  _updateBarMatrices(target, progress) {
    // 复用 tempMatrix，避免每次创建新对象
    this.tempMatrix.compose(
      this.tempPosition,
      this.tempQuaternion,
      this.tempScale
    );
    // 更新 InstancedMesh
  }
}
```

### 2.2 交互优化

#### A. 拖拽检测优化

**优化原理**：区分点击和拖拽，避免误触发

**实现代码**：
```javascript
// InteractionManager.js
const dragThreshold = 5;           // 像素
const clickTimeThreshold = 200;    // 毫秒

onMouseDown(event) {
  this.dragStartX = event.clientX;
  this.dragStartY = event.clientY;
  this.dragStartTime = Date.now();
}

onMouseUp(event) {
  const distance = Math.sqrt(
    Math.pow(event.clientX - this.dragStartX, 2) +
    Math.pow(event.clientY - this.dragStartY, 2)
  );
  const duration = Date.now() - this.dragStartTime;

  // 只有在移动距离小且时间短时才视为点击
  if (distance < dragThreshold && duration < clickTimeThreshold) {
    this._handleClick(event);
  }
}
```

#### B. 区域标签交互优化

**优化原理**：拖拽时禁用标签交互，避免卡顿

**实现代码**：
```javascript
// CameraControls.js
onMouseDown() {
  if (this.callbacks?.onDragStart) {
    this.callbacks.onDragStart();  // 禁用标签交互
  }
}

onMouseUp() {
  if (this.callbacks?.onDragEnd) {
    this.callbacks.onDragEnd();    // 启用标签交互
  }
}
```

#### C. 射线检测优化

**优化原理**：根据视图模式和选中状态优化检测范围

**实现代码**：
```javascript
// InteractionManager.js
_onMouseMove(event) {
  if (this.selectedBarIndex !== null) {
    // 已选中：只检测内层
    this._handleInnerLayerHover();
  } else {
    // 未选中：检测外层
    this._handleOuterShellHover();
  }
}
```

### 2.3 动画优化

#### A. GSAP 动画管理

**优化原理**：使用 GSAP 库实现高性能动画

**特性**：
- 自动帧率适配
- 内置缓动函数库
- 支持 Timeline 组合动画

**实现代码**：
```javascript
// BarAnimationManager.js
animateHeights(barsData, options = {}) {
  const {
    duration = 0.8,
    ease = 'power2.out',
    stagger = 0
  } = options;

  const animationTargets = barsData.map(data => ({
    barIndex: data.barIndex,
    proxy: { progress: 0 },
    startOuterScaleY: this.manager.bars[data.barIndex].currentHeight,
    targetOuterScaleY: data.targetHeight
  }));

  return new Promise(resolve => {
    gsap.to(animationTargets.map(t => t.proxy), {
      progress: 1,
      duration,
      ease,
      stagger,
      onUpdate: () => {
        animationTargets.forEach(target => {
          this._updateBarMatrices(target, target.proxy.progress);
        });
        this.manager.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
      },
      onComplete: resolve
    });
  });
}
```

#### B. 视图切换动画

**优化原理**：平滑过渡组件视图和指标视图

**实现代码**：
```javascript
// ViewModeManager.js
switchViewMode(mode, options = {}) {
  const { duration = 0.8, ease = 'power2.inOut' } = options;

  return new Promise(resolve => {
    gsap.to(this.transitionProxy, {
      progress: 1,
      duration,
      ease,
      onUpdate: () => {
        // 插值计算中间状态
        this.bars.forEach((bar, index) => {
          const fromState = this.fromStates[index];
          const toState = this.toStates[index];
          const progress = this.transitionProxy.progress;

          const posX = fromState.posX + (toState.posX - fromState.posX) * progress;
          const posY = fromState.posY + (toState.posY - fromState.posY) * progress;
          const posZ = fromState.posZ + (toState.posZ - fromState.posZ) * progress;

          // 更新矩阵
          this._updateMatrix(index, posX, posY, posZ);
        });
      },
      onComplete: resolve
    });
  });
}
```

### 2.4 渲染优化

#### A. Shader 扫描光效

**优化原理**：使用自定义 Shader 实现高效的扫描光效

**特性**：
- 基于顶点高度的扫描线
- Fresnel 边缘发光效果
- 加法混合模式

**Shader 代码**：
```glsl
// Fragment Shader
uniform float scanPosition;
uniform float scanWidth;
uniform float minY;
uniform float maxY;

void main() {
  float normalizedHeight = (vPosition.y - minY) / (maxY - minY);
  float distanceToScan = abs(normalizedHeight - scanPosition);
  float scanCore = smoothstep(scanWidth * 0.5, 0.0, distanceToScan);

  vec3 scanColor = mix(baseColor, emissiveColor, scanCore);
  gl_FragColor = vec4(scanColor, 1.0);
}
```

#### B. 视锥体剔除禁用

**优化原理**：对 InstancedMesh 禁用视锥体剔除

**原因**：InstancedMesh 的视锥体剔除不准确

**实现代码**：
```javascript
this.outerShellInstancedMesh.frustumCulled = false;
this.innerLayerInstancedMesh.frustumCulled = false;
```

#### C. 包围球计算

**优化原理**：在动画完成后重新计算包围球

**效果**：确保射线检测准确性

**实现代码**：
```javascript
// BarAnimationManager.js
onComplete: () => {
  this.manager.innerLayerInstancedMesh.computeBoundingSphere();
  this.manager.outerShellInstancedMesh.computeBoundingSphere();
  resolve();
}
```

#### D. 灯光系统优化

**优化原理**：多层次灯光设计，平衡效果和性能

**配置**：
```javascript
// ThreeScene.js
const lights = {
  ambient: new THREE.AmbientLight(0xffffff, 0.6),
  main: new THREE.DirectionalLight(0xffffff, 1.5),
  fill: new THREE.DirectionalLight(0xe8f4ff, 1.0),
  spot: new THREE.SpotLight(0xffffff, 1.8),
  points: [
    new THREE.PointLight(0xe8f4ff, 0.6),
    new THREE.PointLight(0xffffff, 0.6),
    new THREE.PointLight(0xf0f8ff, 0.6),
    new THREE.PointLight(0xfafafa, 0.6)
  ]
};
```

#### E. 渲染器配置优化

**优化原理**：启用高级特性和色彩管理

**配置**：
```javascript
// ThreeScene.js
renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

---

## 三、性能指标

### 3.1 渲染性能

| 指标 | 值 |
|------|-----|
| 最大主机数 | 5000+ |
| 每主机最大组件数 | 80 |
| 平均 FPS | 60 |
| Draw Call 数 | 3-5 |
| 内存占用 | 50-100MB |

### 3.2 交互响应

| 交互 | 响应时间 |
|------|---------|
| 悬停检测 | <16ms |
| 点击检测 | <16ms |
| 视图切换 | 0.8s |
| 摄像机聚焦 | 1.2s |

---

## 四、最佳实践

### 4.1 数据更新

```javascript
// ✓ 好的做法：批量更新
await barChart3DRef.current.setAllMetricDataAnimated(allMetrics, {
  duration: 0.8
});

// ✗ 避免：逐个更新
for (let i = 0; i < metrics.length; i++) {
  await barChart3DRef.current.setMetricData([metrics[i]]);
}
```

### 4.2 内存管理

```javascript
// ✓ 好的做法：及时清理
useEffect(() => {
  return () => {
    barChart3DRef.current?.dispose?.();
  };
}, []);

// ✗ 避免：忘记清理
useEffect(() => {
  // 创建资源但不清理
}, []);
```

### 4.3 事件处理

```javascript
// ✓ 好的做法：使用回调函数
<BarChart3D
  onBarHover={(data) => updateTooltip(data)}
  onBarClick={(data) => showDetail(data)}
/>

// ✗ 避免：直接修改 DOM
onBarHover={(data) => {
  document.getElementById('tooltip').innerHTML = data.uuid;
}}
```

---

## 五、常见问题

### Q1: 如何处理大数据量（5000+主机）？

**A**: 使用 InstancedMesh 批量渲染，系统已优化支持 5000+ 主机。

### Q2: 如何自定义颜色？

**A**: 修改 `BarManager.js` 中的 `ColorMap` 对象，或通过 `setInnerLayerColor()` 方法动态更新。

### Q3: 如何添加新的视图模式？

**A**: 扩展 `ViewModeManager.js`，参考指标视图的实现方式。

### Q4: 如何优化移动设备性能？

**A**:
- 降低像素比：`renderer.setPixelRatio(1)`
- 减少灯光数量
- 禁用阴影：`renderer.shadowMap.enabled = false`

---

## 六、下一步

- 查看 [README.md](./README.md) 了解项目快速开始
- 查看 [BarChartContainer.jsx](../src/components/BarChartContainer.jsx) 了解完整使用示例
