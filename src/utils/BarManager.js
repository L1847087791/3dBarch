import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
 * 只管理数据，外壳和内层都由 BarCollectionManager 的 InstancedMesh 统一管理
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

    // 外壳不再作为独立 Mesh，改为 InstancedMesh 的一部分
    // 但保留 outerShell 引用用于交互（由 BarCollectionManager 设置）
    this.outerShell = null;
    this.outerShellInstanceId = -1;  // 外壳在 InstancedMesh 中的 ID

    this.currentHeight = 0;
    this.layerGap = 0.2;

    // 内层数据（用于交互和更新，不再存储 Mesh 引用）
    this.innerLayers = [];
    // 每层在 InstancedMesh 中的 instanceId（由 BarCollectionManager 设置）
    this.layerInstanceIds = [];

    // 初始化数据结构
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
    this.innerLayers = [];
    this.layerInstanceIds = [];
  }
}

/**
 * 柱状图集合管理器
 * 使用 InstancedMesh 统一管理外壳和内层，合并边框几何体，大幅减少 Draw Call
 */
class BarCollectionManager {
  constructor(scene) {
    this.scene = scene;
    this.bars = [];

    // InstancedMesh 相关
    this.outerShellInstancedMesh = null;   // 外壳 InstancedMesh
    this.innerLayerInstancedMesh = null;   // 内层 InstancedMesh
    this.mergedEdgesMesh = null;           // 合并后的边框 Mesh
    this.totalLayerCount = 0;              // 总层数
    this.instanceIdToLayer = new Map();    // instanceId -> {barIndex, layerIndex}

    // 存储配置参数
    this.barWidth = 0;
    this.maxHeight = 0;
    this.defaultLayerCount = 0;

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
    this.barWidth = barWidth;
    this.maxHeight = maxHeight;
    this.defaultLayerCount = layerCounts[0] || 20;

    // 计算总层数
    this.totalLayerCount = 0;
    positions.forEach((_, index) => {
      const layerCount = layerCounts[index] || 20;
      this.totalLayerCount += layerCount;
    });

    // 创建 BarManager 实例（纯数据）
    let instanceId = 0;
    positions.forEach((pos, index) => {
      const layerCount = layerCounts[index] || 20;
      const groupName = groupNames[index] || '';
      const bar = new BarManager(this.scene, pos, barWidth, maxHeight, layerCount, index, groupName);

      // 设置外壳的 instanceId
      bar.outerShellInstanceId = index;

      // 设置每层的 instanceId
      for (let i = 0; i < layerCount; i++) {
        bar.layerInstanceIds.push(instanceId);
        this.instanceIdToLayer.set(instanceId, { barIndex: index, layerIndex: i });
        instanceId++;
      }

      this.bars.push(bar);
    });

    // 创建外壳 InstancedMesh
    this._createOuterShellInstancedMesh(positions.length);

    // 创建内层 InstancedMesh
    this._createInnerLayerInstancedMesh();

    // 创建合并边框
    this._createMergedEdges();

    // 初始化所有实例的矩阵
    this._updateAllInstanceMatrices();
  }

