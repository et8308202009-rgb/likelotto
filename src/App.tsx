import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus, Trash2, CheckCircle2, XCircle, BarChart3, Database, AlertCircle, Trophy, Upload, Download, FileText, ChevronDown, ChevronUp, ArrowDown, ArrowUp, Lightbulb, RotateCcw, Sparkles, Zap, Target, Globe, RefreshCw, User, LogOut, Lock, Compass } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDA_5BoHKadtjzkJAU1ArSi-N16DiFxxBQ",
  authDomain: "ai-prediction-16f75.firebaseapp.com",
  projectId: "ai-prediction-16f75",
  storageBucket: "ai-prediction-16f75.firebasestorage.app",
  messagingSenderId: "164533780528",
  appId: "1:164533780528:web:f4cca94f6ce1ad27a76df5",
  measurementId: "G-YQKYGSCX0G"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// ==================== 彩種設定檔 ====================
const GAME_CONFIG = {
  '539': { name: '今彩539', maxNum: 39, drawCount: 5, mainCount: 5, avgSum: 100, fetchUrl: 'https://lotto.auzonet.com/dailycash/list.html' },
  'ttl': { name: '加州天天樂', maxNum: 39, drawCount: 5, mainCount: 5, avgSum: 100, fetchUrl: 'https://lotto.auzonet.com/calottery/list.html' },
  'lotto649': { name: '大樂透(含特別號)', maxNum: 49, drawCount: 7, mainCount: 6, avgSum: 147, fetchUrl: 'https://lotto.auzonet.com/lotto649/list.html' },
  'marksix': { name: '六合彩(含特別號)', maxNum: 49, drawCount: 7, mainCount: 6, avgSum: 147, fetchUrl: 'https://lotto.auzonet.com/marksix/list.html' },
  'superlotto': { name: '威力彩 (第一區)', maxNum: 38, drawCount: 6, mainCount: 6, avgSum: 117, fetchUrl: 'https://lotto.auzonet.com/superlotto38/list.html' }
};

// 【量化升級】限制超參數尋優空間 (Restrict Hyperparameter Search)
const QUANT_SEARCH_PERIODS = [5, 10, 20, 30, 50, 80, 100, 150];

// ==================== 演算法名稱定義 ====================
const ALGO_NAMES_AVOID = {
  cold: '❄️ 極冷門號碼 (最常槓龜)',
  hot: '🔥 極熱門回檔 (短期過熱)',
  prev_draw: '🔁 連莊排除 (排除上期號碼)',
  neighbor: '👥 鄰邊碼排除 (排除上期鄰居)',
  tail: '🎯 同尾數過熱 (排除極熱尾數)',
  trail: '🔗 拖牌反向 (歷史最不常跟隨)',
  zone: '📊 頭數分區過熱 (斷區/斷頭)',
  parity: '⚖️ 單雙大小失衡 (極端反向)',
  gap: '⏳ 期距異常排除 (偏離平均間隔)',
  sum_dev: '📈 和值偏差排除 (均值校正回歸)',
  volatility: '🌊 波動率動態切換 (趨勢/回歸)',
  consensus: '🌟 全模型共識 (Ensemble 集成)'
};

const ALGO_NAMES_PLAY = {
  hot: '🔥 強勢熱門 (延續熱度)',
  cold: '❄️ 極限冷門 (預期反彈)',
  prev_draw: '🔁 連莊抓牌 (鎖定上期)',
  neighbor: '👥 鄰邊卡位 (鎖定鄰居)',
  tail: '🎯 熱門同尾 (鎖定尾數)',
  trail: '🔗 拖牌順向 (歷史最常跟隨)',
  zone: '📊 熱門分區 (鎖定頭數)',
  parity: '⚖️ 趨勢順向 (跟隨單雙大小)',
  gap: '⏳ 週期回歸 (到達平均期距)',
  sum_dev: '📈 和值均線 (均值校正回歸)',
  volatility: '🌊 波動率動態切換 (趨勢/回歸)',
  consensus: '🌟 全模型共識 (Ensemble 集成)'
};

const getAvoidAlgoDescription = (algo) => {
  switch(algo) {
    case 'cold': return '尋找開出總次數最少、且最久未開出的號碼，利用機率冷門特性避開。';
    case 'hot': return '尋找短期內開出次數極高的號碼，利用「均值回歸」特性，預測其即將進入冷卻期。';
    case 'prev_draw': return '將上一期開出的號碼直接列為不出牌，利用連莊機率較低的特性進行排除。';
    case 'neighbor': return '將上一期號碼的「+1」與「-1」鄰居號碼列為不出牌，利用鄰邊碼機率曲線進行排除。';
    case 'tail': return '統計近期最常開出的「尾數」(如7尾: 07,17,27,37)，預測該尾數群即將發生斷軌(不出牌)。';
    case 'trail': return '大數據拖牌分析：找出歷史上只要開出上一期的號碼時，下一期「最不可能跟著開出」的死角號碼。';
    case 'zone': return '將號碼按頭數分區，統計近期最熱門的頭數區間，反向預測該區間即將斷軌。';
    case 'parity': return '計算近期單雙與大小的開出比例，找出近期過熱的極端屬性，並反向排除。';
    case 'gap': return '計算每個號碼歷史開出的平均期數間隔。若某號碼當前的等待期距「嚴重偏離」其歷史平均值，則將其排除。';
    case 'sum_dev': return '若近期總和持續偏大，系統將排除極端大號；若偏小則排除極端小號，利用校正回歸預測。';
    case 'volatility': return '觀測大盤和值標準差 (市場波動率)。若震盪劇烈，則預測強者恆弱 (避開熱門)；若為趨勢盤，則預期冷門難出 (避開冷門)。';
    case 'consensus': return '自動彙整所有預測模型的結果，挑選出「被推薦最多次」的號碼。模型集成具備最強的抗跌與防破功能力。';
    default: return '';
  }
};

const getPlayAlgoDescription = (algo) => {
  switch(algo) {
    case 'hot': return '尋找短期內開出次數極高的號碼，利用「強勢延續」特性，預測其將繼續開出。';
    case 'cold': return '尋找開出總次數最少、最久未開出的號碼，預測其即將「觸底反彈」。';
    case 'prev_draw': return '直接投注上一期開出的號碼，捕捉「連莊」趨勢。';
    case 'neighbor': return '投注上一期號碼的鄰居碼（+1、-1），捕捉「邊碼」趨勢。';
    case 'tail': return '統計近期最熱門的「尾數」，集中投注該尾數群，預測熱度延續。';
    case 'trail': return '大數據拖牌分析：找出歷史上只要開出上一期的號碼時，下一期「最常跟著開出」的高機率號碼。';
    case 'zone': return '統計近期最熱門的頭數區間，預測該分區將持續強勢並集中投注。';
    case 'parity': return '計算近期單雙與大小的開出比例，全面跟隨當前最強勢的極端屬性。';
    case 'gap': return '計算號碼歷史平均期距，挑選當前等待期數與平均期距「最接近」的號碼，預期其將準時報到。';
    case 'sum_dev': return '若近期總和偏小，預測大號將出現以「校正均值」；反之亦然。';
    case 'volatility': return '觀測大盤和值標準差 (市場波動率)。若震盪劇烈，啟動均值回歸 (買冷門)；若為趨勢盤，啟動趨勢跟隨 (買熱門)。';
    case 'consensus': return '自動彙整所有預測模型的結果，挑選出「被推薦最多次」的高頻號碼。模型集成具備最穩定的中獎期望值。';
    default: return '';
  }
};

const calculateQuantScore = (res, criterion) => {
  let baseScore = 0;
  const tests = res.totalTests || 1;
  const confidenceWeight = Math.log10(tests + 10); 

  if (criterion === 'min_fail_streak') {
    const accuracy = Number(res.overallAccuracy) / 100;
    baseScore = (accuracy / (res.maxFailStreak + 1)) * confidenceWeight;
  } else if (criterion === 'max_hits') {
    baseScore = res.totalHits * confidenceWeight;
  } else if (criterion.startsWith('max_accuracy_')) {
    const targetHits = parseInt(criterion.split('_')[2], 10) || 1;
    let successCount = 0;
    if (res.hitDistribution) {
      for (let i = targetHits; i < res.hitDistribution.length; i++) {
        successCount += res.hitDistribution[i];
      }
    }
    baseScore = (successCount / tests) * confidenceWeight;
  } else {
    baseScore = (Number(res.overallAccuracy) / 100) * confidenceWeight;
  }

  if (res.algorithmUsed === 'consensus') {
    baseScore *= 1.20; 
  }
  return baseScore;
};

// ==================== 特殊玩法定義 ====================
const ZODIACS = ['羊', '馬', '蛇', '龍', '兔', '虎', '牛', '鼠', '豬', '狗', '雞', '猴'];
const getZodiac = (num) => ZODIACS[num % 12];

const getDrawProps = (draw, config) => {
  const mainNums = draw.numbers.slice(0, config.mainCount);
  const sum = mainNums.reduce((a, b) => a + b, 0);
  const isBig = sum > config.avgSum; 
  const sum_bs = isBig ? '大' : '小';
  const sum_oe = sum % 2 !== 0 ? '單' : '雙';
  const zodiacs = [...new Set(mainNums.map(getZodiac))];
  return { sum, sum_bs, sum_oe, zodiacs };
};

const ALGO_NAMES_SPECIAL = {
  hot: '🔥 熱門趨勢 (延續熱度)',
  cold: '❄️ 冷門反彈 (預期觸底反彈)',
  prev_draw: '🔁 連莊抓牌 (鎖定上期)',
  trail: '🔗 拖牌順向 (歷史最常跟隨)',
  consensus: '🌟 綜合共識 (Ensemble 集成)'
};

const getSpecialAlgoDescription = (algo) => {
  switch(algo) {
    case 'hot': return '尋找短期內最常出現的結果，利用「強勢延續」特性預測將繼續開出。';
    case 'cold': return '尋找短期內最少出現的結果，預期其即將「觸底反彈」。';
    case 'prev_draw': return '預測下一期會開出與上一期相同的結果，捕捉「連莊」趨勢。';
    case 'trail': return '大數據拖牌分析：找出歷史上開出該結果時，下一期「最常跟著開出」的高機率結果。';
    case 'consensus': return '自動彙整各預測模型的結果，挑選出「被推薦最多次」的選項，形成超級共識。';
    default: return '';
  }
};

const calculateNextDraw = (lastDateStr, lastPeriodStr, gameType = '539') => {
  if (!lastDateStr || !lastPeriodStr) return { date: '未知', period: '未知' };
  const nextPeriod = String(parseInt(lastPeriodStr, 10) + 1);
  const date = new Date(lastDateStr);
  date.setDate(date.getDate() + 1);
  
  if (gameType === '539' && date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  } else if (gameType === 'lotto649') {
    while (date.getDay() !== 2 && date.getDay() !== 5) date.setDate(date.getDate() + 1);
  } else if (gameType === 'superlotto') {
    while (date.getDay() !== 1 && date.getDay() !== 4) date.setDate(date.getDate() + 1);
  } else if (gameType === 'marksix') {
    while (date.getDay() !== 2 && date.getDay() !== 4 && date.getDay() !== 6) date.setDate(date.getDate() + 1);
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, period: nextPeriod };
};

// ==================== 刪牌 (不出牌) 預測引擎 ====================
const getAvoidPredictionStats = (recentDraws, targetNumCount, targetAlgorithm, config, allAvailableData = [], targetDrawDate = '') => {
  const stats = Array.from({ length: config.maxNum }, (_, idx) => ({ number: idx + 1, count: 0, lastSeen: Infinity }));
  recentDraws.forEach((draw, index) => {
    draw.numbers.forEach(num => {
      stats[num - 1].count++;
      if (stats[num - 1].lastSeen === Infinity) stats[num - 1].lastSeen = index;
    });
  });

  const coldSort = (a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    if (a.lastSeen === Infinity && b.lastSeen === Infinity) return 0;
    if (a.lastSeen === Infinity) return -1;
    if (b.lastSeen === Infinity) return 1;
    return b.lastSeen - a.lastSeen;
  };

  const fillWithCold = (baseArray) => {
    const coldObj = [...stats].sort(coldSort);
    for (const s of coldObj) {
      if (baseArray.length >= targetNumCount) break;
      if (!baseArray.find(b => b.number === s.number)) baseArray.push(s);
    }
    return baseArray.slice(0, targetNumCount);
  };

  if (targetAlgorithm === 'cold') return stats.sort(coldSort).slice(0, targetNumCount);
  else if (targetAlgorithm === 'hot') return stats.sort((a, b) => { if (a.count !== b.count) return b.count - a.count; return a.lastSeen - b.lastSeen; }).slice(0, targetNumCount);
  else if (targetAlgorithm === 'prev_draw') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers : [];
    return fillWithCold(stats.filter(s => prevNums.includes(s.number)));
  } else if (targetAlgorithm === 'neighbor') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers : [];
    const neighbors = new Set();
    prevNums.forEach(n => { if (n - 1 >= 1) neighbors.add(n - 1); if (n + 1 <= config.maxNum) neighbors.add(n + 1); });
    return fillWithCold(stats.filter(s => neighbors.has(s.number)));
  } else if (targetAlgorithm === 'tail') {
    const tailCounts = Array(10).fill(0);
    recentDraws.forEach(draw => draw.numbers.forEach(n => tailCounts[n % 10]++));
    const hottestTail = tailCounts.indexOf(Math.max(...tailCounts));
    return fillWithCold(stats.filter(s => s.number % 10 === hottestTail));
  } else if (targetAlgorithm === 'trail') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers : [];
    if (prevNums.length === 0 || allAvailableData.length < 2) return fillWithCold([]);
    const followCounts = Array(config.maxNum + 1).fill(0);
    for (let i = 1; i < allAvailableData.length; i++) {
      if (allAvailableData[i].numbers.some(n => prevNums.includes(n))) {
        allAvailableData[i - 1].numbers.forEach(n => followCounts[n]++);
      }
    }
    const trailStats = stats.map(s => ({ ...s, trailCount: followCounts[s.number] }));
    trailStats.sort((a, b) => { if (a.trailCount !== b.trailCount) return a.trailCount - b.trailCount; return coldSort(a, b); });
    return trailStats.slice(0, targetNumCount);
  } else if (targetAlgorithm === 'zone') {
    const zoneCount = Math.ceil(config.maxNum / 10);
    const zoneCounts = Array(zoneCount).fill(0); 
    recentDraws.forEach(draw => draw.numbers.forEach(n => {
      const z = Math.min(Math.floor((n - 1) / 10), zoneCount - 1);
      zoneCounts[z]++;
    }));
    const hottestZone = zoneCounts.indexOf(Math.max(...zoneCounts));
    return fillWithCold(stats.filter(s => Math.min(Math.floor((s.number - 1) / 10), zoneCount - 1) === hottestZone));
  } else if (targetAlgorithm === 'parity') {
    let oddCount = 0, evenCount = 0, bigCount = 0, smallCount = 0;
    const midPoint = Math.floor(config.maxNum / 2);
    recentDraws.forEach(draw => draw.numbers.forEach(n => {
      if (n % 2 !== 0) oddCount++; else evenCount++;
      if (n > midPoint) bigCount++; else smallCount++;
    }));
    const isOddDominant = oddCount > evenCount;
    const isBigDominant = bigCount > smallCount;
    return fillWithCold(stats.filter(s => (s.number % 2 !== 0) === isOddDominant && (s.number > midPoint) === isBigDominant));
  } else if (targetAlgorithm === 'gap') {
    const gaps = Array(config.maxNum + 1).fill(null).map(() => []);
    allAvailableData.forEach((draw, idx) => draw.numbers.forEach(n => gaps[n].push(idx)));
    const gapStats = stats.map(s => {
      const numGaps = gaps[s.number];
      if (numGaps.length < 2) return { ...s, gapDev: 0 };
      const avgGap = (numGaps[numGaps.length - 1] - numGaps[0]) / (numGaps.length - 1);
      const currentGap = numGaps.length > 0 ? numGaps[0] : allAvailableData.length;
      return { ...s, gapDev: Math.abs(currentGap - avgGap) };
    });
    return gapStats.sort((a, b) => b.gapDev - a.gapDev).slice(0, targetNumCount);
  } else if (targetAlgorithm === 'sum_dev') {
    let totalSum = 0;
    recentDraws.forEach(d => totalSum += d.numbers.reduce((acc, val) => acc + val, 0));
    const avgSum = recentDraws.length > 0 ? totalSum / recentDraws.length : config.avgSum;
    const isOverHeated = avgSum > config.avgSum; 
    const sumStats = [...stats].sort((a, b) => isOverHeated ? b.number - a.number : a.number - b.number);
    return fillWithCold(sumStats.slice(0, targetNumCount));
  } else if (targetAlgorithm === 'volatility') {
    const sums = recentDraws.map(d => d.numbers.slice(0, config.mainCount).reduce((acc, val) => acc + val, 0));
    const mean = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : config.avgSum;
    const variance = sums.length > 0 ? sums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sums.length : 0;
    const stdDev = Math.sqrt(variance);
    const isChaotic = stdDev > 15;
    const sortFn = isChaotic ? (a, b) => { if (a.count !== b.count) return b.count - a.count; return a.lastSeen - b.lastSeen; } : coldSort;
    return fillWithCold([...stats].sort(sortFn).slice(0, targetNumCount));
  } else if (targetAlgorithm === 'consensus') {
    const allAlgos = Object.keys(ALGO_NAMES_AVOID).filter(k => k !== 'consensus');
    const voteCounts = Array(config.maxNum + 1).fill(0);
    allAlgos.forEach(algo => {
      const predictedStats = getAvoidPredictionStats(recentDraws, targetNumCount, algo, config, allAvailableData, targetDrawDate);
      predictedStats.forEach(s => voteCounts[s.number]++);
    });
    const consensusStats = stats.map(s => ({ ...s, voteCount: voteCounts[s.number] }));
    consensusStats.sort((a, b) => {
      if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
      return coldSort(a, b);
    });
    return consensusStats.slice(0, targetNumCount);
  }
  return [];
};

