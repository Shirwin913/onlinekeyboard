import { noteMapping, availableSounds } from "./utils/constants.js";

let audioCtx = null;

const audioBuffers = {}; // pid -> sound -> Map(note number -> AudioBuffer)
const playingSources = {}; // pid -> note -> {src, gainNode}
const polySources = {}; // pid -> note -> { A:{src,gain}, B:{src,gain} }

const soundSettings = {};
const sharedBuffers = {}; // sound -> Map(note number -> AudioBuffer)
const allAudioLoaded = {}; // pid -> sound -> boolean

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

async function loadAudioFilesForSound(pid, sound) {
  initAudioContext();
  if (allAudioLoaded[pid]?.[sound]) return;

  if (!audioBuffers[pid]) audioBuffers[pid] = {};
  if (!playingSources[pid]) playingSources[pid] = {};
  if (!polySources[pid]) polySources[pid] = {};
  if (!allAudioLoaded[pid]) allAudioLoaded[pid] = {};

  if (!sharedBuffers[sound]) {
    sharedBuffers[sound] = new Map();
    const promises = Object.entries(noteMapping).map(async ([note, num]) => {
      const ext = "mp3"; // ⭐ 改為一律使用 mp3
      try {
        const res = await fetch(`./samples/${sound}/piano_${note}.${ext}`);
        if (!res.ok) throw new Error(`找不到檔案 piano_${note}.${ext}`);
        const ab = await res.arrayBuffer();
        const buf = await audioCtx.decodeAudioData(ab);
        sharedBuffers[sound].set(num, buf);
      } catch (e) {
        console.warn(`載入 ${sound} 的 piano_${note}.${ext} 失敗：`, e);
      }
    });
    await Promise.all(promises);
  }

  audioBuffers[pid][sound] = new Map();
  sharedBuffers[sound].forEach((buf, num) => {
    audioBuffers[pid][sound].set(num, buf);
  });

  allAudioLoaded[pid][sound] = true;
}

function mapVelocityToFrequency(velocity) {
  const minFreq = 500;
  const maxFreq = 16000;
  const clampedVel = Math.max(1, Math.min(velocity, 127));
  const norm = (clampedVel - 1) / 126;
  return minFreq * Math.pow(maxFreq / minFreq, norm);
}

function playSound(note, pid, velocity) {
  initAudioContext();
  const sound = soundSettings[pid]?.sound;
  if (!sound || !allAudioLoaded[pid]?.[sound]) return;

  if (
    (sound === "cello" || sound === "violin" || sound === "Trombone") &&
    soundSettings[pid].sustain
  ) {
    playPolyCelloNote(note, pid, velocity);
    return;
  }

  stopSound(note, pid);

  const buffer = audioBuffers[pid][sound]?.get(note);
  if (!buffer) return;

  const src = audioCtx.createBufferSource();
  src.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = mapVelocityToFrequency(velocity);

  const gainNode = audioCtx.createGain();
  const baseVolume = (velocity / 127) * soundSettings[pid].volume;
  gainNode.gain.value = Math.min(baseVolume, 1);

  src.connect(filter).connect(gainNode).connect(audioCtx.destination);
  src.start();

  playingSources[pid][note] = { src, gainNode };
}

