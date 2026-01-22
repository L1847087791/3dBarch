import React, { useState, useCallback, useRef, useEffect } from "react";
import BarChart3D from "./BarChart3D";
import { Button, Drawer, Switch, Space } from "antd";
import { ViewMode } from "../utils/ViewModeManager";
import { transformComponentViewData, transformMetricViewData } from "../utils/DataTransformer";

const METRIC_UPDATE_INTERVAL_MS = 1500;
const METRIC_ANIMATION_DURATION = 0.6;
const METRIC_ANIMATION_EASE = 'power2.out';
const METRIC_REQUEST_LATENCY_MS = 200;

/**
 * 生成模拟的组件视图后端数据（严格按照文档格式）
 * @param {number} hostCount - 主机数量
 * @param {number} regionCount - 分区数量
 * @returns {Object} 后端格式的组件视图数据
 */
function generateMockComponentViewData(hostCount = 160, regionCount = 3) {
  const fzs = [];
  const hostsPerRegion = Math.floor(hostCount / regionCount);
  const componentTypes = ['MySQL', 'Redis', 'Nginx', 'Tomcat', 'MongoDB'];

  // 生成分组数据
  for (let i = 0; i < regionCount; i++) {
    const regionHosts = [];
    const actualHostCount = i === regionCount - 1
      ? hostCount - (hostsPerRegion * (regionCount - 1))
      : hostsPerRegion;

    for (let j = 0; j < actualHostCount; j++) {
      const hostId = `host-${i}-${j}`;
      const componentCount = Math.random()<0.5?Math.floor(Math.random() * 6)+5:Math.floor(Math.random() * 10)+1; // 1-10个组件
      const components = [];

      for (let k = 0; k < componentCount; k++) {
        const componentType = componentTypes[Math.floor(Math.random() * componentTypes.length)];
        components.push({
          id: `comp-${hostId}-${k}`,
          mc: `${componentType}-${k + 1}`,
          zylx: componentType,
          gjdj: Math.random()<0.8?0:Math.random()<0.8?Math.floor(Math.random() * 3):Math.floor(Math.random() * 4) // 0-3告警等级
        });
      }

      regionHosts.push({
        id: hostId,
        mc: `server-${i}-${j}`,
        ip: `192.168.${i}.${j + 1}`,
        zylx: Math.random() > 0.5 ? 'Linux' : 'Windows',
        gjdj: Math.max(...components.map(c => c.gjdj)), // 主机告警等级取最高
        zj: components
      });
    }

    fzs.push({
      fz: i === 0 ? null : `APP：手机银行_${i}`, // 第一个分组为null（无分组）
      zylb: regionHosts
    });
  }

  return {
    code: 200,
    data: {
      total: hostCount,
      fzs
    }
  };
}

/**
 * 生成模拟的指标视图后端数据（严格按照文档格式）
 * @param {number} hostCount - 主机数量
 * @returns {Object} 后端格式的指标视图数据
 */
function generateMockMetricViewData(hostCount = 160) {
  const data = [];
  const metricTypes = [
    { zbbs: 'system.cpu.pct_usage', zbmc: 'CPU使用率', dw: '%' },
    { zbbs: 'system.mem.pct_usage', zbmc: '内存使用率', dw: '%' },
    { zbbs: 'system.disk.pct_usage', zbmc: '磁盘使用率', dw: '%' },
    { zbbs: 'system.network.pct_usage', zbmc: '网络使用率', dw: '%' },
    { zbbs: 'system.io.pct_usage', zbmc: 'IO使用率', dw: '%' }
  ];

  for (let i = 0; i < hostCount; i++) {
    const metrics = metricTypes.map(type => ({
      zbbs: type.zbbs,
      zbmc: type.zbmc,
      dw: type.dw,
      value: Math.random() * 100, // 0-100的百分比值
      sj: Date.now()
    }));

    data.push({
      id: `host-${Math.floor(i / 53)}-${i % 53}`, // 匹配组件视图的主机ID
      zymc: `server-${Math.floor(i / 53)}-${i % 53}`,
      zylx: Math.random() > 0.5 ? 'Linux' : 'Windows',
      zb: metrics
    });
  }

  return {
    total: hostCount,
    data
  };
}

/**
 * 截断UUID显示
 * @param {string} uuid - 完整UUID
 * @param {number} length - 显示长度
 */
