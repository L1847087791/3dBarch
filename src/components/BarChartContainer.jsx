import React, { useState } from "react";
import BarChart3D from "./BarChart3D";
import { v4 as uuidv4 } from 'uuid';
import { Button,Drawer } from "antd";
/**
 * 生成场景数据（模拟后端返回）
 * 统一的数据接口格式，包含位置、分组、高度、层数据
 * @returns {Object} sceneData - 场景数据
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

const BarChartContainer = ()=>{
    const [barSceneData,setBarSceneData] = useState(null)
    const [open,setOpen] = useState(false)

    const getBarSceneData1 = ()=>{
        const data = generateSceneData1()
        setBarSceneData(data)
    }
    const getBarSceneData2 = ()=>{
        setBarSceneData(null)
    }
    const showDrawer =  ()=>{
      setOpen(true)
    }
    const closeDrawer = ()=>{
      setOpen(false)
    }

    return(
        <div style={{width:'100%',height:'100%',display:"flex",flexDirection:'column'}}>
          {/* 控制面板 */}
            <div style={{height:'80px',textAlign:"center",backgroundColor:'#3C444D'}} >
                <Button onClick={getBarSceneData1}>获取数据1</Button>
                <Button onClick={getBarSceneData2}>获取数据2</Button>
                <Button onClick={showDrawer}>模拟弹窗</Button>
            </div>
            {/* canvas画布 */}
            <div
             style={{flex:1}}
            >
                <BarChart3D barSceneData={barSceneData} />
            </div>
            {/* 抽屉 */}
            <Drawer
            open={open}
            onClose= {closeDrawer}
            mask={false}
            >

            </Drawer>
        </div>
    )
}

export default BarChartContainer