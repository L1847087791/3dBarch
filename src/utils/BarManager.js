import * as THREE from 'three';

/**
 * 柱状图管理类
 * 负责创建和管理单个柱状图（外壳 + 内部实体）
 */
class BarManager {
  constructor(scene, position = { x: 0, y: 0, z: 0 }, barWidth = 2, maxHeight = 50) {
    this.scene = scene;
    this.position = position;
    this.barWidth = barWidth;
    this.maxHeight = maxHeight;

    this.outerShell = null; // 透明白色外壳
    this.innerBar = null;   // 白色内部实体
    this.currentHeight = 0;

    this.createBar();
  }

  /**
   * 创建柱状图
   */
  createBar() {
    // 创建外壳（透明白色）
    const shellGeometry = new THREE.BoxGeometry(
      this.barWidth,
      this.maxHeight,
      this.barWidth
    );
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      roughness: 0.1,
      metalness: 0.1
    });
    this.outerShell = new THREE.Mesh(shellGeometry, shellMaterial);
    this.outerShell.position.set(
      this.position.x,
      this.position.y + this.maxHeight / 2,
      this.position.z
    );
    this.scene.add(this.outerShell);

    // 创建内部实体（白色，使用最大高度的几何体，通过缩放控制实际高度）
    const innerGeometry = new THREE.BoxGeometry(
      this.barWidth * 0.9, // 稍微小一点，避免与外壳重叠
      this.maxHeight, // 使用最大高度，通过缩放控制
      this.barWidth * 0.9
    );
    const innerMaterial = new THREE.MeshPhongMaterial({
      color: '#FFFFFF',
      emissive: '#FFFFFF',
      emissiveIntensity: 0.8,
      shininess: 100
    });
    this.innerBar = new THREE.Mesh(innerGeometry, innerMaterial);
    this.innerBar.scale.y = 0.002; // 初始缩放为很小
    this.innerBar.position.set(
      this.position.x,
      this.position.y + (this.maxHeight * 0.002) / 2,
      this.position.z
    );
    this.scene.add(this.innerBar);
  }

  /**
   * 更新柱状图高度（优化版 - 使用缩放而非重建几何体）
   * @param {number} value - 数据值（0-100）
   */
  updateHeight(value) {
    // 将数据值映射到高度
    const normalizedValue = Math.max(0, Math.min(100, value)); // 限制在0-100
    const targetHeight = (normalizedValue / 100) * this.maxHeight;

    // 平滑过渡
    this.currentHeight = targetHeight;

    // 使用缩放而非重建几何体（性能优化）
    const scaleY = Math.max(0.002, targetHeight / this.maxHeight); // 最小缩放值避免完全消失
    this.innerBar.scale.y = scaleY;

    // 更新内部实体的位置（从底部开始增长）
    this.innerBar.position.y = this.position.y + (this.maxHeight * scaleY) / 2;
  }

  /**
   * 获取当前高度
   */
  getCurrentHeight() {
    return this.currentHeight;
  }

  /**
   * 销毁柱状图
   */
  dispose() {
    if (this.outerShell) {
      this.outerShell.geometry.dispose();
      this.outerShell.material.dispose();
      this.scene.remove(this.outerShell);
    }

    if (this.innerBar) {
      this.innerBar.geometry.dispose();
      this.innerBar.material.dispose();
      this.scene.remove(this.innerBar);
    }
  }
}

/**
 * 柱状图集合管理器
 * 负责管理多个柱状图
 */
class BarCollectionManager {
  constructor(scene) {
    this.scene = scene;
    this.bars = [];
  }

  /**
   * 创建多个柱状图
   * @param {Array} positions - 位置数组 [{x, y, z}, ...]
   * @param {number} barWidth - 柱状图宽度
   * @param {number} maxHeight - 最大高度
   */
  createBars(positions, barWidth = 2, maxHeight = 50) {
    positions.forEach((pos) => {
      const bar = new BarManager(this.scene, pos, barWidth, maxHeight);
      this.bars.push(bar);
    });
  }

  /**
   * 更新所有柱状图的高度
   * @param {Array} values - 数据值数组
   */
  updateAllHeights(values) {
    values.forEach((value, index) => {
      if (this.bars[index]) {
        this.bars[index].updateHeight(value);
      }
    });
  }

  /**
   * 获取所有柱状图
   */
  getBars() {
    return this.bars;
  }

  /**
   * 销毁所有柱状图
   */
  dispose() {
    this.bars.forEach(bar => bar.dispose());
    this.bars = [];
  }
}

export { BarManager, BarCollectionManager };
