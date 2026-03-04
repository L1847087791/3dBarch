import * as THREE from 'three';
import { gsap } from 'gsap';
/**
 * 摄像机动画控制器
 * 负责处理摄像机聚焦动画、内层文字标签显示等功能
 * 与 InteractionManager 解耦，通过回调和方法调用进行通信
 */
class CameraAnimator {
  /**
   * @param {THREE.Camera} camera - Three.js 相机
   * @param {Object} cameraControls - 相机控制器实例
   * @param {THREE.Scene} scene - Three.js 场景
   * @param {Object} options - 配置选项
   */
  constructor(camera, cameraControls, scene, options = {}) {
    this.camera = camera;
    this.cameraControls = cameraControls;
    this.scene = scene;

    // 配置选项
    this.options = {
      // 摄像机偏移量
      cameraOffsetX: options.cameraOffsetX || 10,
      cameraOffsetZ: options.cameraOffsetZ || 30,
      cameraOffsetY: options.cameraOffsetY || -2,
      // 动画时长
      animationDuration: options.animationDuration || 1.2,
      // 文字标签动画延迟
      labelAnimationDelay: options.labelAnimationDelay || 0.05,
      // 3D文字大小
      textSize: options.textSize || 2,
      // 3D文字偏移
      textOffsetX: options.textOffsetX || 6,
      ...options
    };

    // 初始相机状态（用于重置）
    this.initialCameraPosition = camera.position.clone();
    this.initialTarget = { x: 0, y: 0, z: 0 };

    // 当前聚焦的柱状图
    this.focusedBarIndex = null;
    this.focusedBar = null;

    // 内层3D文字标签
    this.innerLayerLabels = [];

    // 动画状态
    this.isAnimating = false;

    // 字体（使用 Canvas 纹理代替 FontLoader）
    this.font = null;

    // 回调函数
    this.callbacks = {
      onFocusStart: options.onFocusStart || null,
      onFocusComplete: options.onFocusComplete || null,
      onResetComplete: options.onResetComplete || null
    };
  }

  /**
   * 设置初始相机状态（用于重置）
   * @param {THREE.Vector3} position - 初始位置
   * @param {Object} target - 初始目标点
   */
  setInitialState(position, target) {
    this.initialCameraPosition = position.clone();
    this.initialTarget = { ...target };
  }

