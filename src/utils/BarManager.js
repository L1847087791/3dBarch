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
  // 内层材质（Phong光照）- 用于 InstancedMesh
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
 * 柱状图管理类（轻量版 - 配合 InstancedMesh 使用）
 * 只管理外壳和数据映射，内层由 BarCollectionManager 的 InstancedMesh 统一管理
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
    this.layerCount = layerCount;
    this.barIndex = barIndex;
    this.groupName = groupName;

    this.outerShell = null;
    this.currentHeight = 0;
    this.layerGap = 0.2;

    // 内层数据（用于交互和更新，不再存储 Mesh 引用）
    this.innerLayers = [];
    // 每层在 InstancedMesh 中的 instanceId（由 BarCollectionManager 设置）
    this.layerInstanceIds = [];

    this.createBar();
  }

  /**
   * 创建柱状图（只创建外壳）
   */
  createBar() {
    // 创建外壳
    const shellGeometry = GeometryCache.getOuterShellGeometry(this.barWidth, this.maxHeight);
    this.outerShell = new THREE.Mesh(shellGeometry, SharedMaterials.outerShell);
    this.outerShell.position.set(
      this.position.x,
      this.position.y + this.maxHeight / 2,
      this.position.z
    );
    this.outerShell.userData = {
      type: 'outerShell',
      barIndex: this.barIndex,
      groupName: this.groupName,
      raycastEnabled: true
    };
    this.scene.add(this.outerShell);

    // 初始化内层数据结构（不创建实际 Mesh）
    this.initLayerData();
  }

  /**
   * 初始化内层数据结构
   */
  initLayerData() {
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    const layerBaseHeight = availableHeight / this.layerCount;

    this.innerLayers = [];
    for (let i = 0; i < this.layerCount; i++) {
      this.innerLayers.push({
        layerIndex: i,
        barIndex: this.barIndex,
        groupName: this.groupName,
        baseHeight: layerBaseHeight,
        scaleY: 0.002,
        positionY: this.position.y + this.layerGap + (layerBaseHeight * 0.002) / 2 + i * (layerBaseHeight * 0.002 + this.layerGap)
      });
    }
  }

  /**
   * 获取层基础高度
   */
  getLayerBaseHeight() {
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    return availableHeight / this.layerCount;
  }

  /**
   * 更新柱状图高度（计算数据，由 BarCollectionManager 批量更新 InstancedMesh）
   * @param {Array} layerValues - 每层的数据值数组（0-100）
   * @returns {Array} 更新后的层数据
   */
  updateHeight(layerValues) {
    if (typeof layerValues === 'number') {
      layerValues = new Array(this.layerCount).fill(layerValues / this.layerCount);
    }

    if (layerValues.length !== this.layerCount) {
      console.warn(`数据长度(${layerValues.length})与层数(${this.layerCount})不匹配`);
      return this.innerLayers;
    }

    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    const layerBaseHeight = availableHeight / this.layerCount;

    let currentY = this.position.y + this.layerGap;
    for (let i = 0; i < this.innerLayers.length; i++) {
      const normalizedValue = Math.max(0, Math.min(100, layerValues[i]));
      const targetHeight = (normalizedValue / 100) * layerBaseHeight;
      const scaleY = Math.max(0.002, targetHeight / layerBaseHeight);

      this.innerLayers[i].scaleY = scaleY;
      this.innerLayers[i].positionY = currentY + (layerBaseHeight * scaleY) / 2;

      currentY += layerBaseHeight * scaleY + this.layerGap;
    }

    this.currentHeight = currentY - this.position.y - this.layerGap;
    return this.innerLayers;
  }

  getCurrentHeight() {
    return this.currentHeight;
  }

  dispose() {
    if (this.outerShell) {
      this.scene.remove(this.outerShell);
    }
    this.innerLayers = [];
    this.layerInstanceIds = [];
  }
}

/**
 * 柱状图集合管理器
 * 使用 InstancedMesh 统一管理所有内层，大幅减少 Draw Call
 */
class BarCollectionManager {
  constructor(scene) {
    this.scene = scene;
    this.bars = [];

    // InstancedMesh 相关
    this.innerLayerInstancedMesh = null;  // 内层 InstancedMesh
    this.edgesInstancedMesh = null;        // 边框（暂不使用 InstancedMesh，LineSegments 不支持）
    this.totalLayerCount = 0;              // 总层数
    this.instanceIdToLayer = new Map();    // instanceId -> {barIndex, layerIndex}

    // 用于更新矩阵的临时对象
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
  }

  /**
   * 创建多个柱状图
   */
  createBars(positions, barWidth = 2, maxHeight = 50, layerCounts = [], groupNames = []) {
    // 计算总层数
    this.totalLayerCount = 0;
    positions.forEach((_, index) => {
      const layerCount = layerCounts[index] || 20;
      this.totalLayerCount += layerCount;
    });

    // 创建 BarManager 实例（只创建外壳）
    let instanceId = 0;
    positions.forEach((pos, index) => {
      const layerCount = layerCounts[index] || 20;
      const groupName = groupNames[index] || '';
      const bar = new BarManager(this.scene, pos, barWidth, maxHeight, layerCount, index, groupName);

      // 设置每层的 instanceId
      for (let i = 0; i < layerCount; i++) {
        bar.layerInstanceIds.push(instanceId);
        this.instanceIdToLayer.set(instanceId, { barIndex: index, layerIndex: i });
        instanceId++;
      }

      this.bars.push(bar);
    });

    // 创建 InstancedMesh
    this._createInstancedMesh(barWidth, maxHeight, layerCounts[0] || 20);

    // 初始化所有实例的矩阵
    this._updateAllInstanceMatrices();
  }

