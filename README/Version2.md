# Version 2 实施文档

## 一、需求概览

| 需求 | 描述 | 核心目标 |
|------|------|----------|
| 需求一 | 控制面板 + 数据过滤 | 支持关键字搜索，后端返回新快照后重新渲染场景 |
| 需求二 | 悬停浮层 + 点击弹窗 | 交互时显示详情信息，支持后续功能扩展 |
| 需求三 | 虚化聚焦效果 | 点击柱状图时虚化其他柱状图，禁用其交互 |

---

## 二、需求一：控制面板 + 数据重载

### 2.1 方案对比

| 方案 | 实现方式 | 难度 | 性能 | 兼容性 |
|------|----------|------|------|--------|
| **A: Key 重建** | `key={version}` 强制卸载重建 | ⭐ | 中等 (<2s) | 好 |
| B: 内部重载 | 暴露 `reload()` 方法 | ⭐⭐⭐ | 较好 | 需完善 dispose |
| C: 差量更新 | 对比新旧数据，局部更新 | ⭐⭐⭐⭐⭐ | 最优 | 差 (InstancedMesh 限制) |

**选定方案 A**：利用 React key 机制强制重建组件

### 2.2 架构设计

```
BarChartContainer (新增)
├── state: { sceneData, dataVersion, loading }
├── method: handleSearch(keyword)
│
├── <ControlPanel onSearch={handleSearch} />
└── <BarChart3D key={dataVersion} sceneData={sceneData} />
```

### 2.3 实施步骤

**步骤 1：创建 BarChartContainer.jsx**

```jsx
import { useState, useCallback } from 'react';
import BarChart3D from './BarChart3D';
import ControlPanel from './ControlPanel';

export default function BarChartContainer() {
  const [sceneData, setSceneData] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);

  // 初始化加载
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (keyword = '') => {
    setLoading(true);
    try {
      const data = await api.getSceneData(keyword);  // 后端接口
      setSceneData(data);
      setDataVersion(v => v + 1);  // 触发重建
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bar-chart-container">
      <ControlPanel onSearch={fetchData} loading={loading} />
      {sceneData && (
        <BarChart3D key={dataVersion} sceneData={sceneData} />
      )}
    </div>
  );
}
```

**步骤 2：改造 BarChart3D.jsx**

```jsx
// 原：内部生成数据
const sceneData = generateSceneData();

// 改：接收外部数据
export default function BarChart3D({ sceneData }) {
  // 移除 generateSceneData 调用
  // 直接使用 props.sceneData
}
```

**步骤 3：创建 ControlPanel.jsx**

```jsx
import { Input, Button } from 'antd';

export default function ControlPanel({ onSearch, loading }) {
  const [keyword, setKeyword] = useState('');

  const handleSearch = () => {
    onSearch(keyword);
  };

  return (
    <div className="control-panel">
      <Input
        placeholder="输入关键字搜索"
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        onPressEnter={handleSearch}
      />
      <Button onClick={handleSearch} loading={loading}>搜索</Button>
      <Button onClick={() => { setKeyword(''); onSearch(''); }}>重置</Button>
    </div>
  );
}
```

### 2.4 潜在问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 重建时白屏 | 场景销毁到重建有间隙 | 添加 loading 遮罩层 |
| 内存泄漏 | dispose 不完整 | 检查 useEffect 清理函数 |
| 动画中断 | 重建时 GSAP 动画未清理 | 在 dispose 中调用 `gsap.killTweensOf()` |

---

## 三、需求二：悬停浮层 + 点击弹窗

### 3.1 方案对比

| 方案 | 实现方式 | 难度 | 性能 | 兼容性 |
|------|----------|------|------|--------|
| **A: DOM 覆盖层** | 绝对定位 DOM 叠加在 canvas 上 | ⭐⭐ | 好 | 好 (可用 antd) |
| B: CSS2DRenderer | Three.js 内置 2D 渲染器 | ⭐⭐ | 好 | 中等 |
| C: Sprite 精灵图 | Three.js 精灵对象 | ⭐⭐⭐⭐ | 中等 | 差 (需自绘 UI) |

**选定方案 A**：DOM 覆盖层 + 绝对定位

### 3.2 架构设计

```
<div class="chart-wrapper" style="position: relative">
  │
  ├── <canvas />                    <!-- Three.js 画布 -->
  │
  ├── <Tooltip />                   <!-- 浮层：absolute + pointer-events: none -->
  │   └── position: 跟随柱状图顶部
  │
  └── <Modal />                     <!-- 弹窗：absolute + 居中/固定位置 -->
      └── position: 视口居中
</div>
```

### 3.3 实施步骤

**步骤 1：改造 InteractionManager，增加回调**

