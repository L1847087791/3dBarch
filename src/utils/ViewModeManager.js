import * as THREE from 'three';
import gsap from 'gsap';

/**
 * 视图模式常量
 */
export const ViewMode = {
  COMPONENT: 'component',  // 组件视图：内层纵向堆叠
  METRIC: 'metric'         // 指标视图：内层水平并排，5层
};

/**
 * 指标视图配置
 */
export const MetricViewConfig = {
  layerCount: 5,           // 指标视图固定5层
  defaultMetricIds: ['cpu', 'memory', 'disk', 'network', 'io'],
  defaultColors: ['metric1', 'metric2', 'metric3', 'metric4', 'metric5']
};

/**
 * 视图模式管理器
 * 负责管理组件视图和指标视图的切换逻辑
 * 与 BarCollectionManager 解耦，通过接口交互
 */
class ViewModeManager {
  /**
   * @param {THREE.Scene} scene - Three.js 场景
   * @param {BarCollectionManager} barCollectionManager - 柱状图集合管理器
   */
  constructor(scene, barCollectionManager) {
    this.scene = scene;
    this.barManager = barCollectionManager;

    // 当前视图模式
    this.viewMode = ViewMode.COMPONENT;
    this.isTransitioning = false;

    // 指标视图 InstancedMesh
    this.metricLayerInstancedMesh = null;

    // 指标数据存储 barIndex -> metrics[]
    this.metricData = new Map();

    // 指标视图参数
    this.metricLayerWidth = 0;
    this.metricLayerDepth = 0;
    this.metricBaseHeight = 1;
    this.metricColumns = 2;
    this.metricRows = 0;
    this.metricOffsets = [];
    this.metricUpdateTween = null;

    // 临时对象（复用以提高性能）
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
    this.tempColor = new THREE.Color();

    // 颜色映射（指标区分颜色，非告警含义）
    this.colorMap = {
      metric1: '#EDF2FA',
      metric2: '#4A90D9',
      metric3: '#F5A623',
      metric4: '#D0021B',
      metric5: '#8B0000'
    };

    // 回调
    this.onViewModeChange = null;
  }

  /**
   * 初始化指标视图（在 BarCollectionManager 创建柱状图后调用）
   */
  initialize() {
    if (!this.barManager || this.barManager.bars.length === 0) {
      console.warn('ViewModeManager: BarCollectionManager 未初始化或无柱状图');
      return;
    }

    this._initMetricViewParams();
    this._createMetricLayerInstancedMesh();
    this._initDefaultMetricData();
  }

  /**
   * 初始化指标视图参数
   */
  _initMetricViewParams() {
    const barWidth = this.barManager.barWidth;
    const totalInnerWidth = barWidth * 0.9;
    const totalInnerDepth = barWidth * 0.9;
    this.metricRows = Math.ceil(MetricViewConfig.layerCount / this.metricColumns);
    this.metricLayerWidth = totalInnerWidth / this.metricColumns;
    this.metricLayerDepth = totalInnerDepth / this.metricRows;
    this.metricBaseHeight = 1;
    this._refreshMetricOffsets();
  }

  _refreshMetricOffsets() {
    this.metricOffsets = [];
    for (let i = 0; i < MetricViewConfig.layerCount; i++) {
      this.metricOffsets.push(this._getMetricLayoutOffset(i));
    }
  }

  _normalizeMetrics(metrics) {
    return MetricViewConfig.defaultMetricIds.map((id, i) => {
      const metric = metrics[i] || {};
      return {
        id: metric.id || id,
        value: typeof metric.value === 'number' ? Math.max(0, Math.min(1, metric.value)) : 0,
        color: metric.color || MetricViewConfig.defaultColors[i]
      };
    });
  }

  _applyAllMetricData(allMetrics) {
    const normalizedByBar = [];

    this.barManager.bars.forEach((bar, barIndex) => {
      const metrics = Array.isArray(allMetrics?.[barIndex]) ? allMetrics[barIndex] : [];
      const normalized = this._normalizeMetrics(metrics);
      this.metricData.set(barIndex, normalized);
      normalizedByBar[barIndex] = normalized;
    });

    return normalizedByBar;
  }

