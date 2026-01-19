import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import ThreeScene from '../utils/ThreeScene';
import { BarCollectionManager } from '../utils/BarManager';
import CameraControls from '../utils/CameraControls';
import GroupIndicatorManager from '../utils/GroupIndicatorManager';
import InteractionManager from '../utils/InteractionManager';
import ViewModeManager from '../utils/ViewModeManager';


const BarChart3D = forwardRef(({
  barSceneData,
  groupIndicatorInfo,
  onBarHover,
  onBarLeave,
  onBarClick,
  onLayerHover,
  onLayerLeave,
  onLayerClick,
  onMetricHover,
  onMetricLeave
}, ref) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const barManagerRef = useRef(null);
  const viewModeManagerRef = useRef(null);  // 视图模式管理器
  const controlsRef = useRef(null);
  const groupIndicatorRef = useRef(null);
  const interactionRef = useRef(null);
  const workerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isInitializedRef = useRef(false);

  // 使用 useRef 保存回调函数
  const callbacksRef = useRef({
    onBarHover,
    onBarLeave,
    onBarClick,
    onLayerHover,
    onLayerLeave,
    onLayerClick,
    onMetricHover,
    onMetricLeave
  });

  // 更新回调引用
  useEffect(() => {
    callbacksRef.current = {
      onBarHover,
      onBarLeave,
      onBarClick,
      onLayerHover,
      onLayerLeave,
      onLayerClick,
      onMetricHover,
      onMetricLeave
    };
  }, [onBarHover, onBarLeave, onBarClick, onLayerHover, onLayerLeave, onLayerClick, onMetricHover, onMetricLeave]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    // 切换视图模式
    switchViewMode: (mode) => {
      if (viewModeManagerRef.current) {
        return viewModeManagerRef.current.switchViewMode(mode);
      }
      return Promise.resolve();
    },
    // 获取当前视图模式
    getViewMode: () => {
      if (viewModeManagerRef.current) {
        return viewModeManagerRef.current.getViewMode();
      }
      return null;
    },
    // 设置指标数据（从外部传入）
    setMetricData: (metricsArray) => {
      if (viewModeManagerRef.current) {
        viewModeManagerRef.current.setMetricData(metricsArray);
      }
    },
    // 批量设置所有指标数据
    setAllMetricData: (allMetrics) => {
      if (viewModeManagerRef.current) {
        viewModeManagerRef.current.setAllMetricData(allMetrics);
      }
    },
    setAllMetricDataAnimated: (allMetrics, options = {}) => {
      if (viewModeManagerRef.current?.setAllMetricDataAnimated) {
        viewModeManagerRef.current.setAllMetricDataAnimated(allMetrics, options);
      }
    }
  }), []);

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

    // 先销毁视图模式管理器
    if (viewModeManagerRef.current) {
      viewModeManagerRef.current.dispose();
      viewModeManagerRef.current = null;
    }

    if (barManagerRef.current) {
      barManagerRef.current.dispose();
      barManagerRef.current = null;
    }

    if (sceneRef.current) {
      sceneRef.current.clearSceneContent();
    }
  }, []);

  // 第一个 useEffect：只在组件挂载时初始化渲染器
  useEffect(() => {
    if (!containerRef.current) return;

    console.log('初始化 Three.js 渲染器（仅执行一次）...');

    sceneRef.current = new ThreeScene(containerRef.current);
    isInitializedRef.current = true;

    console.log('渲染器已创建');

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      if (interactionRef.current) {
        interactionRef.current.updateCursorAnimate();
      }

      if (sceneRef.current) {
        sceneRef.current.render();
      }
    };
    animate();

    console.log('渲染循环已启动');

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

      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }

      isInitializedRef.current = false;
    };
  }, []);

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

    // 创建视图模式管理器
    viewModeManagerRef.current = new ViewModeManager(scene, barManagerRef.current);
    viewModeManagerRef.current.initialize();

    console.log('视图模式管理器已初始化');

    // 创建区域指示器
    if (groupIndicatorInfo && groupIndicatorInfo.length > 0) {
      groupIndicatorRef.current = new GroupIndicatorManager(scene);
      groupIndicatorRef.current.createAllIndicators(groupIndicatorInfo);
      console.log(`已创建 ${groupIndicatorInfo.length} 个区域指示器`);
    }

    // 设置相机控制
    controlsRef.current = new CameraControls(
      camera,
      renderer.domElement,
      { x: 0, y: 0, z: 0 }
    );

    console.log('相机控制已设置');

    // 设置交互管理器（传入 ViewModeManager）
    interactionRef.current = new InteractionManager(
      camera,
      renderer.domElement,
      barManagerRef.current,
      viewModeManagerRef.current,  // 传入视图模式管理器
      {
        onBarHover: (...args) => callbacksRef.current.onBarHover?.(...args),
        onBarLeave: (...args) => callbacksRef.current.onBarLeave?.(...args),
        onBarClick: (...args) => callbacksRef.current.onBarClick?.(...args),
        onLayerHover: (...args) => callbacksRef.current.onLayerHover?.(...args),
        onLayerLeave: (...args) => callbacksRef.current.onLayerLeave?.(...args),
        onLayerClick: (...args) => callbacksRef.current.onLayerClick?.(...args),
        onMetricHover: (...args) => callbacksRef.current.onMetricHover?.(...args),
        onMetricLeave: (...args) => callbacksRef.current.onMetricLeave?.(...args)
      }
    );

    console.log('交互管理器已设置');

    return () => {
      clearSceneContent();
    };

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
});

export default BarChart3D;
