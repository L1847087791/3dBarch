import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import BarAnimationManager from './BarAnimationManager';

/**
 * 颜色映射表
 */
const ColorMap = {
  // 内层颜色（告警级别：0-3）
  inner: {
    0: '#EDF2FA',    // 正常
    1: '#ffcd3d',    // 次要
    2: '#ff8c3d',    // 主要
    3: '#d9001b',    // 严重
  },
  // 外层颜色（固定为normal）
  outer: {
    normal: '#EDF2FA',    // 正常（固定）
  }
};

/**
 * 全局共享材质（性能优化：避免材质切换开销）
 */
const SharedMaterials = {
  // 外壳材质（透明）- 启用顶点颜色支持实例颜色
  outerShell: new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
  }),
  // 内层材质（Phong光照）- 启用顶点颜色支持实例颜色
  innerLayer: new THREE.MeshPhongMaterial({
    color: 0xffffff,
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
 */
const GeometryCache = {
  outerShellCache: new Map(),
  innerLayerCache: new Map(),
  edgesCache: new Map(),

  getOuterShellGeometry(width, height) {
    const key = `${width}_${height}`;
    if (!this.outerShellCache.has(key)) {
      this.outerShellCache.set(key, new THREE.BoxGeometry(width, height, width));
    }
    return this.outerShellCache.get(key);
  },

  getInnerLayerGeometry(width, height) {
    const key = `${width}_${height}`;
    if (!this.innerLayerCache.has(key)) {
      this.innerLayerCache.set(key, new THREE.BoxGeometry(width, height, width));
    }
    return this.innerLayerCache.get(key);
  },

  getEdgesGeometry(width, height) {
    const key = `${width}_${height}`;
    if (!this.edgesCache.has(key)) {
      const boxGeom = this.getInnerLayerGeometry(width, height);
      this.edgesCache.set(key, new THREE.EdgesGeometry(boxGeom));
    }
    return this.edgesCache.get(key);
  },

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
  constructor(scene, position = { x: 0, y: 0, z: 0 }, barWidth = 10, initHeight = 1, layersData = [], barIndex = 0, groupName = '', baseLayerHeight = 0.088, outerColor = 'normal', uuid = '', layerGap = 0) {
    this.scene = scene;
    this.position = position;
    this.barWidth = barWidth;
    this.initHeight = initHeight; //初始化高度
    this.currentHeight = initHeight; //柱状图实际高度
    this.layersData = layersData;
    this.layerCount = layersData.length || 0;
    this.barIndex = barIndex;  //柱状图集合索引
    this.groupName = groupName;
    this.baseLayerHeight = baseLayerHeight; //基准层高
    this.outerColor = outerColor;
    this.uuid = uuid;

    this.outerShell = null; //外层用于交互
    this.outerShellInstanceId = -1; //外层在InstancedMesh中的ID
    this.innerLayers = []; //内层数据，用于交互
    this.layerInstanceIds = []; //内层的InstancedMesh中的ID
    this.layerGap = layerGap; //内层间隙，由BarCollectionManager控制
    this.initLayerData();
  }

  initLayerData() {
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = this.initHeight - totalGap;
    const actualLayerHeight = availableHeight / this.layerCount;
    const scaleY = actualLayerHeight / this.baseLayerHeight;

    this.innerLayers = [];
    let currentY = this.position.y + this.layerGap;
    for (let i = 0; i < this.layerCount; i++) {
      const layerColorKey = this.layersData[i]?.color || 'normal';
      const layerUuid = this.layersData[i]?.uuid || '';
      this.innerLayers.push({
        layerIndex: i,
        barIndex: this.barIndex,
        groupName: this.groupName,
        baseHeight: this.baseLayerHeight,
        scaleY: scaleY,
        positionY: currentY + actualLayerHeight / 2,
        color: layerColorKey,
        uuid: layerUuid
      });
      currentY += actualLayerHeight + this.layerGap;
    }
  }

  getLayerBaseHeight() {
    return this.baseLayerHeight;
  }

  updateOuterHeight(newHeight) {
    this.currentHeight = newHeight;
    const outerScaleY = newHeight / this.initHeight;
    const totalGap = this.layerGap * (this.layerCount + 1);
    const availableHeight = newHeight - totalGap;
    const actualLayerHeight = availableHeight / this.layerCount;
    const baseLayerHeight = this.getLayerBaseHeight();

    let currentY = this.position.y + this.layerGap;
    for (let i = 0; i < this.innerLayers.length; i++) {
      this.innerLayers[i].scaleY = actualLayerHeight / baseLayerHeight;
      this.innerLayers[i].positionY = currentY + actualLayerHeight / 2;
      currentY += actualLayerHeight + this.layerGap;
    }

    return { outerScaleY, innerLayers: this.innerLayers };
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
 * 只负责组件视图的渲染，视图模式切换由 ViewModeManager 处理
 */
class BarCollectionManager {
  constructor(scene) {
    this.scene = scene;
    this.bars = [];

    // InstancedMesh 相关
    this.outerShellInstancedMesh = null;
    this.innerLayerInstancedMesh = null;
    this.mergedEdgesMesh = null;
    this.totalLayerCount = 0;
    this.instanceIdToLayer = new Map();

    // 存储配置参数
    this.barWidth = 0;
    this.initHeight = 0;
    this.baseLayerHeight = 0;
    this.layerGap = 0.1;  //内层间隙

    // 临时对象（复用以提高性能）
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
    this.tempColor = new THREE.Color();

    // 动画管理器
    this.animationManager = null;
  }

  /**
   * 创建多个柱状图
   */
  createBars(sceneData, barWidth = 10, initHeight = 1, baseLayerCount = 10) {
    const { bars: barsData } = sceneData;

    this.barWidth = barWidth;
    this.initHeight = initHeight;
    const totalGapForBase = this.layerGap * (baseLayerCount + 1);
    this.baseLayerHeight = (initHeight - totalGapForBase) / baseLayerCount;

    // 计算总层数
    this.totalLayerCount = 0;
    barsData.forEach((barData) => {
      this.totalLayerCount += barData.layers?.length || 0;
    });

    // 创建 BarManager 实例
    let instanceId = 0;
    barsData.forEach((barData, index) => {
      const layersData = barData.layers || [];
      const layerCount = layersData.length;
      const bar = new BarManager(
        this.scene,
        barData.position,
        barWidth,
        initHeight,
        layersData,
        index,
        barData.groupName || '',
        this.baseLayerHeight,
        barData.outerColor || 'normal',
        barData.uuid,
        this.layerGap
      );

      bar.outerShellInstanceId = index;

      for (let i = 0; i < layerCount; i++) {
        bar.layerInstanceIds.push(instanceId);
        this.instanceIdToLayer.set(instanceId, { barIndex: index, layerIndex: i });
        instanceId++;
      }

      this.bars.push(bar);
    });

    // 初始化创建 InstancedMesh
    this._createOuterShellInstancedMesh(barsData.length);
    this._createInnerLayerInstancedMesh();
    //初始化所有实例的矩阵
    this._updateAllInstanceMatrices();
    this._initializeColors();

    // 初始化动画管理器
    this.animationManager = new BarAnimationManager(this);

    // 使用动画方式更新到目标高度
    this._initializeHeights(barsData);
  }

  _createOuterShellInstancedMesh(count) {
    const shellGeometry = GeometryCache.getOuterShellGeometry(this.barWidth, this.initHeight);

    this.outerShellInstancedMesh = new THREE.InstancedMesh(
      shellGeometry,
      SharedMaterials.outerShell,
      count
    );
    this.outerShellInstancedMesh.userData = { type: 'outerShellInstanced' };
    this.outerShellInstancedMesh.frustumCulled = false;

    this.bars.forEach((bar, index) => {
      this.tempPosition.set(
        bar.position.x,
        bar.position.y + this.initHeight / 2,
        bar.position.z
      );
      this.tempScale.set(1, 1, 1);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.outerShellInstancedMesh.setMatrixAt(index, this.tempMatrix);

      bar.outerShell = {
        userData: {
          type: 'outerShell',
          barIndex: index,
          groupName: bar.groupName,
          raycastEnabled: true
        },
        scale: { x: 1, y: 1, z: 1 }
      };
    });

    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.outerShellInstancedMesh);
  }

  _createInnerLayerInstancedMesh() {
    const innerWidth = this.barWidth * 0.9;
    const layerGeometry = GeometryCache.getInnerLayerGeometry(innerWidth, this.baseLayerHeight);

    this.innerLayerInstancedMesh = new THREE.InstancedMesh(
      layerGeometry,
      SharedMaterials.innerLayer,
      this.totalLayerCount
    );
    this.innerLayerInstancedMesh.userData = { type: 'innerLayerInstanced' };
    this.innerLayerInstancedMesh.frustumCulled = false;
    this.scene.add(this.innerLayerInstancedMesh);
  }

  _createMergedEdges() {
    const innerWidth = this.barWidth * 0.9;
    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, this.baseLayerHeight);

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

    const mergedGeometry = mergeGeometries(edgesGeometries, false);
    this.mergedEdgesMesh = new THREE.LineSegments(mergedGeometry, SharedMaterials.edges);
    this.mergedEdgesMesh.frustumCulled = false;
    this.scene.add(this.mergedEdgesMesh);

    edgesGeometries.forEach(geom => geom.dispose());
  }

  _updateMergedEdges() {
    if (this.mergedEdgesMesh) {
      this.scene.remove(this.mergedEdgesMesh);
      this.mergedEdgesMesh.geometry.dispose();
    }

    const innerWidth = this.barWidth * 0.9;
    const edgesGeometry = GeometryCache.getEdgesGeometry(innerWidth, this.baseLayerHeight);

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

    const mergedGeometry = mergeGeometries(edgesGeometries, false);
    this.mergedEdgesMesh = new THREE.LineSegments(mergedGeometry, SharedMaterials.edges);
    this.mergedEdgesMesh.frustumCulled = false;
    this.scene.add(this.mergedEdgesMesh);

    edgesGeometries.forEach(geom => geom.dispose());
  }

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
 
  _initializeHeights(barsData) {
    this.animationManager.animateHeights(barsData, {
      duration: 0.8,
      ease: 'power2.out',
      //   onComplete: () => {
      //   this._createMergedEdges();
      // }
    });
  }

  _initializeColors() {
    this.bars.forEach((bar, barIndex) => {
      const outerColorHex = ColorMap.outer[bar.outerColor] || ColorMap.outer.normal;
      this.tempColor.set(outerColorHex);
      this.outerShellInstancedMesh.setColorAt(barIndex, this.tempColor);
    });
    this.outerShellInstancedMesh.instanceColor.needsUpdate = true;

    this.bars.forEach(bar => {
      bar.innerLayers.forEach((layerData, i) => {
        const instanceId = bar.layerInstanceIds[i];
        const innerColorHex = ColorMap.inner[layerData.color] || ColorMap.inner[0];
        this.tempColor.set(innerColorHex);
        this.innerLayerInstancedMesh.setColorAt(instanceId, this.tempColor);
      });
    });
    this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;
  }

  _updateOuterShellMatrix(barIndex, scaleY) {
    const bar = this.bars[barIndex];
    if (!bar) return;

    const scaledHeight = this.initHeight * scaleY;
    this.tempPosition.set(
      bar.position.x,
      bar.position.y + scaledHeight / 2,
      bar.position.z
    );
    this.tempScale.set(1, scaleY, 1);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    this.outerShellInstancedMesh.setMatrixAt(barIndex, this.tempMatrix);
    bar.outerShell.scale.y = scaleY;
  }

  _updateInstanceMatrix(instanceId, barPosition, layerData) {
    this.tempPosition.set(barPosition.x, layerData.positionY, barPosition.z);
    this.tempScale.set(1, layerData.scaleY, 1);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    this.innerLayerInstancedMesh.setMatrixAt(instanceId, this.tempMatrix);
  }

  _updateOuterShellScale(barIndex, scaleX, scaleZ) {
    const bar = this.bars[barIndex];
    if (!bar) return;

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

  updateAllHeights(heights) {
    heights.forEach((height, index) => {
      if (this.bars[index]) {
        const bar = this.bars[index];
        const { outerScaleY, innerLayers } = bar.updateOuterHeight(height);
        this._updateOuterShellMatrix(index, outerScaleY);
        innerLayers.forEach((layerData, i) => {
          const instanceId = bar.layerInstanceIds[i];
          this._updateInstanceMatrix(instanceId, bar.position, layerData);
        });
      }
    });

    this.outerShellInstancedMesh.instanceMatrix.needsUpdate = true;
    this.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;
    this.innerLayerInstancedMesh.computeBoundingSphere();
    this._updateMergedEdges();
  }

  animateAllHeights(heights, options = {}) {
    const barsData = heights.map(height => ({ height }));
    return this.animationManager.animateHeights(barsData, {
      duration: options.duration || 0.8,
      ease: options.ease || 'power2.out',
      onComplete: () => {
        this._updateMergedEdges();
        if (options.onComplete) options.onComplete();
      }
    });
  }

  setInnerLayerColor(barIndex, layerIndex, colorKey) {
    const bar = this.bars[barIndex];
    if (!bar || !bar.innerLayers[layerIndex]) return;

    const instanceId = bar.layerInstanceIds[layerIndex];
    const colorHex = ColorMap.inner[colorKey] || ColorMap.inner[0];
    this.tempColor.set(colorHex);
    this.innerLayerInstancedMesh.setColorAt(instanceId, this.tempColor);
    this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;
    bar.innerLayers[layerIndex].color = colorKey;
  }

  setOuterShellColor(barIndex, colorKey) {
    const bar = this.bars[barIndex];
    if (!bar) return;

    const colorHex = ColorMap.outer[colorKey] || ColorMap.outer.normal;
    this.tempColor.set(colorHex);
    this.outerShellInstancedMesh.setColorAt(barIndex, this.tempColor);
    this.outerShellInstancedMesh.instanceColor.needsUpdate = true;
    bar.outerColor = colorKey;
  }

  updateColors(colorUpdates) {
    colorUpdates.forEach(update => {
      const { barIndex, outerColor, layers } = update;
      const bar = this.bars[barIndex];
      if (!bar) return;

      if (outerColor) {
        const outerColorHex = ColorMap.outer[outerColor] || ColorMap.outer.normal;
        this.tempColor.set(outerColorHex);
        this.outerShellInstancedMesh.setColorAt(barIndex, this.tempColor);
        bar.outerColor = outerColor;
      }

      if (layers && Array.isArray(layers)) {
        layers.forEach(layerUpdate => {
          const { layerIndex, color } = layerUpdate;
          if (bar.innerLayers[layerIndex]) {
            const instanceId = bar.layerInstanceIds[layerIndex];
            const innerColorHex = ColorMap.inner[color] || ColorMap.inner[0];
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

  getLayerByInstanceId(instanceId) {
    return this.instanceIdToLayer.get(instanceId);
  }

  getOuterShellInstancedMesh() {
    return this.outerShellInstancedMesh;
  }

  getInnerLayerInstancedMesh() {
    return this.innerLayerInstancedMesh;
  }

  getBars() {
    return this.bars;
  }

  focusOnBar(barIndex) {
    const bars = this.bars;
    const dimFactor = 0.2;

    bars.forEach((bar, index) => {
      if (index === barIndex) {
        bar.outerShell.userData.raycastEnabled = true;
        return;
      }
      this._dimBar(index, dimFactor);
      bar.outerShell.userData.raycastEnabled = false;
    });

    this.outerShellInstancedMesh.instanceColor.needsUpdate = true;
    this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;
    this.focusedBarIndex = barIndex;
  }

  unfocus() {
    if (this.focusedBarIndex === null && this.focusedBarIndex === undefined) return;

    this.bars.forEach((bar, index) => {
      this._restoreBarColor(index);
      bar.outerShell.userData.raycastEnabled = true;
    });

    this.outerShellInstancedMesh.instanceColor.needsUpdate = true;
    this.innerLayerInstancedMesh.instanceColor.needsUpdate = true;
    this.focusedBarIndex = null;
  }

  _dimBar(barIndex, factor) {
    const bar = this.bars[barIndex];

    const outerColorHex = ColorMap.outer[bar.outerColor] || ColorMap.outer.normal;
    const outerColor = new THREE.Color(outerColorHex);
    outerColor.multiplyScalar(factor);
    this.outerShellInstancedMesh.setColorAt(barIndex, outerColor);

    bar.layerInstanceIds.forEach((instanceId, layerIndex) => {
      const layerColorKey = bar.innerLayers[layerIndex].color;
      const innerColorHex = ColorMap.inner[layerColorKey] || ColorMap.inner.normal;
      const innerColor = new THREE.Color(innerColorHex);
      innerColor.multiplyScalar(factor);
      this.innerLayerInstancedMesh.setColorAt(instanceId, innerColor);
    });
  }

  _restoreBarColor(barIndex) {
    const bar = this.bars[barIndex];

    const outerColorHex = ColorMap.outer[bar.outerColor] || ColorMap.outer.normal;
    const outerColor = new THREE.Color(outerColorHex);
    this.outerShellInstancedMesh.setColorAt(barIndex, outerColor);

    bar.layerInstanceIds.forEach((instanceId, layerIndex) => {
      const layerColorKey = bar.innerLayers[layerIndex].color;
      const innerColorHex = ColorMap.inner[layerColorKey] || ColorMap.inner.normal;
      const innerColor = new THREE.Color(innerColorHex);
      this.innerLayerInstancedMesh.setColorAt(instanceId, innerColor);
    });
  }

  dispose() {
    if (this.outerShellInstancedMesh) {
      this.scene.remove(this.outerShellInstancedMesh);
      this.outerShellInstancedMesh.dispose();
    }

    if (this.innerLayerInstancedMesh) {
      this.scene.remove(this.innerLayerInstancedMesh);
      this.innerLayerInstancedMesh.dispose();
    }

    if (this.mergedEdgesMesh) {
      this.scene.remove(this.mergedEdgesMesh);
      this.mergedEdgesMesh.geometry.dispose();
    }

    this.bars.forEach(bar => bar.dispose());
    this.bars = [];
    this.instanceIdToLayer.clear();
  }
}

export { BarManager, BarCollectionManager, SharedMaterials, GeometryCache, ColorMap };