  /**
   * 创建指标视图 InstancedMesh
   */
  _createMetricLayerInstancedMesh() {
    const barCount = this.barManager.bars.length;
    const metricLayerCount = barCount * MetricViewConfig.layerCount;

    // 创建几何体
    const metricGeometry = new THREE.BoxGeometry(
      this.metricLayerWidth,
      this.metricBaseHeight,
      this.metricLayerDepth
    );

    // 创建材质（克隆共享材质）
    const metricMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x888888,
      emissiveIntensity: 0.3,
      shininess: 50
    });

    this.metricLayerInstancedMesh = new THREE.InstancedMesh(
      metricGeometry,
      metricMaterial,
      metricLayerCount
    );
    this.metricLayerInstancedMesh.userData = {
      type: 'metricLayerInstanced'
    };
    this.metricLayerInstancedMesh.frustumCulled = false;
    this.metricLayerInstancedMesh.visible = false;

    this.scene.add(this.metricLayerInstancedMesh);
  }

  /**
   * 初始化默认指标数据（所有值为0）
   */
  _initDefaultMetricData() {
    this.barManager.bars.forEach((bar, barIndex) => {
      const defaultMetrics = MetricViewConfig.defaultMetricIds.map((id, i) => ({
        id,
        value: 0,
        color: MetricViewConfig.defaultColors[i]
      }));
      this.metricData.set(barIndex, defaultMetrics);
    });

    // 初始化矩阵和颜色
    this._updateAllMetricLayerMatrices();
  }

  /**
   * 设置指标数据（从外部传入）
   * @param {Array} metricsArray - 指标数据数组 [{ barIndex, metrics: [{ id, value, color }] }]
   */
  setMetricData(metricsArray) {
    if (!Array.isArray(metricsArray)) return;

    metricsArray.forEach(({ barIndex, metrics }) => {
      if (barIndex >= 0 && barIndex < this.barManager.bars.length && Array.isArray(metrics)) {
        // 确保有5个指标
        const normalizedMetrics = MetricViewConfig.defaultMetricIds.map((id, i) => {
          const metric = metrics[i] || {};
          return {
            id: metric.id || id,
            value: typeof metric.value === 'number' ? Math.max(0, Math.min(1, metric.value)) : 0,
            color: metric.color || MetricViewConfig.defaultColors[i]
          };
        });
        this.metricData.set(barIndex, normalizedMetrics);
      }
    });

    // 如果当前是指标视图，立即更新显示
    if (this.viewMode === ViewMode.METRIC && !this.isTransitioning) {
      this._updateAllMetricLayerMatrices();
    }
  }

  /**
   * 批量设置所有柱状图的指标数据
   * @param {Array} allMetrics - 所有柱状图的指标数据 [[{ id, value, color }], ...]
   */
  setAllMetricData(allMetrics) {
    if (!Array.isArray(allMetrics)) return;
    this._applyAllMetricData(allMetrics);

    if (this.viewMode === ViewMode.METRIC && !this.isTransitioning) {
      this._updateAllMetricLayerMatrices();
    }
  }

  setAllMetricDataAnimated(allMetrics, options = {}) {
    if (!Array.isArray(allMetrics)) return;

    const {
      duration = 0.6,
      ease = 'power2.out'
    } = options;

    const fromMetrics = [];
    this.barManager.bars.forEach((bar, barIndex) => {
      fromMetrics[barIndex] = this.metricData.get(barIndex) || [];
    });

    const toMetrics = this._applyAllMetricData(allMetrics);

    if (this.viewMode !== ViewMode.METRIC || this.isTransitioning) {
      return;
    }

    this._animateMetricLayerMatrices(fromMetrics, toMetrics, { duration, ease });
  }

  /**
   * 获取指标数据
   * @param {number} barIndex - 柱状图索引
   * @returns {Array} 指标数据数组
   */
  getMetricData(barIndex) {
    return this.metricData.get(barIndex) || [];
  }

  /**
   * 获取当前视图模式
   */
  getViewMode() {
    return this.viewMode;
  }

  /**
   * 切换视图模式
   * @param {string} mode - 目标模式 'component' | 'metric'
   * @param {Object} options - 动画选项
   * @returns {Promise}
   */
  switchViewMode(mode, options = {}) {
    if (this.viewMode === mode || this.isTransitioning) {
      return Promise.resolve();
    }

    const {
      duration = 0.8,
      ease = 'power2.inOut',
      onComplete = null
    } = options;

    this.isTransitioning = true;

    return new Promise((resolve) => {
      if (mode === ViewMode.METRIC) {
        this._transitionToMetricView(duration, ease, () => {
          this.viewMode = ViewMode.METRIC;
          this.isTransitioning = false;
          if (this.onViewModeChange) this.onViewModeChange(ViewMode.METRIC);
          if (onComplete) onComplete();
          resolve();
        });
      } else {
        this._transitionToComponentView(duration, ease, () => {
          this.viewMode = ViewMode.COMPONENT;
          this.isTransitioning = false;
          if (this.onViewModeChange) this.onViewModeChange(ViewMode.COMPONENT);
          if (onComplete) onComplete();
          resolve();
        });
      }
    });
  }

  /**
   * 从组件视图过渡到指标视图
   */
  _transitionToMetricView(duration, ease, onComplete) {
    // 隐藏边框
    if (this.barManager.mergedEdgesMesh) {
      this.barManager.mergedEdgesMesh.visible = false;
    }

    // 更新指标视图矩阵
    this._updateAllMetricLayerMatrices();

    // 显示指标视图层
    this.metricLayerInstancedMesh.visible = true;

    // 收集状态
    const componentStates = this._captureComponentViewState();
    const metricStates = this._captureMetricViewState();

    const proxy = { progress: 0 };

    gsap.to(proxy, {
      progress: 1,
      duration,
      ease,
      onUpdate: () => {
        this._interpolateTransition(componentStates, metricStates, proxy.progress);
      },
      onComplete: () => {
        // 隐藏组件视图层
        this.barManager.innerLayerInstancedMesh.visible = false;
        onComplete();
      }
    });
  }

  /**
   * 从指标视图过渡到组件视图
   */
  _transitionToComponentView(duration, ease, onComplete) {
    // 显示组件视图层
    this.barManager.innerLayerInstancedMesh.visible = true;

    // 收集状态
    const metricStates = this._captureMetricViewState();
    const componentStates = this._captureComponentViewState();

    const proxy = { progress: 0 };

    gsap.to(proxy, {
      progress: 1,
      duration,
      ease,
      onUpdate: () => {
        this._interpolateTransition(metricStates, componentStates, proxy.progress);
      },
      onComplete: () => {
        // 隐藏指标视图层
        this.metricLayerInstancedMesh.visible = false;
        // 显示边框
        if (this.barManager.mergedEdgesMesh) {
          this.barManager.mergedEdgesMesh.visible = true;
        }
        onComplete();
      }
    });
  }

  /**
   * 捕获组件视图状态
   */
  _captureComponentViewState() {
    const states = [];
    this.barManager.bars.forEach((bar) => {
      const barStates = bar.innerLayers.map(layerData => ({
        positionX: bar.position.x,
        positionY: layerData.positionY,
        positionZ: bar.position.z,
        scaleY: layerData.scaleY
      }));
      states.push(barStates);
    });
    return states;
  }

  /**
   * 捕获指标视图状态
   */
  _captureMetricViewState() {
    const states = [];

    this.barManager.bars.forEach((bar, barIndex) => {
      const barStates = [];
      const metrics = this.metricData.get(barIndex) || [];

      for (let i = 0; i < MetricViewConfig.layerCount; i++) {
        const metric = metrics[i] || { value: 0 };
        const heightPercent = metric.value;
        const actualHeight = bar.currentHeight * heightPercent;
        const scaleY = actualHeight / this.metricBaseHeight;
        const { offsetX, offsetZ } = this._getMetricLayoutOffset(i);

        barStates.push({
          positionX: bar.position.x + offsetX,
          positionY: bar.position.y + actualHeight / 2,
          positionZ: bar.position.z + offsetZ,
          scaleY: scaleY
        });
      }
      states.push(barStates);
    });
    return states;
  }

  /**
   * 插值过渡
   */
  _interpolateTransition(fromStates, toStates, progress) {
    // 更新组件视图层
    this.barManager.bars.forEach((bar, barIndex) => {
      const fromBarStates = fromStates[barIndex] || [];
      const toBarStates = toStates[barIndex] || [];

      bar.innerLayers.forEach((layerData, i) => {
        const from = fromBarStates[i] || fromBarStates[0];
        const to = toBarStates[Math.min(i, toBarStates.length - 1)] || toBarStates[0];

        if (from && to) {
          const posX = from.positionX + (to.positionX - from.positionX) * progress;
          const posY = from.positionY + (to.positionY - from.positionY) * progress;
          const posZ = from.positionZ + (to.positionZ - from.positionZ) * progress;
          const scaleY = from.scaleY + (to.scaleY - from.scaleY) * progress;

          this.tempPosition.set(posX, posY, posZ);
          this.tempScale.set(1, scaleY, 1);
          this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);

          const instanceId = bar.layerInstanceIds[i];
          this.barManager.innerLayerInstancedMesh.setMatrixAt(instanceId, this.tempMatrix);
        }
      });
    });
    this.barManager.innerLayerInstancedMesh.instanceMatrix.needsUpdate = true;

    // 更新指标视图层
    let metricInstanceId = 0;
    this.barManager.bars.forEach((bar, barIndex) => {
      const fromBarStates = fromStates[barIndex] || [];
      const toBarStates = toStates[barIndex] || [];

      for (let i = 0; i < MetricViewConfig.layerCount; i++) {
        const from = fromBarStates[Math.min(i, fromBarStates.length - 1)] || fromBarStates[0];
        const to = toBarStates[i] || toBarStates[0];

        if (from && to) {
          const posX = from.positionX + (to.positionX - from.positionX) * progress;
          const posY = from.positionY + (to.positionY - from.positionY) * progress;
          const posZ = from.positionZ + (to.positionZ - from.positionZ) * progress;
          const scaleY = from.scaleY + (to.scaleY - from.scaleY) * progress;

          this.tempPosition.set(posX, posY, posZ);
          this.tempScale.set(1, Math.max(0.01, scaleY), 1);
          this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
          this.metricLayerInstancedMesh.setMatrixAt(metricInstanceId, this.tempMatrix);
        }
        metricInstanceId++;
      }
    });
    this.metricLayerInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新所有指标视图层的矩阵和颜色
   */
  _updateAllMetricLayerMatrices() {
    let instanceId = 0;

    this.barManager.bars.forEach((bar, barIndex) => {
      const metrics = this.metricData.get(barIndex) || [];

      for (let i = 0; i < MetricViewConfig.layerCount; i++) {
        const metric = metrics[i] || { value: 0, color: 'metric1' };
        const heightPercent = metric.value;
        const actualHeight = bar.currentHeight * heightPercent;
        const scaleY = actualHeight / this.metricBaseHeight;
        const { offsetX, offsetZ } = this._getMetricLayoutOffset(i);

        this.tempPosition.set(
          bar.position.x + offsetX,
          bar.position.y + actualHeight / 2,
          bar.position.z + offsetZ
        );
        this.tempScale.set(1, scaleY, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.metricLayerInstancedMesh.setMatrixAt(instanceId, this.tempMatrix);

        // 设置颜色
        const colorHex = this.colorMap[metric.color] || this.colorMap.metric1;
        this.tempColor.set(colorHex);
        this.metricLayerInstancedMesh.setColorAt(instanceId, this.tempColor);

        instanceId++;
      }
    });

    this.metricLayerInstancedMesh.instanceMatrix.needsUpdate = true;
    this.metricLayerInstancedMesh.instanceColor.needsUpdate = true;
  }

  _animateMetricLayerMatrices(fromMetrics, toMetrics, options = {}) {
    const { duration, ease } = options;

    if (this.metricUpdateTween) {
      this.metricUpdateTween.kill();
    }

    this._updateMetricLayerColors(toMetrics);

    const fromValues = [];
    const toValues = [];
    let instanceId = 0;

    this.barManager.bars.forEach((bar, barIndex) => {
      const fromBarMetrics = fromMetrics[barIndex] || [];
      const toBarMetrics = toMetrics[barIndex] || [];

      for (let i = 0; i < MetricViewConfig.layerCount; i++) {
        fromValues[instanceId] = fromBarMetrics[i]?.value ?? 0;
        toValues[instanceId] = toBarMetrics[i]?.value ?? 0;
        instanceId++;
      }
    });

    const offsets = this.metricOffsets.length ? this.metricOffsets : null;
    const proxy = { progress: 0 };

    this.metricUpdateTween = gsap.to(proxy, {
      progress: 1,
      duration,
      ease,
      onUpdate: () => {
        let updateId = 0;

        this.barManager.bars.forEach((bar) => {
          for (let i = 0; i < MetricViewConfig.layerCount; i++) {
            const offset = offsets ? offsets[i] : this._getMetricLayoutOffset(i);
            const value = fromValues[updateId] + (toValues[updateId] - fromValues[updateId]) * proxy.progress;
            const actualHeight = bar.currentHeight * value;
            const scaleY = actualHeight / this.metricBaseHeight;

            this.tempPosition.set(
              bar.position.x + offset.offsetX,
              bar.position.y + actualHeight / 2,
              bar.position.z + offset.offsetZ
            );
            this.tempScale.set(1, Math.max(0.01, scaleY), 1);
            this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
            this.metricLayerInstancedMesh.setMatrixAt(updateId, this.tempMatrix);

            updateId++;
          }
        });

        this.metricLayerInstancedMesh.instanceMatrix.needsUpdate = true;
      },
      onComplete: () => {
        this._updateAllMetricLayerMatrices();
      }
    });
  }

  _updateMetricLayerColors(metricsByBar) {
    let instanceId = 0;

    this.barManager.bars.forEach((bar, barIndex) => {
      const metrics = metricsByBar[barIndex] || [];

      for (let i = 0; i < MetricViewConfig.layerCount; i++) {
        const metric = metrics[i] || { color: 'metric1' };
        const colorHex = this.colorMap[metric.color] || this.colorMap.metric1;
        this.tempColor.set(colorHex);
        this.metricLayerInstancedMesh.setColorAt(instanceId, this.tempColor);
        instanceId++;
      }
    });

    this.metricLayerInstancedMesh.instanceColor.needsUpdate = true;
  }

  _getMetricLayoutOffset(metricIndex) {
    if (this.metricOffsets?.[metricIndex]) {
      return this.metricOffsets[metricIndex];
    }

    const barWidth = this.barManager.barWidth;
    const totalInnerWidth = barWidth * 0.9;
    const totalInnerDepth = barWidth * 0.9;
    const startX = -totalInnerWidth / 2 + this.metricLayerWidth / 2;
    const startZ = -totalInnerDepth / 2 + this.metricLayerDepth / 2;
    const col = metricIndex % this.metricColumns;
    const row = Math.floor(metricIndex / this.metricColumns);

    return {
      offsetX: startX + col * this.metricLayerWidth,
      offsetZ: startZ + row * this.metricLayerDepth
    };
  }

  /**
   * 获取指标视图 InstancedMesh
   */
  getMetricLayerInstancedMesh() {
    return this.metricLayerInstancedMesh;
  }

  /**
   * 根据指标视图 instanceId 获取信息
   * @param {number} instanceId - 实例ID
   * @returns {Object} { barIndex, metricIndex, metric }
   */
  getMetricByInstanceId(instanceId) {
    const barIndex = Math.floor(instanceId / MetricViewConfig.layerCount);
    const metricIndex = instanceId % MetricViewConfig.layerCount;
    const metrics = this.metricData.get(barIndex);
    const metric = metrics ? metrics[metricIndex] : null;

    return { barIndex, metricIndex, metric };
  }

  /**
   * 销毁
   */
  dispose() {
    if (this.metricUpdateTween) {
      this.metricUpdateTween.kill();
      this.metricUpdateTween = null;
    }

    if (this.metricLayerInstancedMesh) {
      this.scene.remove(this.metricLayerInstancedMesh);
      this.metricLayerInstancedMesh.geometry.dispose();
      this.metricLayerInstancedMesh.material.dispose();
      this.metricLayerInstancedMesh = null;
    }

    this.metricData.clear();
    this.barManager = null;
    this.scene = null;
  }
}

export default ViewModeManager;
