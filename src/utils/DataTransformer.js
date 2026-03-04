/**
 * 数据转换工具类
 * 负责将后端数据格式转换为前端可用格式
 */

/**
 * 位置生成配置
 */
const DEFAULT_LAYOUT_CONFIG = {
  hostSpacing: 40,           // 主机间距
  regionGap: 100,            // 分区间隔
  hostsPerRow: 10,           // 每行主机数（用于无分组时的布局）
  regionsPerRow: 6,          // 每行分区数
  barWidth: 10,              // 柱状图宽度
};

/**
 * 根据分组和主机数据生成3D位置坐标
 * @param {Array} groups - 分组数据数组 [{ fz, zylb: [...] }]
 * @param {Object} config - 布局配置
 * @returns {Object} { positions: Map<hostId, {x,y,z}>, groupInfo: [...] }
 */
export function generatePositionsFromGroups(groups, config = {}) {
  const layoutConfig = { ...DEFAULT_LAYOUT_CONFIG, ...config };
  const { hostSpacing, regionGap, hostsPerRow, regionsPerRow, barWidth } = layoutConfig;

  const positions = new Map(); // hostId -> {x, y, z}
  const groupInfo = []; // 分组指示器信息

  // 分离有分组和无分组的主机
  const groupedRegions = [];
  const ungroupedHosts = [];

  groups.forEach(group => {
    if (group.fz) {
      groupedRegions.push(group);
    } else {
      // 无分组的主机
      ungroupedHosts.push(...(group.zylb || []));
    }
  });

  // 合并所有区域（包括无分组）
  const allRegions = [...groupedRegions];
  if (ungroupedHosts.length > 0) {
    allRegions.push({
      fz: '未分组',
      zylb: ungroupedHosts
    });
  }

  // 第一步：计算每个区域的尺寸信息
  const regionLayouts = allRegions.map(region => {
    const hosts = region.zylb || [];
    const hostCount = hosts.length;
    const cols = Math.min(hostsPerRow, hostCount);
    const rows = Math.ceil(hostCount / cols);
    const regionWidth = cols * hostSpacing;
    const regionDepth = rows * hostSpacing;

    return {
      region,
      hosts,
      cols,
      rows,
      regionWidth,
      regionDepth
    };
  });

  // 第二步：按行组织区域，计算每行的布局
  const totalRegions = regionLayouts.length;
  const totalRows = Math.ceil(totalRegions / regionsPerRow);
  const rowLayouts = [];

  for (let row = 0; row < totalRows; row++) {
    const startIdx = row * regionsPerRow;
    const endIdx = Math.min(startIdx + regionsPerRow, totalRegions);
    const regionsInRow = regionLayouts.slice(startIdx, endIdx);

    // 计算该行的总宽度和最大深度
    let rowWidth = 0;
    let maxDepth = 0;

    regionsInRow.forEach((layout, idx) => {
      rowWidth += layout.regionWidth;
      if (idx < regionsInRow.length - 1) {
        rowWidth += regionGap;
      }
      maxDepth = Math.max(maxDepth, layout.regionDepth);
    });

    rowLayouts.push({
      regionsInRow,
      rowWidth,
      maxDepth
    });
  }

  // 第三步：计算总布局尺寸
  const totalWidth = Math.max(...rowLayouts.map(r => r.rowWidth));
  let totalDepth = 0;
  rowLayouts.forEach((rowLayout, idx) => {
    totalDepth += rowLayout.maxDepth;
    if (idx < rowLayouts.length - 1) {
      totalDepth += regionGap;
    }
  });

  // 第四步：为每个区域分配位置
  let currentZ = -totalDepth / 2;

  rowLayouts.forEach((rowLayout, rowIdx) => {
    const { regionsInRow, rowWidth, maxDepth } = rowLayout;
    let currentX = -rowWidth / 2;

    regionsInRow.forEach((layout, colIdx) => {
      const { region, hosts, cols, rows, regionWidth, regionDepth } = layout;

      const regionStartX = currentX;
      const regionStartZ = currentZ;

      // 为区域内的每个主机生成位置
      hosts.forEach((host, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        positions.set(host.id, {
          x: regionStartX + col * hostSpacing,
          y: 0,
          z: regionStartZ + row * hostSpacing
        });
      });

      // 计算区域中心和边界（用于指示器）
      const centerX = regionStartX + (cols - 1) * hostSpacing / 2;
      const centerZ = regionStartZ + (rows - 1) * hostSpacing / 2;
      const padding = barWidth / 2 + 4;
      const width = (cols - 1) * hostSpacing + padding * 2;
      const depth = (rows - 1) * hostSpacing + padding * 2;

      groupInfo.push({
        centerX,
        centerZ,
        width,
        depth,
        label: region.fz
      });

      // 移动到下一个区域的X位置
      currentX += regionWidth + regionGap;
    });

    // 移动到下一行的Z位置
    currentZ += maxDepth + regionGap;
  });

  return { positions, groupInfo };
}