  /**
   * 创建 InstancedMesh
   */
  _createInstancedMesh(barWidth, maxHeight, defaultLayerCount) {
    const totalGap = 0.2 * (defaultLayerCount + 1);
    const availableHeight = maxHeight - totalGap;
    const layerBaseHeight = availableHeight / defaultLayerCount;
    const innerWidth = barWidth * 0.9;

    // 获取几何体
    const layerGeometry = GeometryCache.getInnerLayerGeometry(innerWidth, layerBaseHeight);

    // 创建内层 InstancedMesh
    this.innerLayerInstancedMesh = new THREE.InstancedMesh(
      layerGeometry,
      SharedMaterials.innerLayer,
      this.totalLayerCount
    );
    this.innerLayerInstancedMesh.userData = {
      type: 'innerLayerInstanced'
    };
    // 禁用视锥剔除，确保所有实例都被渲染
    this.innerLayerInstancedMesh.frustumCulled = false;
    this.scene.add(this.innerLayerInstancedMesh);

    // 边框使用普通方式（LineSegments 不支持 InstancedMesh）
    // 在 Step 4 中考虑其他优化方案
    this._createEdges(barWidth, maxHeight, defaultLayerCount);
  }

  /**
   * 创建边框（暂时使用传统方式）
   */
  _createEdges(barWidth, maxHeight, defaultLayerCount) {
    const totalGap = 0.2 * (defaultLayerCount + 1);
    const availableHeight = maxHeight - totalGap;
    const layerBaseHeight = availableHeight / defaultLayerCount;
    const innerWidth = barWidth * 0.9;

    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, layerBaseHeight);

    // 为每个实例创建边框
    this.bars.forEach(bar => {
      bar.innerLayers.forEach((layerData, i) => {
        const edges = new THREE.LineSegments(edgesGeometry, SharedMaterials.edges);
        edges.position.set(bar.position.x, layerData.positionY, bar.position.z);
        edges.scale.y = layerData.scaleY;
        this.scene.add(edges);

        // 存储边框引用到 layerData
        layerData.edges = edges;
      });
    });
  }

  /**
   * 更新所有实例的矩阵
   */
  _updateAllInstanceMatrices() {
    this.bars.forEach(bar => {
      bar.innerLayers.forEach((layerData, i) => {
        const instanceId = bar.layerInstanceIds[i];
        this._updateInstanceMatrix(instanceId, bar.position, layerData);
      });
    });
    this.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
    // 更新边界球体，用于射线检测
    this.innerLayerInstancedMesh.computeBoundingSphere();
  }

  /**
   * 更新单个实例的矩阵
   */
  _updateInstanceMatrix(instanceId, barPosition, layerData) {
    this.tempPosition.set(barPosition.x, layerData.positionY, barPosition.z);
    this.tempScale.set(1, layerData.scaleY, 1);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    this.innerLayerInstancedMesh.setMatrixAt(instanceId, this.tempMatrix);
  }

  /**
   * 更新所有柱状图的高度
   */
  updateAllHeights(values) {
    values.forEach((value, index) => {
      if (this.bars[index]) {
        const bar = this.bars[index];
        bar.updateHeight(value);

        // 更新对应实例的矩阵和边框
        bar.innerLayers.forEach((layerData, i) => {
          const instanceId = bar.layerInstanceIds[i];
          this._updateInstanceMatrix(instanceId, bar.position, layerData);

          // 更新边框
          if (layerData.edges) {
            layerData.edges.position.y = layerData.positionY;
            layerData.edges.scale.y = layerData.scaleY;
          }
        });
      }
    });
    this.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
    // 更新边界球体，用于射线检测
    this.innerLayerInstancedMesh.computeBoundingSphere();
  }

  /**
   * 根据 instanceId 获取层信息
   */
  getLayerByInstanceId(instanceId) {
    return this.instanceIdToLayer.get(instanceId);
  }

  /**
   * 获取 InstancedMesh（用于射线检测）
   */
  getInnerLayerInstancedMesh() {
    return this.innerLayerInstancedMesh;
  }

  getBars() {
    return this.bars;
  }

  dispose() {
    // 销毁 InstancedMesh
    if (this.innerLayerInstancedMesh) {
      this.scene.remove(this.innerLayerInstancedMesh);
      this.innerLayerInstancedMesh.dispose();
    }

    // 销毁边框
    this.bars.forEach(bar => {
      bar.innerLayers.forEach(layerData => {
        if (layerData.edges) {
          this.scene.remove(layerData.edges);
        }
      });
    });

    // 销毁柱状图
    this.bars.forEach(bar => bar.dispose());
    this.bars = [];
    this.instanceIdToLayer.clear();
  }
}

export { BarManager, BarCollectionManager, SharedMaterials, GeometryCache };
