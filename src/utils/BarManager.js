import * as THREE from 'three';

/**
 * 全局共享材质（性能优化：避免材质切换开销）
 */
const SharedMaterials = {
  // 外壳材质（透明）
  outerShell: new THREE.MeshBasicMaterial({
    color: '#EDF2FA',
    transparent: true,
    opacity: 0.2,
  }),
  // 内层材质（Phong光照）
  innerLayer: new THREE.MeshPhongMaterial({
    color: '#EDF2FA',
    emissive: 0xaaaaaa,
    emissiveIntensity: 0.3,
    shininess: 50
  }),
  // 边框材质
  edges: new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 1
  })
};

/**
 * 几何体缓存管理器（性能优化：避免重复创建相同几何体）
 * 使用 key 缓存不同尺寸的几何体
 */
const GeometryCache = {
  // 外壳几何体缓存 key: "width_height" -> geometry
  outerShellCache: new Map(),
  // 内层几何体缓存 key: "width_height" -> geometry
  innerLayerCache: new Map(),
  // 边框几何体缓存 key: "width_height" -> geometry
  edgesCache: new Map(),

  /**
   * 获取或创建外壳几何体
   */
  getOuterShellGeometry(width, height) {
    const key = `${width}_${height}`;
    if (!this.outerShellCache.has(key)) {
      this.outerShellCache.set(key, new THREE.BoxGeometry(width, height, width));
    }
    return this.outerShellCache.get(key);
  },

  /**
   * 获取或创建内层几何体
   */
  getInnerLayerGeometry(width, height) {
    const key = `${width}_${height}`;
    if (!this.innerLayerCache.has(key)) {
      this.innerLayerCache.set(key, new THREE.BoxGeometry(width, height, width));
    }
    return this.innerLayerCache.get(key);
  },

  /**
   * 获取或创建边框几何体
   */
  getEdgesGeometry(width, height) {
    const key = `${width}_${height}`;
    if (!this.edgesCache.has(key)) {
      // EdgesGeometry 需要基于 BoxGeometry 创建
      const boxGeom = this.getInnerLayerGeometry(width, height);
      this.edgesCache.set(key, new THREE.EdgesGeometry(boxGeom));
    }
    return this.edgesCache.get(key);
  },

  /**
   * 清理所有缓存的几何体
   */
  dispose() {
    this.outerShellCache.forEach(geom => geom.dispose());
    this.outerShellCache.clear();
    this.innerLayerCache.forEach(geom => geom.dispose());
    this.innerLayerCache.clear();
    this.edgesCache.forEach(geom => geom.dispose());
    this.edgesCache.clear();
  }
};

/**
 * 柱状图管理类
 * 负责创建和管理单个柱状图（外壳 + 多层内部实体）
 */
class BarManager {
  /**
   * @param {THREE.Scene} scene - Three.js 场景
   * @param {Object} position - 位置 {x, y, z}
   * @param {number} barWidth - 柱状图宽度
   * @param {number} maxHeight - 最大高度
   * @param {number} layerCount - 分层数量
   * @param {number} barIndex - 柱状图在集合中的索引（用于交互识别）
   * @param {string} groupName - 所属堆的名称（如 '数据集 A'）
   */
  constructor(scene, position = { x: 0, y: 0, z: 0 }, barWidth = 2, maxHeight = 50, layerCount = 20, barIndex = 0, groupName = '') {
    this.scene = scene;
    this.position = position;
    this.barWidth = barWidth;
    this.maxHeight = maxHeight;
    this.layerCount = layerCount; // 分层数量
    this.barIndex = barIndex;     // 柱状图索引
    this.groupName = groupName;   // 所属堆名称

    this.outerShell = null; // 透明白色外壳
    this.innerLayers = [];  // 多层内部实体数组（每个元素包含mesh和边框）
    this.currentHeight = 0;
    this.layerGap = 0.2;    // 层与层之间的间隔（加大间距使其更清晰可见）

    this.createBar();
  }

  /**
   * 创建柱状图
   */
  createBar() {
    // 创建外壳（透明白色）- 使用共享材质和缓存几何体
    const shellGeometry = GeometryCache.getOuterShellGeometry(this.barWidth, this.maxHeight);
    this.outerShell = new THREE.Mesh(shellGeometry, SharedMaterials.outerShell);
    this.outerShell.position.set(
      this.position.x,
      this.position.y + this.maxHeight / 2,
      this.position.z
    );
    // 添加 userData 用于交互识别
    this.outerShell.userData = {
      type: 'outerShell',        // 标记为外壳
      barIndex: this.barIndex,   // 所属柱状图索引
      groupName: this.groupName, // 所属堆名称
      raycastEnabled: true       // 是否可被射线拾取
    };
    this.scene.add(this.outerShell);

    // 创建多层内部实体
    this.createLayers();
  }

