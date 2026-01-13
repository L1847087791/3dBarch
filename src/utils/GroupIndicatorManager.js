import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * 区域指示器管理类
 * 负责为每个区域创建：
 * 1. 底部边框平面（透明内部 + 白色边框）
 * 2. CSS2D 文字标签
 */
class GroupIndicatorManager {
  constructor(scene) {
    this.scene = scene;
    this.indicators = []; // 存储所有指示器对象
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

    // 保存指示器对象
    this.indicators.push({
      borderFrame,
      textLabel
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
   * 批量创建多个区域指示器
   * @param {Array} groupsInfo - 区域信息数组
   */
  createAllIndicators(groupsInfo) {
    groupsInfo.forEach(groupInfo => {
      this.createGroupIndicator(groupInfo);
    });
  }

  /**
   * 销毁所有指示器
   */
  dispose() {
    this.indicators.forEach(({ borderFrame, textLabel }) => {
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
