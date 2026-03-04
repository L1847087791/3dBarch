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
    // 创建场景 - 数据中心风格
    this.scene = new THREE.Scene();

    // 深灰色背景（机房风格）
    this.scene.background = new THREE.Color(0x2a2e35);

    // 轻微雾效
    this.scene.fog = new THREE.Fog(0x2a2e35, 800, 2500);

    // 地面（深灰色，与浅色柱子形成对比）
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5000, 5000),
      new THREE.MeshStandardMaterial({
        color: 0x1a1d23,
        metalness: 0.3,
        roughness: 0.7
      })
    );
    groundMesh.rotation.x = Math.PI * -0.5;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

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

    // 创建渲染器 - 启用高级特性
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;  // 标准曝光（浅色物体不需要高曝光）
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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
   * 设置灯光系统 - 数据中心风格（明亮、专业）
   */
  setupLights() {
    // 环境光（提高亮度，适合浅色物体）
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    this.lights.push(ambientLight);

    // 主光源 - 白色强光（顶部照明）
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(100, 200, 100);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    this.scene.add(mainLight);
    this.lights.push(mainLight);

    // 补光 - 冷白色（模拟机房照明）
    const fillLight = new THREE.DirectionalLight(0xe8f4ff, 1.0);
    fillLight.position.set(-100, 100, -100);
    this.scene.add(fillLight);
    this.lights.push(fillLight);

    // 顶部聚光灯（增强立体感）
    const spotLight = new THREE.SpotLight(0xffffff, 1.8);
    spotLight.position.set(0, 300, 0);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.3;
    spotLight.decay = 2;
    spotLight.distance = 1000;
    this.scene.add(spotLight);
    this.lights.push(spotLight);

    // 点光源阵列（柔和氛围光）
    this.createDynamicLights();
  }

  /**
   * 创建动态点光源 - 柔和版（适合浅色场景）
   */
  createDynamicLights() {
    const colors = [0xe8f4ff, 0xffffff, 0xf0f8ff, 0xfafafa];
    const positions = [
      { x: 200, y: 80, z: 200 },
      { x: -200, y: 80, z: 200 },
      { x: 200, y: 80, z: -200 },
      { x: -200, y: 80, z: -200 }
    ];

    positions.forEach((pos, i) => {
      const light = new THREE.PointLight(colors[i], 0.6, 600);
      light.position.set(pos.x, pos.y, pos.z);
      this.scene.add(light);
      this.lights.push(light);
    });
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
