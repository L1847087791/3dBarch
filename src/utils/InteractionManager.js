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
   */
  _handleOuterShellHover() {
    // 获取所有可拾取的外壳对象
    const outerShells = this._getPickableOuterShells();

    // 进行射线检测
    const intersects = this.raycaster.intersectObjects(outerShells);

    if (intersects.length > 0) {
      const intersected = intersects[0].object;
      const barIndex = intersected.userData.barIndex;

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
   * 处理内层悬停检测
   */
  _handleInnerLayerHover() {
    const bar = this.barCollectionManager.getBars()[this.selectedBarIndex];
    if (!bar) return;

    // 获取该柱状图的所有内层 Mesh
    const innerMeshes = bar.innerLayers.map(layerObj => layerObj.mesh);

    // 进行射线检测
    const intersects = this.raycaster.intersectObjects(innerMeshes);

    if (intersects.length > 0) {
      const intersected = intersects[0].object;
      const layerIndex = intersected.userData.layerIndex;

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
   */
  _startLayerBlink() {
    if (this.selectedBarIndex === null || this.hoveredLayerIndex === null) return;

    const bar = this.barCollectionManager.getBars()[this.selectedBarIndex];
    if (!bar) return;

    const layerObj = bar.innerLayers[this.hoveredLayerIndex];
    if (!layerObj) return;

    // 保存原始颜色
    layerObj.mesh.userData.originalEmissive = layerObj.mesh.material.emissive.getHex();
    layerObj.mesh.userData.originalEmissiveIntensity = layerObj.mesh.material.emissiveIntensity;

    // 开始闪烁动画
    this.blinkState = false;
    this.blinkInterval = setInterval(() => {
      this.blinkState = !this.blinkState;
      if (layerObj.mesh.material) {
        if (this.blinkState) {
          // 高亮状态
          layerObj.mesh.material.emissive.setHex(0xffff00);
          layerObj.mesh.material.emissiveIntensity = 0.8;
        } else {
          // 恢复状态
          layerObj.mesh.material.emissive.setHex(layerObj.mesh.userData.originalEmissive);
          layerObj.mesh.material.emissiveIntensity = layerObj.mesh.userData.originalEmissiveIntensity;
        }
      }
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

    // 恢复内层原始颜色
    if (this.selectedBarIndex !== null && this.hoveredLayerIndex !== null) {
      const bar = this.barCollectionManager.getBars()[this.selectedBarIndex];
      if (bar) {
        const layerObj = bar.innerLayers[this.hoveredLayerIndex];
        if (layerObj && layerObj.mesh.userData.originalEmissive !== undefined) {
          layerObj.mesh.material.emissive.setHex(layerObj.mesh.userData.originalEmissive);
          layerObj.mesh.material.emissiveIntensity = layerObj.mesh.userData.originalEmissiveIntensity;
        }
      }
    }

    this.blinkState = false;
  }

  /**
   * 应用悬停状态（缩放效果）
   * @param {number} barIndex - 柱状图索引
   */
  _applyHoverState(barIndex) {
    const bar = this.barCollectionManager.getBars()[barIndex];
    if (!bar) return;

    // 缩放外壳（X和Z方向）
    if (bar.outerShell) {
      bar.outerShell.scale.x = this.hoverScale;
      bar.outerShell.scale.z = this.hoverScale;
    }

    // 缩放内层
    bar.innerLayers.forEach(layerObj => {
      layerObj.mesh.scale.x = this.hoverScale;
      layerObj.mesh.scale.z = this.hoverScale;
      if (layerObj.edges) {
        layerObj.edges.scale.x = this.hoverScale;
        layerObj.edges.scale.z = this.hoverScale;
      }
    });
  }

  /**
   * 重置悬停状态
   */
  _resetHoverState() {
    if (this.hoveredBarIndex === null) return;

    const bar = this.barCollectionManager.getBars()[this.hoveredBarIndex];
    if (!bar) return;

    // 恢复外壳缩放
    if (bar.outerShell) {
      bar.outerShell.scale.x = 1;
      bar.outerShell.scale.z = 1;
    }

    // 恢复内层缩放
    bar.innerLayers.forEach(layerObj => {
      layerObj.mesh.scale.x = 1;
      layerObj.mesh.scale.z = 1;
      if (layerObj.edges) {
        layerObj.edges.scale.x = 1;
        layerObj.edges.scale.z = 1;
      }
    });
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
   */
  _handleOuterShellClick() {
    // 获取所有可拾取的外壳对象
    const outerShells = this._getPickableOuterShells();

    // 进行射线检测
    const intersects = this.raycaster.intersectObjects(outerShells);

    if (intersects.length > 0) {
      // 获取第一个相交的物体（最近的）
      const intersected = intersects[0].object;
      const barIndex = intersected.userData.barIndex;

      console.log('点击了柱状图:', {
        barIndex: barIndex,
        groupName: intersected.userData.groupName,
        mesh: intersected,
        bar: this.barCollectionManager.getBars()[barIndex]
      });

      // 选中该柱状图
      this._onBarSelected(barIndex);
    }
  }

  /**
   * 处理已有选中状态时的点击
   */
  _handleClickWithSelection() {
    const bar = this.barCollectionManager.getBars()[this.selectedBarIndex];
    if (!bar) return;

    // 先检测是否点击了内层
    const innerMeshes = bar.innerLayers.map(layerObj => layerObj.mesh);
    const innerIntersects = this.raycaster.intersectObjects(innerMeshes);

    if (innerIntersects.length > 0) {
      // 点击了内层
      const intersected = innerIntersects[0].object;
      const layerIndex = intersected.userData.layerIndex;

      console.log('点击了内层:', {
        barIndex: this.selectedBarIndex,
        layerIndex: layerIndex,
        groupName: intersected.userData.groupName,
        mesh: intersected,
        layerData: intersected.userData
      });
      return;
    }

    // 检测是否点击了其他柱状图的外层
    const outerShells = this._getPickableOuterShells();
    const outerIntersects = this.raycaster.intersectObjects(outerShells);

    if (outerIntersects.length > 0) {
      const intersected = outerIntersects[0].object;
      const barIndex = intersected.userData.barIndex;

      console.log('点击了柱状图:', {
        barIndex: barIndex,
        groupName: intersected.userData.groupName,
        mesh: intersected,
        bar: this.barCollectionManager.getBars()[barIndex]
      });

      // 切换到新的柱状图
      this._onBarSelected(barIndex);
      return;
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
