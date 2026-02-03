import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * 区域指示器管理类
 * 负责为每个区域创建：
 * 1. 底部边框平面（透明内部 + 白色边框）
 * 2. CSS2D 文字标签
 * 3. 处理区域标签的交互事件（点击）
 */
class GroupIndicatorManager {
  /**
   * @param {THREE.Scene} scene - Three.js 场景
   * @param {Object} callbacks - 回调函数集合
   * @param {Function} callbacks.onRegionClick - 区域点击回调
   */
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.indicators = []; // 存储所有指示器对象

    // 回调函数
    this.callbacks = {
      onRegionClick: callbacks.onRegionClick || null
    };
  }

  /**
   * 创建区域指示器
   * @param {Object} groupInfo - 区域信息
   * @param {number} groupInfo.centerX - 区域中心X坐标
   * @param {number} groupInfo.centerZ - 区域中心Z坐标
   * @param {number} groupInfo.width - 区域宽度（X方向）
   * @param {number} groupInfo.depth - 区域深度（Z方向）
   * @param {string} groupInfo.label - 区域标签文本
   */
  createGroupIndicator(groupInfo) {
    const { centerX, centerZ, width, depth, label } = groupInfo;

    // 1. 创建底部边框平面
    const borderFrame = this.createBorderFrame(centerX, centerZ, width, depth);

    // 2. 创建CSS2D文字标签（放在区域前侧）
    const textLabel = this.createTextLabel(
      label,
      centerX,
      0,
      centerZ - depth / 2 - 30
    );

    // 3. 为标签添加交互事件
    const regionData = { ...groupInfo }; // 保存完整区域信息
    this._attachLabelEvents(textLabel, regionData);

    // 保存指示器对象
    this.indicators.push({
      borderFrame,
      textLabel,
      regionData
    });
  }

  /**
   * 创建边框平面
   * 使用透明平面 + 白色边框线
   */
  createBorderFrame(centerX, centerZ, width, depth) {
    // 创建透明平面
    const planeGeometry = new THREE.PlaneGeometry(width, depth);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(centerX, 0, centerZ);
    this.scene.add(plane);

    // 创建白色边框
    const edgesGeometry = new THREE.EdgesGeometry(planeGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2
    });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.rotation.x = -Math.PI / 2;
    edges.position.set(centerX, 0.1, centerZ);
    this.scene.add(edges);

    return { plane, edges };
  }

  /**
   * 创建CSS2D文字标签
   */
  createTextLabel(text, x, y, z) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'group-label'; //标签样式在根目录的index.css中定义
    labelDiv.textContent = text;
    const label = new CSS2DObject(labelDiv);
    label.position.set(x, y, z);
    this.scene.add(label);

    return label;
  }

  /**
   * 为标签DOM元素添加交互事件
   * @param {CSS2DObject} label - CSS2D标签对象
   * @param {Object} regionData - 区域数据
   */
  _attachLabelEvents(label, regionData) {
    if (!label || !label.element) return;

    const element = label.element;

    // 点击事件
    const onClick = (event) => {
      event.stopPropagation(); // 阻止事件冒泡
      if (this.callbacks.onRegionClick) {
        this.callbacks.onRegionClick(regionData);
      }
    };

    // 添加事件监听器
    element.addEventListener('click', onClick);

    // 保存事件处理函数引用，用于后续移除
    label.userData = {
      ...label.userData,
      eventHandlers: {
        onClick
      }
    };
  }

  /**
   * 移除标签的事件监听器
   * @param {CSS2DObject} label - CSS2D标签对象
   */
  _detachLabelEvents(label) {
    if (!label || !label.element || !label.userData.eventHandlers) return;
    const element = label.element;
    const handlers = label.userData.eventHandlers;
    element.removeEventListener('click', handlers.onClick);

    delete label.userData.eventHandlers;
  }

  /**
   * 批量创建多个区域指示器
   * @param {Array} groupsInfo - 区域信息数组
   */
  createAllIndicators(groupsInfo) {
    groupsInfo.forEach(groupInfo => {
      this.createGroupIndicator(groupInfo);
    });
  }

  /**
   * 隐藏所有区域标签
   */
  hideLabels() {
    this.indicators.forEach(({ textLabel }) => {
      if (textLabel && textLabel.element) {
        textLabel.element.style.opacity = '0';
        textLabel.element.style.pointerEvents = 'none';
      }
    });
  }

  /**
   * 显示所有区域标签
   */
  showLabels() {
    this.indicators.forEach(({ textLabel }) => {
      if (textLabel && textLabel.element) {
        textLabel.element.style.opacity = '1';
        textLabel.element.style.pointerEvents = 'auto';
      }
    });
  }

  /**
   * 禁用所有标签的交互（拖拽时使用）
   */
  disableInteraction() {
    this.indicators.forEach(({ textLabel }) => {
      if (textLabel && textLabel.element) {
        textLabel.element.style.pointerEvents = 'none';
      }
    });
  }

  /**
   * 启用所有标签的交互（拖拽结束后恢复）
   */
  enableInteraction() {
    this.indicators.forEach(({ textLabel }) => {
      if (textLabel && textLabel.element) {
        // 只有当标签可见时才启用交互
        const isVisible = textLabel.element.style.opacity !== '0';
        textLabel.element.style.pointerEvents = isVisible ? 'auto' : 'none';
      }
    });
  }

  /**
   * 销毁所有指示器
   */
  dispose() {
    this.indicators.forEach(({ borderFrame, textLabel }) => {
      // 移除标签事件监听器
      this._detachLabelEvents(textLabel);

      // 销毁边框平面
      if (borderFrame.plane) {
        borderFrame.plane.geometry.dispose();
        borderFrame.plane.material.dispose();
        this.scene.remove(borderFrame.plane);
      }
      if (borderFrame.edges) {
        borderFrame.edges.geometry.dispose();
        borderFrame.edges.material.dispose();
        this.scene.remove(borderFrame.edges);
      }

      // 销毁CSS2D文字标签
      if (textLabel) {
        if (textLabel.element && textLabel.element.parentNode) {
          textLabel.element.parentNode.removeChild(textLabel.element);
        }
        this.scene.remove(textLabel);
      }
    });

    this.indicators = [];
  }
}

export default GroupIndicatorManager;
