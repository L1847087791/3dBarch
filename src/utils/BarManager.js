import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import BarAnimationManager from './BarAnimationManager';

/**
 * 颜色映射表 - 服务器机柜风格（浅灰色系 + 状态指示灯）
 */
const ColorMap = {
  // 内层颜色（告警级别：0-3）- 浅灰色主体
  inner: {
    0: '#e8eef5',    // 浅灰蓝（正常）
    1: '#ffcd3d',    // 浅黄（次要）
    2: '#ff8c3d',    // 浅粉（主要）
    3: '#ff4849',    // 浅红（严重）
  },
  // 外层颜色
  outer: {
    normal: '#f5f5f5',    // 浅灰白
  }
};

/**
 * 全局共享材质 - 服务器机柜风格（哑光塑料质感）
 */
const SharedMaterials = {
  // 外壳材质（半透明玻璃）
  outerShell: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.08,
    metalness: 0.1,
    roughness: 0.3,
    side: THREE.DoubleSide
  }),
  // 内层材质（哑光塑料/金属）
  innerLayer: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.2,        // 低金属度（塑料感）
    roughness: 0.6,        // 高粗糙度（哑光）
    emissive: 0x000000,    // 无自发光
    emissiveIntensity: 0
  }),
  // 边框材质（深灰色细线）
  edges: new THREE.LineBasicMaterial({
    color: 0x666666,       // 深灰色
    transparent: true,
    opacity: 0.4,
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
  constructor(scene, position = { x: 0, y: 0, z: 0 }, barWidth = 10, initHeight = 1, layersData = [], barIndex = 0, groupName = '', baseLayerHeight = 0.088, outerColor = 'normal', uuid = '', layerGap = 0, hostData = null) {
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
    this.hostData = hostData; // 存储主机相关数据（id, mc, ip, zylx, gjdj）

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
      const layerColorKey = this.layersData[i]?.color || 0;
      const layerUuid = this.layersData[i]?.uuid || '';
      const componentData = this.layersData[i]?.componentData || null; // 存储完整的组件数据
      this.innerLayers.push({
        layerIndex: i,
        barIndex: this.barIndex,
        groupName: this.groupName,
        baseHeight: this.baseLayerHeight,
        scaleY: scaleY,
        positionY: currentY + actualLayerHeight / 2,
        color: layerColorKey,
        uuid: layerUuid,
        componentData: componentData // 组件数据（id, mc, zylx, gjdj）
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
    this.layerGap = 0.25;  //内层间隙

    // 临时对象（复用以提高性能）
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
    this.tempColor = new THREE.Color();

    // 动画管理器
    this.animationManager = null;

    // 扫描光晕相关
    this.scanningLights = [];
    this.scanTime = 0;
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
        this.layerGap,
        barData.hostData || null // 传递主机数据
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

    // 创建专业的扫描光效（使用 Shader）
    this._createProfessionalScanEffect();
  }

  /**
   * 创建专业的扫描光效（使用自定义 Shader）
   */
  _createProfessionalScanEffect() {
    // 扫描线的 Vertex Shader
    const scanVertexShader = `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    // 扫描线的 Fragment Shader
    const scanFragmentShader = `
      uniform float scanPosition;      // 扫描线位置 (0-1)
      uniform vec3 scanColor;          // 扫描线颜色
      uniform vec3 baseColor;          // 基础颜色
      uniform float scanWidth;         // 扫描线宽度
      uniform float glowIntensity;     // 发光强度
      uniform float opacity;           // 整体透明度
      uniform float minY;              // 柱子最小Y
      uniform float maxY;              // 柱子最大Y
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        // 计算当前片元的归一化高度 (0-1)
        float normalizedHeight = (vPosition.y - minY) / (maxY - minY);
        
        // 计算到扫描线的距离
        float distanceToScan = abs(normalizedHeight - scanPosition);
        
        // 扫描线核心（非常亮）
        float scanCore = smoothstep(scanWidth * 0.5, 0.0, distanceToScan);
        
        // 扫描线光晕（渐变）
        float scanGlow = smoothstep(scanWidth * 3.0, 0.0, distanceToScan);
        
        // 边缘发光（Fresnel 效果）
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 3.0);
        
        // 混合颜色
        vec3 finalColor = baseColor;
        
        // 添加扫描线
        finalColor = mix(finalColor, scanColor, scanCore * 0.8);
        finalColor += scanColor * scanGlow * glowIntensity * 0.3;
        
        // 添加边缘发光
        finalColor += scanColor * fresnel * 0.4;
        
        // 计算最终透明度
        float finalOpacity = opacity;
        finalOpacity += scanCore * 0.5;        // 扫描线处更不透明
        finalOpacity += scanGlow * 0.2;        // 光晕处稍微不透明
        finalOpacity += fresnel * 0.3;         // 边缘更不透明
        
        gl_FragColor = vec4(finalColor, finalOpacity);
      }
    `;

    this.bars.forEach((bar) => {
      // 检查是否有异常
      const hasAlert = bar.layersData.some(layer => layer.color > 0);
      if (!hasAlert) return;

      // 获取最高告警级别
      const maxAlertLevel = Math.max(...bar.layersData.map(layer => layer.color));
      
      // 根据告警级别设置颜色
      const alertColors = {
        1: new THREE.Color(0xffff00),  // 黄色
        2: new THREE.Color(0xff9800),  // 橙色
        3: new THREE.Color(0xff0000)   // 红色
      };
      const scanColor = alertColors[maxAlertLevel] || new THREE.Color(0xffff00);
      const baseColor = scanColor.clone().multiplyScalar(0.3); // 基础色更暗

      // 创建扫描效果的几何体（与柱子外壳相同）
      const scanGeometry = GeometryCache.getOuterShellGeometry(this.barWidth, this.initHeight);
      
      // 创建 Shader Material
      const scanMaterial = new THREE.ShaderMaterial({
        uniforms: {
          scanPosition: { value: 0.0 },
          scanColor: { value: scanColor },
          baseColor: { value: baseColor },
          scanWidth: { value: 0.05 },
          glowIntensity: { value: 1.0 },
          opacity: { value: 0.25 },
          minY: { value: -this.initHeight / 2 },
          maxY: { value: this.initHeight / 2 }
        },
        vertexShader: scanVertexShader,
        fragmentShader: scanFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const scanMesh = new THREE.Mesh(scanGeometry, scanMaterial);
      scanMesh.position.set(
        bar.position.x,
        bar.position.y + this.initHeight / 2,
        bar.position.z
      );
      
      this.scene.add(scanMesh);
      
      this.scanningLights.push({
        mesh: scanMesh,
        material: scanMaterial,
        barHeight: bar.currentHeight,
        barIndex: bar.barIndex,
        speed: 0.25 + Math.random() * 0.1,  // 提速：0.25-0.35（之前是 0.15-0.20）
        phase: Math.random() * 10,
        alertLevel: maxAlertLevel
      });
    });
  }

  /**
   * 更新扫描光效动画
   */
  updateScanningAnimation(deltaTime = 0.016) {
    this.scanTime += deltaTime;
    
    this.scanningLights.forEach((scanData) => {
      // 获取当前柱子的实际高度
      const bar = this.bars[scanData.barIndex];
      if (!bar) return;
      
      const currentHeight = bar.currentHeight;
      const scaleY = currentHeight / this.initHeight;
      
      // 更新 mesh 的缩放（跟随柱子高度变化）
      scanData.mesh.scale.y = scaleY;
      scanData.mesh.position.y = bar.position.y + currentHeight / 2;
      
      // 计算扫描位置（0-1，循环）
      const cycleTime = 3; // 3秒一个循环（之前是4秒）
      const progress = ((this.scanTime * scanData.speed + scanData.phase) % cycleTime) / cycleTime;
      
      // 使用缓动函数，让运动更自然（先慢后快）
      const easedProgress = this._easeInCubic(progress);
      
      // 更新 shader uniform
      scanData.material.uniforms.scanPosition.value = easedProgress;
      
      // 扫描线接近顶部时增强发光
      const glowBoost = progress > 0.8 ? (progress - 0.8) * 5 : 0;
      scanData.material.uniforms.glowIntensity.value = 1.0 + glowBoost;
    });
  }

  /**
   * 缓动函数：先慢后快（加速效果）
   */
  _easeInCubic(t) {
    return t * t * t;
  }

  /**
   * 缓动函数：先加速后减速（备用）
   */
  _easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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

    // 清理扫描光晕
    this.scanningLights.forEach(scanData => {
      this.scene.remove(scanData.mesh);
      scanData.mesh.geometry.dispose();
      scanData.material.dispose();
    });
    this.scanningLights = [];

    this.bars.forEach(bar => bar.dispose());
    this.bars = [];
    this.instanceIdToLayer.clear();
  }
}

export { BarManager, BarCollectionManager, SharedMaterials, GeometryCache, ColorMap };
