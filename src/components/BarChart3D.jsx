import React, { useEffect, useRef } from 'react';
import ThreeScene from '../utils/ThreeScene';
import { BarCollectionManager } from '../utils/BarManager';
import CameraControls from '../utils/CameraControls';
import GroupIndicatorManager from '../utils/GroupIndicatorManager';
import InteractionManager from '../utils/InteractionManager';

/**
 * 生成柱状图位置
 * 3堆柱状图：30 + 120 + 20，矩形排列
 * 采用三角形分布，充分利用X-Z平面空间
 * @returns {Object} positions - 位置数组和层数配置
 */
function generateBarPositions() {
  const positions = [];
  const layerCounts = []; // 存储每个柱状图的层数
  const groupNames = [];  // 存储每个柱状图所属堆名称
  const spacing = 20; // 柱状图之间的间距

  // 第一堆：60个 (6x10) - 左前方 - 每个柱状图50层
  const group1Rows = 10;
  const group1Cols = 6;
  const group1StartX = -100; // 左侧
  const group1StartZ = -200; // 前方
  const group1LayerCount = 50; // A堆每个柱状图50层
  for (let row = 0; row < group1Rows; row++) {
    for (let col = 0; col < group1Cols; col++) {
      positions.push({
        x: group1StartX + col * spacing,
        y: 0,
        z: group1StartZ + row * spacing
      });
      layerCounts.push(group1LayerCount);
      groupNames.push('数据集 A');
    }
  }

  // 第二堆：60个 (6x10) - 右前方 - 每个柱状图50层
  const group2Rows = 10;
  const group2Cols = 6;
  const group2StartX = 100; // 右侧
  const group2StartZ = -100; // 前方
  const group2LayerCount = 50; // B堆每个柱状图50层
  for (let row = 0; row < group2Rows; row++) {
    for (let col = 0; col < group2Cols; col++) {
      positions.push({
        x: group2StartX + col * spacing,
        y: 0,
        z: group2StartZ + row * spacing
      });
      layerCounts.push(group2LayerCount);
      groupNames.push('数据集 B');
    }
  }

  // 第三堆：40个 (5x8) - 后中方 - 每个柱状图10层
  const group3Rows = 8;
  const group3Cols = 5;
  const group3StartX = -50; // 中间偏左
  const group3StartZ = 100; // 后方
  const group3LayerCount = 50; // C堆每个柱状图50层
  for (let row = 0; row < group3Rows; row++) {
    for (let col = 0; col < group3Cols; col++) {
      positions.push({
        x: group3StartX + col * spacing,
        y: 0,
        z: group3StartZ + row * spacing
      });
      layerCounts.push(group3LayerCount);
      groupNames.push('数据集 C');
    }
  }

  return { positions, layerCounts, groupNames };
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
    const { positions, layerCounts, groupNames } = generateBarPositions();
    barManagerRef.current.createBars(positions, 8, 40, layerCounts, groupNames);

    console.log('已创建 160 个柱状图，层数分配：A堆60层、B堆60层、C堆40层');
    // console.log(barManagerRef.current.getBars())

    // 创建堆指示器（边框和标签）
    // groupIndicatorRef.current = new GroupIndicatorManager(scene);
    // const groupsInfo = generateGroupIndicatorInfo();
    // groupIndicatorRef.current.createAllIndicators(groupsInfo);

    console.log('已创建堆指示器（边框和标签）');

    // 初始化默认分层数据 - 使用 updateAllHeights 批量更新以同步 InstancedMesh
    const bars = barManagerRef.current.getBars();
    const allLayerData = bars.map((bar) => {
      // 为每层设置满高度数据值（100），使每层显示为完整高度
      return Array.from({ length: bar.layerCount }, () => 100);
    });
    barManagerRef.current.updateAllHeights(allLayerData);

    console.log('已初始化默认分层数据');

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
