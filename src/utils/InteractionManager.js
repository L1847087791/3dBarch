import * as THREE from 'three';
import { ViewMode } from './ViewModeManager';

/**
 * 交互管理器类
 * 负责处理3D场景中柱状图的交互事件（点击、悬停等）
 * 使用射线追踪法(Raycaster)实现物体拾取
 * 支持组件视图和指标视图两种模式的不同交互逻辑
 */
class InteractionManager {
  /**
   * @param {THREE.Camera} camera - Three.js 相机
   * @param {HTMLElement} domElement - 渲染器的 DOM 元素
   * @param {BarCollectionManager} barCollectionManager - 柱状图集合管理器
   * @param {ViewModeManager} viewModeManager - 视图模式管理器（可选）
   * @param {Object} callbacks - 回调函数集合
   */
  constructor(camera, domElement, barCollectionManager, viewModeManager = null, callbacks = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.barCollectionManager = barCollectionManager;
    this.viewModeManager = viewModeManager;

    // 摄像机动画控制器（由外部注入）
    this.cameraAnimator = null;

    // 回调函数
    this.callbacks = {
      onBarHover: callbacks.onBarHover || null,
      onBarLeave: callbacks.onBarLeave || null,
      onBarClick: callbacks.onBarClick || null,
      onLayerHover: callbacks.onLayerHover || null,
      onLayerLeave: callbacks.onLayerLeave || null,
      onLayerClick: callbacks.onLayerClick || null,
      onMetricHover: callbacks.onMetricHover || null,
      onMetricLeave: callbacks.onMetricLeave || null,
      onHideRegionLabels: callbacks.onHideRegionLabels || null,
      onShowRegionLabels: callbacks.onShowRegionLabels || null,
    };

    // 射线追踪器
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // 当前选中的柱状图索引（用于内层拾取）
    this.selectedBarIndex = null;

    // 当前悬停的柱状图索引（外层悬停）
    this.hoveredBarIndex = null;

    // 当前悬停的内层索引
    this.hoveredLayerIndex = null;

    // 悬停缩放比例
    this.hoverScale = 1.5;

    // 内层闪烁动画相关
    this.blinkInterval = null;
    this.blinkState = false;

    // 选中光标相关
    this.selectionCursor = null; // 金色光标 Mesh
    this.cursorOffset = 4;     // 光标距离柱状图顶部的偏移量

    // 光标动画相关
    this.cursorRotationSpeed = 0.02;  // 旋转速度（弧度/帧）
    this.cursorFloatSpeed = 0.03;     // 上下浮动速度
    this.cursorFloatAmplitude = 0.5;  // 上下浮动幅度
    this.cursorFloatOffset = 0;       // 浮动偏移量（用于计算当前位置）
    this.cursorBaseY = 0;             // 光标基准Y坐标

    // 拖拽检测相关
    this.isMouseDown = false;         // 鼠标是否按下
    this.mouseDownPosition = null;    // 鼠标按下时的位置 {x, y}
    this.mouseDownTime = 0;           // 鼠标按下的时间戳
    this.isDragging = false;          // 是否正在拖拽
    this.dragThreshold = 5;           // 拖拽阈值（像素）
    this.clickTimeThreshold = 200;    // 点击时间阈值（毫秒）

    // 绑定事件处理函数（保持 this 引用）
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseClick = this._onMouseClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);

