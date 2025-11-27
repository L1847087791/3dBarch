import React, { useEffect, useRef } from 'react';
import ThreeScene from '../utils/ThreeScene';
import { BarCollectionManager } from '../utils/BarManager';
import CameraControls from '../utils/CameraControls';

/**
 * 生成柱状图位置
 * 3堆柱状图：30 + 30 + 20，矩形排列
 */
function generateBarPositions() {
  const positions = [];
  const spacing = 5; // 柱状图之间的间距

  // 第一堆：30个 (6x5)
  const group1Rows = 5;
  const group1Cols = 6;
  const group1StartX = -30;
  for (let row = 0; row < group1Rows; row++) {
    for (let col = 0; col < group1Cols; col++) {
      positions.push({
        x: group1StartX + col * spacing,
        y: 0,
        z: row * spacing
      });
    }
  }

  // 第二堆：30个 (6x5)
  const group2Rows = 5;
  const group2Cols = 6;
  const group2StartX = -10;
  for (let row = 0; row < group2Rows; row++) {
    for (let col = 0; col < group2Cols; col++) {
      positions.push({
        x: group2StartX + col * spacing,
        y: 0,
        z: row * spacing
      });
    }
  }

  // 第三堆：20个 (5x4)
  const group3Rows = 4;
  const group3Cols = 5;
  const group3StartX = 10;
  for (let row = 0; row < group3Rows; row++) {
    for (let col = 0; col < group3Cols; col++) {
      positions.push({
        x: group3StartX + col * spacing,
        y: 0,
        z: row * spacing
      });
    }
  }

  return positions;
}

const BarChart3D = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const barManagerRef = useRef(null);
  const controlsRef = useRef(null);
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
    const positions = generateBarPositions();
    barManagerRef.current.createBars(positions, 2, 40);

    console.log('已创建 80 个柱状图');

    // 初始化所有柱状图高度为随机值（便于测试）
    const initialData = new Array(80).fill(0).map(() => Math.random() * 50 + 20);
    barManagerRef.current.updateAllHeights(initialData);

    console.log('初始数据已设置');

    // 设置相机控制
    controlsRef.current = new CameraControls(
      camera,
      renderer.domElement,
      { x: 0, y: 0, z: 8 } // 注视目标点
    );

    console.log('相机控制已设置');

    // 启动 Worker
    workerRef.current = new Worker(
      new URL('../workers/dataGenerator.worker.js', import.meta.url)
    );

    workerRef.current.addEventListener('message', (event) => {
      const { type, payload } = event.data;
      if (type === 'data' && payload) {
        // 更新柱状图高度
        barManagerRef.current.updateAllHeights(payload);
        console.log('数据已更新');
      }
    });

    // 启动数据生成（80个柱状图，5秒间隔）
    workerRef.current.postMessage({
      type: 'start',
      payload: { count: 80, interval: 5000 }
    });

    console.log('Worker 已启动');

    // 渲染循环
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
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
