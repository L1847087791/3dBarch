import React, { useState, useCallback } from "react";
import BarChart3D from "./BarChart3D";
import { v4 as uuidv4 } from 'uuid';
import { Button, Drawer } from "antd";

/**
 * 5000主机场景配置
 * 20个分区，每区250主机（25列×10行）
 * 分区排列：4列×5行
 */
const SCENE_CONFIG = {
  // 主机配置
  hostsPerRegion: 250,        // 每区主机数
  regionCols: 10,             // 每区列数
  regionRows: 25,             // 每区行数
  layersPerHost: 10,          // 每主机内层数
  hostSpacing: 30,            // 主机间距
  barWidth: 10,                // 柱状图宽度
  barHeight: 30,              // 柱状图高度

  // 分区配置
  totalRegions: 20,           // 总分区数
  regionsPerRow: 4,           // 每行分区数
  regionGap: 200,             // 分区间隔（加大间距）
};

/**
 * 生成5000主机场景数据
 * 20个分区，每区250主机，每主机10个内层
 */
function generateSceneData5000() {
  const bars = [];
  const {
    regionCols, regionRows, layersPerHost, hostSpacing,
    barHeight, totalRegions, regionsPerRow, regionGap
  } = SCENE_CONFIG;

  const innerColors = ['normal', 'info', 'warning', 'error', 'critical'];

  // 计算单个分区的尺寸
  const regionWidth = regionCols * hostSpacing;
  const regionDepth = regionRows * hostSpacing;

  for (let regionIndex = 0; regionIndex < totalRegions; regionIndex++) {
    // 计算分区在网格中的位置（4列×5行）
    const regionCol = regionIndex % regionsPerRow;
    const regionRow = Math.floor(regionIndex / regionsPerRow);

    // 计算分区起始位置（居中布局）
    const totalWidth = regionsPerRow * regionWidth + (regionsPerRow - 1) * regionGap;
    const totalDepth = Math.ceil(totalRegions / regionsPerRow) * regionDepth +
      (Math.ceil(totalRegions / regionsPerRow) - 1) * regionGap;

    const regionStartX = -totalWidth / 2 + regionCol * (regionWidth + regionGap);
    const regionStartZ = -totalDepth / 2 + regionRow * (regionDepth + regionGap);

    const regionName = `区域 ${regionIndex + 1}`;

    // 在分区内生成主机
    for (let row = 0; row < regionRows; row++) {
      for (let col = 0; col < regionCols; col++) {
        const layers = Array.from({ length: layersPerHost }, (_, i) => ({
          color: innerColors[i % innerColors.length],
          uuid: uuidv4()
        }));

        bars.push({
          position: {
            x: regionStartX + col * hostSpacing,
            y: 0,
            z: regionStartZ + row * hostSpacing
          },
          groupName: regionName,
          height: barHeight,
          outerColor: 'normal',
          uuid: uuidv4(),
          layers
        });
      }
    }
  }

  return { bars };
}

/**
 * 生成5000主机场景的区域指示器信息
 * 区域边框完整包裹所有主机
 */
function generateGroupIndicatorInfo5000() {
  const {
    regionCols, regionRows, hostSpacing, barWidth,
    totalRegions, regionsPerRow, regionGap
  } = SCENE_CONFIG;

  const regions = [];

  // 计算单个分区的尺寸
  const regionWidth = regionCols * hostSpacing;
  const regionDepth = regionRows * hostSpacing;

  // 边框额外边距（确保包裹主机）
  const padding = barWidth / 2 + 4;

  for (let regionIndex = 0; regionIndex < totalRegions; regionIndex++) {
    const regionCol = regionIndex % regionsPerRow;
    const regionRow = Math.floor(regionIndex / regionsPerRow);

    // 计算分区起始位置（与主机生成逻辑一致）
    const totalWidth = regionsPerRow * regionWidth + (regionsPerRow - 1) * regionGap;
    const totalDepth = Math.ceil(totalRegions / regionsPerRow) * regionDepth +
      (Math.ceil(totalRegions / regionsPerRow) - 1) * regionGap;

    const regionStartX = -totalWidth / 2 + regionCol * (regionWidth + regionGap);
    const regionStartZ = -totalDepth / 2 + regionRow * (regionDepth + regionGap);

    // 计算区域中心和尺寸（包含边距）
    // 主机位置范围：[regionStartX, regionStartX + (regionCols-1)*hostSpacing]
    const centerX = regionStartX + (regionCols - 1) * hostSpacing / 2;
    const centerZ = regionStartZ + (regionRows - 1) * hostSpacing / 2;

    // 区域尺寸 = 主机范围 + 两侧边距
    const width = (regionCols - 1) * hostSpacing + padding * 2;
    const depth = (regionRows - 1) * hostSpacing + padding * 2;

    regions.push({
      centerX,
      centerZ,
      width,
      depth,
      label: `区域 ${regionIndex + 1}`
    });
  }

  return regions;
}
/**
 * 生成场景数据（模拟后端返回）
 * 统一的数据接口格式，包含位置、分组、高度、层数据
 * 
 */
