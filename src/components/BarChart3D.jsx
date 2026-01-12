import React, { useEffect, useRef } from 'react';
import ThreeScene from '../utils/ThreeScene';
import { BarCollectionManager } from '../utils/BarManager';
import CameraControls from '../utils/CameraControls';
import GroupIndicatorManager from '../utils/GroupIndicatorManager';
import InteractionManager from '../utils/InteractionManager';


const BarChart3D = ({
  barSceneData,
  groupIndicatorInfo,
  onBarHover,
  onBarLeave,
  onBarClick,
  onLayerHover,
  onLayerLeave,
  onLayerClick
}) => {
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
    if(!barSceneData) {console.log('------场景数据为空---------') ;return}

    console.log('初始化 Three.js 场景...');

    // 初始化场景
    sceneRef.current = new ThreeScene(containerRef.current);
    const scene = sceneRef.current.getScene();
    const camera = sceneRef.current.getCamera();
    const renderer = sceneRef.current.getRenderer();

    console.log('场景、相机、渲染器已创建');

    // 创建柱状图管理器
    barManagerRef.current = new BarCollectionManager(scene);
    // barWidth=8, initHeight=5（初始高度，用于共享几何体）
    barManagerRef.current.createBars(barSceneData, 8, 5);

    console.log(`已创建 ${barSceneData.bars.length} 个柱状图`);

    // 创建区域指示器（边框和标签）
    if (groupIndicatorInfo && groupIndicatorInfo.length > 0) {
      groupIndicatorRef.current = new GroupIndicatorManager(scene);
      groupIndicatorRef.current.createAllIndicators(groupIndicatorInfo);
      console.log(`已创建 ${groupIndicatorInfo.length} 个区域指示器`);
    }

    // 设置相机控制
    controlsRef.current = new CameraControls(
      camera,
      renderer.domElement,
      { x: 0, y: 0, z: 0 } // 注视目标点
    );

    console.log('相机控制已设置');

    // 设置交互管理器
    interactionRef.current = new InteractionManager(
      camera,
      renderer.domElement,
      barManagerRef.current,
      {
        onBarHover,
        onBarLeave,
        onBarClick,
        onLayerHover,
        onLayerLeave,
        onLayerClick
      }
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
  }, [barSceneData, groupIndicatorInfo]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        margin: 0,
        padding: 0
      }}
    />
  );
};

export default BarChart3D;