```javascript
// InteractionManager.js
class InteractionManager {
  constructor(camera, domElement, barCollectionManager, callbacks = {}) {
    // ... 原有代码
    this.callbacks = {
      onBarHover: callbacks.onBarHover || null,
      onBarLeave: callbacks.onBarLeave || null,
      onBarClick: callbacks.onBarClick || null,
      onLayerHover: callbacks.onLayerHover || null,
      onLayerClick: callbacks.onLayerClick || null,
    };
  }

  // 获取屏幕坐标
  getScreenPosition(position3D) {
    const vector = new THREE.Vector3(position3D.x, position3D.y, position3D.z);
    vector.project(this.camera);
    const rect = this.domElement.getBoundingClientRect();
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-vector.y * 0.5 + 0.5) * rect.height
    };
  }

  // 修改 _processOuterShellHover
  _processOuterShellHover(barIndex) {
    // ... 原有悬停逻辑

    if (this.callbacks.onBarHover) {
      const bar = this.barCollectionManager.getBars()[barIndex];
      this.callbacks.onBarHover({
        barIndex,
        bar,
        screenPosition: this.getScreenPosition({
          x: bar.position.x,
          y: bar.currentHeight,
          z: bar.position.z
        })
      });
    }
  }

  // 修改 _resetHoverState
  _resetHoverState() {
    // ... 原有重置逻辑

    if (this.callbacks.onBarLeave) {
      this.callbacks.onBarLeave();
    }
  }

  // 修改 _onBarSelected
  _onBarSelected(barIndex) {
    // ... 原有选中逻辑

    if (this.callbacks.onBarClick) {
      const bar = this.barCollectionManager.getBars()[barIndex];
      this.callbacks.onBarClick({
        barIndex,
        bar,
        screenPosition: this.getScreenPosition({
          x: bar.position.x,
          y: bar.currentHeight,
          z: bar.position.z
        })
      });
    }
  }
}
```

**步骤 2：改造 BarChart3D，传递回调**

```jsx
// BarChart3D.jsx
export default function BarChart3D({
  sceneData,
  onBarHover,
  onBarLeave,
  onBarClick,
  onLayerClick
}) {
  useEffect(() => {
    // ... 原有初始化代码

    interactionRef.current = new InteractionManager(
      camera,
      renderer.domElement,
      barManagerRef.current,
      {
        onBarHover,
        onBarLeave,
        onBarClick,
        onLayerClick
      }
    );
  }, []);
}
```

**步骤 3：在 BarChartContainer 中实现浮层/弹窗**

```jsx
// BarChartContainer.jsx
export default function BarChartContainer() {
  // ... 原有状态

  // 浮层状态
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    data: null
  });

  // 弹窗状态
  const [modal, setModal] = useState({
    visible: false,
    data: null
  });

  const handleBarHover = useCallback(({ bar, screenPosition }) => {
    setTooltip({
      visible: true,
      x: screenPosition.x,
      y: screenPosition.y,
      data: bar.tooltipData  // 后端返回的浮层数据
    });
  }, []);

  const handleBarLeave = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }));
  }, []);

  const handleBarClick = useCallback(({ bar }) => {
    setModal({
      visible: true,
      data: bar.detailData  // 后端返回的详情数据
    });
  }, []);

  return (
    <div className="bar-chart-container" style={{ position: 'relative' }}>
      <ControlPanel onSearch={fetchData} loading={loading} />

      {sceneData && (
        <BarChart3D
          key={dataVersion}
          sceneData={sceneData}
          onBarHover={handleBarHover}
          onBarLeave={handleBarLeave}
          onBarClick={handleBarClick}
        />
      )}

      {/* 浮层 */}
      {tooltip.visible && (
        <div
          className="bar-tooltip"
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%) translateY(-10px)',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          <TooltipContent data={tooltip.data} />
        </div>
      )}

      {/* 弹窗 */}
      <Modal
        open={modal.visible}
        onCancel={() => setModal({ visible: false, data: null })}
        footer={null}
      >
        <ModalContent data={modal.data} />
      </Modal>
    </div>
  );
}
```

### 3.4 潜在问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 浮层位置偏移 | 相机旋转后坐标变化 | 在 `requestAnimationFrame` 中持续更新位置 |
| 浮层闪烁 | 频繁触发 hover 事件 | 添加防抖或状态缓存 |
| 浮层被遮挡 | z-index 不够 | 确保浮层 z-index > canvas |
| 弹窗打开时仍可交互 | 未禁用 canvas 事件 | 弹窗打开时设置 `pointerEvents: none` 给 canvas |

---

## 四、需求三：虚化聚焦效果

### 4.1 方案对比

| 方案 | 实现方式 | 难度 | 性能 | 兼容性 |
|------|----------|------|------|--------|
| **A: 亮度降低** | `setColorAt` 降低 RGB 值 | ⭐ | 最优 | 好 |
| B: 透明度着色器 | 自定义 shader 增加 alpha | ⭐⭐⭐⭐ | 好 | 中等 |
| C: 双 Mesh 分离 | 虚化对象移到透明 Mesh | ⭐⭐⭐ | 中等 | 好 |

**选定方案 A**：通过降低颜色亮度模拟虚化效果

### 4.2 实施步骤

**步骤 1：在 BarCollectionManager 中新增方法**