function stopSound(note, pid) {
  const sound = soundSettings[pid]?.sound;

  if (
    (sound === "cello" || sound === "violin" || sound === "Trombone") &&
    soundSettings[pid].sustain
  ) {
    stopPolyCelloNote(note, pid);
    return;
  }

  const obj = playingSources[pid]?.[note];
  if (obj) {
    const { src, gainNode } = obj;

    try {
      const fadeTime = 0.3;
      const now = audioCtx.currentTime;

      if (gainNode) {
        const startGain = Math.max(gainNode.gain.value, 0.0001);
        gainNode.gain.setValueAtTime(startGain, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
        src.stop(now + fadeTime + 0.02);
      } else {
        src.stop();
      }
    } catch {}

    delete playingSources[pid][note];
  }
}

function playPolyCelloNote(note, pid, velocity) {
  stopPolyCelloNote(note, pid);

  const sound = soundSettings[pid]?.sound;
  const buffer = audioBuffers[pid][sound]?.get(note);
  if (!buffer) return;

  if (!polySources[pid][note]) {
    polySources[pid][note] = { A: null, B: null };
  }

  const nodes = polySources[pid][note];

  // 分析緩衝區以找到更好的循環點
  const bufferDuration = buffer.duration;
  
  // 深入分析緩衝區找到最佳循環點
  const attackDuration = analyzeBestAttackDuration(buffer);
  
  // 透過緩衝區分析找到更精確的循環點
  const { bestLoopStart, bestLoopEnd } = findOptimalLoopPoints(buffer, attackDuration);
  
  // 使用分析結果作為循環點
  const loopStart = bestLoopStart;
  const loopEnd = bestLoopEnd;
  
  // 確保長度足夠進行交叉淡變
  const hasSufficientLength = (loopEnd - loopStart) > 1.5;

  const volume = Math.min((velocity / 127) * soundSettings[pid].volume, 1);
  const cutoff = mapVelocityToFrequency(velocity);
  
  // 為每個音符添加隨機種子，確保多個相同音符同時播放時有差異
  const randomSeed = Math.random();
  // 更小的音高變化，減少衝突
  const pitchVariation = 1.0 + (randomSeed * 0.0008 - 0.0004); // ±0.04% 音高变化
  
  // A 片段 - 初始起音部分
  const srcA = audioCtx.createBufferSource();
  srcA.buffer = buffer;
  srcA.playbackRate.value = pitchVariation;

  // 降低起音部分的瞬態響應
  const compressorA = audioCtx.createDynamicsCompressor();
  compressorA.threshold.value = -24;
  compressorA.knee.value = 10;
  compressorA.ratio.value = 12;
  compressorA.attack.value = 0.003;
  compressorA.release.value = 0.25;

  const filterA = audioCtx.createBiquadFilter();
  filterA.type = "lowpass";
  filterA.frequency.value = cutoff;
  filterA.Q.value = 0.7; // 減少共振

  const gainA = audioCtx.createGain();
  gainA.gain.value = volume;

  srcA.connect(compressorA).connect(filterA).connect(gainA).connect(audioCtx.destination);
  srcA.start(audioCtx.currentTime);
  
  // 如果樣本太短，跳過循環設置
  if (!hasSufficientLength) {
    nodes.A = { src: srcA, gain: gainA };
    return;
  }

  // B 片段（循環）
  const srcB = audioCtx.createBufferSource();
  srcB.buffer = buffer;
  srcB.loop = true;
  srcB.loopStart = loopStart;
  srcB.loopEnd = loopEnd;
  
  // 對循環部分應用輕微不同的音高變化
  const loopPitchVariation = pitchVariation * (1 + (Math.random() * 0.0002 - 0.0001));
  srcB.playbackRate.value = loopPitchVariation;

  // 為循環部分也添加壓縮，平滑循環點處的瞬態
  const compressorB = audioCtx.createDynamicsCompressor();
  compressorB.threshold.value = -24;
  compressorB.knee.value = 10;
  compressorB.ratio.value = 12;
  compressorB.attack.value = 0.003;
  compressorB.release.value = 0.25;

  const filterB = audioCtx.createBiquadFilter();
  filterB.type = "lowpass";
  filterB.frequency.value = cutoff * 0.95; // 循環部分略微暗一些
  filterB.Q.value = 0.7;

  const gainB = audioCtx.createGain();
  gainB.gain.value = 0;

  // 增加一個DC過濾器防止可能的DC偏移
  const dcFilterB = audioCtx.createBiquadFilter();
  dcFilterB.type = "highpass";
  dcFilterB.frequency.value = 20; // 過濾20Hz以下的內容
  dcFilterB.Q.value = 0.7;

  srcB.connect(compressorB).connect(filterB).connect(dcFilterB).connect(gainB).connect(audioCtx.destination);

  // 開始B段略微提前，以確保無縫過渡
  const crossfadeDuration = 1.6; // 延長交叉淡變
  // 提前開始B片段以便有更多重疊
  const startTimeB = audioCtx.currentTime + loopStart - 0.1; 
  srcB.start(startTimeB, loopStart);

  // 使用等功率交叉淡變曲線進行更自然的過渡
  const steps = 100; // 更多步驟，更平滑的曲線
  const now = audioCtx.currentTime;
  
  // 設定初始值
  gainA.gain.setValueAtTime(volume, now);
  gainB.gain.setValueAtTime(0, startTimeB);
  
  // 建立交叉淡變曲線點
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const time = startTimeB + t * crossfadeDuration;
    
    // S形等功率交叉淡變曲線，較平滑的過渡
    const fadeOutValue = sCurveEqualPower(t) * volume;
    const fadeInValue = sCurveEqualPower(1-t) * volume;
    
    gainA.gain.linearRampToValueAtTime(fadeOutValue, time);
    gainB.gain.linearRampToValueAtTime(fadeInValue, time);
  }

  // 交叉淡變後的最終清理
  gainA.gain.setValueAtTime(0, startTimeB + crossfadeDuration + 0.01);
  
  nodes.A = { src: srcA, gain: gainA };
  nodes.B = { src: srcB, gain: gainB };
}

