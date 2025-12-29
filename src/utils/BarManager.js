import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 颜色映射表（告警级别）
 */
const ColorMap = {
  // 内层颜色（告警级别）
  inner: {
    normal: '#EDF2FA',    // 正常 - 白色
    info: '#4A90D9',      // 信息 - 蓝色
    warning: '#F5A623',   // 警告 - 黄色
    error: '#D0021B',     // 错误 - 红色
    critical: '#8B0000',  // 严重 - 深红色
  },
  // 外层颜色（系统状态）
  outer: {
    normal: '#EDF2FA',    // 正常
    active: '#4A90D9',    // 活跃
    warning: '#F5A623',   // 警告
    error: '#D0021B',     // 错误
    offline: '#808080',   // 离线
    maintenance: '#9B59B6' // 维护
  }
};

/**
 * 全局共享材质（性能优化：避免材质切换开销）
 */
const SharedMaterials = {
  // 外壳材质（透明）- 启用顶点颜色支持实例颜色
  outerShell: new THREE.MeshBasicMaterial({
    color: 0xffffff,  // 使用白色作为基础色，让实例颜色生效
    transparent: true,
    opacity: 0.2,
  }),
  // 内层材质（Phong光照）- 启用顶点颜色支持实例颜色
  innerLayer: new THREE.MeshPhongMaterial({
    color: 0xffffff,  // 使用白色作为基础色，让实例颜色生效
    emissive: 0x888888,
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
   * @param {number} initHeight - 初始高度（用于共享几何体）
   * @param {Array} layersData - 层数据数组 [{ color: 'normal' }, ...]
   * @param {number} barIndex - 柱状图在集合中的索引（用于交互识别）
   * @param {string} groupName - 所属堆的名称（如 '数据集 A'）
   * @param {number} baseLayerHeight - 统一的基准层高（由 BarCollectionManager 传入）
   * @param {string} outerColor - 外层颜色标识（如 'normal', 'warning'）
   */
  constructor(scene, position = { x: 0, y: 0, z: 0 }, barWidth = 2, initHeight = 5, layersData = [], barIndex = 0, groupName = '', baseLayerHeight = 0.088, outerColor = 'normal') {
    this.scene = scene;
    this.position = position;
    this.barWidth = barWidth;
    this.initHeight = initHeight;  // 初始高度（几何体基准）
    this.currentHeight = initHeight;  // 当前外层高度
    this.layersData = layersData;  // 层数据（包含颜色等信息）
    this.layerCount = layersData.length || 0;
    this.barIndex = barIndex;
    this.groupName = groupName;
    this.baseLayerHeight = baseLayerHeight;  // 统一的基准层高（几何体尺寸）
    this.outerColor = outerColor;  // 外层颜色标识

    // 外壳不再作为独立 Mesh，改为 InstancedMesh 的一部分
    // 但保留 outerShell 引用用于交互（由 BarCollectionManager 设置）
    this.outerShell = null;
    this.outerShellInstanceId = -1;  // 外壳在 InstancedMesh 中的 ID

    this.layerGap = 0.2;  // 固定间隙

    // 内层数据（用于交互和更新，不再存储 Mesh 引用）
    this.innerLayers = [];
    // 每层在 InstancedMesh 中的 instanceId（由 BarCollectionManager 设置）
    this.layerInstanceIds = [];

    // 初始化数据结构（基于 initHeight）
    this.initLayerData();
  }

  /**
   * 初始化内层数据结构（基于 initHeight 和统一的 baseLayerHeight）
   * 每个柱状图根据自己的 layerCount 计算实际层高和 scaleY
   */
  initLayerData() {
    // 每个柱状图根据自己的层数计算实际的层高
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = this.initHeight - totalGap;
    const actualLayerHeight = availableHeight / this.layerCount;

    // scaleY = 实际层高 / 基准层高（几何体尺寸）
    const scaleY = actualLayerHeight / this.baseLayerHeight;

    this.innerLayers = [];
    let currentY = this.position.y + this.layerGap;
    for (let i = 0; i < this.layerCount; i++) {
      // 获取该层的颜色配置，默认为 'normal'
      const layerColorKey = this.layersData[i]?.color || 'normal';
      this.innerLayers.push({
        layerIndex: i,
        barIndex: this.barIndex,
        groupName: this.groupName,
        baseHeight: this.baseLayerHeight,  // 统一的基准层高
        scaleY: scaleY,  // 根据实际层数计算的 scaleY
        positionY: currentY + actualLayerHeight / 2,
        color: layerColorKey  // 颜色标识
      });
      currentY += actualLayerHeight + this.layerGap;
    }
  }

  /**
   * 获取统一的基准层高（几何体尺寸）
   */
  getLayerBaseHeight() {
    return this.baseLayerHeight;
  }

  /**
   * 更新外层高度，内层自适应撑满
   * @param {number} newHeight - 新的外层高度
   * @returns {Object} 更新后的数据 { outerScaleY, innerLayers }
   */
  updateOuterHeight(newHeight) {
    this.currentHeight = newHeight;

    // 计算外壳的 scaleY
    const outerScaleY = newHeight / this.initHeight;

    // 计算内层的新高度和位置
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = newHeight - totalGap;
    const actualLayerHeight = availableHeight / this.layerCount;

    // 基于 initHeight 的每层高度（几何体基准）
    const baseLayerHeight = this.getLayerBaseHeight();

    let currentY = this.position.y + this.layerGap;
    for (let i = 0; i < this.innerLayers.length; i++) {
      // 内层 scaleY = 实际层高 / 基准层高
      this.innerLayers[i].scaleY = actualLayerHeight / baseLayerHeight;
      this.innerLayers[i].positionY = currentY + actualLayerHeight / 2;
      currentY += actualLayerHeight + this.layerGap;
    }

    return {
      outerScaleY,
      innerLayers: this.innerLayers
    };
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
    this.initHeight = 0;  // 初始高度（几何体基准）
    this.baseLayerHeight = 0;  // 统一的基准层高（几何体尺寸）
    this.layerGap = 0.2;  // 层间隙

    // 用于更新矩阵的临时对象
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
    this.tempColor = new THREE.Color();  // 用于设置实例颜色
  }

  /**
   * 创建多个柱状图
   * @param {Object} sceneData - 场景数据 { bars: [{ position, groupName, height, layers: [] }] }
   * @param {number} barWidth - 柱状图宽度
   * @param {number} initHeight - 初始高度（用于共享几何体）
   * @param {number} baseLayerCount - 基准层数（用于计算统一的几何体尺寸，默认50）
   */
  createBars(sceneData, barWidth = 2, initHeight = 5, baseLayerCount = 50) {
    const { bars: barsData } = sceneData;

    this.barWidth = barWidth;
    this.initHeight = initHeight;
    // 计算统一的基准层高（几何体尺寸基于此）
    const totalGapForBase = this.layerGap * (baseLayerCount + 1);
    this.baseLayerHeight = (initHeight - totalGapForBase) / baseLayerCount;

    // 计算总层数
    this.totalLayerCount = 0;
    barsData.forEach((barData) => {
      this.totalLayerCount += barData.layers?.length || 0;
    });

    // 创建 BarManager 实例（纯数据）
    let instanceId = 0;
    barsData.forEach((barData, index) => {
      const layersData = barData.layers || [];
      const layerCount = layersData.length;
      const bar = new BarManager(
        this.scene,
        barData.position,
        barWidth,
        initHeight,
        layersData,  // 传递层数据数组
        index,
        barData.groupName || '',
        this.baseLayerHeight,  // 传入统一的基准层高
        barData.outerColor || 'normal'  // 传入外层颜色
      );

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

    // 创建外壳 InstancedMesh（基于 initHeight）
    this._createOuterShellInstancedMesh(barsData.length);

    // 创建内层 InstancedMesh（基于 initHeight）
    this._createInnerLayerInstancedMesh();

    // 初始化所有实例的矩阵（初始状态，scaleY=1）
    this._updateAllInstanceMatrices();

    // 使用 sceneData 中的 height 更新到目标高度
    this._initializeHeights(barsData);

    // 初始化所有实例的颜色
    this._initializeColors();

    // 创建合并边框（需要在高度初始化之后）
    this._createMergedEdges();
  }

  /**
   * 创建外壳 InstancedMesh
   */
  _createOuterShellInstancedMesh(count) {
    const shellGeometry = GeometryCache.getOuterShellGeometry(this.barWidth, this.initHeight);

    this.outerShellInstancedMesh = new THREE.InstancedMesh(
      shellGeometry,
      SharedMaterials.outerShell,
      count
    );
    this.outerShellInstancedMesh.userData = {
      type: 'outerShellInstanced'
    };
    this.outerShellInstancedMesh.frustumCulled = false;

    // 设置每个外壳的初始矩阵（scaleY=1，基于 initHeight）
    this.bars.forEach((bar, index) => {
      this.tempPosition.set(
        bar.position.x,
        bar.position.y + this.initHeight / 2,
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
        scale: { x: 1, y: 1, z: 1 }  // 用于缩放状态
      };
    });

    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.outerShellInstancedMesh);
  }

  /**
   * 创建内层 InstancedMesh
   */
  _createInnerLayerInstancedMesh() {
    const innerWidth = this.barWidth * 0.9;
    // 使用统一的基准层高
    const layerGeometry = GeometryCache.getInnerLayerGeometry(innerWidth, this.baseLayerHeight);

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
    const innerWidth = this.barWidth * 0.9;
    // 使用统一的基准层高
    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, this.baseLayerHeight);

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

    const innerWidth = this.barWidth * 0.9;
    // 使用统一的基准层高
    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, this.baseLayerHeight);

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
   * 初始化高度（使用 sceneData 中的 height 更新到目标高度）
   * @param {Array} barsData - 柱状图数据数组
   */
  _initializeHeights(barsData) {
    barsData.forEach((barData, index) => {
      if (this.bars[index] && barData.height !== undefined) {
        const bar = this.bars[index];
        const { outerScaleY, innerLayers } = bar.updateOuterHeight(barData.height);

        // 更新外壳矩阵
        this._updateOuterShellMatrix(index, outerScaleY);

        // 更新内层矩阵
        innerLayers.forEach((layerData, i) => {
          const instanceId = bar.layerInstanceIds[i];
          this._updateInstanceMatrix(instanceId, bar.position, layerData);
        });
      }
    });

    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
    this.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
    this.innerLayerInstancedMesh.computeBoundingSphere();
  }

  /**
   * 初始化所有实例的颜色
   */
  _initializeColors() {
    // 设置外壳颜色
    this.bars.forEach((bar, barIndex) => {
      const outerColorHex = ColorMap.outer[bar.outerColor] || ColorMap.outer.normal;
      this.tempColor.set(outerColorHex);
      this.outerShellInstancedMesh.setColorAt(barIndex, this.tempColor);
    });
    this.outerShellInstancedMesh.instanceColor.needsUpdate = true;

    // 设置内层颜色
    this.bars.forEach(bar => {
      bar.innerLayers.forEach((layerData, i) => {
        const instanceId = bar.layerInstanceIds[i];
        const innerColorHex = ColorMap.inner[layerData.color] || ColorMap.inner.normal;
        this.tempColor.set(innerColorHex);
        this.innerLayerInstancedMesh.setColorAt(instanceId, this.tempColor);
      });
    });
    this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;
  }

  /**
   * 更新外壳实例的矩阵（支持高度缩放）
   */
  _updateOuterShellMatrix(barIndex, scaleY) {
    const bar = this.bars[barIndex];
    if (!bar) return;

    // 位置需要根据缩放后的高度调整
    const scaledHeight = this.initHeight * scaleY;
    this.tempPosition.set(
      bar.position.x,
      bar.position.y + scaledHeight / 2,
      bar.position.z
    );
    this.tempScale.set(1, scaleY, 1);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    this.outerShellInstancedMesh.setMatrixAt(barIndex, this.tempMatrix);

    // 更新代理对象的缩放状态
    bar.outerShell.scale.y = scaleY;
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
   * 更新外壳实例的缩放（用于悬停交互，保持当前高度）
   */
  _updateOuterShellScale(barIndex, scaleX, scaleZ) {
    const bar = this.bars[barIndex];
    if (!bar) return;

    // 获取当前的高度缩放
    const currentHeightScaleY = bar.currentHeight / bar.initHeight;
    const scaledHeight = this.initHeight * currentHeightScaleY;

    this.tempPosition.set(
      bar.position.x,
      bar.position.y + scaledHeight / 2,
      bar.position.z
    );
    this.tempScale.set(scaleX, currentHeightScaleY, scaleZ);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    this.outerShellInstancedMesh.setMatrixAt(barIndex, this.tempMatrix);
    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新所有柱状图的高度
   * @param {Array} heights - 每个柱状图的目标高度数组
   */
  updateAllHeights(heights) {
    heights.forEach((height, index) => {
      if (this.bars[index]) {
        const bar = this.bars[index];
        const { outerScaleY, innerLayers } = bar.updateOuterHeight(height);

        // 更新外壳矩阵
        this._updateOuterShellMatrix(index, outerScaleY);

        // 更新内层矩阵
        innerLayers.forEach((layerData, i) => {
          const instanceId = bar.layerInstanceIds[i];
          this._updateInstanceMatrix(instanceId, bar.position, layerData);
        });
      }
    });

    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
    this.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
    this.innerLayerInstancedMesh.computeBoundingSphere();

    // 重新生成合并边框
    this._updateMergedEdges();
  }

  /**
   * 更新单个内层的颜色
   * @param {number} barIndex - 柱状图索引
   * @param {number} layerIndex - 层索引
   * @param {string} colorKey - 颜色标识（如 'normal', 'warning', 'error'）
   */
  setInnerLayerColor(barIndex, layerIndex, colorKey) {
    const bar = this.bars[barIndex];
    if (!bar || !bar.innerLayers[layerIndex]) return;

    const instanceId = bar.layerInstanceIds[layerIndex];
    const colorHex = ColorMap.inner[colorKey] || ColorMap.inner.normal;
    this.tempColor.set(colorHex);
    this.innerLayerInstancedMesh.setColorAt(instanceId, this.tempColor);
    this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;

    // 更新数据
    bar.innerLayers[layerIndex].color = colorKey;
  }

  /**
   * 更新外壳颜色
   * @param {number} barIndex - 柱状图索引
   * @param {string} colorKey - 颜色标识（如 'normal', 'warning', 'error'）
   */
  setOuterShellColor(barIndex, colorKey) {
    const bar = this.bars[barIndex];
    if (!bar) return;

    const colorHex = ColorMap.outer[colorKey] || ColorMap.outer.normal;
    this.tempColor.set(colorHex);
    this.outerShellInstancedMesh.setColorAt(barIndex, this.tempColor);
    this.outerShellInstancedMesh.instanceColor.needsUpdate = true;

    // 更新数据
    bar.outerColor = colorKey;
  }

  /**
   * 批量更新柱状图的颜色
   * @param {Array} colorUpdates - 颜色更新数组 [{ barIndex, outerColor?, layers?: [{ layerIndex, color }] }]
   */
  updateColors(colorUpdates) {
    colorUpdates.forEach(update => {
      const { barIndex, outerColor, layers } = update;
      const bar = this.bars[barIndex];
      if (!bar) return;

      // 更新外壳颜色
      if (outerColor) {
        const outerColorHex = ColorMap.outer[outerColor] || ColorMap.outer.normal;
        this.tempColor.set(outerColorHex);
        this.outerShellInstancedMesh.setColorAt(barIndex, this.tempColor);
        bar.outerColor = outerColor;
      }

      // 更新内层颜色
      if (layers && Array.isArray(layers)) {
        layers.forEach(layerUpdate => {
          const { layerIndex, color } = layerUpdate;
          if (bar.innerLayers[layerIndex]) {
            const instanceId = bar.layerInstanceIds[layerIndex];
            const innerColorHex = ColorMap.inner[color] || ColorMap.inner.normal;
            this.tempColor.set(innerColorHex);
            this.innerLayerInstancedMesh.setColorAt(instanceId, this.tempColor);
            bar.innerLayers[layerIndex].color = color;
          }
        });
      }
    });

    this.outerShellInstancedMesh.instanceColor.needsUpdate = true;
    this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;
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

export { BarManager, BarCollectionManager, SharedMaterials, GeometryCache, ColorMap };