/**
 * 转换组件视图数据（后端格式 -> 前端格式）
 * @param {Object} backendData - 后端返回的组件视图数据
 * @param {Object} config - 布局配置
 * @returns {Object} { sceneData: { bars: [...] }, groupIndicatorInfo: [...], rawData: {...} }
 */
export function transformComponentViewData(backendData, config = {}) {
  if (!backendData || !backendData.data || !backendData.data.fzs) {
    console.error('Invalid backend data format');
    return { sceneData: { bars: [] }, groupIndicatorInfo: [], rawData: null };
  }

  const { data } = backendData;
  const { fzs } = data;

  // 生成位置信息
  const { positions, groupInfo } = generatePositionsFromGroups(fzs, config);

  // 转换为前端格式
  const bars = [];
  const hostDataMap = new Map(); // 存储主机原始数据

  fzs.forEach(group => {
    const groupName = group.fz || '未分组';
    const hosts = group.zylb || [];

    hosts.forEach(host => {
      const position = positions.get(host.id);
      if (!position) {
        console.warn(`Position not found for host: ${host.id}`);
        return;
      }

      // 转换服务组件数据
      const layers = (host.zj || []).map(component => ({
        color: component.gjdj, // 告警等级 0-3
        uuid: component.id,
        // 存储完整的组件数据
        componentData: {
          id: component.id,
          mc: component.mc,
          zylx: component.zylx,
          gjdj: component.gjdj
        }
      }));

      // 计算柱状图高度（基于层数）
      const layerCount = layers.length;

      // 高度计算规则：
      // - 当服务组件为0或空时，主机高度为5
      // - 每层服务组件高度为3
      // - 内层间隙为0.1（与BarManager.js中的layerGap保持一致）
      let height;
      if (layerCount === 0) {
        height = 5; // 无服务组件时的最小高度
      } else {
        const layerHeight = 3; // 每层服务组件高度
        const layerGap = 0.1; // 内层间隙（与BarManager.js保持一致）
        // 总高度 = 所有层高度 + 间隙数量 * 间隙大小
        // 间隙数量 = 层数 + 1（顶部和底部各一个，层与层之间）
        height = layerCount * layerHeight + (layerCount + 1) * layerGap;
      }

      bars.push({
        position,
        groupName,
        height,
        outerColor: 'normal', // 外层固定为normal
        uuid: host.id,
        layers,
        // 存储完整的主机数据
        hostData: {
          id: host.id,
          mc: host.mc,
          ip: host.ip,
          zylx: host.zylx,
          gjdj: host.gjdj
        }
      });

      // 保存原始数据
      hostDataMap.set(host.id, {
        host,
        components: host.zj || []
      });
    });
  });

  return {
    sceneData: { bars },
    groupIndicatorInfo: groupInfo,
    rawData: {
      total: data.total,
      hostDataMap
    }
  };
}

/**
 * 转换指标视图数据（后端格式 -> 前端格式）
 * @param {Object} backendData - 后端返回的指标视图数据
 * @returns {Object} { metricsArray: [...], rawData: {...} }
 */
export function transformMetricViewData(backendData) {
  if (!backendData || !backendData.data) {
    console.error('Invalid metric data format');
    return { metricsArray: [], rawData: null };
  }

  const { data } = backendData;
  const metricsArray = [];
  const hostMetricDataMap = new Map(); // 存储主机指标原始数据

  data.forEach((hostMetric, index) => {
    const metrics = (hostMetric.zb || []).map((metric, metricIndex) => ({
      id: metric.zbbs,
      value: metric.value / 100, // 转换为0-1范围
      color: `metric${metricIndex + 1}`, // metric1-metric5
      // 存储完整的指标数据
      metricData: {
        zbbs: metric.zbbs,
        zbmc: metric.zbmc,
        dw: metric.dw,
        value: metric.value,
        sj: metric.sj
      }
    }));

    metricsArray.push(metrics);

    // 保存原始数据
    hostMetricDataMap.set(hostMetric.id, {
      id: hostMetric.id,
      zymc: hostMetric.zymc,
      zylx: hostMetric.zylx,
      metrics: hostMetric.zb || []
    });
  });

  return {
    metricsArray,
    rawData: {
      total: backendData.total,
      hostMetricDataMap
    }
  };
}

/**
 * 生成分组指示器信息（从位置数据）
 * @param {Array} groupInfo - 分组信息数组
 * @returns {Array} 指示器信息数组
 */
export function generateGroupIndicators(groupInfo) {
  return groupInfo.map(info => ({
    centerX: info.centerX,
    centerZ: info.centerZ,
    width: info.width,
    depth: info.depth,
    label: info.label
  }));
}