// 改良的等功率交叉淡變曲線，使用S曲線
function sCurveEqualPower(x) {
  // 使用S曲線函數，其中x在0到1之間
  // 這比簡單的cos更平滑
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  
  // 使用更平滑的S型曲線，特別優化循環點附近的漸變
  const smoothedX = 0.5 - 0.5 * Math.cos(x * Math.PI);
  return Math.cos(smoothedX * Math.PI / 2);
}

// 分析buffer找出最佳起音時長
function analyzeBestAttackDuration(buffer) {
  const audioData = buffer.getChannelData(0); // 使用第一個聲道數據
  const samples = audioData.length;
  const sampleRate = buffer.sampleRate;
  
  // 預設起音時長（如果分析失敗）
  const defaultAttackDuration = Math.min(2.0, buffer.duration * 0.3);
  
  try {
    // 尋找峰值位置
    let maxSample = 0;
    let peakIndex = 0;
    
    // 只檢查前1/3的緩衝區，這通常包含起音部分
    const searchLimit = Math.floor(samples / 3);
    
    for (let i = 0; i < searchLimit; i++) {
      const absValue = Math.abs(audioData[i]);
      if (absValue > maxSample) {
        maxSample = absValue;
        peakIndex = i;
      }
    }
    
    // 在峰值之後找出幅度降低到峰值的X%的點
    const thresholdPercent = 0.5; // 降到高峰的50%
    const threshold = maxSample * thresholdPercent;
    
    let attackEndIndex = peakIndex;
    // 從峰值向前搜尋合適的起音結束點
    for (let i = peakIndex; i < searchLimit; i++) {
      if (Math.abs(audioData[i]) <= threshold) {
        attackEndIndex = i;
        break;
      }
    }
    
    // 轉換成秒
    let attackDuration = (attackEndIndex / sampleRate) + 0.2; // 新增200ms緩衝
    
    // 確保起音持續時間在合理範圍內
    attackDuration = Math.max(0.5, Math.min(attackDuration, buffer.duration * 0.5));
    
    return attackDuration;
  } catch (e) {
    console.warn("分析起音时长失败，使用默认值", e);
    return defaultAttackDuration;
  }
}

