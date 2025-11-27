# 3D 柱状图实时数据渲染项目

## 项目概述

本项目使用 **React 16** + **Three.js** 实现了一个 3D 柱状图实时数据渲染系统。通过 Web Worker 模拟后端数据流，实现了 80 个 3D 柱状图的实时更新与交互展示。

---

## ✅ 已完成功能

### 1. **核心渲染系统**
- ✅ **3D 场景搭建**：使用 Three.js 构建完整的 3D 场景
- ✅ **80 个柱状图渲染**：分为 3 堆（30 + 30 + 20），矩形排列
- ✅ **柱状图结构**：
  - 外壳：透明白色材质（opacity: 0.2）
  - 内部：白色发光材质，高度根据数据动态变化
- ✅ **场景配色**：淡灰色背景 (#d3d3d3)

### 2. **数据流模拟**
- ✅ **Web Worker 独立线程**：避免阻塞主线程
- ✅ **生成器 + Sleep 机制**：模拟后端实时数据推送
- ✅ **数据更新频率**：每 5 秒推送一次新数据
- ✅ **数据范围**：0-100 随机值，映射到柱状图高度

### 3. **交互控制**
- ✅ **初始视角**：相机位置设置为可完整查看所有 80 个柱状图
- ✅ **鼠标拖拽旋转**：按住左键拖拽，360° 查看场景
- ✅ **滚轮缩放**：拉近/拉远视角（范围 50-300 单位）
- ✅ **球坐标系统**：流畅的相机运动

### 4. **性能优化**
- ✅ **几何体缩放**：使用 scale 而非重建几何体，减少内存开销
- ✅ **requestAnimationFrame**：高效的渲染循环
- ✅ **资源清理**：组件卸载时自动清理 Three.js 资源
- ✅ **Worker 线程**：数据处理与渲染分离

### 5. **代码架构**
- ✅ **模块化设计**：场景、柱状图、相机控制分离
- ✅ **面向对象**：使用类封装 Three.js 逻辑
- ✅ **React Hooks**：使用函数组件 + useEffect/useRef
- ✅ **可复用性**：工具类可在其他项目中复用

---

## 📁 项目结构

```
3d-bar-chart/
├── src/
│   ├── components/
│   │   └── BarChart3D.jsx          # 主组件（整合所有功能）
│   ├── utils/
│   │   ├── ThreeScene.js           # 场景管理类（场景、相机、渲染器、灯光）
│   │   ├── BarManager.js           # 柱状图管理类（创建、更新、销毁）
│   │   └── CameraControls.js       # 相机控制类（旋转、缩放）
│   ├── workers/
│   │   └── dataGenerator.worker.js # 数据生成器（生成器 + sleep）
│   ├── App.js                      # 根组件
│   ├── index.js                    # 入口文件
│   └── index.css                   # 全局样式
├── public/
├── package.json
└── 说明文档.md
```

---

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 16.14.0 | UI 框架（函数组件 + Hooks） |
| **Three.js** | 0.160.0 | 3D 渲染引擎 |
| **Node.js** | v22.14.0 | 运行环境 |
| **Web Workers** | - | 多线程数据处理 |
| **Vite** | 7.2.4 | 项目脚手架及构建工具 |

---

## 🚀 启动项目

### 开发环境
```bash
npm run dev
```

访问：http://localhost:5173（Vite 默认端口）

### 生产构建
```bash
npm run build
```

### 预览生产构建
```bash
npm run preview
```

---

## 🎮 使用说明

1. **查看场景**：打开浏览器，自动加载 3D 场景
2. **旋转视角**：按住鼠标左键拖拽
3. **缩放视角**：滚动鼠标滚轮
4. **观察数据更新**：每 5 秒柱状图高度自动变化
5. **控制台调试**：F12 打开开发者工具，查看日志

---

## 📊 核心实现原理

### 1. 柱状图渲染
```javascript
// 外壳：透明白色
MeshPhysicalMaterial({ opacity: 0.2 })

// 内部：白色发光
MeshPhongMaterial({
  emissive: 0xffffff,
  emissiveIntensity: 0.3
})

// 高度更新：使用缩放（性能优化）
innerBar.scale.y = targetHeight / maxHeight
```

### 2. 数据流模拟
```javascript
// Worker 生成器
async function* dataGenerator(count, interval) {
  while (isRunning) {
    yield generateRandomData(count);
    await sleep(interval);
  }
}

// 主线程轮询接收
workerRef.current.addEventListener('message', (event) => {
  if (event.data.type === 'data') {
    barManager.updateAllHeights(event.data.payload);
  }
});
```

### 3. 相机控制
```javascript
// 球坐标系统
camera.position.x = radius * sin(phi) * sin(theta)
camera.position.y = radius * cos(phi)
camera.position.z = radius * sin(phi) * cos(theta)
```

---

## 🔧 已解决的问题

1. **白屏问题**：
   - 原因：React.StrictMode 导致 useEffect 执行两次
   - 解决：移除 StrictMode，优化 useEffect 依赖项

2. **性能问题**：
   - 原因：频繁创建/销毁几何体
   - 解决：使用 scale 缩放代替重建

3. **ESLint 警告**：
   - Worker 中 `self` 警告：添加 `/* eslint-disable no-restricted-globals */`
   - 未使用变量：清理冗余代码

---

## 📋 后续开发计划

### 短期优化（1-2天）

#### 1. **视觉效果增强**
- [ ] 添加柱状图 hover 高亮效果
- [ ] 鼠标悬停显示数据标签（Tooltip）
- [ ] 柱状图高度变化添加平滑动画（Tween.js）
- [ ] 添加网格辅助线或底板
- [ ] 优化光照效果（阴影、反射）

#### 2. **交互功能扩展**
- [ ] 添加平移功能（鼠标右键拖拽）
- [ ] 添加自动旋转模式（开关按钮）
- [ ] 点击柱状图查看详细数据
- [ ] 添加重置视角按钮

#### 3. **数据展示优化**
- [ ] 添加数据统计面板（最大值、最小值、平均值）
- [ ] 添加实时数据更新计数器
- [ ] 支持暂停/恢复数据更新
- [ ] 支持手动触发数据更新

#### 4. **代码优化**
- [ ] 移除所有 console.log（生产环境）
- [ ] 添加 PropTypes 类型检查
- [ ] 优化 Worker 错误处理
- [ ] 添加加载状态指示器

---

### 中期功能（3-5天）

#### 1. **真实后端对接**
- [ ] 替换 Worker 为真实 WebSocket 连接
- [ ] 支持 HTTP 轮询模式
- [ ] 支持 Server-Sent Events (SSE)
- [ ] 添加数据格式校验

#### 2. **配置化**
- [ ] 柱状图数量可配置
- [ ] 更新频率可调节（UI 滑块）
- [ ] 布局模式可切换（网格/圆形/随机）
- [ ] 颜色主题切换（暗色/亮色）

#### 3. **数据可视化增强**
- [ ] 添加历史数据曲线图
- [ ] 支持多组数据对比
- [ ] 添加数据导出功能（CSV/JSON）
- [ ] 添加数据回放功能

#### 4. **响应式设计**
- [ ] 适配移动端触摸操作
- [ ] 适配不同屏幕尺寸
- [ ] 添加横竖屏切换支持

---

### 长期规划（1-2周）

#### 1. **高级特效**
- [ ] 粒子效果（数据更新时）
- [ ] 后期处理（Bloom、Glow）
- [ ] 环境贴图和反射
- [ ] 实时阴影

#### 2. **性能优化**
- [ ] 几何体合并（减少 Draw Calls）
- [ ] LOD（Level of Detail）系统
- [ ] 视锥剔除优化
- [ ] WebGL2 特性利用

#### 3. **扩展性**
- [ ] 支持插件系统
- [ ] 支持自定义着色器
- [ ] 支持导入 3D 模型替换柱状图
- [ ] 支持 VR/AR 模式

#### 4. **文档和测试**
- [ ] 完善 API 文档
- [ ] 添加单元测试
- [ ] 添加 E2E 测试
- [ ] 编写使用手册

---

## 🐛 已知问题

1. **ESLint 警告**：
   - `BarChart3D.jsx` Line 12-14：未使用的变量（不影响功能）
   - 建议：添加 `// eslint-disable-next-line` 忽略

2. **性能瓶颈**：
   - 80 个柱状图在低端设备上可能有轻微卡顿
   - 建议：后续添加性能降级方案

3. **浏览器兼容性**：
   - 需要支持 WebGL 的现代浏览器
   - IE 不支持（建议提示用户升级）

---

## 🔍 注意事项

1. **开发环境**：
   - 确保 Node.js 版本为 v22.14.0
   - 使用 npm 安装依赖
   - 项目使用 Vite 作为构建工具，支持快速热更新

2. **性能监控**：
   - 打开浏览器开发者工具 → Performance
   - 监控 FPS 和内存使用

3. **数据格式**：
   - 当前数据为 0-100 的数值数组
   - 如需对接后端，确保数据格式一致

4. **资源清理**：
   - 组件卸载时会自动清理资源
   - 切换页面时 Worker 会自动停止

5. **Vite 配置**：
   - 使用 classic JSX Runtime 以兼容 React 16
   - 配置文件位于 vite.config.js

---

## 📞 技术支持

如有问题或建议，请参考：
- Three.js 官方文档：https://threejs.org/docs/
- React 16 文档：https://legacy.reactjs.org/docs/
- Web Workers API：https://developer.mozilla.org/en-US/docs/Web/API/Worker

---

## 📝 更新日志

### v1.0.0 (2025-11-26)
- ✅ 完成基础 3D 场景搭建
- ✅ 实现 80 个柱状图渲染
- ✅ 实现 Worker 数据流模拟
- ✅ 实现相机交互控制
- ✅ 完成性能优化
- ✅ 修复白屏问题

---

## 🎯 项目亮点

1. **高性能**：使用几何体缩放代替重建，减少 GC 压力
2. **架构清晰**：面向对象设计，代码可维护性强
3. **用户体验**：流畅的交互，实时的数据更新
4. **可扩展性**：模块化设计，易于添加新功能
5. **技术前沿**：Three.js + Web Workers + React Hooks

---

*项目创建时间：2025-11-26*
*最后更新时间：2025-11-26*
