import * as THREE from 'three';

/**
 * 交互管理器类
 * 负责处理3D场景中柱状图的交互事件（点击、悬停等）
 * 使用射线追踪法(Raycaster)实现物体拾取
 */
class InteractionManager {
  /**
   * @param {THREE.Camera} camera - Three.js 相机
   * @param {HTMLElement} domElement - 渲染器的 DOM 元素
   * @param {BarCollectionManager} barCollectionManager - 柱状图集合管理器
   */
  constructor(camera, domElement, barCollectionManager) {
    this.camera = camera;
    this.domElement = domElement;
    this.barCollectionManager = barCollectionManager;

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

    // 绑定事件处理函数（保持 this 引用）
    this._onMouseClick = this._onMouseClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);

    // 初始化事件监听
    this._initEventListeners();
  }

  /**
   * 初始化事件监听器
   */
  _initEventListeners() {
    this.domElement.addEventListener('click', this._onMouseClick);
    this.domElement.addEventListener('mousemove', this._onMouseMove);
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
   * 鼠标移动事件处理（悬停检测）
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseMove(event) {
    this._updateMousePosition(event);

    // 更新射线
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 如果有选中的柱状图，优先检测内层悬停
    if (this.selectedBarIndex !== null) {
      this._handleInnerLayerHover();
      // return;
    }

    // 否则检测外层悬停
    this._handleOuterShellHover();
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
        // 如果当前悬停的柱状图不可拾取，尝试检测下一个
        // if (intersects.length > 1) {
        //   const nextBarIndex = intersects[1].instanceId;
        //   const nextBar = this.barCollectionManager.getBars()[nextBarIndex];
        //   if (nextBar && nextBar.outerShell.userData.raycastEnabled !== false) {
        //     this._processOuterShellHover(nextBarIndex);
        //     return;
        //   }
        // }
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
      }
    } else {
      // 鼠标移出所有内层
      if (this.hoveredLayerIndex !== null) {
        this._stopLayerBlink();
        this.hoveredLayerIndex = null;
        this.domElement.style.cursor = 'default';
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
    const cursorMaterial = new THREE.MeshBasicMaterial({
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
    this._updateMousePosition(event);

    // 更新射线
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 如果已有选中的柱状图，检测内层点击或其他柱状图点击
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
        console.log('点击了柱状图:', {
          barIndex: barIndex,
          groupName: bar.groupName,
          bar: bar
        });

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
          console.log('点击了内层:', {
            barIndex: this.selectedBarIndex,
            layerIndex: layerInfo.layerIndex,
            groupName: bar.groupName,
            instanceId: instanceId
          });
          return;
        }
      }
    }

    // 检测是否点击了其他柱状图的外层（使用 InstancedMesh）
    const outerShellInstancedMesh = this.barCollectionManager.getOuterShellInstancedMesh();
    if (outerShellInstancedMesh) {
      const outerIntersects = this.raycaster.intersectObject(outerShellInstancedMesh);

      if (outerIntersects.length > 0) {
        const intersected = outerIntersects[0];
        const barIndex = intersected.instanceId;

        // 跳过当前选中的柱状图
        if (barIndex !== this.selectedBarIndex) {
          const clickedBar = this.barCollectionManager.getBars()[barIndex];
          if (clickedBar) {
            console.log('点击了柱状图:', {
              barIndex: barIndex,
              groupName: clickedBar.groupName,
              bar: clickedBar
            });

            // 切换到新的柱状图
            this._onBarSelected(barIndex);
            return;
          }
        }
      }
    }

    // 点击了空白区域，取消选中
    this._clearBarSelection();
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

    console.log(`柱状图 ${barIndex} 已选中，外层射线检测已禁用，可以与内层交互`);
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

    console.log(`柱状图 ${this.selectedBarIndex} 已取消选中，外层射线检测已恢复`);

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
    this.domElement.removeEventListener('click', this._onMouseClick);
    this.domElement.removeEventListener('mousemove', this._onMouseMove);

    this.selectedBarIndex = null;
    this.hoveredBarIndex = null;
    this.hoveredLayerIndex = null;
  }
}

export default InteractionManager;
