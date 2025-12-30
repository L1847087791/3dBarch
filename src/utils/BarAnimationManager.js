import gsap from 'gsap';

/**
 * 柱状图动画管理器
 * 负责处理柱状图高度变化的 GSAP 动画效果
 */
class BarAnimationManager {
  /**
   * @param {BarCollectionManager} barCollectionManager - 柱状图集合管理器实例
   */
  constructor(barCollectionManager) {
    this.manager = barCollectionManager;
    this.activeAnimations = new Map(); // 存储正在进行的动画 barIndex -> tween
  }

  /**
   * 动画化所有柱状图从当前高度到目标高度
   * @param {Array} barsData - 柱状图数据数组 [{ height: number, ... }, ...]
   * @param {Object} options - 动画选项
   * @param {number} options.duration - 动画时长（秒），默认 0.8
   * @param {string} options.ease - 缓动函数，默认 'power2.out'
   * @param {Function} options.onComplete - 动画完成回调
   * @returns {gsap.core.Tween} GSAP 动画实例
   */
  animateHeights(barsData, options = {}) {
    const {
      duration = 0.8,
      ease = 'power2.out',
      onComplete = null
    } = options;

    // 收集所有需要动画的柱状图数据
    const animationTargets = [];

    barsData.forEach((barData, index) => {
      const bar = this.manager.bars[index];
      if (!bar || barData.height === undefined) return;

      // 计算起始值和目标值
      const startHeight = bar.currentHeight;
      const targetHeight = barData.height;

      // 计算外壳的起始和目标 scaleY
      const startOuterScaleY = startHeight / bar.initHeight;
      const targetOuterScaleY = targetHeight / bar.initHeight;

      // 计算内层的起始和目标值
      const startInnerData = this._calculateInnerLayerData(bar, startHeight);
      const targetInnerData = this._calculateInnerLayerData(bar, targetHeight);

      animationTargets.push({
        barIndex: index,
        bar: bar,
        // 动画进度代理对象
        proxy: {
          progress: 0 // 0 -> 1
        },
        startOuterScaleY,
        targetOuterScaleY,
        startInnerData,
        targetInnerData
      });
    });

    if (animationTargets.length === 0) return null;

    // 创建统一的动画
    const tween = gsap.to(
      animationTargets.map(t => t.proxy),
      {
        progress: 1,
        duration,
        ease,
        onUpdate: () => {
          // 每帧更新所有柱状图的矩阵
          animationTargets.forEach(target => {
            const progress = target.proxy.progress;
            this._updateBarMatrices(target, progress);
          });

          // 标记 InstancedMesh 需要更新
          this.manager.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
          this.manager.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
        },
        onComplete: () => {
          // 动画完成后，更新 bar 的 currentHeight
          animationTargets.forEach(target => {
            const barData = barsData[target.barIndex];
            target.bar.currentHeight = barData.height;
            // 同步更新内层数据
            target.bar.innerLayers = target.targetInnerData;
          });

          // 重新计算包围球（用于射线检测）
          this.manager.innerLayerInstancedMesh.computeBoundingSphere();

          if (onComplete) onComplete();
        }
      }
    );

    return tween;
  }