  /**
   * 创建多层内部实体
   * 每层都是独立的Mesh，便于后续交互拾取
   * 空间分配：底部间隔 + 层1 + 间隔 + 层2 + ... + 层n + 顶部间隔 = 外层高度
   */
  createLayers() {
    // 清空现有层（几何体由缓存管理，不在此处 dispose）
    this.innerLayers.forEach(layerObj => {
      this.scene.remove(layerObj.mesh);
      if (layerObj.edges) {
        this.scene.remove(layerObj.edges);
      }
    });
    this.innerLayers = [];

    // 计算每层的基础高度（考虑层间间隔）
    // 总共需要 (layerCount + 1) 个间隔：底部1个 + 层间(layerCount-1)个 + 顶部1个
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    const layerBaseHeight = availableHeight / this.layerCount;

    // 内层尺寸
    const innerWidth = this.barWidth * 0.9;

    // 获取缓存的几何体（所有层共享同一个几何体）
    const layerGeometry = GeometryCache.getInnerLayerGeometry(innerWidth, layerBaseHeight);
    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, layerBaseHeight);

    // 创建每一层
    for (let i = 0; i < this.layerCount; i++) {
      // 使用共享几何体和材质
      const layerMesh = new THREE.Mesh(layerGeometry, SharedMaterials.innerLayer);

      // 创建边框（使用共享几何体和材质）
      const edges = new THREE.LineSegments(edgesGeometry, SharedMaterials.edges);

      // 初始化缩放为很小
      layerMesh.scale.y = 0.002;
      edges.scale.y = 0.002;

      // 设置层的初始位置（从底部间隔开始）
      const yOffset = this.position.y + this.layerGap + (layerBaseHeight * 0.002) / 2 + i * (layerBaseHeight * 0.002 + this.layerGap);
      layerMesh.position.set(
        this.position.x,
        yOffset,
        this.position.z
      );
      edges.position.copy(layerMesh.position);

      // 存储层的索引和基础高度信息（用于后续更新和交互）
      layerMesh.userData = {
        type: 'innerLayer',        // 标记为内层
        layerIndex: i,             // 层索引
        barIndex: this.barIndex,   // 所属柱状图索引
        groupName: this.groupName, // 所属堆名称
        baseHeight: layerBaseHeight
      };

      this.scene.add(layerMesh);
      this.scene.add(edges);

      // 存储mesh和边框的引用
      this.innerLayers.push({
        mesh: layerMesh,
        edges: edges
      });
    }
  }

  /**
   * 更新柱状图高度（支持多层数据）
   * @param {Array} layerValues - 每层的数据值数组（0-100）
   */
  updateHeight(layerValues) {
    // 如果传入的是单个值（向后兼容），转换为数组
    if (typeof layerValues === 'number') {
      layerValues = new Array(this.layerCount).fill(layerValues / this.layerCount);
    }

    // 确保数据长度匹配
    if (layerValues.length !== this.layerCount) {
      console.warn(`数据长度(${layerValues.length})与层数(${this.layerCount})不匹配`);
      return;
    }

    // 计算总高度和每层高度
    // 总共需要 (layerCount + 1) 个间隔：底部1个 + 层间(layerCount-1)个 + 顶部1个
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    const layerBaseHeight = availableHeight / this.layerCount;

    // 计算每层的目标高度
    const layerHeights = layerValues.map(value => {
      const normalizedValue = Math.max(0, Math.min(100, value));
      return (normalizedValue / 100) * layerBaseHeight;
    });

    // 更新每一层（从底部间隔开始）
    let currentY = this.position.y + this.layerGap;
    for (let i = 0; i < this.innerLayers.length; i++) {
      const layerObj = this.innerLayers[i];
      const targetHeight = layerHeights[i];

      // 使用缩放而非重建几何体（性能优化）
      const scaleY = Math.max(0.002, targetHeight / layerBaseHeight);
      layerObj.mesh.scale.y = scaleY;
      layerObj.edges.scale.y = scaleY;

      // 更新层的位置（从底部开始堆叠）
      const newY = currentY + (layerBaseHeight * scaleY) / 2;
      layerObj.mesh.position.y = newY;
      layerObj.edges.position.y = newY;

      // 累加当前层的高度和间隔
      currentY += layerBaseHeight * scaleY + this.layerGap;
    }

    // 更新总高度
    this.currentHeight = currentY - this.position.y - this.layerGap;
  }

  /**
   * 获取当前高度
   */
  getCurrentHeight() {
    return this.currentHeight;
  }

  /**
   * 销毁柱状图
   * 注意：共享材质和几何体由缓存统一管理，不在此处销毁
   */
  dispose() {
    if (this.outerShell) {
      // 几何体和材质由缓存管理，只从场景移除
      this.scene.remove(this.outerShell);
    }

    // 移除所有内部层（几何体和材质由缓存管理）
    this.innerLayers.forEach(layerObj => {
      this.scene.remove(layerObj.mesh);
      if (layerObj.edges) {
        this.scene.remove(layerObj.edges);
      }
    });
    this.innerLayers = [];
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
   * @param {Array} layerCounts - 每个柱状图的层数数组（可选）
   * @param {Array} groupNames - 每个柱状图所属堆名称数组（可选）
   */
  createBars(positions, barWidth = 2, maxHeight = 50, layerCounts = [], groupNames = []) {
    positions.forEach((pos, index) => {
      // 如果指定了层数数组，使用对应的层数，否则默认为20层
      const layerCount = layerCounts[index] || 20;
      const groupName = groupNames[index] || '';
      const bar = new BarManager(this.scene, pos, barWidth, maxHeight, layerCount, index, groupName);
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

export { BarManager, BarCollectionManager, SharedMaterials, GeometryCache };