const truncateUuid = (uuid, length = 8) => {
  if (!uuid) return '-';
  return uuid.length > length ? `${uuid.slice(0, length)}...` : uuid;
};

const BarChartContainer = () => {
  const [barSceneData, setBarSceneData] = useState(null);
  const [groupIndicatorInfo, setGroupIndicatorInfo] = useState(null);

  // 视图模式状态
  const [viewMode, setViewMode] = useState(ViewMode.COMPONENT);
  const barChart3DRef = useRef(null);
  const viewTransitioningRef = useRef(false);
  const metricPollingRef = useRef({
    timer: null,
    inFlight: false,
    active: false,
    barCount: 0
  });

  // 浮层状态
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    data: null
  });

  // 抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState(null);

  // 获取原有测试数据（160主机）
  const getBarSceneData1 = () => {
    // 生成mock后端数据
    const mockBackendData = generateMockComponentViewData(160, 3);
    // 转换为前端格式
    const { sceneData, groupIndicatorInfo } = transformComponentViewData(mockBackendData);
    setBarSceneData(sceneData);
    setGroupIndicatorInfo(groupIndicatorInfo);
  };

  // 获取5000主机测试数据
  const getBarSceneData5000 = () => {
    // 生成mock后端数据
    const mockBackendData = generateMockComponentViewData(5000,20);
    // 转换为前端格式
    const { sceneData, groupIndicatorInfo } = transformComponentViewData(mockBackendData);
    setBarSceneData(sceneData);
    setGroupIndicatorInfo(groupIndicatorInfo);
  };

  // 清空数据
  const clearBarSceneData = () => {
    setBarSceneData(null);
    setGroupIndicatorInfo(null);
    setDrawerOpen(false);
    setDrawerData(null);
    setViewMode(ViewMode.COMPONENT);
  };

  const stopMetricPolling = useCallback(() => {
    metricPollingRef.current.active = false;
    if (metricPollingRef.current.timer) {
      clearTimeout(metricPollingRef.current.timer);
    }
    metricPollingRef.current.timer = null;
    metricPollingRef.current.inFlight = false;
    metricPollingRef.current.barCount = 0;
  }, []);

  const generateMockMetricData = useCallback((barCount) => {
    // 生成mock后端指标数据
    const mockBackendData = generateMockMetricViewData(barCount);
    // 转换为前端格式
    const { metricsArray } = transformMetricViewData(mockBackendData);
    return metricsArray;
  }, []);

  const fetchMockMetricData = useCallback((barCount) => {
    return new Promise((resolve) => {
      const data = generateMockMetricData(barCount);
      setTimeout(() => resolve(data), METRIC_REQUEST_LATENCY_MS);
    });
  }, [generateMockMetricData]);

  const startMetricPolling = useCallback((barCount) => {
    if (!barCount) return;
    stopMetricPolling();
    metricPollingRef.current.active = true;
    metricPollingRef.current.barCount = barCount;

    const poll = async () => {
      if (!metricPollingRef.current.active || metricPollingRef.current.inFlight) {
        return;
      }

      metricPollingRef.current.inFlight = true;

      try {
        const payload = await fetchMockMetricData(barCount);
        if (metricPollingRef.current.active && barChart3DRef.current?.setAllMetricDataAnimated) {
          barChart3DRef.current.setAllMetricDataAnimated(payload, {
            duration: METRIC_ANIMATION_DURATION,
            ease: METRIC_ANIMATION_EASE
          });
        }
      } finally {
        metricPollingRef.current.inFlight = false;
        if (metricPollingRef.current.active) {
          metricPollingRef.current.timer = setTimeout(poll, METRIC_UPDATE_INTERVAL_MS);
        }
      }
    };

    poll();
  }, [fetchMockMetricData, stopMetricPolling]);

  useEffect(() => {
    if (viewMode !== ViewMode.METRIC || !barSceneData?.bars?.length || viewTransitioningRef.current) {
      stopMetricPolling();
      return stopMetricPolling;
    }

    const barCount = barSceneData.bars.length;
    if (!metricPollingRef.current.active || metricPollingRef.current.barCount !== barCount) {
      startMetricPolling(barCount);
    }
    return ()=>{
      stopMetricPolling()
    }
  }, [viewMode, barSceneData, startMetricPolling, stopMetricPolling]);

  // 切换视图模式
  const handleViewModeChange = useCallback((checked) => {
    const newMode = checked ? ViewMode.METRIC : ViewMode.COMPONENT;
    setViewMode(newMode);

    //数据不存在时的防护清理处理
    if (!barChart3DRef.current?.switchViewMode) {
      if (newMode !== ViewMode.METRIC) {
        stopMetricPolling();
      }
      return;
    }
    //控制否处于切换状态
    if (newMode === ViewMode.METRIC) {
      viewTransitioningRef.current = true;
    } else {
      stopMetricPolling();
    }

    // 通过 ref 调用 BarChart3D 的切换方法
    const switchPromise = barChart3DRef.current.switchViewMode(newMode);

    //等待模式切换完成再启动轮询
    if (newMode === ViewMode.METRIC) {
      Promise.resolve(switchPromise).then(() => {
        viewTransitioningRef.current = false;
        const currentMode = barChart3DRef.current?.getViewMode?.();
        if (currentMode !== ViewMode.METRIC) {
          return;
        }
        const barCount = barSceneData?.bars?.length;
        if (barCount) {
          startMetricPolling(barCount);
        }
      });
    }
  }, [barSceneData, startMetricPolling, stopMetricPolling]);

  // 外层悬停回调
  const handleBarHover = useCallback((data) => {
    // 从BarManager获取主机数据和组件数据
    const bar = data.bar; // BarChart3D应该传递bar对象
    const hostData = bar?.hostData;
    const components = bar?.innerLayers?.map(layer => layer.componentData).filter(Boolean) || [];

    // 统计服务组件类型数量
    const componentTypeCount = {};
    components.forEach(comp => {
      if (comp && comp.zylx) {
        componentTypeCount[comp.zylx] = (componentTypeCount[comp.zylx] || 0) + 1;
      }
    });

    setTooltip({
      visible: true,
      x: data.screenPosition.x,
      y: data.screenPosition.y,
      data: {
        type: 'outer',
        barIndex: data.barIndex,
        uuid: data.uuid,
        groupName: data.groupName,
        hostData: hostData,
        componentTypeCount: componentTypeCount
      }
    });
  }, []);

  // 外层离开回调
  const handleBarLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // 外层点击回调
  const handleBarClick = useCallback((data) => {
    //不再展示抽屉，改为摄像机移动并添加3D文字
  }, []);

  // 内层悬停回调
  const handleLayerHover = useCallback((data) => {
    // 从BarManager获取组件数据
    const bar = data.bar;
    const layer = bar?.innerLayers?.[data.layerIndex];
    const componentData = layer?.componentData;

    setTooltip({
      visible: true,
      x: data.screenPosition.x,
      y: data.screenPosition.y,
      data: {
        type: 'inner',
        barIndex: data.barIndex,
        layerIndex: data.layerIndex,
        barUuid: data.barUuid,
        layerUuid: data.layerUuid,
        groupName: data.groupName,
        componentData: componentData
      }
    });
  }, []);

  // 内层离开回调
  const handleLayerLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // 内层点击回调
  const handleLayerClick = useCallback((data) => {
    setDrawerData({
      type: 'layer',
      barIndex: data.barIndex,
      layerIndex: data.layerIndex,
      barUuid: data.barUuid,
      layerUuid: data.layerUuid,
      groupName: data.groupName
    });
    setDrawerOpen(true);
  }, []);

  // 指标视图悬停回调
  const handleMetricHover = useCallback((data) => {
    // 从BarManager获取主机数据
    const bar = data.bar;
    const hostData = bar?.hostData;

    setTooltip({
      visible: true,
      x: data.screenPosition.x,
      y: data.screenPosition.y,
      data: {
        type: 'metric',
        barIndex: data.barIndex,
        uuid: data.uuid,
        groupName: data.groupName,
        metrics: data.metrics,
        hostData: hostData
      }
    });
  }, []);

  // 指标视图离开回调
  const handleMetricLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // 关闭抽屉
  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: "flex", flexDirection: 'column' }}>
      {/* 控制面板 */}
      <div style={{ height: '80px', textAlign: "center", backgroundColor: '#3C444D', padding: '20px' }}>
        <Space size="middle">
          <Button onClick={getBarSceneData1}>获取数据(160主机)</Button>
          <Button onClick={getBarSceneData5000}>获取数据(5000主机)</Button>
          <Button onClick={clearBarSceneData}>清空数据</Button>
          {barSceneData && (
            <Space>
              <span style={{ color: '#fff' }}>组件视图</span>
              <Switch
                checked={viewMode === ViewMode.METRIC}
                onChange={handleViewModeChange}
              />
              <span style={{ color: '#fff' }}>指标视图</span>
            </Space>
          )}
        </Space>
      </div>

      {/* canvas画布容器 */}
      <div style={{ flex: 1, position: 'relative' }}>
        <BarChart3D
          ref={barChart3DRef}
          barSceneData={barSceneData}
          groupIndicatorInfo={groupIndicatorInfo}
          onBarHover={handleBarHover}
          onBarLeave={handleBarLeave}
          onBarClick={handleBarClick}
          onLayerHover={handleLayerHover}
          onLayerLeave={handleLayerLeave}
          onLayerClick={handleLayerClick}
          onMetricHover={handleMetricHover}
          onMetricLeave={handleMetricLeave}
        />

        {/* 浮层 Tooltip */}
        {tooltip.visible && tooltip.data && (
          <div
            style={{
              position: 'absolute',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%) translateY(-10px)',
              pointerEvents: 'none',
              zIndex: 20,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              whiteSpace: 'nowrap'
            }}
          >
            {tooltip.data.type === 'outer' ? (
              <>
                {/* 组件视图 - 主机浮层 */}
                <div><strong>{tooltip.data.hostData?.mc || '主机'}:{tooltip.data.hostData?.ip || '-'}</strong></div>
                {Object.entries(tooltip.data.componentTypeCount || {}).map(([type, count]) => (
                  <div key={type} style={{ marginTop: '4px' }}>
                    {count}  {type}
                  </div>
                ))}
              </>
            ) : tooltip.data.type === 'inner' ? (
              <>
                {/* 组件视图 - 服务组件浮层 */}
                <div><strong>服务组件</strong></div>
                {tooltip.data.componentData ? (
                  <>
                    <div>名称: {tooltip.data.componentData.mc}</div>
                    <div>类型: {tooltip.data.componentData.zylx}</div>
                    <div>告警等级: {tooltip.data.componentData.gjdj}</div>
                  </>
                ) : (
                  <div>无组件数据</div>
                )}
              </>
            ) : tooltip.data.type === 'metric' ? (
              <>
                {/* 指标视图 - 主机指标浮层 */}
                <div><strong>{tooltip.data.hostData?.mc || '主机'}:{tooltip.data.hostData?.ip || '-'}</strong></div>
                <div style={{ marginTop: '4px', borderTop: '1px solid #555', paddingTop: '4px' }}>
                  {tooltip.data.metrics?.map((m, i) => {
                    const metricData = m.metricData;
                    const colorMap = {
                      metric1: '#6cad7c',
                      metric2: '#4A90D9',
                      metric3: '#F5A623',
                      metric4: '#e975b4',
                      metric5: '#fff500'
                    };
                    const textColor = colorMap[m.color] || '#fff';
                    return (
                      <div key={i} style={{ color: textColor }}>
                        {metricData?.zbmc || m.id}: {metricData?.value?.toFixed(1) || 0}%
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* 抽屉 */}
      <Drawer
        title={drawerData?.type === 'bar' ? '主机详情' : '内层详情'}
        open={drawerOpen}
        onClose={closeDrawer}
        mask={false}
      >
        {drawerData && (
          <div>
            {drawerData.type === 'bar' ? (
              <>
                <p><strong>类型:</strong> 主机</p>
                <p><strong>索引:</strong> {drawerData.barIndex}</p>
                <p><strong>分组:</strong> {drawerData.groupName}</p>
                <p><strong>UUID:</strong> {truncateUuid(drawerData.uuid, 16)}</p>
              </>
            ) : (
              <>
                <p><strong>类型:</strong> 内层</p>
                <p><strong>主机索引:</strong> {drawerData.barIndex}</p>
                <p><strong>内层索引:</strong> {drawerData.layerIndex}</p>
                <p><strong>分组:</strong> {drawerData.groupName}</p>
                <p><strong>主机UUID:</strong> {truncateUuid(drawerData.barUuid, 16)}</p>
                <p><strong>内层UUID:</strong> {truncateUuid(drawerData.layerUuid, 16)}</p>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default BarChartContainer;
