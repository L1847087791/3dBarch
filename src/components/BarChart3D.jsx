import React, { useEffect, useRef } from 'react';
import ThreeScene from '../utils/ThreeScene';
import { BarCollectionManager } from '../utils/BarManager';
import CameraControls from '../utils/CameraControls';
import GroupIndicatorManager from '../utils/GroupIndicatorManager';
import InteractionManager from '../utils/InteractionManager';
import { v4 as uuidv4 } from 'uuid';

/**
 * 生成场景数据（模拟后端返回）
 * 统一的数据接口格式，包含位置、分组、高度、层数据
 * @returns {Object} sceneData - 场景数据
 */
function generateSceneData() {
  const bars = [];
  const spacing = 20;

  // 定义颜色列表用于演示
  const innerColors = ['normal', 'info', 'warning', 'error', 'critical'];
  const outerColors = ['normal', 'active', 'warning', 'error', 'offline', 'maintenance'];

  // 第一堆：60个 (6x10) - 左前方 - 每个柱状图递增层数
  const group1Rows = 10;
  const group1Cols = 6;
  const group1StartX = -100;
  const group1StartZ = -200;
  let group1LayerCount = 1;
  for (let row = 0; row < group1Rows; row++) {
    for (let col = 0; col < group1Cols; col++) {
      const layerCount = group1LayerCount++;
      // 为每层随机分配颜色
      const layers = Array.from({ length: layerCount }, (_, i) => ({
        color: innerColors[i % innerColors.length],
        uuid:uuidv4()
      }));
      bars.push({
        position: { x: group1StartX + col * spacing, y: 0, z: group1StartZ + row * spacing },
        groupName: '数据集 A',
        height: 40,
        outerColor: 'normal',
        uuid:uuidv4(),
        layers
      });
    }
  }

  // 第二堆：60个 (6x10) - 右前方 - 每个柱状图递增层数
  const group2Rows = 10;
  const group2Cols = 6;
  const group2StartX = 100;
  const group2StartZ = -100;
  let group2LayerCount = 1;
  for (let row = 0; row < group2Rows; row++) {
    for (let col = 0; col < group2Cols; col++) {
     if( group2LayerCount<=80){
       group2LayerCount +=2
     }
      const layerCount = group2LayerCount;
      // 根据层索引设置不同颜色（模拟告警级别）
      const layers = Array.from({ length: layerCount }, (_, i) => ({
        color: innerColors[i % innerColors.length],
        uuid:uuidv4()
      }));
      bars.push({
        position: { x: group2StartX + col * spacing, y: 0, z: group2StartZ + row * spacing },
        groupName: '数据集 B',
        height: 40,
        outerColor:'normal',
        uuid:uuidv4(),  
        layers
      });
    }
  }

  // 第三堆：40个 (5x8) - 后中方 - 每个柱状图50层
  const group3Rows = 8;
  const group3Cols = 5;
  const group3StartX = -50;
  const group3StartZ = 100;
  const group3LayerCount = 50;
  for (let row = 0; row < group3Rows; row++) {
    for (let col = 0; col < group3Cols; col++) {
      // 创建渐变颜色效果
      const layers = Array.from({ length: group3LayerCount }, (_, i) => ({
         color: innerColors[i % innerColors.length],
         uuid:uuidv4()
      }));
      bars.push({
        position: { x: group3StartX + col * spacing, y: 0, z: group3StartZ + row * spacing },
        groupName: '数据集 C',
        height: 40,
        outerColor: 'normal',  
        uuid:uuidv4(),
        layers
      });
    }
  }

  return { bars };
}

/**
 * 生成堆指示器信息
 * 根据柱状图位置计算每个堆的边界和标签信息
 */
function generateGroupIndicatorInfo() {
  const spacing = 20;  //需要和柱状图间距保持一致

  return [
    {
      // 第一堆：6列x5行 - 左前方
      centerX: -100 + (5 * spacing) / 2, // x轴中心位置
      centerZ: -100 + (4 * spacing) / 2, //z轴中心位置
      width: 6 * spacing,  // x轴长度
      depth: 5 * spacing,  // z轴长度
      label: '数据集 A'
    },
    {
      // 第二堆：6列x5行 - 右前方
      centerX: 100 + (5 * spacing) / 2, //x轴中心位置
      centerZ: -100 + (4 * spacing) / 2, // z轴中心位置
      width: 6 * spacing,  // x轴长度
      depth: 5 * spacing,  // z轴长度
      label: '数据集 B'
    },
    {
      // 第三堆：5列x4行 - 后中方
      centerX: -50 + (4 * spacing) / 2, // x轴中心位置
      centerZ: 100 + (3 * spacing) / 2, // z轴中心位置
      width: 5 * spacing,  // x轴长度
      depth: 4 * spacing,  //z轴长度
      label: '数据集 C'
    }
  ];
}

const BarChart3D = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const barManagerRef = useRef(null);
  const controlsRef = useRef(null);
  const groupIndicatorRef = useRef(null); // 堆指示器管理器
  const interactionRef = useRef(null);    // 交互管理器
  const workerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log('初始化 Three.js 场景...');

    // 初始化场景
    sceneRef.current = new ThreeScene(containerRef.current);
    const scene = sceneRef.current.getScene();
    const camera = sceneRef.current.getCamera();
    const renderer = sceneRef.current.getRenderer();

    console.log('场景、相机、渲染器已创建');

    // 创建柱状图管理器
    barManagerRef.current = new BarCollectionManager(scene);
    const sceneData = generateSceneData();
    // barWidth=8, initHeight=5（初始高度，用于共享几何体）
    barManagerRef.current.createBars(sceneData, 8, 5);

    console.log(`已创建 ${sceneData.bars.length} 个柱状图`);
    // console.log(barManagerRef.current.getBars())

    // 创建堆指示器（边框和标签）
    // groupIndicatorRef.current = new GroupIndicatorManager(scene);
    // const groupsInfo = generateGroupIndicatorInfo();
    // groupIndicatorRef.current.createAllIndicators(groupsInfo);

    // console.log('已创建堆指示器（边框和标签）');

    // 设置相机控制
    controlsRef.current = new CameraControls(
      camera,
      renderer.domElement,
      { x: 0, y: 0, z: 8 } // 注视目标点
    );

    console.log('相机控制已设置');

    // 设置交互管理器
    interactionRef.current = new InteractionManager(
      camera,
      renderer.domElement,
      barManagerRef.current
    );

    console.log('交互管理器已设置');

    // 渲染循环
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // 更新交互管理器动画（光标旋转和浮动）
      if (interactionRef.current) {
        interactionRef.current.updateCursorAnimate();
      }

      if (sceneRef.current) {
        sceneRef.current.render();
      }
    };
    animate();

    console.log('渲染循环已启动');

    // 清理函数
    return () => {
      console.log('清理资源...');

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'stop' });
        workerRef.current.terminate();
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      if (interactionRef.current) {
        interactionRef.current.dispose();
      }

      if (groupIndicatorRef.current) {
        groupIndicatorRef.current.dispose();
      }

      if (barManagerRef.current) {
        barManagerRef.current.dispose();
      }

      if (sceneRef.current) {
        sceneRef.current.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        margin: 0,
        padding: 0
      }}
    />
  );
};

export default BarChart3D;
