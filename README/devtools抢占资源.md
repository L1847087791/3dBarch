# DevTools 打开后摄像机动画卡顿问题分析

## 问题现象

- **改动之前**：打开 DevTools 再执行点击主机后产生的摄像机动画，整个流程有明显掉帧卡顿
- **改动之后**：打开 DevTools，动画很流畅，几乎不掉帧
- **关键发现**：改动的代码与摄像机动画没有直接关系

## 根本原因

经过控制变量法排查，问题定位到 `src/utils/BarManager.js` 第 194 行：

```javascript
// 之前
this.layerGap = 0.1;  // 卡顿

// 之后
this.layerGap = 0.25; // 流畅
```

### 核心原因：Z-Fighting（深度冲突）

当 `layerGap = 0.1` 时，柱状图内层之间的间隙非常小，导致：

1. **相邻层的几何体在深度缓冲区中的值极其接近**
2. GPU 在判断"哪个像素在前面"时产生**深度精度不足**的问题
3. 渲染时出现**像素级深度冲突**（Z-Fighting）

### 为什么只有摄像机动画时才卡顿？

关键发现：**不是摄像机动画本身导致卡顿，而是动画触发的"变暗"操作让 Z-Fighting 从隐性变为显性。**

当点击主机时，`focusOnBar()` 函数会将其他主机变暗：

```javascript
// src/utils/BarManager.js
focusOnBar(barIndex) {
  const dimFactor = 0.2;  // 将颜色乘以 0.2（变暗 80%）

  bars.forEach((bar, index) => {
    if (index === barIndex) return;  // 被点击的保持原样
    this._dimBar(index, dimFactor);   // 其他全部变暗
  });
}

_dimBar(barIndex, factor) {
  // 外壳颜色 × 0.2
  outerColor.multiplyScalar(factor);

  // 每一层内层颜色 × 0.2
  bar.layerInstanceIds.forEach((instanceId, layerIndex) => {
    innerColor.multiplyScalar(factor);
  });
}
```

**为什么变暗会触发 Z-Fighting 的视觉问题？**

| 状态 | 颜色值 | 深度冲突表现 |
|------|--------|-------------|
| 正常 | 原色（如 `#e8eef5`） | 即使有轻微 Z-Fighting，颜色差异不明显 |
| 变暗后 | 原色 × 0.2（如 `#2e3031`） | **深色放大了 Z-Fighting 的视觉效果** |

当 `layerGap = 0.1` 时：
1. 相邻层本来就有轻微的深度冲突
2. 正常颜色下，冲突像素的颜色差异小，肉眼不易察觉
3. **变暗后**，冲突像素在"深色"和"更深色"之间闪烁
4. GPU 每帧都在重新计算这些边界像素
5. DevTools 的额外开销让这个问题雪上加霜

### 为什么 DevTools 放大了这个问题？

DevTools 打开时：
- 浏览器的帧率可能被限制或不稳定
- 渲染管线增加了额外的同步点
- 当存在 Z-Fighting 时，每帧的深度判定结果可能不同
- GPU 需要反复重新计算这些"边界像素"，导致大量无效重绘

当 `layerGap = 0.25` 时：
- 层与层之间有足够的深度差距
- 深度缓冲区能明确判断前后关系
- 不再有像素级的深度冲突
- 渲染稳定，无额外开销

## 是否需要关注 DevTools 导致的卡顿？

| 情况 | 是否需要关注 |
|------|-------------|
| DevTools 打开后整体变慢 10-20% | 正常，不用管 |
| DevTools 打开后**特定操作**严重卡顿 | ⚠️ 需要关注 |
| 关闭 DevTools 后问题消失 | 可能是潜在问题的放大镜 |

## 这是一个预警信号

本次问题说明：
- 场景中存在 **Z-Fighting** 或 **深度精度边界问题**
- 正常情况下 GPU 勉强能处理，但稳定性很脆弱
- DevTools 的额外开销打破了这个脆弱的平衡

即使用户不开 DevTools，在以下情况也可能出现问题：
- 低端设备
- 浏览器后台有其他任务
- 摄像机移动到特定角度（深度值更接近时）

## 解决方案

### 当前方案
增大 `layerGap` 值（0.1 → 0.25），确保层与层之间有足够的深度差距。

### 其他可选方案
如果需要更小的间隙但又要避免 Z-Fighting：

1. **使用 `logarithmicDepthBuffer`**（对大场景有效）
2. **调整 camera 的 near/far 比例**（减小范围提高精度）
3. **对重叠几何体使用 `polygonOffset`**

## 结论

DevTools 在本次问题中充当了"放大镜"的角色，帮助暴露了一个潜在的渲染稳定性问题。这提醒我们：当 DevTools 打开导致特定操作异常卡顿时，往往意味着代码中存在边界条件或性能隐患，值得深入排查。