  /**
   * 创建外壳 InstancedMesh
   */
  _createOuterShellInstancedMesh(count) {
    const shellGeometry = GeometryCache.getOuterShellGeometry(this.barWidth, this.maxHeight);

    this.outerShellInstancedMesh = new THREE.InstancedMesh(
      shellGeometry,
      SharedMaterials.outerShell,
      count
    );
    this.outerShellInstancedMesh.userData = {
      type: 'outerShellInstanced'
    };
    this.outerShellInstancedMesh.frustumCulled = false;

    // 设置每个外壳的矩阵
    this.bars.forEach((bar, index) => {
      this.tempPosition.set(
        bar.position.x,
        bar.position.y + this.maxHeight / 2,
        bar.position.z
      );
      this.tempScale.set(1, 1, 1);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.outerShellInstancedMesh.setMatrixAt(index, this.tempMatrix);

      // 创建一个代理对象用于交互识别
      bar.outerShell = {
        userData: {
          type: 'outerShell',
          barIndex: index,
          groupName: bar.groupName,
          raycastEnabled: true
        },
        scale: { x: 1, z: 1 }  // 用于悬停缩放状态
      };
    });

    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.outerShellInstancedMesh);
  }

  /**
   * 创建内层 InstancedMesh
   */
  _createInnerLayerInstancedMesh() {
    const totalGap = 0.2 * (this.defaultLayerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    const layerBaseHeight = availableHeight / this.defaultLayerCount;
    const innerWidth = this.barWidth * 0.9;

    const layerGeometry = GeometryCache.getInnerLayerGeometry(innerWidth, layerBaseHeight);

    this.innerLayerInstancedMesh = new THREE.InstancedMesh(
      layerGeometry,
      SharedMaterials.innerLayer,
      this.totalLayerCount
    );
    this.innerLayerInstancedMesh.userData = {
      type: 'innerLayerInstanced'
    };
    this.innerLayerInstancedMesh.frustumCulled = false;
    this.scene.add(this.innerLayerInstancedMesh);
  }

  /**
   * 创建合并边框（所有边框合并为一个 LineSegments）
   */
  _createMergedEdges() {
    const totalGap = 0.2 * (this.defaultLayerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    const layerBaseHeight = availableHeight / this.defaultLayerCount;
    const innerWidth = this.barWidth * 0.9;

    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, layerBaseHeight);

    // 收集所有边框几何体
    const edgesGeometries = [];
    this.bars.forEach(bar => {
      bar.innerLayers.forEach((layerData) => {
        // 克隆并变换几何体
        const clonedGeom = edgesGeometry.clone();
        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(bar.position.x, layerData.positionY, bar.position.z);
        const scaleMatrix = new THREE.Matrix4();
        scaleMatrix.makeScale(1, layerData.scaleY, 1);
        matrix.multiply(scaleMatrix);
        clonedGeom.applyMatrix4(matrix);
        edgesGeometries.push(clonedGeom);
      });
    });

    // 合并所有边框几何体
    const mergedGeometry = mergeGeometries(edgesGeometries, false);
    this.mergedEdgesMesh = new THREE.LineSegments(mergedGeometry, SharedMaterials.edges);
    this.mergedEdgesMesh.frustumCulled = false;
    this.scene.add(this.mergedEdgesMesh);

    // 清理临时几何体
    edgesGeometries.forEach(geom => geom.dispose());
  }

  /**
   * 重新生成合并边框（数据更新后调用）
   */
  _updateMergedEdges() {
    // 移除旧的边框
    if (this.mergedEdgesMesh) {
      this.scene.remove(this.mergedEdgesMesh);
      this.mergedEdgesMesh.geometry.dispose();
    }

    const totalGap = 0.2 * (this.defaultLayerCount + 1);
    const availableHeight = this.maxHeight - totalGap;
    const layerBaseHeight = availableHeight / this.defaultLayerCount;
    const innerWidth = this.barWidth * 0.9;

    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, layerBaseHeight);

    // 收集所有边框几何体
    const edgesGeometries = [];
    this.bars.forEach(bar => {
      bar.innerLayers.forEach((layerData) => {
        const clonedGeom = edgesGeometry.clone();
        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(bar.position.x, layerData.positionY, bar.position.z);
        const scaleMatrix = new THREE.Matrix4();
        scaleMatrix.makeScale(1, layerData.scaleY, 1);
        matrix.multiply(scaleMatrix);
        clonedGeom.applyMatrix4(matrix);
        edgesGeometries.push(clonedGeom);
      });
    });

    // 合并所有边框几何体
    const mergedGeometry = mergeGeometries(edgesGeometries, false);
    this.mergedEdgesMesh = new THREE.LineSegments(mergedGeometry, SharedMaterials.edges);
    this.mergedEdgesMesh.frustumCulled = false;
    this.scene.add(this.mergedEdgesMesh);

    // 清理临时几何体
    edgesGeometries.forEach(geom => geom.dispose());
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
   * 更新外壳实例的缩放
   */
  _updateOuterShellScale(barIndex, scaleX, scaleZ) {
    const bar = this.bars[barIndex];
    if (!bar) return;

    this.tempPosition.set(
      bar.position.x,
      bar.position.y + this.maxHeight / 2,
      bar.position.z
    );
    this.tempScale.set(scaleX, 1, scaleZ);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    this.outerShellInstancedMesh.setMatrixAt(barIndex, this.tempMatrix);
    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新所有柱状图的高度
   */
  updateAllHeights(values) {
    values.forEach((value, index) => {
      if (this.bars[index]) {
        const bar = this.bars[index];
        bar.updateHeight(value);

        // 更新对应实例的矩阵
        bar.innerLayers.forEach((layerData, i) => {
          const instanceId = bar.layerInstanceIds[i];
          this._updateInstanceMatrix(instanceId, bar.position, layerData);
        });
      }
    });
    this.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
    this.innerLayerInstancedMesh.computeBoundingSphere();

    // 重新生成合并边框
    this._updateMergedEdges();
  }

  /**
   * 根据 instanceId 获取层信息
   */
  getLayerByInstanceId(instanceId) {
    return this.instanceIdToLayer.get(instanceId);
  }

  /**
   * 获取外壳 InstancedMesh（用于射线检测）
   */
  getOuterShellInstancedMesh() {
    return this.outerShellInstancedMesh;
  }

  /**
   * 获取内层 InstancedMesh（用于射线检测）
   */
  getInnerLayerInstancedMesh() {
    return this.innerLayerInstancedMesh;
  }

  getBars() {
    return this.bars;
  }

  dispose() {
    // 销毁外壳 InstancedMesh
    if (this.outerShellInstancedMesh) {
      this.scene.remove(this.outerShellInstancedMesh);
      this.outerShellInstancedMesh.dispose();
    }

    // 销毁内层 InstancedMesh
    if (this.innerLayerInstancedMesh) {
      this.scene.remove(this.innerLayerInstancedMesh);
      this.innerLayerInstancedMesh.dispose();
    }

    // 销毁合并边框
    if (this.mergedEdgesMesh) {
      this.scene.remove(this.mergedEdgesMesh);
      this.mergedEdgesMesh.geometry.dispose();
    }

    // 销毁柱状图数据
    this.bars.forEach(bar => bar.dispose());
    this.bars = [];
    this.instanceIdToLayer.clear();
  }
}

export { BarManager, BarCollectionManager, SharedMaterials, GeometryCache };