    // 初始化事件监听
    this._initEventListeners();
  }

  /**
   * 设置摄像机动画控制器
   * @param {CameraAnimator} cameraAnimator - 摄像机动画控制器实例
   */
  setCameraAnimator(cameraAnimator) {
    this.cameraAnimator = cameraAnimator;
  }

  /**
   * 获取当前视图模式
   */
  _getViewMode() {
    if (this.viewModeManager) {
      return this.viewModeManager.getViewMode();
    }
    return ViewMode.COMPONENT;
  }

  /**
   * 初始化事件监听器
   */
  _initEventListeners() {
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    this.domElement.addEventListener('click', this._onMouseClick);
    this.domElement.addEventListener('mousemove', this._onMouseMove);
    this.domElement.addEventListener('mouseleave', this._onMouseLeave);
  }

  /**
   * 获取3D坐标对应的屏幕坐标
   * @param {Object} position3D - 3D坐标 {x, y, z}
   * @returns {Object} 屏幕坐标 {x, y}
   */
  getScreenPosition(position3D) {
    const vector = new THREE.Vector3(position3D.x, position3D.y, position3D.z);
    vector.project(this.camera);
    const rect = this.domElement.getBoundingClientRect();
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-vector.y * 0.5 + 0.5) * rect.height
    };
  }

  /**
   * 更新鼠标坐标（归一化设备坐标）
   * @param {MouseEvent} event - 鼠标事件
   */
  _updateMousePosition(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * 鼠标按下事件处理
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseDown(event) {
    this.isMouseDown = true;
    this.isDragging = false;
    this.mouseDownTime = Date.now();

    // 记录鼠标按下时的屏幕坐标（用于计算移动距离）
    this.mouseDownPosition = {
      x: event.clientX,
      y: event.clientY
    };
  }

  /**
   * 鼠标移动事件处理（悬停检测）
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseMove(event) {
    // 如果鼠标按下，检测是否开始拖拽
    if (this.isMouseDown && this.mouseDownPosition) {
      const deltaX = event.clientX - this.mouseDownPosition.x;
      const deltaY = event.clientY - this.mouseDownPosition.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // 如果移动距离超过阈值，标记为拖拽状态
      if (distance > this.dragThreshold) {
        this.isDragging = true;
      }
    }

    // 如果正在拖拽，跳过所有悬停检测
    if (this.isDragging) {
      return;
    }

    this._updateMousePosition(event);

    // 更新射线
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 根据视图模式处理不同的交互逻辑
    const viewMode = this._getViewMode();

    if (viewMode === ViewMode.METRIC) {
      // 指标视图：只支持外层悬停，显示指标信息
      this._handleMetricViewHover();
      return;
    }

    // 组件视图：原有逻辑
    // 如果有选中的柱状图，只检测内层悬停，跳过外层悬停
    if (this.selectedBarIndex !== null) {
      this._handleInnerLayerHover();
      return;
    }

    // 否则检测外层悬停
    this._handleOuterShellHover();
  }

  /**
   * 鼠标离开画布事件处理
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseLeave(event) {
    // 重置拖拽状态
    this.isMouseDown = false;
    this.isDragging = false;
    this.mouseDownPosition = null;

    // 重置鼠标样式
    this.domElement.style.cursor = 'default';

    // 根据视图模式处理不同的离开逻辑
    const viewMode = this._getViewMode();

    if (viewMode === ViewMode.METRIC) {
      // 指标视图：清除外层悬停状态
      if (this.hoveredBarIndex !== null) {
        this._resetHoverState();
        this.hoveredBarIndex = null;

        // 触发指标视图离开回调
        if (this.callbacks.onMetricLeave) {
          this.callbacks.onMetricLeave();
        }
      }
      return;
    }

    // 组件视图：清除悬停状态
    // 如果有选中的柱状图，清除内层悬停状态
    if (this.selectedBarIndex !== null) {
      if (this.hoveredLayerIndex !== null) {
        this._stopLayerBlink();
        this.hoveredLayerIndex = null;

        // 触发内层离开回调
        if (this.callbacks.onLayerLeave) {
          this.callbacks.onLayerLeave();
        }
      }
    } else {
      // 没有选中柱状图，清除外层悬停状态
      if (this.hoveredBarIndex !== null) {
        this._resetHoverState();
        this.hoveredBarIndex = null;

        // 触发外层离开回调
        if (this.callbacks.onBarLeave) {
          this.callbacks.onBarLeave();
        }
      }
    }
  }

  /**
   * 处理指标视图下的悬停检测
   * 只支持外层悬停，显示所有内层的高度百分比
   */
  _handleMetricViewHover() {
    // 获取外壳 InstancedMesh
    const outerShellInstancedMesh = this.barCollectionManager.getOuterShellInstancedMesh();
    if (!outerShellInstancedMesh) return;

    // 进行射线检测
    const intersects = this.raycaster.intersectObject(outerShellInstancedMesh);

    if (intersects.length > 0) {
      const intersected = intersects[0];
      const barIndex = intersected.instanceId;
      const bar = this.barCollectionManager.getBars()[barIndex];

      if (!bar) return;

      // 如果悬停到新的柱状图
      if (this.hoveredBarIndex !== barIndex) {
        // 恢复之前悬停的柱状图
        this._resetHoverState();

        // 设置新的悬停状态
        this.hoveredBarIndex = barIndex;
        this._applyHoverState(barIndex);

        // 改变鼠标样式
        this.domElement.style.cursor = 'pointer';

        // 获取指标数据（从 ViewModeManager 获取）
        const metrics = this.viewModeManager ? this.viewModeManager.getMetricData(barIndex) : [];
        const screenPosition = this.getScreenPosition({
          x: bar.position.x,
          y: bar.currentHeight,
          z: bar.position.z
        });

        // 触发指标视图悬停回调
        if (this.callbacks.onMetricHover) {
          this.callbacks.onMetricHover({
            type: 'metric',
            barIndex,
            uuid: bar.uuid,
            groupName: bar.groupName,
            metrics: metrics, // 直接传递完整的metrics数据（包含metricData和color）
            screenPosition,
            bar: bar // 传递完整的bar对象
          });
        }
      }
    } else {
      // 鼠标移出所有柱状图
      if (this.hoveredBarIndex !== null) {
        this._resetHoverState();
        this.hoveredBarIndex = null;
        this.domElement.style.cursor = 'default';

        // 触发指标视图离开回调
        if (this.callbacks.onMetricLeave) {
          this.callbacks.onMetricLeave();
        }
      }
    }
  }

  /**
   * 处理外层悬停检测
   * 使用 InstancedMesh 射线检测
   */
  _handleOuterShellHover() {
    // 获取外壳 InstancedMesh
    const outerShellInstancedMesh = this.barCollectionManager.getOuterShellInstancedMesh();
    if (!outerShellInstancedMesh) return;

    // 进行射线检测
    const intersects = this.raycaster.intersectObject(outerShellInstancedMesh);

    if (intersects.length > 0) {
      const intersected = intersects[0];
      const barIndex = intersected.instanceId;

      // 检查是否可拾取（未被选中）
      const bar = this.barCollectionManager.getBars()[barIndex];
      if (!bar || bar.outerShell.userData.raycastEnabled === false) {
        // 没有可拾取的柱状图
        if (this.hoveredBarIndex !== null && this.hoveredBarIndex !== this.selectedBarIndex) {
          this._resetHoverState();
          this.hoveredBarIndex = null;
          this.domElement.style.cursor = 'default';
        }
        return;
      }

      this._processOuterShellHover(barIndex);
    } else {
      // 鼠标移出所有柱状图
      if (this.hoveredBarIndex !== null) {
        this._resetHoverState();
        this.hoveredBarIndex = null;
        this.domElement.style.cursor = 'default';

        // 触发外层离开回调
        if (this.callbacks.onBarLeave) {
          this.callbacks.onBarLeave();
        }
      }
    }
  }

  /**
   * 处理外壳悬停逻辑
   */
  _processOuterShellHover(barIndex) {
    // 如果悬停到新的柱状图
    if (this.hoveredBarIndex !== barIndex) {
      // 恢复之前悬停的柱状图
      this._resetHoverState();

      // 设置新的悬停状态
      this.hoveredBarIndex = barIndex;
      this._applyHoverState(barIndex);

      // 改变鼠标样式
      this.domElement.style.cursor = 'pointer';

      // 触发外层悬停回调
      if (this.callbacks.onBarHover) {
        const bar = this.barCollectionManager.getBars()[barIndex];
        const screenPosition = this.getScreenPosition({
          x: bar.position.x,
          y: bar.currentHeight,
          z: bar.position.z
        });
        this.callbacks.onBarHover({
          type: 'outer',
          barIndex,
          uuid: bar.uuid,
          groupName: bar.groupName,
          screenPosition,
          bar: bar // 传递完整的bar对象
        });
      }
    }
  }

  /**
   * 处理内层悬停检测
   * 使用 InstancedMesh 的射线检测
   */
  _handleInnerLayerHover() {
    const bar = this.barCollectionManager.getBars()[this.selectedBarIndex];
    if (!bar) return;

    // 获取 InstancedMesh
    const instancedMesh = this.barCollectionManager.getInnerLayerInstancedMesh();
    if (!instancedMesh) return;

    // 进行射线检测
    const intersects = this.raycaster.intersectObject(instancedMesh);

    if (intersects.length > 0) {
      const intersected = intersects[0];
      const instanceId = intersected.instanceId;

      // 根据 instanceId 获取层信息
      const layerInfo = this.barCollectionManager.getLayerByInstanceId(instanceId);
      if (!layerInfo) return;

      // 只处理当前选中柱状图的内层
      if (layerInfo.barIndex !== this.selectedBarIndex) return;

      const layerIndex = layerInfo.layerIndex;

      // 如果悬停到新的内层
      if (this.hoveredLayerIndex !== layerIndex) {
        // 停止之前的闪烁
        this._stopLayerBlink();

        // 设置新的悬停内层
        this.hoveredLayerIndex = layerIndex;

        // 开始闪烁
        this._startLayerBlink();

        this.domElement.style.cursor = 'pointer';

        // 触发内层悬停回调
        if (this.callbacks.onLayerHover) {
          const screenPosition = this.getScreenPosition({
            x: bar.position.x,
            y: bar.currentHeight,
            z: bar.position.z
          });
          const layerData = bar.innerLayers[layerIndex];
          this.callbacks.onLayerHover({
            type: 'inner',
            barIndex: this.selectedBarIndex,
            layerIndex,
            barUuid: bar.uuid,
            layerUuid: layerData?.uuid,
            groupName: bar.groupName,
            screenPosition,
            bar: bar // 传递完整的bar对象
          });
        }
      }
    } else {
      // 鼠标移出所有内层
      if (this.hoveredLayerIndex !== null) {
        this._stopLayerBlink();
        this.hoveredLayerIndex = null;
        this.domElement.style.cursor = 'default';

        // 触发内层离开回调
        if (this.callbacks.onLayerLeave) {
          this.callbacks.onLayerLeave();
        }
      }
    }
  }

  /**
   * 开始内层闪烁效果
   * 由于边框已合并，改用 InstancedMesh 的颜色实现闪烁
   */
  _startLayerBlink() {
    if (this.selectedBarIndex === null || this.hoveredLayerIndex === null) return;

    const bar = this.barCollectionManager.getBars()[this.selectedBarIndex];
    if (!bar) return;

    const instanceId = bar.layerInstanceIds[this.hoveredLayerIndex];
    const layerData = bar.innerLayers[this.hoveredLayerIndex];
    const instancedMesh = this.barCollectionManager.getInnerLayerInstancedMesh();
    if (!instancedMesh || !layerData) return;

    // 保存原始颜色
    this.originalBlinkColor = new THREE.Color('#EDF2FA');

    // 保存 layerData 用于恢复正确的 scaleY
    this.blinkLayerData = layerData;

    // 开始闪烁动画（通过缩放内层实现）
    this.blinkState = false;
    this.blinkInstanceId = instanceId;
    this.blinkInterval = setInterval(() => {
      this.blinkState = !this.blinkState;

      const tempMatrix = new THREE.Matrix4();
      const tempPosition = new THREE.Vector3();
      const tempQuaternion = new THREE.Quaternion();
      const tempScale = new THREE.Vector3();

      instancedMesh.getMatrixAt(instanceId, tempMatrix);
      tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);

      if (this.blinkState) {
        // 高亮状态 - 放大
        tempScale.x = 1.15;
        tempScale.y = layerData.scaleY;  // 保持正确的 Y 缩放
        tempScale.z = 1.15;
      } else {
        // 恢复状态
        tempScale.x = 1;
        tempScale.y = layerData.scaleY;  // 保持正确的 Y 缩放
        tempScale.z = 1;
      }

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      instancedMesh.setMatrixAt(instanceId, tempMatrix);
      instancedMesh.instanceMatrix.needsUpdate = true;
    }, 200);
  }

  /**
   * 停止内层闪烁效果
   */
  _stopLayerBlink() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }

    // 恢复内层缩放
    if (this.blinkInstanceId !== undefined && this.blinkInstanceId !== null) {
      const instancedMesh = this.barCollectionManager.getInnerLayerInstancedMesh();
      if (instancedMesh && this.blinkLayerData) {
        const tempMatrix = new THREE.Matrix4();
        const tempPosition = new THREE.Vector3();
        const tempQuaternion = new THREE.Quaternion();
        const tempScale = new THREE.Vector3();

        instancedMesh.getMatrixAt(this.blinkInstanceId, tempMatrix);
        tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);

        // 恢复正常缩放，使用保存的 scaleY
        tempScale.x = 1;
        tempScale.y = this.blinkLayerData.scaleY;
        tempScale.z = 1;

        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        instancedMesh.setMatrixAt(this.blinkInstanceId, tempMatrix);
        instancedMesh.instanceMatrix.needsUpdate = true;
      }
      this.blinkInstanceId = null;
      this.blinkLayerData = null;
    }

    this.blinkState = false;
  }

  /**
   * 创建选中光标（金色箭头指示器：线+箭头）
   * @param {number} barIndex - 柱状图索引
   */
  _createSelectionCursor(barIndex) {
    const bar = this.barCollectionManager.getBars()[barIndex];
    if (!bar) return;

    // 如果已存在光标，先移除
    this._removeSelectionCursor();

    // 创建光标组（包含线和箭头）
    this.selectionCursor = new THREE.Group();

    // 金色发光材质
    const cursorMaterial = new THREE.MeshPhongMaterial({
      color: 0xFFD700,           // 金色
      emissive: 0xFFD700,        // 金色发光
      emissiveIntensity: 1.0     // 发光强度
    });

    // 1. 创建细长的线（圆柱体）
    const lineHeight = 8;        // 线的长度
    const lineRadius = 0.4;     // 线的粗细
    const lineGeometry = new THREE.CylinderGeometry(
      lineRadius,
      lineRadius,
      lineHeight,
      8
    );
    const line = new THREE.Mesh(lineGeometry, cursorMaterial.clone());
    line.position.y = lineHeight / 2; // 线在上方
    this.selectionCursor.add(line);

    // 2. 创建箭头（三角锥，尖端朝下）
    const arrowHeight = 1.2;     // 箭头高度
    const arrowRadius = 1;     // 箭头底部半径
    const arrowGeometry = new THREE.ConeGeometry(arrowRadius, arrowHeight, 4);
    const arrow = new THREE.Mesh(arrowGeometry, cursorMaterial.clone());
    arrow.position.y = -arrowHeight / 2; // 箭头在下方
    arrow.rotation.x = Math.PI; // 旋转180度，使尖端朝下
    this.selectionCursor.add(arrow);

    // 标记光标，避免被射线拾取
    this.selectionCursor.userData = {
      type: 'selectionCursor',
      raycastEnabled: false
    };

    // 更新光标位置
    this._updateCursorPosition(barIndex);

    // 添加到场景
    this.barCollectionManager.scene.add(this.selectionCursor);
  }

  /**
   * 移除选中光标
   */
  _removeSelectionCursor() {
    if (this.selectionCursor) {
      // 遍历光标组中的所有子对象，清理几何体和材质
      this.selectionCursor.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          child.material.dispose();
        }
      });

      // 从场景中移除
      this.barCollectionManager.scene.remove(this.selectionCursor);

      this.selectionCursor = null;
    }
  }

  /**
   * 更新光标位置（定位到柱状图顶部上方）
   * @param {number} barIndex - 柱状图索引
   */
  _updateCursorPosition(barIndex) {
    if (!this.selectionCursor) return;

    const bar = this.barCollectionManager.getBars()[barIndex];
    if (!bar) return;

    // 计算柱状图顶部的Y坐标
    // 外壳底部Y坐标 + 当前外壳高度 = 顶部Y坐标
    const shellTopY = bar.position.y + bar.currentHeight;

    // 光标位置：柱状图顶部 + 偏移量
    const cursorY = shellTopY + this.cursorOffset;

    // 保存基准Y坐标（用于动画）
    this.cursorBaseY = cursorY;

    // 设置光标位置（X和Z与柱状图中心对齐）
    this.selectionCursor.position.set(
      bar.position.x,
      cursorY,
      bar.position.z
    );
  }

  /**
   * 更新光标动画（在渲染循环中每帧调用）
   * 实现旋转和上下浮动效果
   */
  updateCursorAnimate() {
    if (!this.selectionCursor) return;

    // 1. 旋转动画（绕Y轴旋转）
    this.selectionCursor.rotation.y += this.cursorRotationSpeed;

    // 2. 上下浮动动画（使用正弦波）
    this.cursorFloatOffset += this.cursorFloatSpeed;
    const floatY = Math.sin(this.cursorFloatOffset) * this.cursorFloatAmplitude;

    // 更新Y坐标（基准位置 + 浮动偏移）
    this.selectionCursor.position.y = this.cursorBaseY + floatY;
  }

  /**
   * 应用悬停状态（缩放效果）
   * 外壳和内层都使用 InstancedMesh，需要更新矩阵来实现缩放
   * @param {number} barIndex - 柱状图索引
   */
  _applyHoverState(barIndex) {
    const bar = this.barCollectionManager.getBars()[barIndex];
    if (!bar) return;

    // 缩放外壳（通过 InstancedMesh 矩阵）
    this.barCollectionManager._updateOuterShellScale(barIndex, this.hoverScale, this.hoverScale);

    // 更新代理对象的缩放状态（用于记录）
    if (bar.outerShell) {
      bar.outerShell.scale.x = this.hoverScale;
      bar.outerShell.scale.z = this.hoverScale;
    }

    // 缩放内层（通过 InstancedMesh 矩阵）
    this._updateBarInstanceScale(bar, this.hoverScale);
  }

  /**
   * 重置悬停状态
   */
  _resetHoverState() {
    if (this.hoveredBarIndex === null) return;

    const bar = this.barCollectionManager.getBars()[this.hoveredBarIndex];
    if (!bar) return;

    // 恢复外壳缩放（通过 InstancedMesh 矩阵）
    this.barCollectionManager._updateOuterShellScale(this.hoveredBarIndex, 1, 1);

    // 更新代理对象的缩放状态
    if (bar.outerShell) {
      bar.outerShell.scale.x = 1;
      bar.outerShell.scale.z = 1;
    }

    // 恢复内层缩放（通过 InstancedMesh 矩阵）
    this._updateBarInstanceScale(bar, 1);
  }

  /**
   * 更新柱状图所有内层实例的 X/Z 缩放
   * @param {BarManager} bar - 柱状图实例
   * @param {number} scale - 缩放比例
   */
  _updateBarInstanceScale(bar, scale) {
    const instancedMesh = this.barCollectionManager.getInnerLayerInstancedMesh();
    if (!instancedMesh) return;

    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();

    bar.innerLayers.forEach((layerData, i) => {
      const instanceId = bar.layerInstanceIds[i];

      // 获取当前矩阵
      instancedMesh.getMatrixAt(instanceId, tempMatrix);
      tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);

      // 更新 X/Z 缩放，使用 layerData.scaleY 确保 Y 轴缩放正确
      tempScale.x = scale;
      tempScale.y = layerData.scaleY;  // 使用数据中的 scaleY，避免累积误差
      tempScale.z = scale;

      // 重新组合矩阵
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      instancedMesh.setMatrixAt(instanceId, tempMatrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 鼠标点击事件处理
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseClick(event) {
    // 计算鼠标移动距离和按下时长
    let distance = 0;
    let duration = 0;

    if (this.mouseDownPosition) {
      const deltaX = event.clientX - this.mouseDownPosition.x;
      const deltaY = event.clientY - this.mouseDownPosition.y;
      distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      duration = Date.now() - this.mouseDownTime;
    }

    // 重置拖拽状态
    this.isMouseDown = false;
    this.isDragging = false;
    this.mouseDownPosition = null;

    // 只有移动距离小于阈值且时间小于阈值才视为有效点击
    if (distance > this.dragThreshold || duration > this.clickTimeThreshold) {
      return;
    }

    this._updateMousePosition(event);

    // 更新射线
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 根据视图模式处理不同的点击逻辑
    const viewMode = this._getViewMode();

    if (viewMode === ViewMode.METRIC) {
      // 指标视图：不支持点击选中，直接返回
      return;
    }

    // 组件视图：原有逻辑
    // 如果已有选中的柱状图，检测内层点击或其他点击
    if (this.selectedBarIndex !== null) {
      this._handleClickWithSelection();
      return;
    }

    // 否则检测外层点击
    this._handleOuterShellClick();
  }

  /**
   * 处理外层点击
   * 使用 InstancedMesh 射线检测
   */
  _handleOuterShellClick() {
    // 获取外壳 InstancedMesh
    const outerShellInstancedMesh = this.barCollectionManager.getOuterShellInstancedMesh();
    if (!outerShellInstancedMesh) return;

    // 进行射线检测
    const intersects = this.raycaster.intersectObject(outerShellInstancedMesh);

    if (intersects.length > 0) {
      const intersected = intersects[0];
      const barIndex = intersected.instanceId;
      const bar = this.barCollectionManager.getBars()[barIndex];

      if (bar) {
        //先执行外层离开回调，清除浮层
        if (this.callbacks.onBarLeave) {
          this.callbacks.onBarLeave();
        }
        // 触发外层点击回调
        if (this.callbacks.onBarClick) {
          this.callbacks.onBarClick({
            type: 'bar',
            barIndex,
            uuid: bar.uuid,
            groupName: bar.groupName
          });
        }

        // 选中该柱状图
        this._onBarSelected(barIndex);
      }
    }
  }

  /**
   * 处理已有选中状态时的点击
   */
  _handleClickWithSelection() {
    const bar = this.barCollectionManager.getBars()[this.selectedBarIndex];
    if (!bar) return;

    // 先检测是否点击了内层（使用 InstancedMesh）
    const instancedMesh = this.barCollectionManager.getInnerLayerInstancedMesh();
    if (instancedMesh) {
      const innerIntersects = this.raycaster.intersectObject(instancedMesh);

      if (innerIntersects.length > 0) {
        const intersected = innerIntersects[0];
        const instanceId = intersected.instanceId;
        const layerInfo = this.barCollectionManager.getLayerByInstanceId(instanceId);

        // 只处理当前选中柱状图的内层
        if (layerInfo && layerInfo.barIndex === this.selectedBarIndex) {
          const layerData = bar.innerLayers[layerInfo.layerIndex];

          // 触发内层点击回调
          if (this.callbacks.onLayerClick) {
            this.callbacks.onLayerClick({
              type: 'layer',
              barIndex: this.selectedBarIndex,
              layerIndex: layerInfo.layerIndex,
              barUuid: bar.uuid,
              layerUuid: layerData?.uuid,
              groupName: bar.groupName
            });
          }
          return;
        }
      }
    }
    // // 点击了空白区域或其他主机，取消选中
    // this._clearBarSelection();
  }

  /**
   * 获取所有可拾取的外壳对象
   * @returns {THREE.Mesh[]} 外壳 Mesh 数组
   */
  _getPickableOuterShells() {
    const bars = this.barCollectionManager.getBars();
    const outerShells = [];

    bars.forEach((bar, index) => {
      if (bar.outerShell && bar.outerShell.userData.raycastEnabled !== false) {
        outerShells.push(bar.outerShell);
      }
    });

    return outerShells;
  }

  /**
   * 柱状图被选中时的处理
   * @param {number} barIndex - 被选中的柱状图索引
   */
  _onBarSelected(barIndex) {
    // 如果点击的是已选中的柱状图，不做处理
    if (this.selectedBarIndex === barIndex) return;

    // 如果摄像机动画控制器存在且有聚焦状态，先清除之前的聚焦
    if (this.cameraAnimator && this.cameraAnimator.hasFocus()) {
      this.cameraAnimator.clearFocus();
    }

    // 恢复之前选中柱状图的外层可拾取状态
    if (this.selectedBarIndex !== null) {
      this._restoreOuterShellRaycast(this.selectedBarIndex);
    }

    // 停止内层闪烁
    this._stopLayerBlink();
    this.hoveredLayerIndex = null;

    // 重置外层悬停状态
    this._resetHoverState();
    this.hoveredBarIndex = null;

    // 设置新的选中状态
    this.selectedBarIndex = barIndex;

    // 禁用当前柱状图外层的射线检测
    this._disableOuterShellRaycast(barIndex);

    // 创建选中光标
    this._createSelectionCursor(barIndex);

    // 触发虚化聚焦效果
    this.barCollectionManager.focusOnBar(barIndex);

    // 触发摄像机聚焦动画
    const bar = this.barCollectionManager.getBars()[barIndex];
    if (this.cameraAnimator && bar) {
      this.cameraAnimator.focusOnBar(
        bar,
        barIndex,
        () => {
          // 隐藏区域标签
          if (this.callbacks.onHideRegionLabels) {
            this.callbacks.onHideRegionLabels();
          }
        }
      );
    }
  }

  /**
   * 清除柱状图选中状态
   */
  _clearBarSelection() {
    if (this.selectedBarIndex === null) return;

    // 停止内层闪烁
    this._stopLayerBlink();
    this.hoveredLayerIndex = null;

    // 恢复外层可拾取状态
    this._restoreOuterShellRaycast(this.selectedBarIndex);

    // 移除选中光标
    this._removeSelectionCursor();

    // 取消虚化聚焦
    this.barCollectionManager.unfocus();

    this.selectedBarIndex = null;
  }

  /**
   * 禁用指定柱状图外层的射线检测
   * @param {number} barIndex - 柱状图索引
   */
  _disableOuterShellRaycast(barIndex) {
    const bar = this.barCollectionManager.getBars()[barIndex];
    if (bar && bar.outerShell) {
      bar.outerShell.userData.raycastEnabled = false;
    }
  }

  /**
   * 恢复指定柱状图外层的射线检测
   * @param {number} barIndex - 柱状图索引
   */
  _restoreOuterShellRaycast(barIndex) {
    const bar = this.barCollectionManager.getBars()[barIndex];
    if (bar && bar.outerShell) {
      bar.outerShell.userData.raycastEnabled = true;
    }
  }

  /**
   * 获取当前选中的柱状图索引
   * @returns {number|null} 选中的柱状图索引，未选中返回 null
   */
  getSelectedBarIndex() {
    return this.selectedBarIndex;
  }

  /**
   * 清除选中状态（公开方法）
   */
  clearSelection() {
    this._clearBarSelection();
  }

  /**
   * 销毁交互管理器，移除事件监听
   */
  dispose() {
    // 停止内层闪烁
    this._stopLayerBlink();

    // 恢复选中柱状图的外层可拾取状态
    if (this.selectedBarIndex !== null) {
      this._restoreOuterShellRaycast(this.selectedBarIndex);
    }

    // 移除选中光标
    this._removeSelectionCursor();

    // 重置悬停状态
    this._resetHoverState();
    this.domElement.style.cursor = 'default';

    // 移除事件监听
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    this.domElement.removeEventListener('click', this._onMouseClick);
    this.domElement.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('mouseleave', this._onMouseLeave);

    this.selectedBarIndex = null;
    this.hoveredBarIndex = null;
    this.hoveredLayerIndex = null;
  }
}

export default InteractionManager;