  /**
   * 动画化单个柱状图高度
   * @param {number} barIndex - 柱状图索引
   * @param {number} targetHeight - 目标高度
   * @param {Object} options - 动画选项
   * @returns {gsap.core.Tween} GSAP 动画实例
   */
  animateBarHeight(barIndex, targetHeight, options = {}) {
    const {
      duration = 0.8,
      ease = 'power2.out',
      onComplete = null
    } = options;

    const bar = this.manager.bars[barIndex];
    if (!bar) return null;

    // 如果该柱状图有正在进行的动画，先停止它
    if (this.activeAnimations.has(barIndex)) {
      this.activeAnimations.get(barIndex).kill();
    }

    const startHeight = bar.currentHeight;
    const startOuterScaleY = startHeight / bar.initHeight;
    const targetOuterScaleY = targetHeight / bar.initHeight;

    const startInnerData = this._calculateInnerLayerData(bar, startHeight);
    const targetInnerData = this._calculateInnerLayerData(bar, targetHeight);

    const proxy = { progress: 0 };

    const tween = gsap.to(proxy, {
      progress: 1,
      duration,
      ease,
      onUpdate: () => {
        const progress = proxy.progress;

        // 插值计算当前外壳 scaleY
        const currentOuterScaleY = startOuterScaleY + (targetOuterScaleY - startOuterScaleY) * progress;

        // 更新外壳矩阵
        this.manager._updateOuterShellMatrix(barIndex, currentOuterScaleY);

        // 插值计算并更新内层矩阵
        for (let i = 0; i < bar.innerLayers.length; i++) {
          const startLayer = startInnerData[i];
          const targetLayer = targetInnerData[i];

          const currentScaleY = startLayer.scaleY + (targetLayer.scaleY - startLayer.scaleY) * progress;
          const currentPositionY = startLayer.positionY + (targetLayer.positionY - startLayer.positionY) * progress;

          const instanceId = bar.layerInstanceIds[i];
          this.manager._updateInstanceMatrix(instanceId, bar.position, {
            scaleY: currentScaleY,
            positionY: currentPositionY
          });
        }

        this.manager.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
        this.manager.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
      },
      onComplete: () => {
        bar.currentHeight = targetHeight;
        bar.innerLayers = targetInnerData;
        this.manager.innerLayerInstancedMesh.computeBoundingSphere();
        this.activeAnimations.delete(barIndex);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(barIndex, tween);
    return tween;
  }

  /**
   * 计算指定高度下的内层数据
   * @param {BarManager} bar - 柱状图实例
   * @param {number} height - 目标高度
   * @returns {Array} 内层数据数组
   */
  _calculateInnerLayerData(bar, height) {
    const totalGap = bar.layerGap * (bar.layerCount + 1);
    const availableHeight = height - totalGap;
    const actualLayerHeight = availableHeight / bar.layerCount;
    const baseLayerHeight = bar.getLayerBaseHeight();

    const layers = [];
    let currentY = bar.position.y + bar.layerGap;

    for (let i = 0; i < bar.innerLayers.length; i++) {
      layers.push({
        ...bar.innerLayers[i],
        scaleY: actualLayerHeight / baseLayerHeight,
        positionY: currentY + actualLayerHeight / 2
      });
      currentY += actualLayerHeight + bar.layerGap;
    }

    return layers;
  }

  /**
   * 根据动画进度更新单个柱状图的矩阵
   * @param {Object} target - 动画目标数据
   * @param {number} progress - 动画进度 0-1
   */
  _updateBarMatrices(target, progress) {
    const { barIndex, bar, startOuterScaleY, targetOuterScaleY, startInnerData, targetInnerData } = target;

    // 插值计算当前外壳 scaleY
    const currentOuterScaleY = startOuterScaleY + (targetOuterScaleY - startOuterScaleY) * progress;

    // 更新外壳矩阵
    this.manager._updateOuterShellMatrix(barIndex, currentOuterScaleY);

    // 插值计算并更新内层矩阵
    for (let i = 0; i < bar.innerLayers.length; i++) {
      const startLayer = startInnerData[i];
      const targetLayer = targetInnerData[i];

      const currentScaleY = startLayer.scaleY + (targetLayer.scaleY - startLayer.scaleY) * progress;
      const currentPositionY = startLayer.positionY + (targetLayer.positionY - startLayer.positionY) * progress;

      const instanceId = bar.layerInstanceIds[i];
      this.manager._updateInstanceMatrix(instanceId, bar.position, {
        scaleY: currentScaleY,
        positionY: currentPositionY
      });
    }
  }

  /**
   * 停止所有正在进行的动画
   */
  killAll() {
    this.activeAnimations.forEach(tween => tween.kill());
    this.activeAnimations.clear();
  }

  /**
   * 停止指定柱状图的动画
   * @param {number} barIndex - 柱状图索引
   */
  killBar(barIndex) {
    if (this.activeAnimations.has(barIndex)) {
      this.activeAnimations.get(barIndex).kill();
      this.activeAnimations.delete(barIndex);
    }
  }

  /**
   * 销毁动画管理器
   */
  dispose() {
    this.killAll();
    this.manager = null;
  }
}

export default BarAnimationManager;