function generateSceneData1() {
  const bars = [];
  const spacing = 20;

  // 定义颜色列表用于演示
  const innerColors = ['normal', 'info', 'warning', 'error', 'critical'];
  const outerColors = ['normal', 'active', 'warning', 'error', 'offline', 'maintenance'];

  // 第一堆：60个 (6x10) - 左前方 - 每个柱状图递增层数
  const group1Rows = 10;
  const group1Cols = 6;
  const group1StartX = -250;
  const group1StartZ = -100;
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
  const group2StartX = 80;
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
  const group3StartX = -80;
  const group3StartZ = -100;
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
      centerX: -250 + (5 * spacing) / 2, // x轴中心位置
      centerZ: -100 + (9 * spacing) / 2, //z轴中心位置
      width: 6 * spacing,  // x轴长度
      depth: 10 * spacing,  // z轴长度
      label: '数据集 A'
    },
    {
      // 第二堆：6列x5行 - 右前方
      centerX:80 + (5 * spacing) / 2, //x轴中心位置
      centerZ: -100 + (9 * spacing) / 2, // z轴中心位置
      width: 6 * spacing,  // x轴长度
      depth: 10 * spacing,  // z轴长度
      label: '数据集 B'
    },
    {
      // 第三堆：5列x4行 - 后中方
      centerX: -80 + (4 * spacing) / 2, // x轴中心位置
      centerZ: -100 + (7 * spacing) / 2, // z轴中心位置
      width: 5 * spacing,  // x轴长度
      depth: 8 * spacing,  //z轴长度
      label: '数据集 C'
    }
  ];
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

  // 获取原有测试数据
  const getBarSceneData1 = () => {
    const data = generateSceneData1();
    setBarSceneData(data);
    setGroupIndicatorInfo(generateGroupIndicatorInfo());
  };

  // 获取5000主机测试数据
  const getBarSceneData5000 = () => {
    const data = generateSceneData5000();
    setBarSceneData(data);
    setGroupIndicatorInfo(generateGroupIndicatorInfo5000());
  };

  // 清空数据
  const clearBarSceneData = () => {
    setBarSceneData(null);
    setGroupIndicatorInfo(null);
    setDrawerOpen(false);
    setDrawerData(null);
  };

  // 外层悬停回调
  const handleBarHover = useCallback((data) => {
    setTooltip({
      visible: true,
      x: data.screenPosition.x,
      y: data.screenPosition.y,
      data: {
        type: 'outer',
        barIndex: data.barIndex,
        uuid: data.uuid,
        groupName: data.groupName
      }
    });
  }, []);

  // 外层离开回调
  const handleBarLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // 外层点击回调
  const handleBarClick = useCallback((data) => {
    setDrawerData({
      type: 'bar',
      barIndex: data.barIndex,
      uuid: data.uuid,
      groupName: data.groupName
    });
    setDrawerOpen(true);
  }, []);

  // 内层悬停回调
  const handleLayerHover = useCallback((data) => {
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
        groupName: data.groupName
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

  // 关闭抽屉
  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: "flex", flexDirection: 'column' }}>
      {/* 控制面板 */}
      <div style={{ height: '80px', textAlign: "center", backgroundColor: '#3C444D', padding: '20px' }}>
        <Button onClick={getBarSceneData1} style={{ marginRight: '10px' }}>获取数据(160主机)</Button>
        <Button onClick={getBarSceneData5000} style={{ marginRight: '10px' }}>获取数据(5000主机)</Button>
        <Button onClick={clearBarSceneData}>清空数据</Button>
      </div>

      {/* canvas画布容器 */}
      <div style={{ flex: 1, position: 'relative' }}>
        <BarChart3D
          barSceneData={barSceneData}
          groupIndicatorInfo={groupIndicatorInfo}
          onBarHover={handleBarHover}
          onBarLeave={handleBarLeave}
          onBarClick={handleBarClick}
          onLayerHover={handleLayerHover}
          onLayerLeave={handleLayerLeave}
          onLayerClick={handleLayerClick}
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
                <div><strong>主机</strong></div>
                <div>索引: {tooltip.data.barIndex}</div>
                <div>UUID: {truncateUuid(tooltip.data.uuid)}</div>
              </>
            ) : (
              <>
                <div>索引: {tooltip.data.layerIndex}</div>
                <div>UUID: {truncateUuid(tooltip.data.layerUuid)}</div>
              </>
            )}
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