// ==================== 出牌 (Play) 預測引擎 ====================
const getPlayPredictionStats = (recentDraws, targetNumCount, targetAlgorithm, config, allAvailableData = [], targetDrawDate = '') => {
  const stats = Array.from({ length: config.maxNum }, (_, idx) => ({ number: idx + 1, count: 0, lastSeen: Infinity }));
  
  recentDraws.forEach((draw, index) => {
    draw.numbers.slice(0, config.mainCount).forEach(num => {
      stats[num - 1].count++;
      if (stats[num - 1].lastSeen === Infinity) stats[num - 1].lastSeen = index;
    });
  });

  const hotSort = (a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.lastSeen - b.lastSeen;
  };

  const fillWithHot = (baseArray) => {
    const hotObj = [...stats].sort(hotSort);
    for (const s of hotObj) {
      if (baseArray.length >= targetNumCount) break;
      if (!baseArray.find(b => b.number === s.number)) baseArray.push(s);
    }
    return baseArray.slice(0, targetNumCount);
  };

  if (targetAlgorithm === 'hot') return stats.sort(hotSort).slice(0, targetNumCount);
  else if (targetAlgorithm === 'cold') return stats.sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    if (a.lastSeen === Infinity && b.lastSeen === Infinity) return 0;
    if (a.lastSeen === Infinity) return -1;
    if (b.lastSeen === Infinity) return 1;
    return b.lastSeen - a.lastSeen;
  }).slice(0, targetNumCount);
  else if (targetAlgorithm === 'prev_draw') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers.slice(0, config.mainCount) : [];
    return fillWithHot(stats.filter(s => prevNums.includes(s.number)));
  } else if (targetAlgorithm === 'neighbor') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers.slice(0, config.mainCount) : [];
    const neighbors = new Set();
    prevNums.forEach(n => { if (n - 1 >= 1) neighbors.add(n - 1); if (n + 1 <= config.maxNum) neighbors.add(n + 1); });
    return fillWithHot(stats.filter(s => neighbors.has(s.number)));
  } else if (targetAlgorithm === 'tail') {
    const tailCounts = Array(10).fill(0);
    recentDraws.forEach(draw => draw.numbers.slice(0, config.mainCount).forEach(n => tailCounts[n % 10]++));
    const hottestTail = tailCounts.indexOf(Math.max(...tailCounts));
    return fillWithHot(stats.filter(s => s.number % 10 === hottestTail));
  } else if (targetAlgorithm === 'trail') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers.slice(0, config.mainCount) : [];
    if (prevNums.length === 0 || allAvailableData.length < 2) return fillWithHot([]);
    const followCounts = Array(config.maxNum + 1).fill(0);
    for (let i = 1; i < allAvailableData.length; i++) {
      if (allAvailableData[i].numbers.slice(0, config.mainCount).some(n => prevNums.includes(n))) {
        allAvailableData[i - 1].numbers.slice(0, config.mainCount).forEach(n => followCounts[n]++);
      }
    }
    const trailStats = stats.map(s => ({ ...s, trailCount: followCounts[s.number] }));
    trailStats.sort((a, b) => { if (a.trailCount !== b.trailCount) return b.trailCount - a.trailCount; return hotSort(a, b); });
    return trailStats.slice(0, targetNumCount);
  } else if (targetAlgorithm === 'zone') {
    const zoneCount = Math.ceil(config.maxNum / 10);
    const zoneCounts = Array(zoneCount).fill(0);
    recentDraws.forEach(draw => draw.numbers.slice(0, config.mainCount).forEach(n => {
      const z = Math.min(Math.floor((n - 1) / 10), zoneCount - 1);
      zoneCounts[z]++;
    }));
    const hottestZone = zoneCounts.indexOf(Math.max(...zoneCounts));
    return fillWithHot(stats.filter(s => Math.min(Math.floor((s.number - 1) / 10), zoneCount - 1) === hottestZone));
  } else if (targetAlgorithm === 'parity') {
    let oddCount = 0, evenCount = 0, bigCount = 0, smallCount = 0;
    const midPoint = Math.floor(config.maxNum / 2);
    recentDraws.forEach(draw => draw.numbers.slice(0, config.mainCount).forEach(n => {
      if (n % 2 !== 0) oddCount++; else evenCount++;
      if (n > midPoint) bigCount++; else smallCount++;
    }));
    const isOddDominant = oddCount >= evenCount;
    const isBigDominant = bigCount >= smallCount;
    return fillWithHot(stats.filter(s => (s.number % 2 !== 0) === isOddDominant && (s.number > midPoint) === isBigDominant));
  } else if (targetAlgorithm === 'gap') {
    const gaps = Array(config.maxNum + 1).fill(null).map(() => []);
    allAvailableData.forEach((draw, idx) => draw.numbers.slice(0, config.mainCount).forEach(n => gaps[n].push(idx)));
    const gapStats = stats.map(s => {
      const numGaps = gaps[s.number];
      if (numGaps.length < 2) return { ...s, gapDev: 999 };
      const avgGap = (numGaps[numGaps.length - 1] - numGaps[0]) / (numGaps.length - 1);
      const currentGap = numGaps.length > 0 ? numGaps[0] : allAvailableData.length;
      return { ...s, gapDev: Math.abs(currentGap - avgGap) };
    });
    return gapStats.sort((a, b) => a.gapDev - b.gapDev).slice(0, targetNumCount);
  } else if (targetAlgorithm === 'sum_dev') {
    let totalSum = 0;
    recentDraws.forEach(d => totalSum += d.numbers.slice(0, config.mainCount).reduce((acc, val) => acc + val, 0));
    const avgSum = recentDraws.length > 0 ? totalSum / recentDraws.length : config.avgSum;
    const isUnderHeated = avgSum < config.avgSum;
    const sumStats = [...stats].sort((a, b) => isUnderHeated ? b.number - a.number : a.number - b.number);
    return fillWithHot(sumStats.slice(0, targetNumCount));
  } else if (targetAlgorithm === 'volatility') {
    const sums = recentDraws.map(d => d.numbers.slice(0, config.mainCount).reduce((acc, val) => acc + val, 0));
    const mean = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : config.avgSum;
    const variance = sums.length > 0 ? sums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sums.length : 0;
    const stdDev = Math.sqrt(variance);
    const isChaotic = stdDev > 15;
    const sortFn = isChaotic ? (a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      if (a.lastSeen === Infinity && b.lastSeen === Infinity) return 0;
      if (a.lastSeen === Infinity) return -1;
      if (b.lastSeen === Infinity) return 1;
      return b.lastSeen - a.lastSeen;
    } : hotSort;
    return fillWithHot([...stats].sort(sortFn).slice(0, targetNumCount));
  } else if (targetAlgorithm === 'consensus') {
    const allAlgos = Object.keys(ALGO_NAMES_PLAY).filter(k => k !== 'consensus');
    const voteCounts = Array(config.maxNum + 1).fill(0);
    allAlgos.forEach(algo => {
      const predictedStats = getPlayPredictionStats(recentDraws, targetNumCount, algo, config, allAvailableData, targetDrawDate);
      predictedStats.forEach(s => voteCounts[s.number]++);
    });
    const consensusStats = stats.map(s => ({ ...s, voteCount: voteCounts[s.number] }));
    consensusStats.sort((a, b) => {
      if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
      return hotSort(a, b);
    });
    return consensusStats.slice(0, targetNumCount);
  }
  return [];
};


// ==================== 特碼孤支 (Extra) 預測引擎 ====================
const getExtraPredictionStats = (recentDraws, targetNumCount, targetAlgorithm, config, allAvailableData = [], targetDrawDate = '') => {
  if (config.drawCount === config.mainCount) return []; 
  const stats = Array.from({ length: config.maxNum }, (_, idx) => ({ number: idx + 1, count: 0, lastSeen: Infinity }));
  
  recentDraws.forEach((draw, index) => {
    draw.numbers.slice(config.mainCount).forEach(num => {
      stats[num - 1].count++;
      if (stats[num - 1].lastSeen === Infinity) stats[num - 1].lastSeen = index;
    });
  });

  const hotSort = (a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.lastSeen - b.lastSeen;
  };

  const fillWithHot = (baseArray) => {
    const hotObj = [...stats].sort(hotSort);
    for (const s of hotObj) {
      if (baseArray.length >= targetNumCount) break;
      if (!baseArray.find(b => b.number === s.number)) baseArray.push(s);
    }
    return baseArray.slice(0, targetNumCount);
  };

  if (targetAlgorithm === 'hot') return stats.sort(hotSort).slice(0, targetNumCount);
  else if (targetAlgorithm === 'cold') return stats.sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    if (a.lastSeen === Infinity && b.lastSeen === Infinity) return 0;
    if (a.lastSeen === Infinity) return -1;
    if (b.lastSeen === Infinity) return 1;
    return b.lastSeen - a.lastSeen;
  }).slice(0, targetNumCount);
  else if (targetAlgorithm === 'prev_draw') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers.slice(config.mainCount) : [];
    return fillWithHot(stats.filter(s => prevNums.includes(s.number)));
  } else if (targetAlgorithm === 'neighbor') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers.slice(config.mainCount) : [];
    const neighbors = new Set();
    prevNums.forEach(n => { if (n - 1 >= 1) neighbors.add(n - 1); if (n + 1 <= config.maxNum) neighbors.add(n + 1); });
    return fillWithHot(stats.filter(s => neighbors.has(s.number)));
  } else if (targetAlgorithm === 'tail') {
    const tailCounts = Array(10).fill(0);
    recentDraws.forEach(draw => draw.numbers.slice(config.mainCount).forEach(n => tailCounts[n % 10]++));
    const hottestTail = tailCounts.indexOf(Math.max(...tailCounts));
    return fillWithHot(stats.filter(s => s.number % 10 === hottestTail));
  } else if (targetAlgorithm === 'trail') {
    const prevNums = recentDraws[0] ? recentDraws[0].numbers.slice(config.mainCount) : [];
    if (prevNums.length === 0 || allAvailableData.length < 2) return fillWithHot([]);
    const followCounts = Array(config.maxNum + 1).fill(0);
    for (let i = 1; i < allAvailableData.length; i++) {
      if (allAvailableData[i].numbers.slice(config.mainCount).some(n => prevNums.includes(n))) {
        allAvailableData[i - 1].numbers.slice(config.mainCount).forEach(n => followCounts[n]++);
      }
    }
    const trailStats = stats.map(s => ({ ...s, trailCount: followCounts[s.number] }));
    trailStats.sort((a, b) => { if (a.trailCount !== b.trailCount) return b.trailCount - a.trailCount; return hotSort(a, b); });
    return trailStats.slice(0, targetNumCount);
  } else if (targetAlgorithm === 'zone') {
    const zoneCount = Math.ceil(config.maxNum / 10);
    const zoneCounts = Array(zoneCount).fill(0);
    recentDraws.forEach(draw => draw.numbers.slice(config.mainCount).forEach(n => {
      const z = Math.min(Math.floor((n - 1) / 10), zoneCount - 1);
      zoneCounts[z]++;
    }));
    const hottestZone = zoneCounts.indexOf(Math.max(...zoneCounts));
    return fillWithHot(stats.filter(s => Math.min(Math.floor((s.number - 1) / 10), zoneCount - 1) === hottestZone));
  } else if (targetAlgorithm === 'parity') {
    let oddCount = 0, evenCount = 0, bigCount = 0, smallCount = 0;
    const midPoint = Math.floor(config.maxNum / 2);
    recentDraws.forEach(draw => draw.numbers.slice(config.mainCount).forEach(n => {
      if (n % 2 !== 0) oddCount++; else evenCount++;
      if (n > midPoint) bigCount++; else smallCount++;
    }));
    const isOddDominant = oddCount >= evenCount;
    const isBigDominant = bigCount >= smallCount;
    return fillWithHot(stats.filter(s => (s.number % 2 !== 0) === isOddDominant && (s.number > midPoint) === isBigDominant));
  } else if (targetAlgorithm === 'gap') {
    const gaps = Array(config.maxNum + 1).fill(null).map(() => []);
    allAvailableData.forEach((draw, idx) => draw.numbers.slice(config.mainCount).forEach(n => gaps[n].push(idx)));
    const gapStats = stats.map(s => {
      const numGaps = gaps[s.number];
      if (numGaps.length < 2) return { ...s, gapDev: 999 };
      const avgGap = (numGaps[numGaps.length - 1] - numGaps[0]) / (numGaps.length - 1);
      const currentGap = numGaps.length > 0 ? numGaps[0] : allAvailableData.length;
      return { ...s, gapDev: Math.abs(currentGap - avgGap) };
    });
    return gapStats.sort((a, b) => a.gapDev - b.gapDev).slice(0, targetNumCount);
  } else if (targetAlgorithm === 'sum_dev') {
    let totalSum = 0;
    recentDraws.forEach(d => totalSum += d.numbers.slice(config.mainCount).reduce((acc, val) => acc + val, 0));
    const expectedAvg = ((config.maxNum + 1) / 2) * (config.drawCount - config.mainCount);
    const avgSum = recentDraws.length > 0 ? totalSum / recentDraws.length : expectedAvg;
    const isUnderHeated = avgSum < expectedAvg;
    const sumStats = [...stats].sort((a, b) => isUnderHeated ? b.number - a.number : a.number - b.number);
    return fillWithHot(sumStats.slice(0, targetNumCount));
  } else if (targetAlgorithm === 'volatility') {
    const sums = recentDraws.map(d => d.numbers.slice(config.mainCount).reduce((acc, val) => acc + val, 0));
    const expectedAvg = ((config.maxNum + 1) / 2) * (config.drawCount - config.mainCount);
    const mean = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : expectedAvg;
    const variance = sums.length > 0 ? sums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sums.length : 0;
    const stdDev = Math.sqrt(variance);
    const isChaotic = stdDev > 10; // 特碼波動判定標準稍小
    const sortFn = isChaotic ? (a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      if (a.lastSeen === Infinity && b.lastSeen === Infinity) return 0;
      if (a.lastSeen === Infinity) return -1;
      if (b.lastSeen === Infinity) return 1;
      return b.lastSeen - a.lastSeen;
    } : hotSort;
    return fillWithHot([...stats].sort(sortFn).slice(0, targetNumCount));
  } else if (targetAlgorithm === 'consensus') {
    const allAlgos = Object.keys(ALGO_NAMES_PLAY).filter(k => k !== 'consensus');
    const voteCounts = Array(config.maxNum + 1).fill(0);
    allAlgos.forEach(algo => {
      const predictedStats = getExtraPredictionStats(recentDraws, targetNumCount, algo, config, allAvailableData, targetDrawDate);
      predictedStats.forEach(s => voteCounts[s.number]++);
    });
    const consensusStats = stats.map(s => ({ ...s, voteCount: voteCounts[s.number] }));
    consensusStats.sort((a, b) => {
      if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
      return hotSort(a, b);
    });
    return consensusStats.slice(0, targetNumCount);
  }
  return [];
};


// ==================== 特殊玩法 (Special) 預測引擎 ====================
const getSpecialPredictionStats = (mode, recentDraws, targetCount, targetAlgorithm, config, allAvailableData = []) => {
  let possibleOutcomes = [];
  if (mode === 'sum_bs') possibleOutcomes = ['大', '小'];
  else if (mode === 'sum_oe') possibleOutcomes = ['單', '雙'];
  else if (mode === 'zodiac') possibleOutcomes = ZODIACS;

  const stats = possibleOutcomes.map(outcome => ({ outcome, count: 0, lastSeen: Infinity }));
  const enrichedDraws = recentDraws.map(d => getDrawProps(d, config));
  
  enrichedDraws.forEach((draw, index) => {
    let outcomesInDraw = [];
    if (mode === 'sum_bs') outcomesInDraw = [draw.sum_bs];
    else if (mode === 'sum_oe') outcomesInDraw = [draw.sum_oe];
    else if (mode === 'zodiac') outcomesInDraw = draw.zodiacs;

    outcomesInDraw.forEach(o => {
      const stat = stats.find(s => s.outcome === o);
      if (stat) {
        stat.count++;
        if (stat.lastSeen === Infinity) stat.lastSeen = index;
      }
    });
  });

  const hotSort = (a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.lastSeen - b.lastSeen;
  };
  
  const coldSort = (a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    if (a.lastSeen === Infinity && b.lastSeen === Infinity) return 0;
    if (a.lastSeen === Infinity) return -1;
    if (b.lastSeen === Infinity) return 1;
    return b.lastSeen - a.lastSeen;
  };

  if (targetAlgorithm === 'hot') return stats.sort(hotSort).slice(0, targetCount);
  if (targetAlgorithm === 'cold') return stats.sort(coldSort).slice(0, targetCount);
  if (targetAlgorithm === 'prev_draw') {
    const prevOutcomes = enrichedDraws[0] ? (mode === 'zodiac' ? enrichedDraws[0].zodiacs : [mode === 'sum_bs' ? enrichedDraws[0].sum_bs : enrichedDraws[0].sum_oe]) : [];
    const base = stats.filter(s => prevOutcomes.includes(s.outcome));
    const hotObj = [...stats].sort(hotSort);
    for (const s of hotObj) {
       if (base.length >= targetCount) break;
       if (!base.find(b => b.outcome === s.outcome)) base.push(s);
    }
    return base.slice(0, targetCount);
  }
  if (targetAlgorithm === 'trail') {
    const prevOutcomes = enrichedDraws[0] ? (mode === 'zodiac' ? enrichedDraws[0].zodiacs : [mode === 'sum_bs' ? enrichedDraws[0].sum_bs : enrichedDraws[0].sum_oe]) : [];
    if (prevOutcomes.length === 0 || allAvailableData.length < 2) return [...stats].sort(hotSort).slice(0, targetCount);
    
    const followCounts = {};
    possibleOutcomes.forEach(o => followCounts[o] = 0);
    
    const allEnriched = allAvailableData.map(d => getDrawProps(d, config));
    for (let i = 1; i < allEnriched.length; i++) {
      const currentOutcomes = mode === 'zodiac' ? allEnriched[i].zodiacs : [mode === 'sum_bs' ? allEnriched[i].sum_bs : allEnriched[i].sum_oe];
      const hasCommon = prevOutcomes.some(o => currentOutcomes.includes(o));
      if (hasCommon) {
        const nextOutcomes = mode === 'zodiac' ? allEnriched[i-1].zodiacs : [mode === 'sum_bs' ? allEnriched[i-1].sum_bs : allEnriched[i-1].sum_oe];
        nextOutcomes.forEach(o => { if (followCounts[o] !== undefined) followCounts[o]++; });
      }
    }
    const trailStats = stats.map(s => ({ ...s, trailCount: followCounts[s.outcome] }));
    return trailStats.sort((a, b) => { if (a.trailCount !== b.trailCount) return b.trailCount - a.trailCount; return hotSort(a, b); }).slice(0, targetCount);
  }
  if (targetAlgorithm === 'consensus') {
    const algos = ['hot', 'cold', 'prev_draw', 'trail'];
    const votes = {};
    possibleOutcomes.forEach(o => votes[o] = 0);
    algos.forEach(algo => {
       const res = getSpecialPredictionStats(mode, recentDraws, targetCount, algo, config, allAvailableData);
       res.forEach(s => votes[s.outcome]++);
    });
    const consStats = stats.map(s => ({ ...s, voteCount: votes[s.outcome] }));
    return consStats.sort((a, b) => { if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount; return hotSort(a, b); }).slice(0, targetCount);
  }
  return [];
};