// 尋找最佳循環點
function findOptimalLoopPoints(buffer, attackDuration) {
  const audioData = buffer.getChannelData(0);
  const samples = audioData.length;
  const sampleRate = buffer.sampleRate;
  
  // 預設循環點
  const defaultLoopStart = attackDuration;
  const defaultLoopEnd = buffer.duration - 0.2;
  
  try {
    // 起音之後的持續部分開始點（範例索引）
    const sustainStartIndex = Math.floor(attackDuration * sampleRate);
    
    // 緩衝區結尾安全區域之前的點
    const safeEndIndex = Math.floor((buffer.duration - 0.2) * sampleRate);
    
    if (safeEndIndex - sustainStartIndex < sampleRate) {
      // 如果持續部分太短，直接使用預設值
      return { bestLoopStart: defaultLoopStart, bestLoopEnd: defaultLoopEnd };
    }
    
    // 在持續部分尋找最接近零交叉的點作為循環起點
    let bestStartIndex = sustainStartIndex;
    let minStartDiff = Math.abs(audioData[sustainStartIndex]);
    
    // 在起始點附近搜尋±1000個樣本以找到更好的零交叉點
    const searchRange = 1000;
    const searchStart = Math.max(0, sustainStartIndex - searchRange);
    const searchEnd = Math.min(samples - 1, sustainStartIndex + searchRange);
    
    for (let i = searchStart; i < searchEnd; i++) {
      // 檢查是否為正向零交叉點（從負到正）
      if (i > 0 && audioData[i-1] <= 0 && audioData[i] >= 0) {
        const diff = Math.abs(audioData[i]);
        if (diff < minStartDiff) {
          minStartDiff = diff;
          bestStartIndex = i;
        }
      }
    }
    
    // 循環結束點：尋找與循環起點相似的波形區域，為了平滑過渡
    // 從安全結束點向前搜索
    let bestEndIndex = safeEndIndex;
    let minEndDifference = Number.MAX_VALUE;
    
    // 定義一個小視窗來比較波形片段
    const windowSize = Math.floor(0.02 * sampleRate); // 20ms窗口
    
    // 在安全結束點附近搜尋±2000個樣本以找到與起點相似的區域
    const endSearchStart = Math.max(bestStartIndex + sampleRate, safeEndIndex - 2000);
    const endSearchEnd = Math.min(samples - windowSize - 1, safeEndIndex + 2000);
    
    for (let i = endSearchStart; i < endSearchEnd; i++) {
      let totalDiff = 0;
      
      // 比較視窗內的波形形狀
      for (let j = 0; j < windowSize; j++) {
        totalDiff += Math.abs(audioData[bestStartIndex + j] - audioData[i + j]);
      }
      
      const avgDiff = totalDiff / windowSize;
      
      if (avgDiff < minEndDifference) {
        minEndDifference = avgDiff;
        bestEndIndex = i;
      }
    }
    
    // 將樣本索引轉換回秒
    const bestLoopStart = bestStartIndex / sampleRate;
    const bestLoopEnd = bestEndIndex / sampleRate;
    
    // 驗證循環點是否合理
    if (bestLoopEnd <= bestLoopStart || bestLoopEnd - bestLoopStart < 0.5) {
      return { bestLoopStart: defaultLoopStart, bestLoopEnd: defaultLoopEnd };
    }
    
    return { bestLoopStart, bestLoopEnd };
  } catch (e) {
    console.warn("查找最佳循环点失败，使用默认值", e);
    return { bestLoopStart: defaultLoopStart, bestLoopEnd: defaultLoopEnd };
  }
}

// 修改停止函數，使用更長的淡出時間防止爆音
function stopPolyCelloNote(note, pid) {
  const nodes = polySources[pid]?.[note];
  if (!nodes) return;

  const now = audioCtx.currentTime;

  ["A", "B"].forEach((k) => {
    const entry = nodes[k];
    if (!entry) return;

    const { src, gain } = entry;

    try {
      // 取消任何先前計劃的值更改
      gain.gain.cancelScheduledValues(now);

      // 更長的淡出時間，特別是對於B節點（循環部分）
      const fadeOutTime = k === "B" ? 0.15 : 0.08;
      
      // 取得當前增益
      const currentGain = gain.gain.value;
      
      // 防止gain為0
      if (currentGain > 0.0001) {
        gain.gain.setValueAtTime(currentGain, now);
        // 使用曲線淡出而不是線性淡出
        gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutTime);
      } else {
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.00001, now + fadeOutTime);
      }

      // 在淡出完成后停止源
      src.stop(now + fadeOutTime + 0.01);
    } catch (e) {
      console.warn("停止音符时出错", e);
      try { src.stop(); } catch {}
    }

    nodes[k] = null;
  });
}

function unloadAudioForPiano(pid) {
  if (playingSources[pid]) {
    Object.values(playingSources[pid]).forEach((obj) => {
      try {
        obj.src.stop();
      } catch {}
    });
    delete playingSources[pid];
  }

  if (polySources[pid]) {
    Object.entries(polySources[pid]).forEach(([note, nodes]) => {
      ["A", "B"].forEach((k) => {
        if (nodes[k]) {
          try {
            nodes[k].src.stop();
          } catch {}
        }
      });
    });
    delete polySources[pid];
  }

  if (audioBuffers[pid]) delete audioBuffers[pid];
  delete soundSettings[pid];
  delete allAudioLoaded[pid];
}

export {
  playSound,
  stopSound,
  stopPolyCelloNote,
  loadAudioFilesForSound,
  unloadAudioForPiano,
  soundSettings,
  allAudioLoaded,
  audioBuffers,
};