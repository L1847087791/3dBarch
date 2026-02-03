import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import ThreeScene from '../utils/ThreeScene';
import { BarCollectionManager } from '../utils/BarManager';
import CameraControls from '../utils/CameraControls';
import CameraAnimator from '../utils/CameraAnimator';
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
  const cameraAnimatorRef = useRef(null);  // 摄像机动画控制器
  const groupIndicatorRef = useRef(null);
  const interactionRef = useRef(null);
  const workerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isInitializedRef = useRef(false);

  // 摄像机聚焦状态
  const [cameraFocused, setCameraFocused] = useState(false);

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
    // 先销毁摄像机动画控制器
    if (cameraAnimatorRef.current) {
      cameraAnimatorRef.current.dispose();
      cameraAnimatorRef.current = null;
    }

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

    setCameraFocused(false);
  }, []);

  // 第一个 useEffect：只在组件挂载时初始化渲染器
  useEffect(() => {
    if (!containerRef.current) return;

    sceneRef.current = new ThreeScene(containerRef.current);
    isInitializedRef.current = true;

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      if (interactionRef.current) {
        interactionRef.current.updateCursorAnimate();
      }

      // 更新扫描光晕动画
      if (barManagerRef.current && barManagerRef.current.updateScanningAnimation) {
        barManagerRef.current.updateScanningAnimation(0.016);
      }

      if (sceneRef.current) {
        sceneRef.current.render();
      }
    };
    animate();

    return () => {
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
      return;
    }

    const scene = sceneRef.current.getScene();
    const camera = sceneRef.current.getCamera();
    const renderer = sceneRef.current.getRenderer();

    // 创建柱状图管理器
    barManagerRef.current = new BarCollectionManager(scene);
    barManagerRef.current.createBars(barSceneData, 10, 1);

    // 创建视图模式管理器
    viewModeManagerRef.current = new ViewModeManager(scene, barManagerRef.current);
    viewModeManagerRef.current.initialize();

    // 创建区域指示器
    if (groupIndicatorInfo && groupIndicatorInfo.length > 0) {
      groupIndicatorRef.current = new GroupIndicatorManager(scene);
      groupIndicatorRef.current.createAllIndicators(groupIndicatorInfo);
    }

    // 设置相机控制
    controlsRef.current = new CameraControls(
      camera,
      renderer.domElement,
      { x: 0, y: 0, z: 0 }
    );

    // 创建摄像机动画控制器
    cameraAnimatorRef.current = new CameraAnimator(
      camera,
      controlsRef.current,
      scene,
      {
        cameraOffsetX: 10,
        cameraOffsetZ: 30,
        cameraOffsetY: -2,
        animationDuration: 1.2,
        onFocusStart: () => { },
        onFocusComplete: () => {
          setCameraFocused(true);
        },
        onResetComplete: () => {
          setCameraFocused(false);
        }
      }
    );

    // 保存初始相机状态
    cameraAnimatorRef.current.setInitialState(
      camera.position.clone(),
      { x: 0, y: 0, z: 0 }
    );

    // 隐藏区域标签的回调
    const hideRegionLabels = () => {
      if (groupIndicatorRef.current) {
        groupIndicatorRef.current.hideLabels();
      }
    };

    // 显示区域标签的回调
    const showRegionLabels = () => {
      if (groupIndicatorRef.current) {
        groupIndicatorRef.current.showLabels();
      }
    };

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
        onMetricLeave: (...args) => callbacksRef.current.onMetricLeave?.(...args),
        onHideRegionLabels: hideRegionLabels,
        onShowRegionLabels: showRegionLabels
      }
    );

    // 将摄像机动画控制器注入到交互管理器
    interactionRef.current.setCameraAnimator(cameraAnimatorRef.current);

    return () => {
      clearSceneContent();
    };

  }, [barSceneData, groupIndicatorInfo, clearSceneContent]);

  // 摄像机重置按钮点击处理
  const handleCameraReset = useCallback(() => {
    if (cameraAnimatorRef.current) {
      // 显示区域标签的回调
      const showRegionLabels = () => {
        if (groupIndicatorRef.current) {
          groupIndicatorRef.current.showLabels();
        }
      };

      cameraAnimatorRef.current.resetCamera(showRegionLabels);

      // 清除交互管理器的选中状态
      if (interactionRef.current) {
        interactionRef.current.clearSelection();
      }
    }
  }, []);

  // 取消预览按钮点击处理（保持摄像机位置，取消虚化效果）
  const handleCancelPreview = useCallback(() => {
    // 移除内层3D文字标签
    if (cameraAnimatorRef.current) {
      cameraAnimatorRef.current.clearFocus();
    }

    // 显示区域标签
    if (groupIndicatorRef.current) {
      groupIndicatorRef.current.showLabels();
    }

    // 取消虚化效果
    if (barManagerRef.current) {
      barManagerRef.current.unfocus();
    }

    // 清除交互管理器的选中状态
    if (interactionRef.current) {
      interactionRef.current.clearSelection();
    }

    // 更新状态
    setCameraFocused(false);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && cameraFocused) {
      handleCancelPreview();
    }
  }, [cameraFocused, handleCancelPreview]);



  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
        position: 'relative',
        outline: 'none'
      }}
      onKeyDown={handleKeyDown}
    >
      {/* 摄像机重置按钮 */}
      {cameraFocused && (
        <button
          className="camera-reset-btn"
          onClick={handleCameraReset}
          title="重置摄像机"
        >
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
          </svg>
        </button>
      )}
      {/* 取消预览按钮 */}
      {cameraFocused && (
        <button
          className="camera-cancel-btn"
          onClick={handleCancelPreview}
          title="取消预览"
        >
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      )}
    </div>
  );
});

export default BarChart3D;