```javascript
// BarManager.js - BarCollectionManager 类

// 聚焦到指定柱状图
focusOnBar(barIndex) {
  const bars = this.bars;
  const dimFactor = 0.2;  // 虚化程度：0.2 = 20% 亮度

  bars.forEach((bar, index) => {
    if (index === barIndex) {
      // 选中柱状图：保持原样，确保可交互
      bar.outerShell.userData.raycastEnabled = true;
      return;
    }

    // 其他柱状图：降低亮度 + 禁用交互
    this._dimBar(index, dimFactor);
    bar.outerShell.userData.raycastEnabled = false;
  });

  this.outerShellInstancedMesh.instanceColor.needsUpdate = true;
  this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;

  this.focusedBarIndex = barIndex;
}

// 取消聚焦，恢复所有柱状图
unfocus() {
  if (this.focusedBarIndex === null) return;

  this.bars.forEach((bar, index) => {
    this._restoreBarColor(index);
    bar.outerShell.userData.raycastEnabled = true;
  });

  this.outerShellInstancedMesh.instanceColor.needsUpdate = true;
  this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;

  this.focusedBarIndex = null;
}

// 降低单个柱状图亮度
_dimBar(barIndex, factor) {
  const bar = this.bars[barIndex];

  // 外壳
  const outerColor = new THREE.Color(ColorMap.outer[bar.outerColor]);
  outerColor.multiplyScalar(factor);
  this.outerShellInstancedMesh.setColorAt(barIndex, outerColor);

  // 内层
  bar.layerInstanceIds.forEach((instanceId, layerIndex) => {
    const layerColorKey = bar.innerLayers[layerIndex].color;
    const innerColor = new THREE.Color(ColorMap.inner[layerColorKey]);
    innerColor.multiplyScalar(factor);
    this.innerLayerInstancedMesh.setColorAt(instanceId, innerColor);
  });
}

// 恢复单个柱状图颜色
_restoreBarColor(barIndex) {
  const bar = this.bars[barIndex];

  // 外壳
  const outerColor = new THREE.Color(ColorMap.outer[bar.outerColor]);
  this.outerShellInstancedMesh.setColorAt(barIndex, outerColor);

  // 内层
  bar.layerInstanceIds.forEach((instanceId, layerIndex) => {
    const layerColorKey = bar.innerLayers[layerIndex].color;
    const innerColor = new THREE.Color(ColorMap.inner[layerColorKey]);
    this.innerLayerInstancedMesh.setColorAt(instanceId, innerColor);
  });
}
```

**步骤 2：在 InteractionManager 中集成聚焦**

```javascript
// InteractionManager.js

_onBarSelected(barIndex) {
  // ... 原有选中逻辑

  // 触发聚焦效果
  this.barCollectionManager.focusOnBar(barIndex);
}

_clearBarSelection() {
  // ... 原有清除逻辑

  // 取消聚焦
  this.barCollectionManager.unfocus();
}
```

### 4.3 潜在问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 颜色恢复不准确 | 原始颜色未保存 | 在 bar 对象中缓存原始颜色值 |
| 边框未虚化 | 边框是独立 Mesh | 同步修改边框材质颜色 |
| 虚化过渡生硬 | 无动画过渡 | 使用 GSAP 动画 factor 从 1 到 0.2 |

---

## 五、文件变更清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新建 | `src/components/BarChartContainer.jsx` | 父容器组件 |
| 新建 | `src/components/ControlPanel.jsx` | 控制面板组件 |
| 新建 | `src/components/TooltipContent.jsx` | 浮层内容组件 |
| 新建 | `src/components/ModalContent.jsx` | 弹窗内容组件 |
| 修改 | `src/components/BarChart3D.jsx` | 接收 props，传递回调 |
| 修改 | `src/utils/InteractionManager.js` | 增加回调机制 |
| 修改 | `src/utils/BarManager.js` | 增加聚焦/虚化方法 |
| 新建 | `src/styles/overlay.css` | 浮层/弹窗样式 |

---

## 六、实施顺序

```
阶段一：基础改造
├── 1.1 改造 InteractionManager 增加回调
├── 1.2 改造 BarChart3D 接收 props
└── 1.3 测试回调是否正常触发

阶段二：控制面板
├── 2.1 创建 BarChartContainer
├── 2.2 创建 ControlPanel
└── 2.3 测试数据重载

阶段三：浮层弹窗
├── 3.1 实现浮层定位逻辑
├── 3.2 实现弹窗显示逻辑
└── 3.3 测试交互流程

阶段四：虚化效果
├── 4.1 实现 focusOnBar / unfocus
├── 4.2 集成到选中逻辑
└── 4.3 测试视觉效果
```

---

## 七、后续优化方向

1. **加载体验**：数据重载时添加骨架屏或 loading 动画
2. **虚化动画**：使用 GSAP 实现渐变虚化效果
3. **相机聚焦**：点击柱状图时相机平滑移动到最佳观察位置
4. **浮层跟随**：相机旋转时浮层位置实时更新

---

*文档版本：v2.0*
*更新日期：2025-01-05*
