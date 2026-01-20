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

    // 绑定方法，确保 this 指向正确且引用一致
    this.onWindowResize = this.onWindowResize.bind(this);

    this.init();
  }

  /**
   * 初始化场景
   */
  init() {
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('lightblue'); // 蓝色背景

    //创建坐标辅助器，仅用于区分笛卡尔坐标 ：X 轴为红色，Y 轴为绿色，Z 轴为蓝色
    // const axesHelper = new THREE.AxesHelper(200)
    // this.scene.add(axesHelper);

    // //创建网格辅助器，调试场景图位置
    // const grideHelper = new THREE.GridHelper(5000, 100)   //步长为5000/100=50
    // this.scene.add(grideHelper)

    //添加地平面
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5000, 5000),
      new THREE.MeshPhongMaterial({color:'gray'})
    )
      groundMesh.rotation.x = Math.PI * -0.5
      this.scene.add(groundMesh)

    // 创建透视相机
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(
      60, // 视野角度
      width / height, // 宽高比
      1, // 近裁剪面
      5000 // 远裁剪面
    );

    // 设置相机初始位置，近距离查看（初始只看到1-2个区域）
    this.camera.position.set(138, 423, 0);
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
    window.addEventListener('resize', this.onWindowResize);
  }

  /**
   * 设置灯光系统
   */
  setupLights() {
    // 环境光 - 提供基础亮度
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
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
   * 清理场景内容（保留渲染器，用于数据更新时复用）
   * @param {Array} excludeTypes - 要保留的对象类型，如 ['AxesHelper', 'GridHelper', 'Mesh']
   */
  clearSceneContent(excludeTypes = ['AxesHelper', 'GridHelper']) {
    if (!this.scene) return;

    const objectsToRemove = [];

    this.scene.traverse((object) => {
      // 跳过场景本身和灯光
      if (object === this.scene) return;
      if (object.isLight) return;

      // 跳过辅助器和地面（根据 excludeTypes）
      if (excludeTypes.includes(object.type)) return;

      // 保留地面（PlaneGeometry 的 Mesh）
      if (object.isMesh && object.geometry && object.geometry.type === 'PlaneGeometry') {
        return;
      }

      // 只收集顶层对象（非子对象）
      if (object.parent === this.scene) {
        objectsToRemove.push(object);
      }
    });

    // 移除并清理对象
    objectsToRemove.forEach((object) => {
      this.disposeObject(object);
      this.scene.remove(object);
    });
  }

  /**
   * 递归清理单个对象及其子对象的资源
   */
  disposeObject(object) {
    // 先递归清理子对象
    if (object.children && object.children.length > 0) {
      // 复制数组避免遍历时修改
      [...object.children].forEach(child => {
        this.disposeObject(child);
      });
    }

    // 清理几何体
    if (object.geometry) {
      object.geometry.dispose();
    }

    // 清理材质
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach(material => {
          this.disposeMaterial(material);
        });
      } else {
        this.disposeMaterial(object.material);
      }
    }
  }

  /**
   * 清理材质及其纹理
   */
  disposeMaterial(material) {
    if (material.map) material.map.dispose();
    if (material.lightMap) material.lightMap.dispose();
    if (material.bumpMap) material.bumpMap.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.specularMap) material.specularMap.dispose();
    if (material.envMap) material.envMap.dispose();
    material.dispose();
  }

  /**
   * 清理资源（完全销毁，包括渲染器）
   */
  dispose() {
    window.removeEventListener('resize', this.onWindowResize);

    // 先清理场景内容
    this.clearSceneContent([]);

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss(); // 强制释放 WebGL 上下文
      if (this.container && this.renderer.domElement) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    // 清理 CSS2D 渲染器
    if (this.labelRenderer && this.labelRenderer.domElement) {
      if (this.container && this.labelRenderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.labelRenderer.domElement);
      }
      this.labelRenderer = null;
    }

    this.scene = null;
    this.camera = null;
  }
}

export default ThreeScene;
