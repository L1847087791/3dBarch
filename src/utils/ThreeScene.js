import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * Three.js 场景管理类
 * 负责初始化场景、相机、渲染器和灯光
 */
class ThreeScene {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.labelRenderer = null; // CSS2D 渲染器
    this.lights = [];

    this.init();
  }

  /**
   * 初始化场景
   */
  init() {
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1B1E28'); // 淡灰色背景

    //创建坐标辅助器，仅用于区分笛卡尔坐标 ：X 轴为红色，Y 轴为绿色，Z 轴为蓝色
    const axesHelper = new THREE.AxesHelper(200)
    this.scene.add(axesHelper);

    //创建网格辅助器，调试场景图位置
    // const grideHelper = new THREE.GridHelper(500,50)   //步长为500/50=10
    // this.scene.add(grideHelper)

    // 创建透视相机
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(
      60, // 视野角度
      width / height, // 宽高比
      1, // 近裁剪面
      1000 // 远裁剪面
    );

    // 设置相机初始位置，确保能看到所有柱状图
    this.camera.position.set(-168, 45, -72);
    this.camera.lookAt(0, 0, 0);

    // 创建渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, // 抗锯齿
      alpha: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // 创建 CSS2D 渲染器（用于渲染标签）
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none'; // 不阻挡鼠标事件
    this.container.appendChild(this.labelRenderer.domElement);

    // 添加灯光
    this.setupLights();

    // 监听窗口大小变化
    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * 设置灯光系统
   */
  setupLights() {
    // 环境光 - 提供基础亮度
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    this.lights.push(ambientLight);

    // 方向光 - 主光源
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);
    this.lights.push(directionalLight);

    // 补光
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-50, 50, -50);
    this.scene.add(fillLight);
    this.lights.push(fillLight);
  }

  /**
   * 窗口大小变化处理
   */
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    // 更新 CSS2D 渲染器大小
    if (this.labelRenderer) {
      this.labelRenderer.setSize(width, height);
    }
  }

  /**
   * 渲染场景
   */
  render() {
    this.renderer.render(this.scene, this.camera);

    // 渲染标签
    if (this.labelRenderer) {
      this.labelRenderer.render(this.scene, this.camera);
    }
  }

  /**
   * 获取场景对象
   */
  getScene() {
    return this.scene;
  }

  /**
   * 获取相机对象
   */
  getCamera() {
    return this.camera;
  }

  /**
   * 获取渲染器对象
   */
  getRenderer() {
    return this.renderer;
  }

  /**
   * 获取 CSS2D 渲染器对象
   */
  getLabelRenderer() {
    return this.labelRenderer;
  }

  /**
   * 清理资源
   */
  dispose() {
    window.removeEventListener('resize', this.onWindowResize);

    if (this.renderer) {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement) {
        this.container.removeChild(this.renderer.domElement);
      }
    }

    // 清理 CSS2D 渲染器
    if (this.labelRenderer && this.labelRenderer.domElement) {
      if (this.container && this.labelRenderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.labelRenderer.domElement);
      }
    }

    // 清理场景中的所有对象
    if (this.scene) {
      this.scene.traverse((object) => {
        if(object.axesHelper){
          object.axesHelper.dispose()
        }
        if(object.grideHelper){
          object.grideHelper.dispose()
        }
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }
  }
}

export default ThreeScene;
