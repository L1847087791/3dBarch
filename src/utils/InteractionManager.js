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

    // 当前选中的柱状图索引（用于步骤二的内层拾取）
    this.selectedBarIndex = null;

    // 当前悬停的柱状图索引
    this.hoveredBarIndex = null;

    // 悬停缩放比例
    this.hoverScale = 1.1;

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

      // 触发选中回调（预留给步骤二使用）
      this._onBarSelected(barIndex);
    }
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
   * 柱状图被选中时的处理（预留给步骤二扩展）
   * @param {number} barIndex - 被选中的柱状图索引
   */
  _onBarSelected(barIndex) {
    // 步骤一：仅记录选中状态
    this.selectedBarIndex = barIndex;

    // 步骤二将在此处添加：
    // 1. 禁用当前柱状图外层的射线检测
    // 2. 启用内层交互
    // 3. 恢复之前选中柱状图的外层可拾取状态
  }

  /**
   * 获取当前选中的柱状图索引
   * @returns {number|null} 选中的柱状图索引，未选中返回 null
   */
  getSelectedBarIndex() {
    return this.selectedBarIndex;
  }

  /**
   * 清除选中状态
   */
  clearSelection() {
    this.selectedBarIndex = null;
  }

  /**
   * 销毁交互管理器，移除事件监听
   */
  dispose() {
    // 重置悬停状态
    this._resetHoverState();
    this.domElement.style.cursor = 'default';

    // 移除事件监听
    this.domElement.removeEventListener('click', this._onMouseClick);
    this.domElement.removeEventListener('mousemove', this._onMouseMove);

    this.selectedBarIndex = null;
    this.hoveredBarIndex = null;
  }
}

export default InteractionManager;
