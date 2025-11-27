/* eslint-disable no-restricted-globals */
/**
 * Worker 数据生成器
 * 使用生成器 + sleep 模拟后端实时数据流
 */

let dataCache = null; // 缓存最新的数据
let isRunning = false;

/**
 * 生成随机数据
 * @param {number} count - 数据数量
 * @returns {Array} - 数据数组
 */
function generateRandomData(count) {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push(Math.floor(Math.random() * 100)); // 0-100 的随机数
  }
  return data;
}

/**
 * Sleep 函数
 * @param {number} ms - 毫秒数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 数据生成器
 * @param {number} count - 数据数量
 * @param {number} interval - 更新间隔（毫秒）
 */
async function* dataGenerator(count, interval) {
  while (isRunning) {
    const data = generateRandomData(count);
    yield data;
    await sleep(interval);
  }
}

/**
 * 启动数据生成
 */
async function startDataGeneration(count, interval) {
  isRunning = true;
  const generator = dataGenerator(count, interval);

  for await (const data of generator) {
    dataCache = data;
    // 通知主线程有新数据
    self.postMessage({
      type: 'data',
      payload: data
    });
  }
}

/**
 * 监听主线程消息
 */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'start':
      // 启动数据生成
      const { count, interval } = payload;
      startDataGeneration(count, interval);
      self.postMessage({
        type: 'started',
        payload: { count, interval }
      });
      break;

    case 'stop':
      // 停止数据生成
      isRunning = false;
      self.postMessage({
        type: 'stopped'
      });
      break;

    case 'getData':
      // 返回最新的缓存数据
      self.postMessage({
        type: 'data',
        payload: dataCache
      });
      break;

    default:
      break;
  }
});