  /**
   * 聚焦到指定柱状图
   * @param {Object} bar - 柱状图对象（来自 BarManager）
   * @param {number} barIndex - 柱状图索引
   * @param {Function} onHideRegionLabels - 隐藏区域标签的回调
   */
  focusOnBar(bar, barIndex, onHideRegionLabels) {
    if (this.isAnimating || !bar) return;

    this.isAnimating = true;
    this.focusedBarIndex = barIndex;
    this.focusedBar = bar;

    // 立即隐藏区域标签
    if (onHideRegionLabels) {
      onHideRegionLabels();
    }

    // 触发聚焦开始回调
    if (this.callbacks.onFocusStart) {
      this.callbacks.onFocusStart(barIndex);
    }

    // 计算目标位置
    const targetPosition = this._calculateCameraPosition(bar);
    const lookAtTarget = {
      x: bar.position.x,
      y: bar.currentHeight / 2,
      z: bar.position.z
    };

    // 获取当前相机的lookAt目标点（从相机控制器获取）
    const currentTarget = this.cameraControls
      ? { ...this.cameraControls.target }
      : { x: 0, y: 0, z: 0 };

    // 创建一个用于插值的目标点对象
    const animatedTarget = { ...currentTarget };

    // 使用 gsap 动画同时移动摄像机位置和视角目标点
    const timeline = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        // 更新相机控制器的目标点
        if (this.cameraControls) {
          this.cameraControls.setTarget(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
          // 更新球坐标参数
          this._updateCameraControlsParams();
        }
        // 触发聚焦完成回调
        if (this.callbacks.onFocusComplete) {
          this.callbacks.onFocusComplete(barIndex);
        }
      }
    });

    // 同时动画相机位置
    timeline.to(this.camera.position, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration: this.options.animationDuration,
      ease: 'power2.inOut',
    }, 0);

    // 同时动画视角目标点（实现平滑的视角过渡）
    timeline.to(animatedTarget, {
      x: lookAtTarget.x,
      y: lookAtTarget.y,
      z: lookAtTarget.z,
      duration: this.options.animationDuration,
      ease: 'power2.inOut',
      onUpdate: () => {
        // 动画过程中持续更新 lookAt
        this.camera.lookAt(animatedTarget.x, animatedTarget.y, animatedTarget.z);
      }
    }, 0);

    // 动画结束前显示内层文字标签
    timeline.call(() => {
      this._createInnerLayerLabels(bar);
    }, [], this.options.animationDuration * 0.8);
  }

  /**
   * 计算摄像机目标位置
   * @param {Object} bar - 柱状图对象
   * @returns {Object} 目标位置 {x, y, z}
   */
  _calculateCameraPosition(bar) {
    const { cameraOffsetX, cameraOffsetZ, cameraOffsetY } = this.options;

    // 摄像机位置在主机位置的斜前方
    return {
      x: bar.position.x + cameraOffsetX,
      y: bar.currentHeight + cameraOffsetY,
      z: bar.position.z + cameraOffsetZ
    };
  }

  /**
   * 更新相机控制器的球坐标参数
   * @param {Object} targetOverride - 可选的目标点覆盖（用于重置时）
   */
  _updateCameraControlsParams(targetOverride = null) {
    if (!this.cameraControls) return;

    const target = targetOverride || this.cameraControls.target;
    const camera = this.camera;

    // 重新计算球坐标
    this.cameraControls.radius = Math.sqrt(
      Math.pow(camera.position.x - target.x, 2) +
      Math.pow(camera.position.y - target.y, 2) +
      Math.pow(camera.position.z - target.z, 2)
    );
    this.cameraControls.theta = Math.atan2(
      camera.position.x - target.x,
      camera.position.z - target.z
    );
    this.cameraControls.phi = Math.acos(
      (camera.position.y - target.y) / this.cameraControls.radius
    );
  }

  /**
   * 创建内层3D文字标签
   * @param {Object} bar - 柱状图对象
   */
  _createInnerLayerLabels(bar) {
    if (!bar || !bar.innerLayers) return;

    // 先清除已有标签
    this._removeInnerLayerLabels();

    const layers = bar.innerLayers;

    layers.forEach((layer, index) => {
      // 获取组件名称
      const componentName = layer.componentData?.mc || `Layer-${index + 1}`;

      // 使用 Canvas 创建文字纹理
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      // 设置 canvas 尺寸
      const fontSize = 48;
      context.font = `bold ${fontSize}px Arial`;
      const textWidth = context.measureText(componentName).width;
      canvas.width = textWidth + 60;
      canvas.height = fontSize + 60;

      // 重新设置字体（canvas 尺寸改变后需要重新设置）
      context.font = `bold ${fontSize}px Arial`;
      context.fillStyle = 'white';
      context.textBaseline = 'middle';
      context.textAlign = 'left';
      context.fillText(componentName, 30, canvas.height / 2);

      // 创建纹理
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      //优化文本贴图配置，避免文字边缘被吃
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      // 创建平面几何体显示文字
      const aspectRatio = canvas.width / canvas.height;
      const planeHeight = this.options.textSize;
      const planeWidth = planeHeight * aspectRatio;

      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      });

      const textMesh = new THREE.Mesh(geometry, material);

      // 设置位置（在内层旁边）
      textMesh.position.set(
        bar.position.x + this.options.textOffsetX + planeWidth / 2,
        layer.positionY,
        bar.position.z
      );

      this.scene.add(textMesh);
      this.innerLayerLabels.push({
        mesh: textMesh,
        material: material,
        texture: texture,
        geometry: geometry
      });
    });

    const materials = this.innerLayerLabels.map(item => item.material);
    // 使用 gsap 动画显示标签（自下而上）,利用官方更为推荐的stagger写法
    gsap.to(materials, {
      opacity: 1,
      duration: 0.3,
      stagger: this.options.labelAnimationDelay,
      ease: 'power2.out'
    });

  }

  /**
   * 移除所有内层3D文字标签
   */
  _removeInnerLayerLabels() {
    this.innerLayerLabels.forEach(label => {
      if (label.mesh) {
        this.scene.remove(label.mesh);
      }
      if (label.geometry) {
        label.geometry.dispose();
      }
      if (label.material) {
        label.material.dispose();
      }
      if (label.texture) {
        label.texture.dispose();
      }
    });
    this.innerLayerLabels = [];
  }

  /**
   * 重置摄像机到初始位置（只改变聚焦目标，不改变位置）
   * @param {Function} onShowRegionLabels - 显示区域标签的回调
   */
  resetCamera(onShowRegionLabels) {
    if (this.isAnimating) return;

    // 移除内层文字标签
    this._removeInnerLayerLabels();

    // 重置聚焦状态
    this.focusedBarIndex = null;
    this.focusedBar = null;

    this.isAnimating = true;

    // 使用 gsap 动画将相机目标点移回初始位置
    const currentTarget = this.cameraControls ? { ...this.cameraControls.target } : { x: 0, y: 0, z: 0 };

    gsap.to(currentTarget, {
      x: this.initialTarget.x,
      y: this.initialTarget.y,
      z: this.initialTarget.z,
      duration: this.options.animationDuration * 0.8,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.camera.lookAt(currentTarget.x, currentTarget.y, currentTarget.z);
        if (this.cameraControls) {
          this.cameraControls.target = { ...currentTarget };
          // 传入当前目标点进行更新
          this._updateCameraControlsParams(currentTarget);
        }
      },
      onComplete: () => {
        this.isAnimating = false;

        // 最终确保球坐标参数正确
        if (this.cameraControls) {
          this.cameraControls.target = { ...this.initialTarget };
          this._updateCameraControlsParams(this.initialTarget);
        }

        // 显示区域标签
        if (onShowRegionLabels) {
          onShowRegionLabels();
        }

        // 触发重置完成回调
        if (this.callbacks.onResetComplete) {
          this.callbacks.onResetComplete();
        }
      }
    });
  }

  /**
   * 清除聚焦状态（不移动摄像机）
   */
  clearFocus() {
    this._removeInnerLayerLabels();
    this.focusedBarIndex = null;
    this.focusedBar = null;
  }

  /**
   * 检查是否有聚焦的柱状图
   * @returns {boolean}
   */
  hasFocus() {
    return this.focusedBarIndex !== null;
  }

  /**
   * 获取当前聚焦的柱状图索引
   * @returns {number|null}
   */
  getFocusedBarIndex() {
    return this.focusedBarIndex;
  }

  /**
   * 检查是否正在动画中
   * @returns {boolean}
   */
  isInAnimation() {
    return this.isAnimating;
  }

  /**
   * 聚焦到指定区域
   * 摄像机移动到区域中心正上方，俯视整个区域
   * @param {Object} regionInfo - 区域信息
   * @param {number} regionInfo.centerX - 区域中心X坐标
   * @param {number} regionInfo.centerZ - 区域中心Z坐标
   * @param {number} regionInfo.width - 区域宽度
   * @param {number} regionInfo.depth - 区域深度
   * @param {string} regionInfo.label - 区域标签
   * @param {Function} onHideRegionLabels - 隐藏区域标签的回调（可选）
   */
  focusOnRegion(regionInfo, onHideRegionLabels = null) {
    if (this.isAnimating || !regionInfo) return;

    this.isAnimating = true;

    // 清除之前的聚焦状态（如果有）
    this._removeInnerLayerLabels();
    this.focusedBarIndex = null;
    this.focusedBar = null;

    // 可选：隐藏区域标签
    if (onHideRegionLabels) {
      onHideRegionLabels();
    }

    // 触发聚焦开始回调
    if (this.callbacks.onFocusStart) {
      this.callbacks.onFocusStart(null); // 区域聚焦没有barIndex
    }

    // 计算摄像机目标位置
    const { centerX, centerZ, width, depth } = regionInfo;

    // 根据区域大小计算合适的摄像机高度和距离
    const regionSize = Math.max(width, depth);
    const cameraHeight = regionSize * 0.6 + 15; // 高度适中
    const cameraOffsetZ = regionSize * 0.4 + 10; // 前方偏移，形成斜视角

    // 摄像机位置：区域斜上方（而非正上方）
    const targetPosition = {
      x: centerX,
      y: cameraHeight,
      z: centerZ + cameraOffsetZ  // 在前方，形成斜视角
    };

    // 视角目标：区域中心略高于地面（而非地面）
    const lookAtTarget = {
      x: centerX,
      y: 5,  // 略高于地面，避免视角太陡
      z: centerZ
    };

    // 获取当前相机的lookAt目标点
    const currentTarget = this.cameraControls
      ? { ...this.cameraControls.target }
      : { x: 0, y: 0, z: 0 };

    // 创建用于插值的目标点对象
    const animatedTarget = { ...currentTarget };

    // 使用 gsap 动画同时移动摄像机位置和视角目标点
    const timeline = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        // 更新相机控制器的目标点
        if (this.cameraControls) {
          this.cameraControls.setTarget(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
          // 更新球坐标参数
          this._updateCameraControlsParams();
        }
        // 触发聚焦完成回调
        if (this.callbacks.onFocusComplete) {
          this.callbacks.onFocusComplete(null); // 区域聚焦没有barIndex
        }
      }
    });

    // 同时动画相机位置
    timeline.to(this.camera.position, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration: this.options.animationDuration,
      ease: 'power2.inOut',
    }, 0);

    // 同时动画视角目标点
    timeline.to(animatedTarget, {
      x: lookAtTarget.x,
      y: lookAtTarget.y,
      z: lookAtTarget.z,
      duration: this.options.animationDuration,
      ease: 'power2.inOut',
      onUpdate: () => {
        // 动画过程中持续更新 lookAt
        this.camera.lookAt(animatedTarget.x, animatedTarget.y, animatedTarget.z);
      }
    }, 0);
  }

  /**
   * 销毁
   */
  dispose() {
    // 停止所有 gsap 动画
    gsap.killTweensOf(this.camera.position);

    // 移除所有标签
    this._removeInnerLayerLabels();

    this.focusedBarIndex = null;
    this.focusedBar = null;
    this.isAnimating = false;
  }
}

export default CameraAnimator;