export default function App() {
  const [activeTab, setActiveTab] = useState('data'); 
  const [user, setUser] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false); 
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState('connecting');

  // ==========================================
  // 👇 1. 加入站長身分判定
  // ==========================================
  const ADMIN_UID = "kU1yvnKcN4NLldo8Rvtp4AOT7bv2"; // <--- 🚨 請換成你的 UID
  const isAdmin = user && user.uid === ADMIN_UID;
  
  // --- 狀態：彩種選擇 ---
  const [currentGame, setCurrentGame] = useState('539'); 
  const currentConfig = GAME_CONFIG[currentGame];
  
  const [myNumbers, setMyNumbers] = useState(Array(15).fill('')); 
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [historicalData, setHistoricalData] = useState([]);

  const [newDrawDate, setNewDrawDate] = useState('');
  const [newDrawPeriod, setNewDrawPeriod] = useState('');
  const [newDrawNumbers, setNewDrawNumbers] = useState([]);
  const [dataError, setDataError] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMessage, setImportMessage] = useState({ type: '', text: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // --- 狀態：刪牌預測系統 ---
  const [avoidAlgorithm, setAvoidAlgorithm] = useState('cold'); 
  const [avoidDrawCount, setAvoidDrawCount] = useState(50); 
  const [avoidNumberCount, setAvoidNumberCount] = useState(5); 
  const [avoidEndDate, setAvoidEndDate] = useState(''); 
  const [avoidOptimizeCriterion, setAvoidOptimizeCriterion] = useState('min_fail_streak');
  const [avoidPredictionResult, setAvoidPredictionResult] = useState(null);
  const [avoidAutoBacktestCount, setAvoidAutoBacktestCount] = useState(30);
  const [avoidSearchMin, setAvoidSearchMin] = useState(10);
  const [avoidSearchMax, setAvoidSearchMax] = useState(150);
  const [avoidAutoBacktestResult, setAvoidAutoBacktestResult] = useState(null);
  const [avoidOptimizationMessage, setAvoidOptimizationMessage] = useState(''); 

  // --- 狀態：出牌預測系統 ---
  const [playAlgorithm, setPlayAlgorithm] = useState('hot'); 
  const [playDrawCount, setPlayDrawCount] = useState(50); 
  const [playNumberCount, setPlayNumberCount] = useState(5); 
  const [playEndDate, setPlayEndDate] = useState(''); 
  const [playOptimizeCriterion, setPlayOptimizeCriterion] = useState('max_hits');
  const [playPredictionResult, setPlayPredictionResult] = useState(null);
  const [playAutoBacktestCount, setPlayAutoBacktestCount] = useState(30);
  const [playSearchMin, setPlaySearchMin] = useState(10);
  const [playSearchMax, setPlaySearchMax] = useState(150);
  const [playAutoBacktestResult, setPlayAutoBacktestResult] = useState(null);
  const [playOptimizationMessage, setPlayOptimizationMessage] = useState(''); 

  // --- 狀態：特碼孤支 (Extra) 預測系統 ---
  const [extraAlgorithm, setExtraAlgorithm] = useState('hot'); 
  const [extraDrawCount, setExtraDrawCount] = useState(50); 
  const [extraNumberCount, setExtraNumberCount] = useState(1); 
  const [extraEndDate, setExtraEndDate] = useState(''); 
  const [extraOptimizeCriterion, setExtraOptimizeCriterion] = useState('max_hits');
  const [extraPredictionResult, setExtraPredictionResult] = useState(null);
  const [extraAutoBacktestCount, setExtraAutoBacktestCount] = useState(30);
  const [extraSearchMin, setExtraSearchMin] = useState(10);
  const [extraSearchMax, setExtraSearchMax] = useState(150);
  const [extraAutoBacktestResult, setExtraAutoBacktestResult] = useState(null);
  const [extraOptimizationMessage, setExtraOptimizationMessage] = useState(''); 

  // --- 狀態：特殊玩法預測系統 ---
  const [specialMode, setSpecialMode] = useState('sum_bs'); // sum_bs, sum_oe, zodiac
  const [specialAlgorithm, setSpecialAlgorithm] = useState('hot');
  const [specialDrawCount, setSpecialDrawCount] = useState(50);
  const [specialNumberCount, setSpecialNumberCount] = useState(1); 
  const [specialEndDate, setSpecialEndDate] = useState('');
  const [specialOptimizeCriterion, setSpecialOptimizeCriterion] = useState('max_accuracy');
  const [specialPredictionResult, setSpecialPredictionResult] = useState(null);
  const [specialAutoBacktestCount, setSpecialAutoBacktestCount] = useState(30);
  const [specialSearchMin, setSpecialSearchMin] = useState(10);
  const [specialSearchMax, setSpecialSearchMax] = useState(150);
  const [specialAutoBacktestResult, setSpecialAutoBacktestResult] = useState(null);
  const [specialOptimizationMessage, setSpecialOptimizationMessage] = useState('');

  // --- 狀態：全彩種數據統計 ---
  const [globalSearchMin, setGlobalSearchMin] = useState(10);
  const [globalSearchMax, setGlobalSearchMax] = useState(150);
  const [globalBacktestCount, setGlobalBacktestCount] = useState(30);
  const [isGlobalCalculating, setIsGlobalCalculating] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(''); 
  const [globalStatsResult, setGlobalStatsResult] = useState(null);
  const [globalStatsError, setGlobalStatsError] = useState('');

  // 切換彩種重置預設值
  useEffect(() => {
    setAvoidPredictionResult(null); setAvoidAutoBacktestResult(null); setAvoidOptimizationMessage('');
    setPlayPredictionResult(null); setPlayAutoBacktestResult(null); setPlayOptimizationMessage('');
    setExtraPredictionResult(null); setExtraAutoBacktestResult(null); setExtraOptimizationMessage('');
    setSpecialPredictionResult(null); setSpecialAutoBacktestResult(null); setSpecialOptimizationMessage('');
    
    setNewDrawNumbers(Array(GAME_CONFIG[currentGame].drawCount).fill(''));
    setMyNumbers(Array(GAME_CONFIG[currentGame].drawCount + 5).fill('')); 
    setAvoidNumberCount(GAME_CONFIG[currentGame].mainCount); 
    setPlayNumberCount(GAME_CONFIG[currentGame].mainCount);
    setExtraNumberCount(1);
    setConfirmDeleteAll(false);
  }, [currentGame]);

  // 會員登入初始化
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('登入失敗:', error); setCloudStatus('error'); setIsDataLoading(false);
      }
    };
    if (Object.keys(firebaseConfig).length === 0) { setCloudStatus('error'); setIsDataLoading(false); return; }
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 👇 這行幫你印出 UID，記得打開 F12 來看！
        console.log("我的UID是：", currentUser.uid); 
        setCloudStatus('connected');
      } else {
        setCloudStatus('error'); 
        setIsDataLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 獨立處理訂閱狀態的監聽
  useEffect(() => {
    if (!user) {
      setIsSubscribed(false);
      return;
    }
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
    const unsubscribe = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().isSubscribed === true) {
        setIsSubscribed(true);
      } else {
        setIsSubscribed(false);
      }
    }, (err) => {
      setIsSubscribed(false);
    });
    return () => unsubscribe();
  }, [user]);

  // ==========================================
  // 👇 2. 修改：歷史數據庫監聽 (指向 global_data)
  // ==========================================
  useEffect(() => {
    if (!user) return;
    setIsDataLoading(true);
    // 所有人 (包含你與使用者) 都去讀取 global_data
    const drawsRef = collection(db, , `draws_${currentGame}`);
    const unsubscribe = onSnapshot(drawsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setHistoricalData(data);
      setIsDataLoading(false);
    }, (err) => {
      console.error('讀取雲端數據失敗:', err); setIsDataLoading(false);
    });
    return () => unsubscribe();
  }, [user, currentGame]);

  const handleLogout = async () => {
    await signOut(auth);
    await signInAnonymously(auth);
  };

  const simulatePayment = async () => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
      await setDoc(profileRef, { isSubscribed: true }, { merge: true });
      alert("🎉 付款成功！您現在已是 PRO 專業版會員，全站功能已解鎖。");
    } catch(err) {
      console.error(err);
      alert("模擬付款失敗，請確認網路連線或資料庫權限。");
    }
  };

  const handleMyNumberChange = (index, value) => {
    const newNumbers = [...myNumbers]; newNumbers[index] = value; setMyNumbers(newNumbers);
  };

  const analysisResult = useMemo(() => {
    const parsedMyNumbers = myNumbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    const isInputValid = parsedMyNumbers.length > 0 && parsedMyNumbers.every(n => n >= 1 && n <= currentConfig.maxNum) && new Set(parsedMyNumbers).size === parsedMyNumbers.length;
    if (!isInputValid) return null;

    const filteredData = historicalData.filter(draw => {
      if (startDate && draw.date < startDate) return false;
      if (endDate && draw.date > endDate) return false;
      return true;
    }).sort((a, b) => sortOrder === 'desc' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));

    const matchCountsArray = Array(currentConfig.mainCount + 1).fill(0);
    const details = [];

    filteredData.forEach(draw => {
      const mainNums = draw.numbers.slice(0, currentConfig.mainCount);
      const specialNums = draw.numbers.slice(currentConfig.mainCount);
      
      const matchedMain = mainNums.filter(n => parsedMyNumbers.includes(n));
      const matchedSpecial = specialNums.filter(n => parsedMyNumbers.includes(n));
      
      const matchCount = matchedMain.length;
      matchCountsArray[matchCount]++;
      details.push({ ...draw, matchedMain, matchedSpecial, matchCount, isWin: matchCount >= 1 || matchedSpecial.length > 0 });
    });

    const matchAtLeast = Array(currentConfig.mainCount + 1).fill(0);
    for(let i=1; i<=currentConfig.mainCount; i++) {
       matchAtLeast[i] = matchCountsArray.slice(i).reduce((a,b)=>a+b, 0);
    }

    return { totalDraws: filteredData.length, loseCount: matchCountsArray[0], matchAtLeast, matchAll: matchCountsArray[currentConfig.mainCount], details, parsedMyNumbers };
  }, [myNumbers, startDate, endDate, historicalData, sortOrder, currentConfig]);


  // ==================== 刪牌 (Avoid) 處理函式 ====================
  const executeAvoidBacktest = (targetDrawCount, targetBacktestCount, targetNumCount, targetEndDate, targetAlgorithm, customData = historicalData, customConfig = currentConfig) => {
    let availableData = customData;
    if (targetEndDate) availableData = availableData.filter(draw => draw.date <= targetEndDate);
    if (availableData.length < targetBacktestCount + targetDrawCount) return { error: `資料量不足！` };

    const results = [];
    let successfulPeriods = 0;

    for (let i = 0; i < targetBacktestCount; i++) {
      const targetDraw = availableData[i];
      const priorDraws = availableData.slice(i + 1, i + 1 + targetDrawCount);
      const allPriorData = availableData.slice(i + 1); 
      const predictedStats = getAvoidPredictionStats(priorDraws, targetNumCount, targetAlgorithm, customConfig, allPriorData, targetDraw.date);
      const predictedColdNumbers = predictedStats.map(s => s.number);
      
      const failedNumbers = predictedColdNumbers.filter(n => targetDraw.numbers.includes(n));
      const isSuccess = failedNumbers.length === 0;

      if (isSuccess) successfulPeriods++;
      results.push({ date: targetDraw.date, period: targetDraw.period, actualNumbers: targetDraw.numbers, predictedNumbers: predictedColdNumbers, failedNumbers, isSuccess });
    }

    let maxSuccessStreak = 0, maxFailStreak = 0, currentSuccessStreak = 0, currentFailStreak = 0;
    const failStreakCounts = {}; 

    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].isSuccess) {
        currentSuccessStreak++; 
        if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }
        currentFailStreak = 0;
        if (currentSuccessStreak > maxSuccessStreak) maxSuccessStreak = currentSuccessStreak;
      } else {
        currentFailStreak++; 
        currentSuccessStreak = 0;
        if (currentFailStreak > maxFailStreak) maxFailStreak = currentFailStreak;
      }
    }
    if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }

    return {
      algorithmUsed: targetAlgorithm, drawCountUsed: targetDrawCount, totalTests: targetBacktestCount,
      successfulPeriods, failedPeriods: targetBacktestCount - successfulPeriods,
      overallAccuracy: ((successfulPeriods / targetBacktestCount) * 100).toFixed(2),
      maxSuccessStreak, maxFailStreak, failStreakCounts, details: results
    };
  };

  const handleAvoidPredict = () => {
    setAvoidAutoBacktestResult(null); setAvoidOptimizationMessage('');
    if (historicalData.length === 0) return setAvoidPredictionResult({ error: '目前沒有歷史數據' });
    let availableData = historicalData;
    if (avoidEndDate) availableData = availableData.filter(draw => draw.date <= avoidEndDate);
    if (availableData.length === 0) return setAvoidPredictionResult({ error: `無歷史數據` });

    const recentDraws = availableData.slice(0, avoidDrawCount);
    const lastDraw = availableData[0];
    const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
    const predictedStats = getAvoidPredictionStats(recentDraws, avoidNumberCount, avoidAlgorithm, currentConfig, availableData, nextDrawInfo.date);

    setAvoidPredictionResult({
      algorithmName: ALGO_NAMES_AVOID[avoidAlgorithm], algorithmKey: avoidAlgorithm, analyzedCount: recentDraws.length,
      numbers: predictedStats, endDate: avoidEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period
    });
  };

  const handleSmartAvoidPredict = () => {
    setAvoidPredictionResult(null); setAvoidAutoBacktestResult(null); setAvoidOptimizationMessage('');
    let availableData = historicalData;
    if (avoidEndDate) availableData = availableData.filter(draw => draw.date <= avoidEndDate);
    const tCount = avoidAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, avoidSearchMin)) return setAvoidPredictionResult({ error: `資料量不足以進行 ${tCount} 期回測。`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= avoidSearchMin && p <= avoidSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(avoidSearchMin);

    for (const algo of Object.keys(ALGO_NAMES_AVOID)) {
      for (const pCount of allowedPeriods) {
        const res = executeAvoidBacktest(pCount, tCount, avoidNumberCount, avoidEndDate, algo);
        if (res.error) continue;
        if (!bestConfig || calculateQuantScore(res, avoidOptimizeCriterion) > calculateQuantScore(bestConfig, avoidOptimizeCriterion)) {
          bestConfig = res;
        }
      }
    }

    if (bestConfig) {
      setAvoidDrawCount(bestConfig.drawCountUsed); setAvoidAlgorithm(bestConfig.algorithmUsed);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const lastDraw = availableData[0];
      const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
      const predictedStats = getAvoidPredictionStats(recentDraws, avoidNumberCount, bestConfig.algorithmUsed, currentConfig, availableData, nextDrawInfo.date);

      setAvoidPredictionResult({
        algorithmName: ALGO_NAMES_AVOID[bestConfig.algorithmUsed], algorithmKey: bestConfig.algorithmUsed, analyzedCount: bestConfig.drawCountUsed,
        numbers: predictedStats, endDate: avoidEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period,
        smartMessage: `🤖 系統已為您找出具有統計顯著性的「防禦黃金解」！\n\n🏆 最佳量化模型：【${ALGO_NAMES_AVOID[bestConfig.algorithmUsed]}】\n📊 最佳觀測週期：近「${bestConfig.drawCountUsed} 期」\n🛡️ 表現：在此次 ${tCount} 期嚴格樣本外回測中，最高連破僅 ${bestConfig.maxFailStreak} 期，勝率達 ${bestConfig.overallAccuracy}%！\n\n👉 以下為預測的【${nextDrawInfo.date} (第 ${nextDrawInfo.period} 期)】不出牌推薦：`
      });
      setAvoidAutoBacktestResult(bestConfig);
    }
  };

  const handleAvoidAutoBacktest = () => {
    setAvoidPredictionResult(null); setAvoidOptimizationMessage('');
    setAvoidAutoBacktestResult(executeAvoidBacktest(avoidDrawCount, avoidAutoBacktestCount, avoidNumberCount, avoidEndDate, avoidAlgorithm));
  };

  const handleAvoidOptimizeParameters = () => {
    setAvoidPredictionResult(null); setAvoidOptimizationMessage('');
    let availableData = historicalData;
    if (avoidEndDate) availableData = availableData.filter(draw => draw.date <= avoidEndDate);
    const tCount = avoidAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, avoidSearchMin)) return setAvoidAutoBacktestResult({ error: `資料量不足`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= avoidSearchMin && p <= avoidSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(avoidSearchMin);
    
    for (const pCount of allowedPeriods) {
      const res = executeAvoidBacktest(pCount, tCount, avoidNumberCount, avoidEndDate, avoidAlgorithm);
      if (res.error) continue;
      if (!bestConfig || calculateQuantScore(res, avoidOptimizeCriterion) > calculateQuantScore(bestConfig, avoidOptimizeCriterion)) bestConfig = res;
    }

    if (bestConfig) {
      setAvoidDrawCount(bestConfig.drawCountUsed); setAvoidAutoBacktestResult(bestConfig);
      setAvoidOptimizationMessage(`🎯 針對【${ALGO_NAMES_AVOID[avoidAlgorithm]}】的最強量化策略為「觀測近 ${bestConfig.drawCountUsed} 期」，在 ${tCount} 期的回測中最高連破僅 ${bestConfig.maxFailStreak} 期，勝率 ${bestConfig.overallAccuracy}%！`);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const nextDrawInfo = calculateNextDraw(availableData[0]?.date, availableData[0]?.period, currentGame);
      const predictedStats = getAvoidPredictionStats(recentDraws, avoidNumberCount, avoidAlgorithm, currentConfig, availableData, nextDrawInfo.date);
      setAvoidPredictionResult({ algorithmName: ALGO_NAMES_AVOID[avoidAlgorithm], algorithmKey: avoidAlgorithm, analyzedCount: bestConfig.drawCountUsed, numbers: predictedStats, endDate: avoidEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period });
    }
  };

  // ==================== 出牌 (Play) 處理函式 ====================
  const executePlayBacktest = (targetDrawCount, targetBacktestCount, targetNumCount, targetEndDate, targetAlgorithm) => {
    let availableData = historicalData;
    if (targetEndDate) availableData = availableData.filter(draw => draw.date <= targetEndDate);
    if (availableData.length < targetBacktestCount + targetDrawCount) return { error: `資料量不足！` };

    const results = [];
    let successfulPeriods = 0;
    let totalHits = 0;
    const hitDistribution = Array(currentConfig.mainCount + 1).fill(0);

    for (let i = 0; i < targetBacktestCount; i++) {
      const targetDraw = availableData[i];
      const priorDraws = availableData.slice(i + 1, i + 1 + targetDrawCount);
      const allPriorData = availableData.slice(i + 1); 
      const predictedStats = getPlayPredictionStats(priorDraws, targetNumCount, targetAlgorithm, currentConfig, allPriorData, targetDraw.date);
      const predictedHotNumbers = predictedStats.map(s => s.number);
      
      const targetMainNumbers = targetDraw.numbers.slice(0, currentConfig.mainCount);
      const hitNumbers = predictedHotNumbers.filter(n => targetMainNumbers.includes(n));
      const isSuccess = hitNumbers.length >= 1; 

      if (isSuccess) successfulPeriods++;
      totalHits += hitNumbers.length;
      hitDistribution[Math.min(hitNumbers.length, currentConfig.mainCount)]++; 

      results.push({ date: targetDraw.date, period: targetDraw.period, actualNumbers: targetDraw.numbers, predictedNumbers: predictedHotNumbers, hitNumbers, isSuccess });
    }

    let maxSuccessStreak = 0, maxFailStreak = 0, currentSuccessStreak = 0, currentFailStreak = 0;
    const failStreakCounts = {}; 

    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].isSuccess) {
        currentSuccessStreak++; 
        if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }
        currentFailStreak = 0;
        if (currentSuccessStreak > maxSuccessStreak) maxSuccessStreak = currentSuccessStreak;
      } else {
        currentFailStreak++; 
        currentSuccessStreak = 0;
        if (currentFailStreak > maxFailStreak) maxFailStreak = currentFailStreak;
      }
    }
    if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }

    return {
      algorithmUsed: targetAlgorithm, drawCountUsed: targetDrawCount, totalTests: targetBacktestCount,
      successfulPeriods, failedPeriods: targetBacktestCount - successfulPeriods, totalHits, hitDistribution,
      overallAccuracy: ((successfulPeriods / targetBacktestCount) * 100).toFixed(2),
      maxSuccessStreak, maxFailStreak, failStreakCounts, details: results
    };
  };

  const handlePlayPredict = () => {
    setPlayAutoBacktestResult(null); setPlayOptimizationMessage('');
    if (historicalData.length === 0) return setPlayPredictionResult({ error: '目前沒有歷史數據' });
    let availableData = historicalData;
    if (playEndDate) availableData = availableData.filter(draw => draw.date <= playEndDate);
    if (availableData.length === 0) return setPlayPredictionResult({ error: `無歷史數據` });

    const recentDraws = availableData.slice(0, playDrawCount);
    const lastDraw = availableData[0];
    const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
    const predictedStats = getPlayPredictionStats(recentDraws, playNumberCount, playAlgorithm, currentConfig, availableData, nextDrawInfo.date);

    setPlayPredictionResult({
      algorithmName: ALGO_NAMES_PLAY[playAlgorithm], algorithmKey: playAlgorithm, analyzedCount: recentDraws.length,
      numbers: predictedStats, endDate: playEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period
    });
  };

  const handleSmartPlayPredict = () => {
    setPlayPredictionResult(null); setPlayAutoBacktestResult(null); setPlayOptimizationMessage('');
    let availableData = historicalData;
    if (playEndDate) availableData = availableData.filter(draw => draw.date <= playEndDate);
    const tCount = playAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, playSearchMin)) return setPlayPredictionResult({ error: `資料量不足以進行 ${tCount} 期回測。`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= playSearchMin && p <= playSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(playSearchMin);

    for (const algo of Object.keys(ALGO_NAMES_PLAY)) {
      for (const pCount of allowedPeriods) {
        const res = executePlayBacktest(pCount, tCount, playNumberCount, playEndDate, algo);
        if (res.error) continue;
        if (!bestConfig || calculateQuantScore(res, playOptimizeCriterion) > calculateQuantScore(bestConfig, playOptimizeCriterion)) {
          bestConfig = res;
        }
      }
    }

    if (bestConfig) {
      setPlayDrawCount(bestConfig.drawCountUsed); setPlayAlgorithm(bestConfig.algorithmUsed);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const lastDraw = availableData[0];
      const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
      const predictedStats = getPlayPredictionStats(recentDraws, playNumberCount, bestConfig.algorithmUsed, currentConfig, availableData, nextDrawInfo.date);

      const priorityText = playOptimizeCriterion === 'max_hits' ? '總命中期望值最高' : '長期保底勝率最穩定';

      setPlayPredictionResult({
        algorithmName: ALGO_NAMES_PLAY[bestConfig.algorithmUsed], algorithmKey: bestConfig.algorithmUsed, analyzedCount: bestConfig.drawCountUsed,
        numbers: predictedStats, endDate: playEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period,
        smartMessage: `🤖 系統已透過嚴格統計顯著性，為您找出抗跌能力最強的「量化出牌黃金解」！\n\n🏆 最佳量化模型：【${ALGO_NAMES_PLAY[bestConfig.algorithmUsed]}】\n📊 最佳觀測週期：近「${bestConfig.drawCountUsed} 期」\n🛡️ 表現：在此次 ${tCount} 期樣本外回測中，共命中 ${bestConfig.totalHits} 顆主支 (${priorityText})！\n\n👉 以下為系統預測的【${nextDrawInfo.date} (第 ${nextDrawInfo.period} 期)】建議投注號碼：`
      });
      setPlayAutoBacktestResult(bestConfig);
    }
  };

  const handlePlayAutoBacktest = () => {
    setPlayPredictionResult(null); setPlayOptimizationMessage('');
    setPlayAutoBacktestResult(executePlayBacktest(playDrawCount, playAutoBacktestCount, playNumberCount, playEndDate, playAlgorithm));
  };

  const handlePlayOptimizeParameters = () => {
    setPlayPredictionResult(null); setPlayOptimizationMessage('');
    let availableData = historicalData;
    if (playEndDate) availableData = availableData.filter(draw => draw.date <= playEndDate);
    const tCount = playAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, playSearchMin)) return setPlayAutoBacktestResult({ error: `資料量不足`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= playSearchMin && p <= playSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(playSearchMin);

    for (const pCount of allowedPeriods) {
      const res = executePlayBacktest(pCount, tCount, playNumberCount, playEndDate, playAlgorithm);
      if (res.error) continue;
      if (!bestConfig || calculateQuantScore(res, playOptimizeCriterion) > calculateQuantScore(bestConfig, playOptimizeCriterion)) bestConfig = res;
    }

    if (bestConfig) {
      setPlayDrawCount(bestConfig.drawCountUsed); setPlayAutoBacktestResult(bestConfig);
      const priorityText = playOptimizeCriterion === 'max_hits' ? '總命中期望值最高' : '長期保底勝率最穩定';
      setPlayOptimizationMessage(`🎯 針對【${ALGO_NAMES_PLAY[playAlgorithm]}】的最強量化策略為「觀測近 ${bestConfig.drawCountUsed} 期」，在 ${tCount} 期的回測中共命中 ${bestConfig.totalHits} 顆主支 (${priorityText})！`);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const nextDrawInfo = calculateNextDraw(availableData[0]?.date, availableData[0]?.period, currentGame);
      const predictedStats = getPlayPredictionStats(recentDraws, playNumberCount, playAlgorithm, currentConfig, availableData, nextDrawInfo.date);
      setPlayPredictionResult({ algorithmName: ALGO_NAMES_PLAY[playAlgorithm], algorithmKey: playAlgorithm, analyzedCount: bestConfig.drawCountUsed, numbers: predictedStats, endDate: playEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period });
    }
  };

  // ==================== 特碼孤支 (Extra) 處理函式 ====================
  const executeExtraBacktest = (targetDrawCount, targetBacktestCount, targetNumCount, targetEndDate, targetAlgorithm) => {
    let availableData = historicalData;
    if (targetEndDate) availableData = availableData.filter(draw => draw.date <= targetEndDate);
    if (availableData.length < targetBacktestCount + targetDrawCount) return { error: `資料量不足！` };

    const results = [];
    let successfulPeriods = 0;
    let totalHits = 0;

    for (let i = 0; i < targetBacktestCount; i++) {
      const targetDraw = availableData[i];
      const priorDraws = availableData.slice(i + 1, i + 1 + targetDrawCount);
      const allPriorData = availableData.slice(i + 1); 
      const predictedStats = getExtraPredictionStats(priorDraws, targetNumCount, targetAlgorithm, currentConfig, allPriorData, targetDraw.date);
      const predictedHotNumbers = predictedStats.map(s => s.number);
      
      const targetExtraNumbers = targetDraw.numbers.slice(currentConfig.mainCount);
      const hitNumbers = predictedHotNumbers.filter(n => targetExtraNumbers.includes(n));
      const isSuccess = hitNumbers.length >= 1; 

      if (isSuccess) successfulPeriods++;
      totalHits += hitNumbers.length;

      results.push({ date: targetDraw.date, period: targetDraw.period, actualNumbers: targetDraw.numbers, predictedNumbers: predictedHotNumbers, hitNumbers, isSuccess });
    }

    let maxSuccessStreak = 0, maxFailStreak = 0, currentSuccessStreak = 0, currentFailStreak = 0;
    const failStreakCounts = {}; 

    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].isSuccess) {
        currentSuccessStreak++; 
        if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }
        currentFailStreak = 0;
        if (currentSuccessStreak > maxSuccessStreak) maxSuccessStreak = currentSuccessStreak;
      } else {
        currentFailStreak++; 
        currentSuccessStreak = 0;
        if (currentFailStreak > maxFailStreak) maxFailStreak = currentFailStreak;
      }
    }
    if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }

    return {
      algorithmUsed: targetAlgorithm, drawCountUsed: targetDrawCount, totalTests: targetBacktestCount,
      successfulPeriods, failedPeriods: targetBacktestCount - successfulPeriods, totalHits,
      overallAccuracy: ((successfulPeriods / targetBacktestCount) * 100).toFixed(2),
      maxSuccessStreak, maxFailStreak, failStreakCounts, details: results
    };
  };

  const handleExtraPredict = () => {
    setExtraAutoBacktestResult(null); setExtraOptimizationMessage('');
    if (historicalData.length === 0) return setExtraPredictionResult({ error: '目前沒有歷史數據' });
    let availableData = historicalData;
    if (extraEndDate) availableData = availableData.filter(draw => draw.date <= extraEndDate);
    if (availableData.length === 0) return setExtraPredictionResult({ error: `無歷史數據` });

    const recentDraws = availableData.slice(0, extraDrawCount);
    const lastDraw = availableData[0];
    const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
    const predictedStats = getExtraPredictionStats(recentDraws, extraNumberCount, extraAlgorithm, currentConfig, availableData, nextDrawInfo.date);

    setExtraPredictionResult({
      algorithmName: ALGO_NAMES_PLAY[extraAlgorithm], algorithmKey: extraAlgorithm, analyzedCount: recentDraws.length,
      numbers: predictedStats, endDate: extraEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period
    });
  };

  const handleSmartExtraPredict = () => {
    setExtraPredictionResult(null); setExtraAutoBacktestResult(null); setExtraOptimizationMessage('');
    let availableData = historicalData;
    if (extraEndDate) availableData = availableData.filter(draw => draw.date <= extraEndDate);
    const tCount = extraAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, extraSearchMin)) return setExtraPredictionResult({ error: `資料量不足以進行 ${tCount} 期回測。`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= extraSearchMin && p <= extraSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(extraSearchMin);

    for (const algo of Object.keys(ALGO_NAMES_PLAY)) {
      for (const pCount of allowedPeriods) {
        const res = executeExtraBacktest(pCount, tCount, extraNumberCount, extraEndDate, algo);
        if (res.error) continue;
        if (!bestConfig || calculateQuantScore(res, extraOptimizeCriterion) > calculateQuantScore(bestConfig, extraOptimizeCriterion)) {
          bestConfig = res;
        }
      }
    }

    if (bestConfig) {
      setExtraDrawCount(bestConfig.drawCountUsed); setExtraAlgorithm(bestConfig.algorithmUsed);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const lastDraw = availableData[0];
      const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
      const predictedStats = getExtraPredictionStats(recentDraws, extraNumberCount, bestConfig.algorithmUsed, currentConfig, availableData, nextDrawInfo.date);

      const priorityText = extraOptimizeCriterion === 'max_hits' ? '長期命中期望值最高' : '保底穩定勝率最高';

      setExtraPredictionResult({
        algorithmName: ALGO_NAMES_PLAY[bestConfig.algorithmUsed], algorithmKey: bestConfig.algorithmUsed, analyzedCount: bestConfig.drawCountUsed,
        numbers: predictedStats, endDate: extraEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period,
        smartMessage: `🤖 系統已為您找出兼具樣本顯著性的「特碼黃金解」！\n\n🏆 最佳量化模型：【${ALGO_NAMES_PLAY[bestConfig.algorithmUsed]}】\n📊 最佳觀測週期：近「${bestConfig.drawCountUsed} 期」\n🛡️ 表現：在此次 ${tCount} 期回測中，共命中 ${bestConfig.totalHits} 顆特碼 (${priorityText})！\n\n👉 以下為系統預測的【${nextDrawInfo.date} (第 ${nextDrawInfo.period} 期)】建議特碼：`
      });
      setExtraAutoBacktestResult(bestConfig);
    }
  };

  const handleExtraAutoBacktest = () => {
    setExtraPredictionResult(null); setExtraOptimizationMessage('');
    setExtraAutoBacktestResult(executeExtraBacktest(extraDrawCount, extraAutoBacktestCount, extraNumberCount, extraEndDate, extraAlgorithm));
  };

  const handleExtraOptimizeParameters = () => {
    setExtraPredictionResult(null); setExtraOptimizationMessage('');
    let availableData = historicalData;
    if (extraEndDate) availableData = availableData.filter(draw => draw.date <= extraEndDate);
    const tCount = extraAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, extraSearchMin)) return setExtraAutoBacktestResult({ error: `資料量不足`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= extraSearchMin && p <= extraSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(extraSearchMin);

    for (const pCount of allowedPeriods) {
      const res = executeExtraBacktest(pCount, tCount, extraNumberCount, extraEndDate, extraAlgorithm);
      if (res.error) continue;
      if (!bestConfig || calculateQuantScore(res, extraOptimizeCriterion) > calculateQuantScore(bestConfig, extraOptimizeCriterion)) bestConfig = res;
    }

    if (bestConfig) {
      setExtraDrawCount(bestConfig.drawCountUsed); setExtraAutoBacktestResult(bestConfig);
      const priorityText = extraOptimizeCriterion === 'max_hits' ? '長期命中期望值最高' : '保底穩定勝率最高';
      setExtraOptimizationMessage(`🎯 針對【${ALGO_NAMES_PLAY[extraAlgorithm]}】的最強策略為「觀測近 ${bestConfig.drawCountUsed} 期」，在 ${tCount} 期的回測中共命中 ${bestConfig.totalHits} 顆特碼 (${priorityText})！`);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const nextDrawInfo = calculateNextDraw(availableData[0]?.date, availableData[0]?.period, currentGame);
      const predictedStats = getExtraPredictionStats(recentDraws, extraNumberCount, extraAlgorithm, currentConfig, availableData, nextDrawInfo.date);
      setExtraPredictionResult({ algorithmName: ALGO_NAMES_PLAY[extraAlgorithm], algorithmKey: extraAlgorithm, analyzedCount: bestConfig.drawCountUsed, numbers: predictedStats, endDate: extraEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period });
    }
  };

  // ==================== 特殊玩法 (Special) 處理函式 ====================
  const executeSpecialBacktest = (mode, targetDrawCount, targetBacktestCount, targetNumCount, targetEndDate, targetAlgorithm) => {
    let availableData = historicalData;
    if (targetEndDate) availableData = availableData.filter(draw => draw.date <= targetEndDate);
    if (availableData.length < targetBacktestCount + targetDrawCount) return { error: `資料量不足！` };

    const results = [];
    let successfulPeriods = 0;
    let totalHits = 0;

    for (let i = 0; i < targetBacktestCount; i++) {
      const targetDraw = availableData[i];
      const priorDraws = availableData.slice(i + 1, i + 1 + targetDrawCount);
      const allPriorData = availableData.slice(i + 1); 
      const predictedStats = getSpecialPredictionStats(mode, priorDraws, targetNumCount, targetAlgorithm, currentConfig, allPriorData);
      const predictedOutcomes = predictedStats.map(s => s.outcome);
      
      const targetProps = getDrawProps(targetDraw, currentConfig);
      let actualOutcomes = [];
      if (mode === 'sum_bs') actualOutcomes = [targetProps.sum_bs];
      else if (mode === 'sum_oe') actualOutcomes = [targetProps.sum_oe];
      else if (mode === 'zodiac') actualOutcomes = targetProps.zodiacs;

      const hitOutcomes = predictedOutcomes.filter(o => actualOutcomes.includes(o));
      const isSuccess = hitOutcomes.length >= 1; 

      if (isSuccess) successfulPeriods++;
      totalHits += hitOutcomes.length;

      results.push({ date: targetDraw.date, period: targetDraw.period, actualNumbers: targetDraw.numbers, targetProps, predictedOutcomes, hitOutcomes, isSuccess });
    }

    let maxSuccessStreak = 0, maxFailStreak = 0, currentSuccessStreak = 0, currentFailStreak = 0;
    const failStreakCounts = {}; 

    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].isSuccess) {
        currentSuccessStreak++; 
        if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }
        currentFailStreak = 0;
        if (currentSuccessStreak > maxSuccessStreak) maxSuccessStreak = currentSuccessStreak;
      } else {
        currentFailStreak++; 
        currentSuccessStreak = 0;
        if (currentFailStreak > maxFailStreak) maxFailStreak = currentFailStreak;
      }
    }
    if (currentFailStreak > 0) { failStreakCounts[currentFailStreak] = (failStreakCounts[currentFailStreak] || 0) + 1; }

    return {
      algorithmUsed: targetAlgorithm, drawCountUsed: targetDrawCount, totalTests: targetBacktestCount,
      successfulPeriods, failedPeriods: targetBacktestCount - successfulPeriods, totalHits,
      overallAccuracy: ((successfulPeriods / targetBacktestCount) * 100).toFixed(2),
      maxSuccessStreak, maxFailStreak, failStreakCounts, details: results
    };
  };

  const handleSpecialPredict = () => {
    setSpecialAutoBacktestResult(null); setSpecialOptimizationMessage('');
    if (historicalData.length === 0) return setSpecialPredictionResult({ error: '目前沒有歷史數據' });
    let availableData = historicalData;
    if (specialEndDate) availableData = availableData.filter(draw => draw.date <= specialEndDate);
    if (availableData.length === 0) return setSpecialPredictionResult({ error: `無歷史數據` });

    const recentDraws = availableData.slice(0, specialDrawCount);
    const lastDraw = availableData[0];
    const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
    const predictedStats = getSpecialPredictionStats(specialMode, recentDraws, specialNumberCount, specialAlgorithm, currentConfig, availableData);

    setSpecialPredictionResult({
      algorithmName: ALGO_NAMES_SPECIAL[specialAlgorithm], algorithmKey: specialAlgorithm, analyzedCount: recentDraws.length,
      numbers: predictedStats, endDate: specialEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period
    });
  };

  const handleSmartSpecialPredict = () => {
    setSpecialPredictionResult(null); setSpecialAutoBacktestResult(null); setSpecialOptimizationMessage('');
    let availableData = historicalData;
    if (specialEndDate) availableData = availableData.filter(draw => draw.date <= specialEndDate);
    const tCount = specialAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, specialSearchMin)) return setSpecialPredictionResult({ error: `資料量不足以進行 ${tCount} 期回測。`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= specialSearchMin && p <= specialSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(specialSearchMin);

    for (const algo of Object.keys(ALGO_NAMES_SPECIAL)) {
      for (const pCount of allowedPeriods) {
        const res = executeSpecialBacktest(specialMode, pCount, tCount, specialNumberCount, specialEndDate, algo);
        if (res.error) continue;
        if (!bestConfig || calculateQuantScore(res, specialOptimizeCriterion) > calculateQuantScore(bestConfig, specialOptimizeCriterion)) {
          bestConfig = res;
        }
      }
    }

    if (bestConfig) {
      setSpecialDrawCount(bestConfig.drawCountUsed); setSpecialAlgorithm(bestConfig.algorithmUsed);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const lastDraw = availableData[0];
      const nextDrawInfo = calculateNextDraw(lastDraw?.date, lastDraw?.period, currentGame);
      const predictedStats = getSpecialPredictionStats(specialMode, recentDraws, specialNumberCount, bestConfig.algorithmUsed, currentConfig, availableData);

      const priorityText = specialOptimizeCriterion === 'max_hits' ? '期望命中數最高' : 
                           specialOptimizeCriterion === 'min_fail_streak' ? '連敗次數最低' : '整體勝率最高';

      setSpecialPredictionResult({
        algorithmName: ALGO_NAMES_SPECIAL[bestConfig.algorithmUsed], algorithmKey: bestConfig.algorithmUsed, analyzedCount: bestConfig.drawCountUsed,
        numbers: predictedStats, endDate: specialEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period,
        smartMessage: `🤖 系統已為您找出經過樣本數驗證的「量化玩法黃金解」！\n\n🏆 最佳量化模型：【${ALGO_NAMES_SPECIAL[bestConfig.algorithmUsed]}】\n📊 最佳觀測週期：近「${bestConfig.drawCountUsed} 期」\n🛡️ 表現：在此次 ${tCount} 期回測中 (${priorityText})，${specialOptimizeCriterion === 'min_fail_streak' ? `最高連破僅 ${bestConfig.maxFailStreak} 期，` : ''}勝率達 ${bestConfig.overallAccuracy}%！\n\n👉 以下為系統預測的【${nextDrawInfo.date} (第 ${nextDrawInfo.period} 期)】建議結果：`
      });
      setSpecialAutoBacktestResult(bestConfig);
    }
  };

  const handleSpecialAutoBacktest = () => {
    setSpecialPredictionResult(null); setSpecialOptimizationMessage('');
    setSpecialAutoBacktestResult(executeSpecialBacktest(specialMode, specialDrawCount, specialAutoBacktestCount, specialNumberCount, specialEndDate, specialAlgorithm));
  };

  const handleSpecialOptimizeParameters = () => {
    setSpecialPredictionResult(null); setSpecialOptimizationMessage('');
    let availableData = historicalData;
    if (specialEndDate) availableData = availableData.filter(draw => draw.date <= specialEndDate);
    const tCount = specialAutoBacktestCount || 30;
    if (availableData.length < tCount + Math.max(1, specialSearchMin)) return setSpecialAutoBacktestResult({ error: `資料量不足`});

    let bestConfig = null;
    const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= specialSearchMin && p <= specialSearchMax);
    if (allowedPeriods.length === 0) allowedPeriods.push(specialSearchMin);

    for (const pCount of allowedPeriods) {
      const res = executeSpecialBacktest(specialMode, pCount, tCount, specialNumberCount, specialEndDate, specialAlgorithm);
      if (res.error) continue;
      if (!bestConfig || calculateQuantScore(res, specialOptimizeCriterion) > calculateQuantScore(bestConfig, specialOptimizeCriterion)) bestConfig = res;
    }

    if (bestConfig) {
      setSpecialDrawCount(bestConfig.drawCountUsed); setSpecialAutoBacktestResult(bestConfig);
      const priorityText = specialOptimizeCriterion === 'max_hits' ? '期望命中數最高' : 
                           specialOptimizeCriterion === 'min_fail_streak' ? '連敗次數最低' : '整體勝率最高';
      setSpecialOptimizationMessage(`🎯 針對【${ALGO_NAMES_SPECIAL[specialAlgorithm]}】的最強策略為「觀測近 ${bestConfig.drawCountUsed} 期」，在 ${tCount} 期的回測中 (${priorityText}) ${specialOptimizeCriterion === 'min_fail_streak' ? `最高連破僅 ${bestConfig.maxFailStreak} 期，` : ''}勝率 ${bestConfig.overallAccuracy}%！`);
      const recentDraws = availableData.slice(0, bestConfig.drawCountUsed);
      const nextDrawInfo = calculateNextDraw(availableData[0]?.date, availableData[0]?.period, currentGame);
      const predictedStats = getSpecialPredictionStats(specialMode, recentDraws, specialNumberCount, specialAlgorithm, currentConfig, availableData);
      setSpecialPredictionResult({ algorithmName: ALGO_NAMES_SPECIAL[specialAlgorithm], algorithmKey: specialAlgorithm, analyzedCount: bestConfig.drawCountUsed, numbers: predictedStats, endDate: specialEndDate || '最新', targetDate: nextDrawInfo.date, targetPeriod: nextDrawInfo.period });
    }
  };

  // ==================== 全彩種數據統計處理函式 ====================
  const handleGenerateGlobalStats = async () => {
    if (!user) return setGlobalStatsError('請等待系統連線完成。');
    setIsGlobalCalculating(true);
    setGlobalStatsResult(null);
    setGlobalStatsError('');

    try {
      const results = {};
      for (const gameKey of Object.keys(GAME_CONFIG)) {
        const config = GAME_CONFIG[gameKey];

        // 👇 3. 修改全彩種統計的讀取路徑 (global_data)
        const drawsRef = collection(db, 'artifacts', appId, 'global_data', `draws_${gameKey}`);
        const snapshot = await getDocs(drawsRef);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (data.length < globalSearchMin + globalBacktestCount) {
          results[gameKey] = { gameName: config.name, status: 'Insufficient' };
          continue;
        }

        const allowedPeriods = QUANT_SEARCH_PERIODS.filter(p => p >= globalSearchMin && p <= globalSearchMax);
        if (allowedPeriods.length === 0) allowedPeriods.push(globalSearchMin);
        
        const gameStats = [];

        for (let n = 5; n <= 10; n++) {
          setGlobalProgress(`🚀 量化運算中：${config.name} - 預測 ${n} 顆不出牌...`);
          await new Promise(resolve => setTimeout(resolve, 5)); 

          let bestWinRate = null;
          let bestFailStreak = null;

          for (const algo of Object.keys(ALGO_NAMES_AVOID)) {
            for (const pCount of allowedPeriods) {
              const res = executeAvoidBacktest(pCount, globalBacktestCount, n, '', algo, data, config);
              if (res.error) continue;

              if (!bestWinRate || calculateQuantScore(res, 'max_accuracy') > calculateQuantScore(bestWinRate, 'max_accuracy')) {
                bestWinRate = res;
              }
              if (!bestFailStreak || calculateQuantScore(res, 'min_fail_streak') > calculateQuantScore(bestFailStreak, 'min_fail_streak')) {
                bestFailStreak = res;
              }
            }
          }
          gameStats.push({ n, bestWinRate, bestFailStreak });
        }
        results[gameKey] = { gameName: config.name, status: 'OK', stats: gameStats };
      }
      setGlobalStatsResult(results);
    } catch(err) {
      setGlobalStatsError('計算過程中發生錯誤：' + err.message);
    }
    setGlobalProgress('');
    setIsGlobalCalculating(false);
  };


  // ==================== 數據管理處理函式 ====================
  const handleAddNewDraw = async () => {
    setDataError('');
    if (!newDrawDate || !newDrawPeriod) return setDataError('請輸入日期與期數');
    const parsedNumbers = newDrawNumbers.map(n => parseInt(n, 10));
    if (parsedNumbers.some(isNaN) || parsedNumbers.some(n => n < 1 || n > currentConfig.maxNum)) return setDataError(`請輸入 ${currentConfig.drawCount} 個 1~${currentConfig.maxNum} 之間的有效數字`);
    if (new Set(parsedNumbers).size !== currentConfig.drawCount) return setDataError('開獎號碼不能重複且必須填滿');
    if (!user || cloudStatus !== 'connected') return setDataError('❌ 雲端未連線，無法儲存資料');
    
    const mainNums = parsedNumbers.slice(0, currentConfig.mainCount).sort((a, b) => a - b);
    const specialNums = parsedNumbers.slice(currentConfig.mainCount);
    const finalNumbers = [...mainNums, ...specialNums];

    try {
      // 👇 4. 修改寫入路徑 (global_data)
      const docRef = doc(db, 'artifacts', appId, 'global_data', 'shared', `draws_${currentGame}`, Date.now().toString());
      await setDoc(docRef, { date: newDrawDate, period: newDrawPeriod, numbers: finalNumbers });
      setNewDrawDate(''); setNewDrawPeriod(''); setNewDrawNumbers(Array(currentConfig.drawCount).fill(''));
      setDataError('✅ 新增成功！(已安全同步至公共雲端)'); setTimeout(() => setDataError(''), 3000);
    } catch (err) { setDataError('❌ 儲存失敗，請檢查網路連線或權限'); }
  };

  const handleNewDrawNumberChange = (index, value) => { const newNumbers = [...newDrawNumbers]; newNumbers[index] = value; setNewDrawNumbers(newNumbers); };
  
  const handleDeleteDraw = async (id) => { 
    if (!user || !isAdmin) return; 
    try { 
      // 👇 5. 修改刪除路徑 (global_data)
      await deleteDoc(doc(db, 'artifacts', appId, 'global_data', `draws_${currentGame}`, id)); 
      setConfirmDeleteId(null); 
    } catch (err) { console.error("刪除失敗", err); } 
  };

  const handleDeleteAllData = async () => {
    if (!user || !isAdmin || historicalData.length === 0) return;
    try {
      setIsDataLoading(true);
      const batches = [];
      let currentBatch = writeBatch(db);
      let count = 0;

      historicalData.forEach((draw, index) => {
        // 👇 6. 修改一鍵清空路徑 (global_data)
        const docRef = doc(db, 'artifacts', appId, 'global_data', `draws_${currentGame}`, draw.id);
        currentBatch.delete(docRef);
        count++;
        if (count === 490 || index === historicalData.length - 1) {
          batches.push(currentBatch.commit());
          currentBatch = writeBatch(db);
          count = 0;
        }
      });

      await Promise.all(batches);
      setConfirmDeleteAll(false);
      setIsDataLoading(false);
      setDataError('✅ 已成功清空公共歷史數據！');
      setTimeout(() => setDataError(''), 3000);
    } catch (err) {
      console.error("清空失敗:", err);
      setIsDataLoading(false);
      setDataError('❌ 清空失敗，請檢查權限。');
      setTimeout(() => setDataError(''), 3000);
    }
  };

  const parseAndSaveData = async (textToParse) => {
    let addedCount = 0; let newDraws = [];
    
    const lines = textToParse.trim().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim(); if (!line) continue;
      const parts = line.split(/[\s,\t|]+/).filter(Boolean);
      
      let dateIdx = parts.findIndex(p => /^\d{3,4}[-/]\d{1,2}[-/]\d{1,2}$/.test(p));
      if (dateIdx === -1) continue;
      
      let dateStr = parts[dateIdx].replace(/\//g, '-'); 
      const dateParts = dateStr.split('-');
      if (dateParts[0].length === 3) dateParts[0] = String(parseInt(dateParts[0], 10) + 1911);
      if (dateParts.length === 3) dateStr = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
      
      const periodMatch = parts.find(p => /^\d{5,}$/.test(p));
      const period = periodMatch ? periodMatch : "未知期數";

      const possibleNums = parts.slice(dateIdx + 1).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 1 && n <= currentConfig.maxNum);
      if (possibleNums.length >= currentConfig.drawCount) {
        const nums = possibleNums.slice(0, currentConfig.drawCount); 
        if (new Set(nums).size === currentConfig.drawCount) {
          const mainNums = nums.slice(0, currentConfig.mainCount).sort((a, b) => a - b);
          const specialNums = nums.slice(currentConfig.mainCount);
          newDraws.push({ id: `imported-${Date.now()}-${addedCount}`, date: dateStr, period: period, numbers: [...mainNums, ...specialNums] }); 
          addedCount++;
        }
      }
    }

    if (addedCount === 0) {
      const parts = textToParse.split(/[\s,\t|]+/).filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        if (/^\d{3,4}[-/]\d{1,2}[-/]\d{1,2}$/.test(parts[i])) {
          let dateStr = parts[i].replace(/\//g, '-');
          const dateParts = dateStr.split('-');
          if (dateParts[0].length === 3) dateParts[0] = String(parseInt(dateParts[0], 10) + 1911);
          if (dateParts.length === 3) dateStr = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;

          let period = "未知期數";
          if (i > 0 && /^\d{5,}$/.test(parts[i-1])) period = parts[i-1];
          else if (i + 1 < parts.length && /^\d{5,}$/.test(parts[i+1])) period = parts[i+1];

          const nums = [];
          let j = i + 1;
          while (nums.length < currentConfig.drawCount && j < parts.length && j < i + 20) { 
             const n = parseInt(parts[j], 10);
             if (!isNaN(n) && n >= 1 && n <= currentConfig.maxNum && !/^\d{5,}$/.test(parts[j])) {
                if (!nums.includes(n)) nums.push(n);
             }
             j++;
          }

          if (nums.length === currentConfig.drawCount) {
             const mainNums = nums.slice(0, currentConfig.mainCount).sort((a, b) => a - b);
             const specialNums = nums.slice(currentConfig.mainCount);
             newDraws.push({ id: `imported-${Date.now()}-${addedCount}`, date: dateStr, period: period, numbers: [...mainNums, ...specialNums] });
             addedCount++;
          }
        }
      }
    }

    if (addedCount > 0 && user && isAdmin) {
      const existingDates = new Set(historicalData.map(d => d.date));
      const filteredNewDraws = newDraws.filter(d => !existingDates.has(d.date));
      const finalCount = filteredNewDraws.length;
      
      if (finalCount === 0) return { type: 'error', text: `解析了 ${addedCount} 筆資料，但皆與現有日期重複，無缺漏資料。` };
      
      try {
        const batch = writeBatch(db);
        filteredNewDraws.forEach(draw => {
          // 👇 7. 修改文字匯入的寫入路徑 (global_data)
          batch.set(doc(db, 'artifacts', appId, 'global_data', `draws_${currentGame}`, draw.id), { 
            date: draw.date, period: draw.period, numbers: draw.numbers 
          });
        });
        await batch.commit();
        return { type: 'success', text: `🎉 成功解析並匯入 ${finalCount} 筆新資料！(已同步至公共雲端)` };
      } catch (error) { return { type: 'error', text: '儲存至雲端失敗，請檢查管理員權限。' }; }
    } else if (!user) return { type: 'error', text: '系統尚未連線。' };
    else if (!isAdmin) return { type: 'error', text: '❌ 只有管理員可以匯入資料。' };
    else return { type: 'error', text: '❌ 找不到符合格式的開獎數據。' };
  };

  const handleParseImport = async () => {
    if (!importText.trim()) return setImportMessage({ type: 'error', text: '請貼上要匯入的數據' });
    setImportMessage({ type: 'info', text: '⏳ 正在解析數據中...' });
    const resultMsg = await parseAndSaveData(importText);
    setImportMessage(resultMsg);
    if (resultMsg.type === 'success') setImportText('');
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify(historicalData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; 
    a.download = `${currentGame}_history_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ==================== 付費牆介面 ====================
  const renderPaywall = () => (
    <div className="bg-white rounded-2xl shadow-2xl border border-yellow-200 overflow-hidden text-center p-10 max-w-2xl mx-auto mt-10 relative">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500"></div>
      <div className="w-24 h-24 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-yellow-100">
        <Lock className="w-10 h-10" />
      </div>
      <h2 className="text-3xl font-black text-gray-800 mb-4">解鎖 AI 量化專業版，掌握財富密碼</h2>
      <p className="text-gray-500 mb-8 font-medium leading-relaxed">
        您目前使用的是免費版本，僅開放基礎「數據查詢」與「號碼比對」。<br/>
        升級 <span className="text-yellow-600 font-bold">PRO 量化會員</span> 即可無限制使用「12 大 AI 預測模型」、「量化顯著性評分系統」與「機構級前向滾動回測」等強大功能！
      </p>

      <button onClick={simulatePayment} className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-black rounded-xl transition-all shadow-xl flex items-center justify-center text-lg mx-auto mb-4 transform hover:scale-105 border border-yellow-300">
        <Sparkles className="w-6 h-6 mr-2" /> 模擬付款 $990/月 (解鎖 PRO)
      </button>
      <p className="text-xs text-gray-400 mt-6">💡 這是一個模擬的商業化付費牆機制，點擊模擬付款即可免費體驗完整功能。</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800 font-sans pb-12">
      <header className="bg-slate-900 text-white shadow-lg border-b border-indigo-500 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 sm:flex sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center space-x-2">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <span className="text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">
                {currentConfig.name}
              </span>
              <span className="text-xs bg-indigo-600 px-2 py-1 rounded-md font-bold shadow-inner">量化分析引擎 Pro</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex-wrap gap-1">
                {Object.keys(GAME_CONFIG).map(gameKey => (
                   <button 
                     key={gameKey}
                     onClick={() => setCurrentGame(gameKey)} 
                     className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${currentGame === gameKey ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                   >
                     {GAME_CONFIG[gameKey].name}
                   </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-4 sm:mt-0 flex flex-col sm:items-end gap-3 h-fit">
            <div className="flex items-center">
              {user && !user.isAnonymous ? (
                <div className="flex items-center bg-slate-800 rounded-lg pl-2 pr-1 py-1 border border-slate-700 shadow-sm">
                  <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-2 shadow-inner">
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="text-sm font-medium text-slate-200 mr-3">{user.displayName || '會員'}</span>
                  {isAdmin && <span className="text-xs bg-red-600 px-2 py-0.5 rounded text-white font-bold mr-2">站長</span>}
                  {isSubscribed ? (
                    <span className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900 text-xs font-black px-2 py-1 rounded flex items-center shadow-sm">
                      <Trophy className="w-3 h-3 mr-1"/> PRO
                    </span>
                  ) : (
                    <button onClick={simulatePayment} className="text-xs font-bold text-yellow-400 hover:text-yellow-300 border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 rounded transition-colors">
                      升級 PRO
                    </button>
                  )}
                  <button onClick={handleLogout} className="ml-2 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title="登出">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={simulatePayment} className="flex items-center text-sm font-bold bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 text-white px-4 py-2 rounded-lg transition-colors shadow-md">
                  <Sparkles className="w-4 h-4 mr-2" /> 升級 PRO 體驗
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-1 bg-slate-800 p-1 rounded-lg">
              <button onClick={() => setActiveTab('global_stats')} className={`flex items-center px-4 py-2 rounded-md transition-colors font-bold text-sm ${activeTab === 'global_stats' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}>
                {(!isSubscribed && !isAdmin) && <Lock className="w-3 h-3 mr-1 opacity-50" />}
                <Globe className="w-4 h-4 mr-1" /> 全彩種評測
              </button>
              <button onClick={() => setActiveTab('predict_extra')} className={`flex items-center px-4 py-2 rounded-md transition-colors font-bold text-sm ${activeTab === 'predict_extra' ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}>
                {(!isSubscribed && !isAdmin) && <Lock className="w-3 h-3 mr-1 opacity-50" />}
                <Zap className="w-4 h-4 mr-1" /> 特碼孤支
              </button>
              <button onClick={() => setActiveTab('predict_special')} className={`flex items-center px-4 py-2 rounded-md transition-colors font-bold text-sm ${activeTab === 'predict_special' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}>
                {(!isSubscribed && !isAdmin) && <Lock className="w-3 h-3 mr-1 opacity-50" />}
                <Compass className="w-4 h-4 mr-1" /> 特殊玩法
              </button>
              <button onClick={() => setActiveTab('predict_play')} className={`flex items-center px-4 py-2 rounded-md transition-colors font-bold text-sm ${activeTab === 'predict_play' ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}>
                {(!isSubscribed && !isAdmin) && <Lock className="w-3 h-3 mr-1 opacity-50" />}
                <Target className="w-4 h-4 mr-1" /> 出牌預測
              </button>
              <button onClick={() => setActiveTab('predict_avoid')} className={`flex items-center px-4 py-2 rounded-md transition-colors font-bold text-sm ${activeTab === 'predict_avoid' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}>
                {(!isSubscribed && !isAdmin) && <Lock className="w-3 h-3 mr-1 opacity-50" />}
                <Lightbulb className="w-4 h-4 mr-1" /> 刪牌預測
              </button>
              <button onClick={() => setActiveTab('analysis')} className={`flex items-center px-4 py-2 rounded-md transition-colors font-medium text-sm ${activeTab === 'analysis' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-slate-700'}`}>
                <BarChart3 className="w-4 h-4 mr-2" /> 分析比對
              </button>
              <button onClick={() => setActiveTab('data')} className={`flex items-center px-4 py-2 rounded-md transition-colors font-medium text-sm ${activeTab === 'data' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-slate-700'}`}>
                <Database className="w-4 h-4 mr-2" /> 數據庫
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        
        {/* ==================== 權限阻擋 / 付費牆 ==================== */}
        {(!isSubscribed && !isAdmin && ['global_stats', 'predict_play', 'predict_avoid', 'predict_special', 'predict_extra'].includes(activeTab)) ? renderPaywall() : (
          <>
            {/* ==================== 🏆 全彩種數據評測分頁 ==================== */}
            {activeTab === 'global_stats' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg border border-yellow-200 p-6 overflow-hidden relative">
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-yellow-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
                  <h2 className="text-2xl font-black text-yellow-600 mb-2 flex items-center relative z-10">
                    <Globe className="w-7 h-7 mr-2 text-yellow-500" /> 全彩種量化尋寶儀表板 (刪牌排行榜)
                  </h2>
                  <p className="text-sm text-gray-500 mb-6 font-medium relative z-10">
                    系統已導入<strong>量化尋優空間限制</strong>與<strong>共識模型加權機制</strong>。將為您徹底防禦隨機離群值，掃描出每一個彩種最強、最抗跌的黃金防禦參數！
                  </p>

                  <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-5 mb-6 flex flex-col md:flex-row gap-4 relative z-10">
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-yellow-900 mb-2">🔍 自動尋優區間 (採用對數量化間距)</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min="5" value={globalSearchMin} onChange={(e) => setGlobalSearchMin(parseInt(e.target.value) || 5)} className="w-full px-4 py-3 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-base font-bold text-yellow-900 shadow-sm text-center" />
                        <span className="text-yellow-700 font-bold">~</span>
                        <input type="number" min="5" value={globalSearchMax} onChange={(e) => setGlobalSearchMax(parseInt(e.target.value) || 5)} className="w-full px-4 py-3 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-base font-bold text-yellow-900 shadow-sm text-center" />
                      </div>
                      <p className="text-xs text-yellow-600 mt-2 font-medium">💡 系統會自動取該區間內的對數步長 (例如 10, 20, 30, 50, 100) 進行測試，防堵過度擬合。</p>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-yellow-900 mb-2">🗓️ 樣本外回測驗證期數 (OOS 考驗)</label>
                      <input type="number" min="1" value={globalBacktestCount} onChange={(e) => setGlobalBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-3 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-base font-bold text-yellow-900 shadow-sm" />
                      <p className="text-xs text-yellow-600 mt-2 font-medium">💡 測試集長度越長，所計算出的「量化信賴權重」就越高。</p>
                    </div>
                  </div>

                  <button onClick={handleGenerateGlobalStats} disabled={isGlobalCalculating} className={`w-full px-6 py-4 font-black rounded-xl transition-all shadow-lg flex items-center justify-center text-xl relative z-10 ${isGlobalCalculating ? 'bg-yellow-300 text-yellow-700 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white transform hover:scale-[1.01]'}`}>
                    {isGlobalCalculating ? <RefreshCw className="w-6 h-6 mr-2 animate-spin" /> : <Sparkles className="w-6 h-6 mr-2 animate-bounce text-yellow-100" />}
                    {isGlobalCalculating ? globalProgress || '宇宙級量化運算中，請稍候...' : '開始全彩種自動量化尋優'}
                  </button>

                  {globalStatsError && <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg font-bold border border-red-200 relative z-10">{globalStatsError}</div>}
                </div>

                {globalStatsResult && (
                  <div className="space-y-8 mt-8">
                    {Object.keys(GAME_CONFIG).map(gameKey => {
                      const res = globalStatsResult[gameKey];
                      if (!res) return null;

                      return (
                        <div key={gameKey} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                          <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-xl font-black text-white flex items-center">
                              <Trophy className="w-5 h-5 mr-2 text-yellow-400" />
                              {res.gameName} <span className="text-sm font-medium text-slate-300 ml-3">排行榜 (刪牌)</span>
                            </h3>
                          </div>

                          {res.status === 'Insufficient' ? (
                            <div className="p-8 text-center text-gray-500 font-medium">
                              <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                              此彩種歷史資料庫期數不足，請先至「數據管理」連網自動補充最新資料。
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200">
                                  <tr>
                                    <th className="px-6 py-4 text-center w-24">預測顆數</th>
                                    <th className="px-6 py-4 border-l border-gray-200">🏆 綜合量化評分最高 (勝率偏好)</th>
                                    <th className="px-6 py-4 border-l border-gray-200">🛡️ 綜合量化評分最高 (連破防禦偏好)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {res.stats.map(stat => (
                                    <tr key={stat.n} className="hover:bg-slate-50">
                                      <td className="px-6 py-4 text-center font-black text-lg text-slate-700 bg-slate-50">{stat.n} 顆</td>
                                      <td className="px-6 py-4 border-l border-gray-100">
                                        {stat.bestWinRate ? (
                                          <>
                                            <div className="font-bold text-indigo-700 mb-1 text-base flex flex-wrap items-center">
                                              {ALGO_NAMES_AVOID[stat.bestWinRate.algorithmUsed].split(' (')[0]}
                                              <span className="text-xs font-bold text-white bg-indigo-500 px-2 py-0.5 rounded ml-2 shadow-sm whitespace-nowrap">觀測 {stat.bestWinRate.drawCountUsed} 期</span>
                                            </div>
                                            <div className="text-gray-600 font-medium mt-2">
                                              過關: <span className="text-green-600 font-black">{stat.bestWinRate.successfulPeriods}</span> 場 | 
                                              失敗: <span className="text-red-500 font-black">{stat.bestWinRate.failedPeriods}</span> 場
                                            </div>
                                            <div className="mt-1.5 inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">
                                              樣本外勝率 {stat.bestWinRate.overallAccuracy}%
                                            </div>
                                          </>
                                        ) : <span className="text-gray-400">無法計算</span>}
                                      </td>
                                      <td className="px-6 py-4 border-l border-gray-100">
                                        {stat.bestFailStreak ? (
                                          <>
                                            <div className="font-bold text-rose-700 mb-1 text-base flex flex-wrap items-center">
                                              {ALGO_NAMES_AVOID[stat.bestFailStreak.algorithmUsed].split(' (')[0]}
                                              <span className="text-xs font-bold text-white bg-rose-500 px-2 py-0.5 rounded ml-2 shadow-sm whitespace-nowrap">觀測 {stat.bestFailStreak.drawCountUsed} 期</span>
                                            </div>
                                            <div className="text-gray-600 font-medium mt-2">
                                              最低連破: <span className="text-rose-600 font-black">{stat.bestFailStreak.maxFailStreak}</span> 期
                                            </div>
                                            <div className="mt-1.5 inline-block px-2 py-0.5 bg-rose-50 text-rose-700 rounded text-xs font-bold border border-rose-100">
                                              伴隨勝率 {stat.bestFailStreak.overallAccuracy}%
                                            </div>
                                          </>
                                        ) : <span className="text-gray-400">無法計算</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ==================== ✨ 特碼孤支預測分頁 (Extra) ==================== */}
            {activeTab === 'predict_extra' && (
              currentConfig.drawCount === currentConfig.mainCount ? (
                <div className="bg-white rounded-xl shadow-lg border border-amber-200 p-12 text-center mt-6">
                   <AlertCircle className="w-20 h-20 text-amber-400 mx-auto mb-6" />
                   <h2 className="text-2xl font-black text-gray-800 mb-2">此彩種目前不支援特碼孤支</h2>
                   <p className="text-gray-500 text-lg">【{currentConfig.name}】並無單獨的特別號，請切換至「大樂透」或「六合彩」等彩種來使用此功能。</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-xl font-bold text-amber-900 mb-2 flex items-center">
                      <Zap className="w-6 h-6 mr-2 text-amber-500" /> 全維度 AI 特碼量化預測系統
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">導入大數據樣本顯著性與共識加權機制。系統會自動利用市場波動率與各項指標尋優，幫助您過濾掉噪音，找尋抗跌能力最強的特碼黃金解！</p>
                    
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 mb-6 flex flex-col gap-4">
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-amber-900 mb-2">🎯 1. 預測特碼數？</label>
                          <select value={extraNumberCount} onChange={(e) => setExtraNumberCount(Number(e.target.value))} className="w-full px-4 py-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none text-base font-medium text-amber-900 shadow-sm">
                            {[1, 2, 3, 4, 5].map(num => <option key={num} value={num}>產出 {num} 顆推薦特碼</option>)}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-amber-900 mb-2">🏆 2. 尋找參數首要目標？</label>
                          <select value={extraOptimizeCriterion} onChange={(e) => setExtraOptimizeCriterion(e.target.value)} className="w-full px-4 py-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none text-base font-medium text-amber-900 shadow-sm">
                            <option value="max_hits">💥 追求命中爆發力 (總命中數 + 量化信心)</option>
                            <option value="max_accuracy">🎯 追求穩定勝率 (保底勝率 + 量化信心)</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-amber-900 mb-2">📅 3. 回測截止日 (選填)</label>
                          <input type="date" value={extraEndDate} onChange={(e) => setExtraEndDate(e.target.value)} className="w-full px-4 py-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none text-amber-900 shadow-sm" />
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row gap-4 border-t border-amber-200 pt-4 mt-2">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-amber-900 mb-2">🔍 4. 自動尋優區間 (量化對數步長)</label>
                          <div className="flex items-center gap-2">
                            <input type="number" min="5" value={extraSearchMin} onChange={(e) => setExtraSearchMin(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none font-bold text-amber-900 text-center shadow-sm" />
                            <span className="text-amber-700 font-bold">~</span>
                            <input type="number" min="5" value={extraSearchMax} onChange={(e) => setExtraSearchMax(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none font-bold text-amber-900 text-center shadow-sm" />
                          </div>
                        </div>
                        <div className="flex-1">
                           <label className="block text-sm font-bold text-amber-900 mb-2">🗓️ 5. 樣本外回測期數 (OOS 考驗)</label>
                           <input type="number" min="1" value={extraAutoBacktestCount} onChange={(e) => setExtraAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none font-bold text-amber-900 shadow-sm" />
                        </div>
                      </div>
                    </div>

                    <button onClick={handleSmartExtraPredict} className="w-full px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center text-lg transform hover:scale-[1.01]">
                      <Zap className="w-6 h-6 mr-2 animate-pulse" /> AI 量化動態尋優 12 大特碼模型
                    </button>
                  </div>

                  {extraPredictionResult && (
                    <div className="bg-white rounded-xl shadow-lg border border-amber-200 overflow-hidden mt-6 ring-2 ring-amber-50">
                      {extraPredictionResult.error ? (
                        <div className="p-8 text-center text-red-500"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-300" />{extraPredictionResult.error}</div>
                      ) : (
                        <>
                          {extraPredictionResult.smartMessage && (
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 p-6">
                              <p className="text-amber-800 font-bold whitespace-pre-wrap leading-relaxed flex items-start text-sm">
                                {extraPredictionResult.smartMessage}
                              </p>
                            </div>
                          )}
                          <div className="p-8 bg-white">
                            <div className="text-center mb-6">
                              <div className="inline-block bg-amber-500 text-white px-5 py-2 rounded-full font-bold shadow-md mb-3">
                                👇 根據 {extraPredictionResult.algorithmName.split(' ')[0]} 建議投注的 {extraNumberCount} 顆特碼 👇
                              </div>
                              <div className="text-amber-900 font-extrabold text-lg sm:text-xl bg-amber-50 border border-amber-100 inline-block px-6 py-3 rounded-xl shadow-sm w-full sm:w-auto block mx-auto">
                                🎯 預測目標：{extraPredictionResult.targetDate} (第 {extraPredictionResult.targetPeriod} 期)
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-4 justify-center mb-6">
                              {extraPredictionResult.numbers.map((stat, idx) => (
                                <div key={idx} className="flex flex-col items-center">
                                  <div className="w-20 h-20 flex items-center justify-center rounded-full text-3xl font-black shadow-lg bg-gradient-to-br from-yellow-400 to-amber-500 text-white border-4 border-yellow-200 mb-3 transform hover:scale-110 transition-transform">
                                    {stat.number}
                                  </div>
                                  <span className="text-xs text-gray-500 font-medium">
                                    {extraPredictionResult.algorithmKey === 'consensus' && typeof stat.voteCount !== 'undefined' ? `共識 ${stat.voteCount} 票` : 
                                     extraPredictionResult.algorithmKey === 'trail' && typeof stat.trailCount !== 'undefined' ? `跟隨 ${stat.trailCount} 次` : 
                                     extraPredictionResult.algorithmKey === 'gap' && typeof stat.gapDev !== 'undefined' ? `偏差 ${stat.gapDev.toFixed(1)} 期` : 
                                     `出現 ${stat.count} 次`}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="bg-amber-50 rounded-lg p-5 text-sm text-amber-800 border border-amber-100 max-w-2xl mx-auto mt-6">
                              <p className="font-bold mb-2 flex items-center"><Lightbulb className="w-4 h-4 mr-1 text-yellow-500" /> 演算法邏輯說明</p>
                              <p className="text-amber-700 opacity-90 leading-relaxed">{getPlayAlgoDescription(extraPredictionResult.algorithmKey)}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 進階手動實驗室 (特碼) */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100"><h3 className="text-md font-semibold text-gray-700 flex items-center"><RotateCcw className="w-4 h-4 mr-2 text-amber-400" /> 特碼進階實驗室 (手動指定特定模型與參數)</h3></div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">強制指定演算法模型</label>
                          <select value={extraAlgorithm} onChange={(e) => setExtraAlgorithm(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-200 outline-none bg-gray-50 font-medium">
                            {Object.entries(ALGO_NAMES_PLAY).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">手動指定觀測週期</label>
                          <input type="number" min="1" value={extraDrawCount} onChange={(e) => setExtraDrawCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-200 outline-none bg-gray-50" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">樣本外回測期數</label>
                          <input type="number" min="1" value={extraAutoBacktestCount} onChange={(e) => setExtraAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-200 outline-none bg-gray-50" />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={handleExtraPredict} className="flex-1 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 font-medium rounded-lg transition-colors flex items-center justify-center">僅手動單次預測</button>
                        <button onClick={handleExtraAutoBacktest} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition-colors flex items-center justify-center">執行此模型回測</button>
                        <button onClick={handleExtraOptimizeParameters} className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg transition-colors flex items-center justify-center shadow-sm">自動尋優此模型</button>
                      </div>
                      {extraOptimizationMessage && <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{extraOptimizationMessage}</div>}
                    </div>
                  </div>

                  {/* 回測報告結果 (特碼) */}
                  {extraAutoBacktestResult && !extraAutoBacktestResult.error && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
                      <div className="px-6 py-4 border-b border-gray-100 bg-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <h3 className="font-semibold text-white flex items-center"><RotateCcw className="w-4 h-4 mr-2 text-amber-300" /> {ALGO_NAMES_PLAY[extraAutoBacktestResult.algorithmUsed]} (特碼) 回測報告</h3>
                        <span className="text-sm text-slate-800 bg-yellow-400 px-3 py-1 rounded-full font-bold">特碼勝率：{extraAutoBacktestResult.overallAccuracy}%</span>
                      </div>
                      <div className="p-6 bg-slate-50 border-b border-gray-100 flex flex-wrap justify-around text-center gap-y-4">
                        <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-medium mb-1">回測總期數</p><p className="text-2xl font-bold text-slate-700">{extraAutoBacktestResult.totalTests} 期</p></div>
                        <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">成功命中特碼</p><p className="text-2xl font-bold text-green-500">{extraAutoBacktestResult.successfulPeriods} 期</p></div>
                        <div className="w-1/3 sm:w-auto border-r border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">最高連過</p><p className="text-2xl font-bold text-green-500">{extraAutoBacktestResult.maxSuccessStreak} 期</p></div>
                        <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-medium mb-1">槓龜期數</p><p className="text-2xl font-bold text-red-500">{extraAutoBacktestResult.failedPeriods} 期</p></div>
                        <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">最高連破</p><p className="text-2xl font-bold text-red-400">{extraAutoBacktestResult.maxFailStreak} 期</p></div>
                      </div>
                      
                      <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                        {extraAutoBacktestResult.details.map((res, idx) => (
                          <div key={idx} className="p-4 hover:bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center space-x-2 mb-2">
                                <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{res.date}</span>
                                <span className="text-xs text-slate-500">第 {res.period} 期</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${res.isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{res.isSuccess ? `✅ 命中特碼` : '❌ 槓龜'}</span>
                              </div>
                              <div className="text-sm flex flex-wrap gap-1 items-center">
                                <span className="text-slate-500 inline-block w-20">當期開獎：</span>
                                {res.actualNumbers.map((n, i) => {
                                  const isSpecial = i >= currentConfig.mainCount;
                                  return (
                                    <span key={i} className={`inline-block w-6 text-center font-bold rounded ${isSpecial ? 'bg-yellow-100 text-yellow-700 border border-yellow-300 shadow-sm text-xs py-0.5' : 'text-slate-400 text-sm opacity-60'}`}>{n}</span>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="bg-white border border-amber-100 rounded-lg p-2 text-sm shadow-sm">
                              <span className="text-amber-500 text-xs block mb-1 font-medium">系統推薦特碼 ({extraNumberCount}顆)：</span>
                              <div className="flex gap-1 flex-wrap">
                                {res.predictedNumbers.map(n => {
                                  const isHit = res.hitNumbers.includes(n);
                                  return (<span key={n} className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold border ${isHit ? 'bg-green-500 text-white border-green-600' : 'bg-amber-50 text-amber-500 border-amber-200'}`}>{n}</span>);
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* ==================== 🎲 特殊玩法預測分頁 ==================== */}
            {activeTab === 'predict_special' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg border border-emerald-100 p-6 overflow-hidden relative">
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-emerald-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
                  <h2 className="text-2xl font-black text-emerald-700 mb-2 flex items-center">
                    <Compass className="w-7 h-7 mr-2 text-teal-500" /> AI 特殊量化預測 (總和/生肖)
                  </h2>
                  <p className="text-sm text-gray-500 mb-6 font-medium relative z-10">針對總和大小、單雙、及開獎生肖，運用完整的量化評分引擎與 OOS 測試為您找尋抗跌黃金解。</p>
                  
                  <div className="flex bg-emerald-50 p-1 rounded-lg w-full md:w-max mb-6 shadow-inner border border-emerald-100 relative z-10">
                    {[
                      { id: 'sum_bs', label: '總和大小' },
                      { id: 'sum_oe', label: '總和單雙' },
                      { id: 'zodiac', label: '歷史生肖' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => { 
                          setSpecialMode(m.id); 
                          setSpecialNumberCount(m.id === 'zodiac' ? 3 : 1); 
                          setSpecialPredictionResult(null); 
                          setSpecialAutoBacktestResult(null); 
                          setSpecialOptimizationMessage(''); 
                        }}
                        className={`flex-1 md:w-32 py-2 text-sm font-bold rounded-md transition-all ${specialMode === m.id ? 'bg-white text-emerald-800 shadow-sm border border-emerald-200' : 'text-emerald-600 hover:bg-emerald-100'}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-5 mb-6 flex flex-col gap-4 relative z-10">
                    <div className="flex flex-col md:flex-row gap-4">
                      {specialMode === 'zodiac' && (
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-teal-900 mb-2">🎯 1. 產生幾組生肖預測？</label>
                          <select value={specialNumberCount} onChange={(e) => setSpecialNumberCount(Number(e.target.value))} className="w-full px-4 py-3 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-400 outline-none text-base font-bold text-teal-900 shadow-sm">
                            {[1, 2, 3, 4, 5, 6].map(num => <option key={num} value={num}>精選 {num} 個生肖</option>)}
                          </select>
                        </div>
                      )}
                      {(specialMode === 'sum_bs' || specialMode === 'sum_oe') && (
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-teal-900 mb-2">🎯 1. 預測目標</label>
                          <div className="w-full px-4 py-3 border border-teal-200 rounded-lg bg-teal-100 text-teal-800 font-bold opacity-80 cursor-not-allowed">
                            {specialMode === 'sum_bs' ? '單一結果 (大 或 小)' : '單一結果 (單 或 雙)'}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-teal-900 mb-2">🏆 2. 尋寶首要目標？</label>
                        <select value={specialOptimizeCriterion} onChange={(e) => setSpecialOptimizeCriterion(e.target.value)} className="w-full px-4 py-3 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-400 outline-none text-base font-bold text-teal-900 shadow-sm">
                          <option value="max_accuracy">📈 最常中獎 (保底勝率 + 顯著性加權)</option>
                          <option value="min_fail_streak">🛡️ 最穩防守 (最低連破 + 顯著性加權)</option>
                          <option value="max_hits">💥 最強爆發 (總命中次數 + 顯著性加權)</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-teal-900 mb-2">📅 3. 回測截止日 (選填)</label>
                        <input type="date" value={specialEndDate} onChange={(e) => setSpecialEndDate(e.target.value)} className="w-full px-4 py-3 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-400 outline-none text-teal-900 shadow-sm" />
                      </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-4 border-t border-teal-200 pt-4 mt-2">
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-teal-900 mb-2">🔍 4. 自動尋優區間 (量化對數步長)</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min="5" value={specialSearchMin} onChange={(e) => setSpecialSearchMin(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-400 outline-none font-bold text-teal-900 text-center shadow-sm" />
                          <span className="text-teal-700 font-bold">~</span>
                          <input type="number" min="5" value={specialSearchMax} onChange={(e) => setSpecialSearchMax(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-400 outline-none font-bold text-teal-900 text-center shadow-sm" />
                        </div>
                      </div>
                      <div className="flex-1">
                         <label className="block text-sm font-bold text-teal-900 mb-2">🗓️ 5. 樣本外回測期數 (OOS 考驗)</label>
                         <input type="number" min="1" value={specialAutoBacktestCount} onChange={(e) => setSpecialAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-400 outline-none font-bold text-teal-900 shadow-sm" />
                      </div>
                    </div>
                  </div>

                  <button onClick={handleSmartSpecialPredict} className="w-full px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black rounded-xl transition-all shadow-lg flex items-center justify-center text-xl transform hover:scale-[1.01] relative z-10">
                    <Sparkles className="w-6 h-6 mr-2 animate-pulse text-yellow-300" /> AI 量化尋優 {specialMode === 'sum_bs' ? '大小' : specialMode === 'sum_oe' ? '單雙' : '生肖'} 預測
                  </button>
                </div>

                {specialPredictionResult && (
                  <div className="bg-white rounded-xl shadow-2xl border-2 border-emerald-400 overflow-hidden mt-6">
                    {specialPredictionResult.error ? (
                      <div className="p-8 text-center text-red-500"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-300" />{specialPredictionResult.error}</div>
                    ) : (
                      <>
                        {specialPredictionResult.smartMessage && (
                          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 p-6">
                            <p className="text-emerald-800 font-bold whitespace-pre-wrap leading-relaxed flex items-start text-sm">
                              {specialPredictionResult.smartMessage}
                            </p>
                          </div>
                        )}
                        <div className="p-8 bg-white">
                          <div className="text-center mb-8">
                            <div className="inline-block bg-emerald-600 text-white px-6 py-2.5 rounded-full font-black shadow-lg mb-4 text-lg border-2 border-emerald-400">
                              🎯 根據【{specialPredictionResult.algorithmName.split(' ')[0]}】建議投注的 {specialMode === 'zodiac' ? `${specialNumberCount} 個生肖` : `結果`} 🎯
                            </div>
                            <div className="text-emerald-900 font-extrabold text-lg sm:text-xl bg-emerald-50 border-2 border-emerald-100 inline-block px-6 py-3 rounded-xl shadow-sm w-full sm:w-auto block mx-auto">
                              預測目標：{specialPredictionResult.targetDate} (第 {specialPredictionResult.targetPeriod} 期)
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4 justify-center mb-8">
                            {specialPredictionResult.numbers && specialPredictionResult.numbers.map((stat, idx) => (
                              <div key={idx} className="flex flex-col items-center">
                                <div className="w-24 h-24 flex items-center justify-center rounded-2xl text-5xl font-black shadow-[0_0_15px_rgba(16,185,129,0.4)] bg-gradient-to-br from-emerald-400 to-teal-600 text-white border-4 border-emerald-100 mb-3 transform hover:scale-105 transition-transform">
                                  {stat.outcome}
                                </div>
                                <span className="text-xs text-gray-500 font-bold">
                                  {specialPredictionResult.algorithmKey === 'consensus' && typeof stat.voteCount !== 'undefined' ? `共識 ${stat.voteCount} 票` : 
                                   specialPredictionResult.algorithmKey === 'trail' && typeof stat.trailCount !== 'undefined' ? `歷史跟隨 ${stat.trailCount} 次` : 
                                   `出現 ${stat.count} 次`}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="bg-teal-50 rounded-lg p-5 text-sm text-teal-900 border border-teal-100 max-w-2xl mx-auto mt-6">
                            <p className="font-bold mb-2 flex items-center"><Compass className="w-4 h-4 mr-1 text-teal-500" /> 特殊預測演算法邏輯</p>
                            <p className="text-teal-700 opacity-90 leading-relaxed font-medium">{getSpecialAlgoDescription(specialPredictionResult.algorithmKey)}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 進階實驗室 (特殊玩法) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-100"><h3 className="text-md font-bold text-gray-700 flex items-center"><RotateCcw className="w-4 h-4 mr-2 text-emerald-500" /> 特殊玩法進階實驗室 (手掌握微調參數)</h3></div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">強制指定演算法模型</label>
                        <select value={specialAlgorithm} onChange={(e) => setSpecialAlgorithm(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-200 outline-none bg-gray-50 font-medium">
                          {Object.entries(ALGO_NAMES_SPECIAL).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">手動指定觀測週期</label>
                        <input type="number" min="1" value={specialDrawCount} onChange={(e) => setSpecialDrawCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-200 outline-none bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">樣本外回測期數</label>
                        <input type="number" min="1" value={specialAutoBacktestCount} onChange={(e) => setSpecialAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-200 outline-none bg-gray-50" />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={handleSpecialPredict} className="flex-1 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded-lg transition-colors flex items-center justify-center shadow-sm">僅手動單次預測</button>
                      <button onClick={handleSpecialAutoBacktest} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors flex items-center justify-center shadow-sm">執行此模型回測</button>
                      <button onClick={handleSpecialOptimizeParameters} className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg transition-colors flex items-center justify-center shadow-sm">自動量化尋優此模型</button>
                    </div>
                    {specialOptimizationMessage && <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm font-bold whitespace-pre-wrap leading-relaxed shadow-sm">{specialOptimizationMessage}</div>}
                  </div>
                </div>

                {/* 回測報告 (特殊玩法) */}
                {specialAutoBacktestResult && !specialAutoBacktestResult.error && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-gray-100 bg-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="font-bold text-white flex items-center">
                        <RotateCcw className="w-4 h-4 mr-2 text-emerald-400" /> {ALGO_NAMES_SPECIAL[specialAutoBacktestResult.algorithmUsed]} ({specialMode === 'sum_bs' ? '大小' : specialMode === 'sum_oe' ? '單雙' : '生肖'}) 回測報告
                      </h3>
                      <span className="text-sm text-emerald-900 bg-emerald-400 px-3 py-1 rounded-full font-black shadow-sm">
                        期數勝率: {specialAutoBacktestResult.overallAccuracy}%
                      </span>
                    </div>
                    <div className="p-6 bg-slate-50 border-b border-gray-100 flex flex-wrap justify-around text-center gap-y-4">
                      <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-bold mb-1">回測長度</p><p className="text-2xl font-black text-slate-700">{specialAutoBacktestResult.totalTests} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-bold mb-1">成功命中</p><p className="text-2xl font-black text-emerald-600">{specialAutoBacktestResult.successfulPeriods} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-r border-gray-200 px-2"><p className="text-xs text-slate-500 font-bold mb-1">最高連過</p><p className="text-2xl font-black text-emerald-500">{specialAutoBacktestResult.maxSuccessStreak} 期</p></div>
                      <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-bold mb-1">失敗槓龜</p><p className="text-2xl font-black text-slate-400">{specialAutoBacktestResult.failedPeriods} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-bold mb-1">最高連破</p><p className="text-2xl font-black text-slate-500">{specialAutoBacktestResult.maxFailStreak} 期</p></div>
                    </div>
                    
                    {specialAutoBacktestResult.failStreakCounts && Object.keys(specialAutoBacktestResult.failStreakCounts).length > 0 && (
                      <div className="bg-slate-100 border-b border-slate-200 p-3 flex flex-wrap items-center justify-center gap-2 text-sm">
                        <span className="text-slate-700 font-bold flex items-center mr-2"><AlertCircle className="w-4 h-4 mr-1 text-slate-500" /> 歷史連破次數統計：</span>
                        {Object.entries(specialAutoBacktestResult.failStreakCounts).sort((a, b) => Number(a[0]) - Number(b[0])).map(([streak, count]) => (
                          <span key={streak} className="bg-white border border-slate-300 text-slate-600 px-2 py-1 rounded shadow-sm font-medium">
                            連破 {streak} 期: <span className="font-black text-slate-700">{count}</span> 次
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                      {specialAutoBacktestResult.details.map((res, idx) => (
                        <div key={idx} className="p-4 hover:bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{res.date}</span>
                              <span className="text-xs text-slate-500 font-medium">第 {res.period} 期</span>
                              <span className={`text-xs font-black px-2 py-0.5 rounded ${res.isSuccess ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-500'}`}>
                                {res.isSuccess ? '🎉 命中' : '❌ 槓龜'}
                              </span>
                            </div>
                            <div className="text-sm flex flex-wrap items-center gap-2">
                              <span className="text-slate-500 font-medium">當期主支：</span>
                              {res.actualNumbers.slice(0, currentConfig.mainCount).map(n => <span key={n} className="inline-block text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{n}</span>)}
                              <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold text-xs">
                                {specialMode === 'sum_bs' ? `總和 ${res.targetProps.sum} (${res.targetProps.sum_bs})` : specialMode === 'sum_oe' ? `總和 ${res.targetProps.sum} (${res.targetProps.sum_oe})` : res.targetProps.zodiacs.join(', ')}
                              </span>
                            </div>
                          </div>
                          <div className="bg-white border border-slate-200 rounded-lg p-2 text-sm shadow-sm">
                            <span className="text-emerald-600 text-xs block mb-1 font-bold">系統建議投注：</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {res.predictedOutcomes.map(o => {
                                const isHit = res.hitOutcomes.includes(o);
                                return (
                                  <span key={o} className={`px-2 py-1 rounded text-xs font-black ${isHit ? 'bg-emerald-500 text-white shadow-md border border-emerald-600' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{o}</span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 出牌預測分頁 (Play) ==================== */}
            {activeTab === 'predict_play' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="text-xl font-bold text-rose-900 mb-2 flex items-center">
                    <Target className="w-6 h-6 mr-2 text-rose-500" /> 全維度 AI 量化出牌預測
                  </h2>
                  <p className="text-sm text-gray-500 mb-6">導入大數據樣本顯著性與共識加權機制。設定出牌數後，AI 將掃描 12 大模型，為您擷取抗跌能力最強的「黃金解」並預測下一期出牌！</p>
                  
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-5 mb-6 flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-rose-900 mb-2">🎯 1. 預測出牌數？</label>
                        <select value={playNumberCount} onChange={(e) => setPlayNumberCount(Number(e.target.value))} className="w-full px-4 py-3 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 outline-none text-base font-medium text-rose-900 shadow-sm">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map(num => <option key={num} value={num}>產出 {num} 顆推薦號碼</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-rose-900 mb-2">🏆 2. 尋找參數首要目標？</label>
                        <select value={playOptimizeCriterion} onChange={(e) => setPlayOptimizeCriterion(e.target.value)} className="w-full px-4 py-3 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 outline-none text-base font-medium text-rose-900 shadow-sm">
                          <option value="max_hits">💥 追求總命中期望值 (累積中獎主支 + 量化權重)</option>
                          <option value="max_accuracy_1">🎯 追求穩定勝率 (保底中 1 支機率 + 量化權重)</option>
                          <option value="max_accuracy_2">🎯 追求穩定勝率 (保底中 2 支機率 + 量化權重)</option>
                          <option value="max_accuracy_3">🎯 追求穩定勝率 (保底中 3 支機率 + 量化權重)</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-rose-900 mb-2">📅 3. 回測截止日 (選填)</label>
                        <input type="date" value={playEndDate} onChange={(e) => setPlayEndDate(e.target.value)} className="w-full px-4 py-3 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 outline-none text-rose-900 shadow-sm" />
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 border-t border-rose-200 pt-4 mt-2">
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-rose-900 mb-2">🔍 4. 自動尋優區間 (量化對數步長)</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min="5" value={playSearchMin} onChange={(e) => setPlaySearchMin(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 outline-none font-bold text-rose-900 text-center shadow-sm" />
                          <span className="text-rose-700 font-bold">~</span>
                          <input type="number" min="5" value={playSearchMax} onChange={(e) => setPlaySearchMax(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 outline-none font-bold text-rose-900 text-center shadow-sm" />
                        </div>
                      </div>
                      <div className="flex-1">
                         <label className="block text-sm font-bold text-rose-900 mb-2">🗓️ 5. 樣本外回測期數 (OOS 考驗)</label>
                         <input type="number" min="1" value={playAutoBacktestCount} onChange={(e) => setPlayAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 outline-none font-bold text-rose-900 shadow-sm" />
                      </div>
                    </div>
                  </div>

                  <button onClick={handleSmartPlayPredict} className="w-full px-6 py-4 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center text-lg transform hover:scale-[1.01]">
                    <Sparkles className="w-6 h-6 mr-2 animate-pulse" /> AI 量化動態尋優 12 大出牌模型
                  </button>
                </div>

                {playPredictionResult && (
                  <div className="bg-white rounded-xl shadow-lg border border-rose-100 overflow-hidden mt-6 ring-2 ring-rose-50">
                    {playPredictionResult.error ? (
                      <div className="p-8 text-center text-red-500"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-300" />{playPredictionResult.error}</div>
                    ) : (
                      <>
                        {playPredictionResult.smartMessage && (
                          <div className="bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-200 p-6">
                            <p className="text-rose-800 font-bold whitespace-pre-wrap leading-relaxed flex items-start text-sm">
                              {playPredictionResult.smartMessage}
                            </p>
                          </div>
                        )}
                        <div className="p-8 bg-white">
                          <div className="text-center mb-6">
                            <div className="inline-block bg-rose-600 text-white px-5 py-2 rounded-full font-bold shadow-md mb-3">
                              👇 根據 {playPredictionResult.algorithmName.split(' ')[0]} 建議投注的 {playNumberCount} 顆號碼 👇
                            </div>
                            <div className="text-rose-900 font-extrabold text-lg sm:text-xl bg-rose-50 border border-rose-100 inline-block px-6 py-3 rounded-xl shadow-sm w-full sm:w-auto block mx-auto">
                              🎯 預測目標：{playPredictionResult.targetDate} (第 {playPredictionResult.targetPeriod} 期)
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4 justify-center mb-6">
                            {playPredictionResult.numbers.map((stat, idx) => (
                              <div key={idx} className="flex flex-col items-center">
                                <div className="w-20 h-20 flex items-center justify-center rounded-full text-3xl font-black shadow-lg bg-gradient-to-br from-red-500 to-rose-600 text-white border-4 border-rose-200 mb-3 transform hover:scale-110 transition-transform">
                                  {stat.number}
                                </div>
                                <span className="text-xs text-gray-500 font-medium">
                                  {playPredictionResult.algorithmKey === 'consensus' && typeof stat.voteCount !== 'undefined' ? `共識 ${stat.voteCount} 票` : 
                                   playPredictionResult.algorithmKey === 'trail' && typeof stat.trailCount !== 'undefined' ? `跟隨 ${stat.trailCount} 次` : 
                                   playPredictionResult.algorithmKey === 'gap' && typeof stat.gapDev !== 'undefined' ? `偏差 ${stat.gapDev.toFixed(1)} 期` : 
                                   `出現 ${stat.count} 次`}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="bg-rose-50 rounded-lg p-5 text-sm text-rose-800 border border-rose-100 max-w-2xl mx-auto mt-6">
                            <p className="font-bold mb-2 flex items-center"><Lightbulb className="w-4 h-4 mr-1 text-yellow-500" /> 演算法邏輯說明</p>
                            <p className="text-rose-700 opacity-90 leading-relaxed">{getPlayAlgoDescription(playPredictionResult.algorithmKey)}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 進階手動實驗室 (出牌) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-100"><h3 className="text-md font-semibold text-gray-700 flex items-center"><RotateCcw className="w-4 h-4 mr-2 text-rose-400" /> 進階實驗室 (手動指定特定模型與參數)</h3></div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">強制指定演算法模型</label>
                        <select value={playAlgorithm} onChange={(e) => setPlayAlgorithm(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-200 outline-none bg-gray-50 font-medium">
                          {Object.entries(ALGO_NAMES_PLAY).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">手動指定觀測週期</label>
                        <input type="number" min="1" value={playDrawCount} onChange={(e) => setPlayDrawCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-200 outline-none bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">樣本外回測期數</label>
                        <input type="number" min="1" value={playAutoBacktestCount} onChange={(e) => setPlayAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-200 outline-none bg-gray-50" />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={handlePlayPredict} className="flex-1 px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 font-medium rounded-lg transition-colors flex items-center justify-center">僅手動單次預測</button>
                      <button onClick={handlePlayAutoBacktest} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition-colors flex items-center justify-center">執行此模型回測</button>
                      <button onClick={handlePlayOptimizeParameters} className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg transition-colors flex items-center justify-center shadow-sm">自動量化尋優此模型</button>
                    </div>
                    {playOptimizationMessage && <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{playOptimizationMessage}</div>}
                  </div>
                </div>

                {/* 回測報告結果 (出牌) */}
                {playAutoBacktestResult && !playAutoBacktestResult.error && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-gray-100 bg-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="font-semibold text-white flex items-center"><RotateCcw className="w-4 h-4 mr-2 text-rose-300" /> {ALGO_NAMES_PLAY[playAutoBacktestResult.algorithmUsed]} 回測報告</h3>
                      <span className="text-sm text-slate-800 bg-yellow-400 px-3 py-1 rounded-full font-bold">至少中一球機率：{playAutoBacktestResult.overallAccuracy}%</span>
                    </div>
                    <div className="p-6 bg-slate-50 border-b border-gray-100 flex flex-wrap justify-around text-center gap-y-4">
                      <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-medium mb-1">回測總期數</p><p className="text-2xl font-bold text-slate-700">{playAutoBacktestResult.totalTests} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">命中總球數</p><p className="text-2xl font-bold text-green-600">{playAutoBacktestResult.totalHits} 顆</p></div>
                      <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">有中獎期數</p><p className="text-2xl font-bold text-green-500">{playAutoBacktestResult.successfulPeriods} 期</p></div>
                      <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-medium mb-1">槓龜期數</p><p className="text-2xl font-bold text-red-500">{playAutoBacktestResult.failedPeriods} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">最高連破</p><p className="text-2xl font-bold text-red-400">{playAutoBacktestResult.maxFailStreak} 期</p></div>
                    </div>
                    
                    {/* === 命中球數分佈 === */}
                    {playAutoBacktestResult.hitDistribution && (
                      <div className="bg-green-50 border-b border-green-100 p-3 flex flex-wrap items-center justify-center gap-2 text-sm">
                        <span className="text-green-800 font-bold flex items-center mr-2"><Trophy className="w-4 h-4 mr-1" /> 命中球數分佈 (僅計算主支)：</span>
                        {playAutoBacktestResult.hitDistribution.map((count, hits) => {
                          if (hits === 0 || count === 0) return null;
                          return (
                            <span key={hits} className="bg-white border border-green-200 text-green-700 px-2 py-1 rounded shadow-sm font-medium">
                              中 {hits} 支: <span className="font-black">{count}</span> 期
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                      {playAutoBacktestResult.details.map((res, idx) => (
                        <div key={idx} className="p-4 hover:bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{res.date}</span>
                              <span className="text-xs text-slate-500">第 {res.period} 期</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${res.isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{res.isSuccess ? `✅ 命中 ${res.hitNumbers.length} 支` : '❌ 槓龜'}</span>
                            </div>
                            <div className="text-sm flex flex-wrap gap-1 items-center">
                              <span className="text-slate-500 inline-block w-20">當期開獎：</span>
                              {res.actualNumbers.map((n, i) => {
                                const isSpecial = i >= currentConfig.mainCount;
                                return (
                                  <span key={i} className={`inline-block w-6 text-center font-bold rounded ${isSpecial ? 'bg-yellow-100 text-yellow-700 border border-yellow-300 shadow-sm text-xs py-0.5' : 'text-slate-700 text-sm'}`}>{n}</span>
                                );
                              })}
                            </div>
                          </div>
                          <div className="bg-white border border-slate-100 rounded-lg p-2 text-sm shadow-sm">
                            <span className="text-rose-400 text-xs block mb-1 font-medium">系統推薦出牌 ({playNumberCount}顆)：</span>
                            <div className="flex gap-1 flex-wrap">
                              {res.predictedNumbers.map(n => {
                                const isHit = res.hitNumbers.includes(n);
                                return (<span key={n} className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold border ${isHit ? 'bg-green-500 text-white border-green-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{n}</span>);
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 分析比對分頁 ==================== */}
            {activeTab === 'analysis' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2 flex items-center"><Target className="w-5 h-5 mr-2 text-indigo-500" /> 我要對獎 / 買法回測</h2>
                  <div className="mb-6 bg-indigo-50 p-4 rounded-lg">
                    <p className="text-sm text-indigo-800 mb-3 font-medium">請輸入您的號碼組合 (最多 15 顆)，系統將為您比對歷史開獎結果，並計算如果每期都買這組號碼的「中獎機率」與「連敗紀錄」！</p>
                    <div className="flex flex-wrap gap-2">
                      {myNumbers.map((num, idx) => (
                        <input key={`my-num-${idx}`} type="number" min="1" max={currentConfig.maxNum} value={num} onChange={(e) => handleMyNumberChange(idx, e.target.value)} className="w-12 h-12 text-center font-bold rounded-lg border-2 border-indigo-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all" placeholder="-" />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm text-gray-500 mb-1">過濾起始日 (可選)</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-indigo-500 outline-none" /></div>
                    <div><label className="block text-sm text-gray-500 mb-1">過濾結束日 (可選)</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-indigo-500 outline-none" /></div>
                  </div>
                </div>

                {analysisResult && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center"><p className="text-gray-500 text-sm mb-1">分析期數</p><p className="text-3xl font-bold text-indigo-600">{analysisResult.totalDraws}</p></div>
                      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center"><p className="text-gray-500 text-sm mb-1">完全沒中 (0顆)</p><p className="text-3xl font-bold text-gray-700">{analysisResult.loseCount}</p><p className="text-xs text-gray-400 mt-1">機率 {((analysisResult.loseCount / analysisResult.totalDraws) * 100).toFixed(1)}%</p></div>
                      <div className="bg-white p-5 rounded-xl shadow-sm border border-green-100 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-green-50 rounded-bl-full -z-10"></div>
                        <p className="text-green-600 text-sm mb-1 font-medium">至少中 2 支 (不含特)</p><p className="text-3xl font-bold text-green-600">{analysisResult.matchAtLeast[2]}</p><p className="text-xs text-green-500 mt-1">機率 {((analysisResult.matchAtLeast[2] / analysisResult.totalDraws) * 100).toFixed(1)}%</p>
                      </div>
                      <div className="bg-white p-5 rounded-xl shadow-sm border border-yellow-100 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-50 rounded-bl-full -z-10"></div>
                        <p className="text-yellow-600 text-sm mb-1 font-medium">至少中 3 支 (不含特)</p><p className="text-3xl font-bold text-yellow-600">{analysisResult.matchAtLeast[3]}</p><p className="text-xs text-yellow-500 mt-1">機率 {((analysisResult.matchAtLeast[3] / analysisResult.totalDraws) * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-700">詳細比對清單</h3>
                        <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="text-sm px-3 py-1 bg-white border rounded hover:bg-gray-50 flex items-center shadow-sm">
                          {sortOrder === 'desc' ? <><ArrowDown className="w-4 h-4 mr-1"/> 從新到舊</> : <><ArrowUp className="w-4 h-4 mr-1"/> 從舊到新</>}
                        </button>
                      </div>
                      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                        {analysisResult.details.map(draw => (
                          <div key={draw.id} className={`p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors ${draw.isWin ? 'bg-green-50/30' : ''}`}>
                            <div className="mb-2 sm:mb-0">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className="text-sm font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded">{draw.date}</span><span className="text-sm text-gray-500">第 {draw.period} 期</span>
                              </div>
                              <div className="flex gap-2">
                                {draw.numbers.map((num, idx) => {
                                  const isSpecial = idx >= currentConfig.mainCount;
                                  const isMatched = isSpecial ? draw.matchedSpecial.includes(num) : draw.matchedMain.includes(num);
                                  
                                  return (
                                    <span key={idx} className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold border 
                                      ${isMatched ? (isSpecial ? 'bg-yellow-500 text-white border-yellow-600 shadow-md transform scale-110' : 'bg-green-500 text-white border-green-600 shadow-md transform scale-110') : 
                                      (isSpecial ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-gray-50 text-gray-400 border-gray-200')}`}>
                                      {num}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="self-end sm:self-auto flex items-center">
                              {draw.isWin ? (
                                <span className="flex items-center bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">
                                  <CheckCircle2 className="w-4 h-4 mr-1" /> 中 {draw.matchedMain.length} 支 {draw.matchedSpecial.length > 0 ? `+ ${draw.matchedSpecial.length}特` : ''}
                                </span>
                              ) : (
                                <span className="flex items-center text-gray-400 px-3 py-1 text-sm"><XCircle className="w-4 h-4 mr-1" /> 槓龜</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ==================== 刪牌分頁 (避免) ==================== */}
            {activeTab === 'predict_avoid' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="text-xl font-bold text-indigo-900 mb-2 flex items-center">
                    <Lightbulb className="w-6 h-6 mr-2 text-indigo-500" /> 全維度 AI 量化刪牌預測
                  </h2>
                  <p className="text-sm text-gray-500 mb-6">導入大數據樣本顯著性與共識加權機制。AI 將自動運用市場波動率尋優，過濾掉噪音，為您擷取歷史防禦最強的「唯一防禦黃金解」並立刻預測不出牌！</p>
                  
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-6 flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-indigo-900 mb-2">🎯 1. 預測不出牌數？</label>
                        <select value={avoidNumberCount} onChange={(e) => setAvoidNumberCount(Number(e.target.value))} className="w-full px-4 py-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none text-base font-medium text-indigo-900 shadow-sm">
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map(num => <option key={num} value={num}>產出 {num} 顆不出牌</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-indigo-900 mb-2">🏆 2. 尋找參數首要目標？</label>
                        <select value={avoidOptimizeCriterion} onChange={(e) => setAvoidOptimizeCriterion(e.target.value)} className="w-full px-4 py-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none text-base font-medium text-indigo-900 shadow-sm">
                          <option value="min_fail_streak">🛡️ 最穩定 (連破最低 + 顯著性加權)</option>
                          <option value="max_accuracy">📈 最精準 (整體勝率 + 顯著性加權)</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-indigo-900 mb-2">📅 3. 回測截止日 (選填)</label>
                        <input type="date" value={avoidEndDate} onChange={(e) => setAvoidEndDate(e.target.value)} className="w-full px-4 py-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none text-indigo-900 shadow-sm" />
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 border-t border-indigo-200 pt-4 mt-2">
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-indigo-900 mb-2">🔍 4. 自動尋優區間 (量化對數步長)</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min="5" value={avoidSearchMin} onChange={(e) => setAvoidSearchMin(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none font-bold text-indigo-900 text-center shadow-sm" />
                          <span className="text-indigo-700 font-bold">~</span>
                          <input type="number" min="5" value={avoidSearchMax} onChange={(e) => setAvoidSearchMax(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none font-bold text-indigo-900 text-center shadow-sm" />
                        </div>
                      </div>
                      <div className="flex-1">
                         <label className="block text-sm font-bold text-indigo-900 mb-2">🗓️ 5. 樣本外回測期數 (OOS 考驗)</label>
                         <input type="number" min="1" value={avoidAutoBacktestCount} onChange={(e) => setAvoidAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none font-bold text-indigo-900 shadow-sm" />
                      </div>
                    </div>
                  </div>

                  <button onClick={handleSmartAvoidPredict} className="w-full px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center text-lg transform hover:scale-[1.01]">
                    <Sparkles className="w-6 h-6 mr-2 animate-pulse" /> AI 量化動態尋優 12 大刪牌模型
                  </button>
                </div>

                {avoidPredictionResult && (
                  <div className="bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden mt-6 ring-2 ring-indigo-50">
                    {avoidPredictionResult.error ? (
                      <div className="p-8 text-center text-red-500"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-300" />{avoidPredictionResult.error}</div>
                    ) : (
                      <>
                        {avoidPredictionResult.smartMessage && (
                          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200 p-6">
                            <p className="text-indigo-800 font-bold whitespace-pre-wrap leading-relaxed flex items-start text-sm">
                              {avoidPredictionResult.smartMessage}
                            </p>
                          </div>
                        )}
                        <div className="p-8 bg-white">
                          <div className="text-center mb-6">
                            <div className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-full font-bold shadow-md mb-3">
                              👇 根據 {avoidPredictionResult.algorithmName.split(' ')[0]} 建議避開的 {avoidNumberCount} 顆號碼 👇
                            </div>
                            <div className="text-indigo-900 font-extrabold text-lg sm:text-xl bg-indigo-50 border border-indigo-100 inline-block px-6 py-3 rounded-xl shadow-sm w-full sm:w-auto block mx-auto">
                              🎯 預測目標：{avoidPredictionResult.targetDate} (第 {avoidPredictionResult.targetPeriod} 期)
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4 justify-center mb-6">
                            {avoidPredictionResult.numbers.map((stat, idx) => (
                              <div key={idx} className="flex flex-col items-center">
                                <div className="w-20 h-20 flex items-center justify-center rounded-full text-3xl font-black shadow-lg bg-slate-800 text-white border-4 border-slate-200 mb-3 transform hover:scale-110 transition-transform">
                                  {stat.number}
                                </div>
                                <span className="text-xs text-gray-500 font-medium">
                                  {avoidPredictionResult.algorithmKey === 'consensus' && typeof stat.voteCount !== 'undefined' ? `共識 ${stat.voteCount} 票` : 
                                   avoidPredictionResult.algorithmKey === 'trail' && typeof stat.trailCount !== 'undefined' ? `跟隨 ${stat.trailCount} 次` : 
                                   avoidPredictionResult.algorithmKey === 'gap' && typeof stat.gapDev !== 'undefined' ? `偏差 ${stat.gapDev.toFixed(1)} 期` : 
                                   `出現 ${stat.count} 次`}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="bg-indigo-50 rounded-lg p-5 text-sm text-indigo-800 border border-indigo-100 max-w-2xl mx-auto mt-6">
                            <p className="font-bold mb-2 flex items-center"><Lightbulb className="w-4 h-4 mr-1 text-yellow-500" /> 演算法邏輯說明</p>
                            <p className="text-indigo-700 opacity-90 leading-relaxed">{getAvoidAlgoDescription(avoidPredictionResult.algorithmKey)}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 進階手動實驗室 (刪牌) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-100"><h3 className="text-md font-semibold text-gray-700 flex items-center"><RotateCcw className="w-4 h-4 mr-2 text-indigo-400" /> 進階實驗室 (手動指定特定模型與參數)</h3></div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">強制指定演算法模型</label>
                        <select value={avoidAlgorithm} onChange={(e) => setAvoidAlgorithm(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none bg-gray-50 font-medium">
                          {Object.entries(ALGO_NAMES_AVOID).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">手動指定觀測週期</label>
                        <input type="number" min="1" value={avoidDrawCount} onChange={(e) => setAvoidDrawCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">樣本外回測期數</label>
                        <input type="number" min="1" value={avoidAutoBacktestCount} onChange={(e) => setAvoidAutoBacktestCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none bg-gray-50" />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={handleAvoidPredict} className="flex-1 px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium rounded-lg transition-colors flex items-center justify-center">僅手動單次預測</button>
                      <button onClick={handleAvoidAutoBacktest} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition-colors flex items-center justify-center">執行此模型回測</button>
                      <button onClick={handleAvoidOptimizeParameters} className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg transition-colors flex items-center justify-center shadow-sm">自動量化尋優此模型</button>
                    </div>
                    {avoidOptimizationMessage && <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{avoidOptimizationMessage}</div>}
                  </div>
                </div>

                {/* 回測報告結果 (刪牌) */}
                {avoidAutoBacktestResult && !avoidAutoBacktestResult.error && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-gray-100 bg-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="font-semibold text-white flex items-center"><RotateCcw className="w-4 h-4 mr-2 text-indigo-300" /> {ALGO_NAMES_AVOID[avoidAutoBacktestResult.algorithmUsed]} 回測報告</h3>
                      <span className="text-sm text-slate-800 bg-yellow-400 px-3 py-1 rounded-full font-bold">期數準確率：{avoidAutoBacktestResult.overallAccuracy}%</span>
                    </div>
                    <div className="p-6 bg-slate-50 border-b border-gray-100 flex flex-wrap justify-around text-center gap-y-4">
                      <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-medium mb-1">回測總期數</p><p className="text-2xl font-bold text-slate-700">{avoidAutoBacktestResult.totalTests} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">成功 (完全避開)</p><p className="text-2xl font-bold text-green-600">{avoidAutoBacktestResult.successfulPeriods} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-r border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">最高連過</p><p className="text-2xl font-bold text-green-500">{avoidAutoBacktestResult.maxSuccessStreak} 期</p></div>
                      <div className="w-1/3 sm:w-auto"><p className="text-xs text-slate-500 font-medium mb-1">失敗 (中≥1顆)</p><p className="text-2xl font-bold text-red-500">{avoidAutoBacktestResult.failedPeriods} 期</p></div>
                      <div className="w-1/3 sm:w-auto border-l border-gray-200 px-2"><p className="text-xs text-slate-500 font-medium mb-1">最高連破</p><p className="text-2xl font-bold text-red-400">{avoidAutoBacktestResult.maxFailStreak} 期</p></div>
                    </div>
                    
                    {/* === 連破次數分佈統計 === */}
                    {avoidAutoBacktestResult.failStreakCounts && Object.keys(avoidAutoBacktestResult.failStreakCounts).length > 0 && (
                      <div className="bg-red-50 border-b border-red-100 p-3 flex flex-wrap items-center justify-center gap-2 text-sm">
                        <span className="text-red-800 font-bold flex items-center mr-2"><AlertCircle className="w-4 h-4 mr-1" /> 歷史連破次數統計：</span>
                        {Object.entries(avoidAutoBacktestResult.failStreakCounts).sort((a, b) => Number(a[0]) - Number(b[0])).map(([streak, count]) => (
                          <span key={streak} className="bg-white border border-red-200 text-red-600 px-2 py-1 rounded shadow-sm font-medium">
                            連破 {streak} 期: <span className="font-black text-red-700">{count}</span> 次
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                      {avoidAutoBacktestResult.details.map((res, idx) => (
                        <div key={idx} className="p-4 hover:bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{res.date}</span>
                              <span className="text-xs text-slate-500">第 {res.period} 期</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${res.isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{res.isSuccess ? '✅ 成功避開' : '❌ 預測破功'}</span>
                            </div>
                            <div className="text-sm flex flex-wrap gap-1 items-center">
                              <span className="text-slate-500 inline-block w-20">當期開獎：</span>
                              {res.actualNumbers.map((n, i) => {
                                const isSpecial = i >= currentConfig.mainCount;
                                return (
                                  <span key={i} className={`inline-block w-6 text-center font-bold rounded ${isSpecial ? 'bg-yellow-100 text-yellow-700 border border-yellow-300 shadow-sm text-xs py-0.5' : 'text-slate-700 text-sm'}`}>{n}</span>
                                );
                              })}
                            </div>
                          </div>
                          <div className="bg-white border border-slate-100 rounded-lg p-2 text-sm shadow-sm">
                            <span className="text-indigo-400 text-xs block mb-1 font-medium">系統預測不出牌 ({avoidNumberCount}顆)：</span>
                            <div className="flex gap-1 flex-wrap">
                              {res.predictedNumbers.map(n => {
                                const isFailed = res.failedNumbers.includes(n);
                                return (<span key={n} className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${isFailed ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{n}</span>);
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 數據管理分頁 ==================== */}
            {activeTab === 'data' && (
              <div className="space-y-6">

                {/* 👇 加入 isAdmin 判斷，包住手動新增區塊 */}
                {isAdmin && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2 flex items-center"><Plus className="w-5 h-5 mr-2 text-indigo-500" /> 新增開獎結果 (管理員專用)</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div><label className="block text-sm text-gray-500 mb-1">開獎日期</label><input type="date" value={newDrawDate} onChange={(e) => setNewDrawDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-indigo-500 outline-none" /></div>
                      <div><label className="block text-sm text-gray-500 mb-1">期數 (如: 115000075)</label><input type="text" value={newDrawPeriod} onChange={(e) => setNewDrawPeriod(e.target.value)} placeholder="請輸入期數" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-indigo-500 outline-none" /></div>
                    </div>
                    <div className="mb-6">
                      <label className="block text-sm text-gray-500 mb-2">開獎號碼 (共 {currentConfig.drawCount} 個，前 {currentConfig.mainCount} 個為主支)</label>
                      <div className="flex flex-wrap gap-3">
                        {newDrawNumbers.map((num, idx) => {
                          const isSpecial = idx >= currentConfig.mainCount;
                          return (
                            <div key={`new-num-${idx}`} className="relative">
                              <input 
                                type="number" 
                                min="1" 
                                max={currentConfig.maxNum} 
                                value={num} 
                                onChange={(e) => handleNewDrawNumberChange(idx, e.target.value)} 
                                className={`w-14 h-14 text-center text-xl font-bold rounded-full border-2 focus:outline-none transition-all ${isSpecial ? 'border-yellow-400 focus:border-yellow-600 bg-yellow-50' : 'border-gray-200 focus:border-indigo-500'}`} 
                                placeholder={isSpecial ? '特' : '-'} 
                              />
                              {isSpecial && <span className="absolute -top-2 -right-1 bg-yellow-500 text-white text-[10px] font-bold px-1 rounded">特別號</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {dataError && <div className={`mb-4 p-3 rounded-lg text-sm ${dataError === '✅ 已成功清空公共歷史數據！' || dataError === '✅ 新增成功！(已安全同步至公共雲端)' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{dataError}</div>}
                    <button onClick={handleAddNewDraw} className="w-full sm:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center">
                      <Plus className="w-4 h-4 mr-2" /> 儲存這期開獎資料
                    </button>
                  </div>
                )}

                {/* 👇 加入 isAdmin 判斷，包住匯入與備份區塊 */}
                {isAdmin && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setShowImport(!showImport)}>
                      <h3 className="font-semibold text-gray-700 flex items-center"><FileText className="w-5 h-5 mr-2 text-indigo-500" /> 萬能文字批次匯入 / 備份歷史數據</h3>
                      {showImport ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                    </div>
                    {showImport && (
                      <div className="p-6 border-t border-gray-100">
                        <div className="flex flex-col md:flex-row gap-6">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">貼上文字自動解析 (支援 Excel 或網頁直接全選複製)</label>
                            <p className="text-xs text-gray-500 mb-2">無須精準排版，系統會自動無視中文與雜亂符號，精準尋找：<code className="bg-gray-100 px-1 py-0.5 rounded">日期 + {currentConfig.drawCount}顆球號</code></p>
                            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} className="w-full h-32 px-4 py-3 text-sm border rounded-lg focus:ring-2 focus:border-indigo-500 outline-none resize-none font-mono" placeholder="直接將網頁或 Excel 內容整片貼上來吧！" />
                            {importMessage.text && <div className={`mt-2 p-3 rounded-lg text-sm font-bold ${importMessage.type === 'success' ? 'bg-green-50 text-green-700' : importMessage.type === 'info' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>{importMessage.text}</div>}
                            <button onClick={handleParseImport} className="mt-3 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg flex items-center"><Upload className="w-4 h-4 mr-2" /> 開始解析並匯入</button>
                          </div>
                          <div className="w-full md:w-64 flex flex-col border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">備份數據</label>
                            <button onClick={handleExportData} className="w-full px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm font-medium rounded-lg flex items-center justify-center"><Download className="w-4 h-4 mr-2" /> 下載備份檔 (.json)</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="flex items-center gap-4">
                      <h3 className="font-semibold text-gray-700 flex items-center"><Database className="w-5 h-5 mr-2 text-indigo-500" /> 已儲存的歷史資料庫</h3>
                      <span className="text-sm text-gray-500">共 {historicalData.length} 筆</span>
                    </div>
                    {/* 隱藏一鍵清空按鈕 */}
                    {historicalData.length > 0 && isAdmin && (
                      confirmDeleteAll ? (
                        <div className="flex items-center space-x-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 self-end sm:self-auto">
                          <span className="text-sm text-red-600 font-bold mr-1">確定清空全部？(不可恢復)</span>
                          <button onClick={handleDeleteAllData} className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 transition-colors shadow-sm">確定清空</button>
                          <button onClick={() => setConfirmDeleteAll(false)} className="px-3 py-1 bg-white text-gray-600 text-xs font-bold rounded border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">取消</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteAll(true)} className="text-sm px-3 py-1.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg font-bold transition-colors flex items-center shadow-sm self-end sm:self-auto">
                          <Trash2 className="w-4 h-4 mr-1" /> 一鍵清空數據
                        </button>
                      )
                    )}
                  </div>
                  <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                    {isDataLoading ? <div className="p-12 text-center text-indigo-500">正在同步雲端數據...</div> : historicalData.length === 0 ? <div className="p-8 text-center text-gray-500">目前沒有任何歷史資料</div> : (
                      historicalData.map(draw => (
                        <div key={draw.id} className="p-4 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50">
                          <div className="mb-3 sm:mb-0">
                            <div className="flex items-center space-x-3 mb-2">
                              <span className="text-sm font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded">{draw.date}</span><span className="text-sm text-gray-500">第 {draw.period} 期</span>
                            </div>
                            <div className="flex gap-2">
                              {draw.numbers.map((num, idx) => {
                                const isSpecial = idx >= currentConfig.mainCount;
                                return (
                                  <span key={idx} className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold border ${isSpecial ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-sm relative' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                                    {num}
                                    {isSpecial && <span className="absolute -top-1 -right-2 text-[8px] bg-yellow-500 text-white px-1 rounded-full scale-75">特</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          <div className="self-end sm:self-auto mt-2 sm:mt-0">
                            {/* 👇 加上 isAdmin 判斷 */}
                            {isAdmin && (
                              confirmDeleteId === draw.id ? (
                                <div className="flex items-center space-x-2 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                                  <span className="text-sm text-red-600 font-medium mr-1">確定刪除？</span>
                                  <button onClick={() => handleDeleteDraw(draw.id)} className="px-3 py-1 bg-red-500 text-white text-xs rounded">刪除</button>
                                  <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-1 bg-white text-gray-600 text-xs rounded border">取消</button>
                                </div>
                              ) : (<button onClick={() => setConfirmDeleteId(draw.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-5 h-5" /></button>)
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}