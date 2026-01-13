import React, { useEffect, useRef, useCallback } from 'react';
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
  const isInitializedRef = useRef(false); // 标记渲染器是否已初始化

  // 使用 useRef 保存回调函数，避免重新创建交互管理器
  const callbacksRef = useRef({
    onBarHover,
    onBarLeave,
    onBarClick,
    onLayerHover,
    onLayerLeave,
    onLayerClick
  });

  // 更新回调引用
  useEffect(() => {
    callbacksRef.current = {
      onBarHover,
      onBarLeave,
      onBarClick,
      onLayerHover,
      onLayerLeave,
      onLayerClick
    };
  }, [onBarHover, onBarLeave, onBarClick, onLayerHover, onLayerLeave, onLayerClick]);

  // 清理场景内容（不销毁渲染器）
  const clearSceneContent = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }

    if (interactionRef.current) {
      interactionRef.current.dispose();
      interactionRef.current = null;
    }

    if (groupIndicatorRef.current) {
      groupIndicatorRef.current.dispose();
      groupIndicatorRef.current = null;
    }

    if (barManagerRef.current) {
      barManagerRef.current.dispose();
      barManagerRef.current = null;
    }

    // 清理场景中的动态内容，保留渲染器
    if (sceneRef.current) {
      sceneRef.current.clearSceneContent();
    }
  }, []);

  // 第一个 useEffect：只在组件挂载时初始化渲染器，卸载时销毁
  useEffect(() => {
    if (!containerRef.current) return;

    console.log('初始化 Three.js 渲染器（仅执行一次）...');

    // 初始化场景和渲染器
    sceneRef.current = new ThreeScene(containerRef.current);
    isInitializedRef.current = true;

    console.log('渲染器已创建');

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

    // 组件卸载时的清理函数
    return () => {
      console.log('组件卸载，完全清理资源...');

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'stop' });
        workerRef.current.terminate();
      }

      clearSceneContent();

      // 完全销毁渲染器（只在组件卸载时）
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }

      isInitializedRef.current = false;
    };
  }, []); // 空依赖数组，只在挂载/卸载时执行

  // 第二个 useEffect：数据变化时更新场景内容
  useEffect(() => {
    if (!isInitializedRef.current || !sceneRef.current) return;
    if (!barSceneData) {
      console.log('------场景数据为空---------');
      return;
    }

    console.log('更新场景数据...');
    const scene = sceneRef.current.getScene();
    const camera = sceneRef.current.getCamera();
    const renderer = sceneRef.current.getRenderer();

    // 创建柱状图管理器
    barManagerRef.current = new BarCollectionManager(scene);
    barManagerRef.current.createBars(barSceneData, 10, 1);

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

    // 设置交互管理器（使用 ref 中的回调）
    interactionRef.current = new InteractionManager(
      camera,
      renderer.domElement,
      barManagerRef.current,
      {
        onBarHover: (...args) => callbacksRef.current.onBarHover?.(...args),
        onBarLeave: (...args) => callbacksRef.current.onBarLeave?.(...args),
        onBarClick: (...args) => callbacksRef.current.onBarClick?.(...args),
        onLayerHover: (...args) => callbacksRef.current.onLayerHover?.(...args),
        onLayerLeave: (...args) => callbacksRef.current.onLayerLeave?.(...args),
        onLayerClick: (...args) => callbacksRef.current.onLayerClick?.(...args)
      }
    );

    console.log('交互管理器已设置');
    return ()=>{
        // 清理旧的场景内容
       clearSceneContent();
    }

  }, [barSceneData, groupIndicatorInfo, clearSceneContent]);

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
