import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * 堆指示器管理类
 * 负责为每个柱状图堆创建：
 * 1. 底部边框平面（透明内部 + 白色边框）
 * 2. 文字标签（使用 CSS2DObject）
 */
class GroupIndicatorManager {
  constructor(scene) {
    this.scene = scene;
    this.indicators = []; // 存储所有指示器对象
  }

  /**
   * 创建堆指示器
   * @param {Object} groupInfo - 堆信息
   * @param {number} groupInfo.centerX - 堆中心X坐标
   * @param {number} groupInfo.centerZ - 堆中心Z坐标
   * @param {number} groupInfo.width - 堆宽度（X方向）
   * @param {number} groupInfo.depth - 堆深度（Z方向）
   * @param {string} groupInfo.label - 堆标签文本
   */
  createGroupIndicator(groupInfo) {
    const { centerX, centerZ, width, depth, label } = groupInfo;

    // 1. 创建底部边框平面
    const borderFrame = this.createBorderFrame(centerX, centerZ, width, depth);

    // 2. 创建文字标签（放在前侧）
    const textLabel = this.createTextLabel(
      label,
      centerX,
      0, // y坐标，稍微抬高一点
      centerZ - depth / 2 - 30 // z坐标，放在堆的前侧（-z方向）
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
      opacity: 0, // 完全透明
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2; // 旋转到水平
    plane.position.set(centerX, 0, centerZ); // y=0位置
    this.scene.add(plane);

    // 创建白色边框
    const edgesGeometry = new THREE.EdgesGeometry(planeGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2
    });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.rotation.x = -Math.PI / 2; // 旋转到水平
    edges.position.set(centerX, 0.1, centerZ); // 稍微抬高一点，避免z-fighting
    this.scene.add(edges);

    return { plane, edges };
  }

  /**
   * 创建文字标签
   * 使用 CSS2DObject 实现2D文字
   */
  createTextLabel(text, x, y, z) {
    // 创建 HTML 元素
    const labelDiv = document.createElement('div');
    labelDiv.className = 'group-label';
    labelDiv.textContent = text;
    labelDiv.style.color = 'white';
    labelDiv.style.fontSize = '18px';
    labelDiv.style.fontFamily = 'Arial, sans-serif';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.padding = '8px 16px';
    labelDiv.style.background = 'rgba(0, 0, 0, 0.5)';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.border = '1px solid white';
    labelDiv.style.pointerEvents = 'none'; // 不阻挡鼠标事件
    labelDiv.style.userSelect = 'none'; // 不可选中

    // 创建 CSS2DObject
    const label = new CSS2DObject(labelDiv);
    label.position.set(x, y, z);
    this.scene.add(label);

    return label;
  }

  /**
   * 批量创建多个堆指示器
   * @param {Array} groupsInfo - 堆信息数组
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

      // 销毁文字标签
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
