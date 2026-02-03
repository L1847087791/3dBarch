/**
 * 相机控制类
 * 负责处理鼠标和滚轮交互，控制相机的缩放和旋转
 */
class CameraControls {
  constructor(camera, domElement, target = { x: 0, y: 0, z: 0 }) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = target; // 相机注视的目标点

    // 鼠标状态
    this.isMouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // 相机球坐标（用于旋转）
    this.radius = Math.sqrt(
      Math.pow(camera.position.x - target.x, 2) +
      Math.pow(camera.position.y - target.y, 2) +
      Math.pow(camera.position.z - target.z, 2)
    );
    this.theta = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
    this.phi = Math.acos((camera.position.y - target.y) / this.radius);

    // 限制
    this.minRadius = 50;
    this.maxRadius = 300;
    this.minPhi = 0.1;
    this.maxPhi = Math.PI - 0.1;

    // 灵敏度
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 20;

    this.addEventListeners();
  }

  /**
   * 添加事件监听
   */
  addEventListeners() {
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('wheel', this.onWheel.bind(this));
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * 鼠标按下事件
   */
  onMouseDown(event) {
    this.isMouseDown = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  /**
   * 鼠标移动事件
   */
  onMouseMove(event) {
    if (!this.isMouseDown) return;

    this.mouseX = event.clientX;
    this.mouseY = event.clientY;

    const deltaX = this.mouseX - this.lastMouseX;
    const deltaY = this.mouseY - this.lastMouseY;

    // 水平旋转（theta）
    this.theta -= deltaX * this.rotateSpeed;

    // 垂直旋转（phi）
    this.phi -= deltaY * this.rotateSpeed;
    this.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.phi));

    this.lastMouseX = this.mouseX;
    this.lastMouseY = this.mouseY;

    this.updateCameraPosition();
  }

  /**
   * 鼠标松开事件
   */
  onMouseUp() {
    this.isMouseDown = false;
  }

  /**
   * 滚轮事件
   */
  onWheel(event) {
    event.preventDefault();

    // 缩放
    if (event.deltaY > 0) {
      this.radius += this.zoomSpeed;
    } else {
      this.radius -= this.zoomSpeed;
    }

    // 限制缩放范围
    // this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));

    this.updateCameraPosition();
  }

  /**
   * 更新相机位置
   */
  updateCameraPosition() {
    // 将球坐标转换为笛卡尔坐标
    this.camera.position.x = this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    this.camera.position.y = this.target.y + this.radius * Math.cos(this.phi);
    this.camera.position.z = this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta);

    this.camera.lookAt(this.target.x, this.target.y, this.target.z);

    //此处注释展示相机位置，可用于调节相机初始位置
    // console.log(this.camera.position)
    // console.log(this.target)
  }

  /**
   * 设置目标点
   */
  setTarget(x, y, z) {
    this.target = { x, y, z };
    this.camera.lookAt(x, y, z);
  }

  /**
   * 移除事件监听
   */
  dispose() {
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.domElement.removeEventListener('mousemove', this.onMouseMove);
    this.domElement.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }
}

export default CameraControls;
