import { noteMapping, availableSounds } from "./utils/constants.js";

let audioCtx = null;

const audioBuffers = {}; // pid -> sound -> Map(note number -> AudioBuffer)
const playingSources = {}; // pid -> note -> AudioBufferSourceNode（一般音色）
const polySources = {}; // pid -> note -> { A:{src,gain}, B:{src,gain} }（cello sustain 專用）

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
      const res = await fetch(`./samples/${sound}/piano_${note}.wav`);
      const ab = await res.arrayBuffer();
      const buf = await audioCtx.decodeAudioData(ab);
      sharedBuffers[sound].set(num, buf);
    });
    await Promise.all(promises);
  }

  audioBuffers[pid][sound] = new Map();
  sharedBuffers[sound].forEach((buf, num) => {
    audioBuffers[pid][sound].set(num, buf);
  });

  allAudioLoaded[pid][sound] = true;
}

function playSound(note, pid, velocity) {
  initAudioContext();
  const sound = soundSettings[pid]?.sound;
  if (!sound || !allAudioLoaded[pid]?.[sound]) return;

  // cello + sustain → polyphonic cross-fade 播放
  if (sound === "cello" && soundSettings[pid].sustain) {
    playPolyCelloNote(note, pid, velocity);
    return;
  }

  stopSound(note, pid); // 停止上一個

  const buffer = audioBuffers[pid][sound]?.get(note);
  if (!buffer) return;

  const src = audioCtx.createBufferSource();
  src.buffer = buffer;

  const gainNode = audioCtx.createGain();
  const baseVolume = (velocity / 127) * soundSettings[pid].volume;
  gainNode.gain.value = Math.min(baseVolume, 1);

  src.connect(gainNode).connect(audioCtx.destination);
  src.start();

  playingSources[pid][note] = src;
}

function stopSound(note, pid) {
  const sound = soundSettings[pid]?.sound;

  // cello sustain → 停止 polyphonic 播放
  if (sound === "cello" && soundSettings[pid].sustain) {
    stopPolyCelloNote(note, pid);
    return;
  }

  const src = playingSources[pid]?.[note];
  if (src) {
    try {
      src.stop();
    } catch {}
    delete playingSources[pid][note];
  }
}

// ----- Cello Polyphonic Cross-Fade 播放 -----

function findZeroCrossing(buffer, startTime, searchWidth = 0.5) {
  const channelData = buffer.getChannelData(0); // 取第 0 聲道
  const sampleRate = buffer.sampleRate;

  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.min(
    channelData.length - 1,
    Math.floor((startTime + searchWidth) * sampleRate)
  );

  for (let i = startSample; i < endSample - 1; i++) {
    // 判斷：前後樣本一正一負，表示 crossing
    if (channelData[i] <= 0 && channelData[i + 1] > 0) {
      return i / sampleRate; // 轉回秒
    }
  }

  // 沒找到就用原來的 startTime
  return startTime;
}

function playPolyCelloNote(note, pid, velocity) {
  stopPolyCelloNote(note, pid); // 停止之前的

  const buffer = audioBuffers[pid]["cello"]?.get(note);
  if (!buffer) return;

  if (!polySources[pid][note]) {
    polySources[pid][note] = { A: null, B: null };
  }

  const nodes = polySources[pid][note];

  // ----- 自動尋找 loopStart -----
  const defaultStart = 2.5; // 預設嘗試 2.5 秒
  const loopStart = findZeroCrossing(buffer, defaultStart, 0.5); // 在 2.5~3 秒間找最佳點
  const loopEnd = buffer.duration;

  // ----- Source A：起始播放 -----
  const srcA = audioCtx.createBufferSource();
  srcA.buffer = buffer;

  const gainA = audioCtx.createGain();
  const volume = Math.min((velocity / 127) * soundSettings[pid].volume, 1);
  gainA.gain.value = volume;

  srcA.connect(gainA).connect(audioCtx.destination);
  srcA.start(audioCtx.currentTime);

  // ----- Source B：loop 播放 + cross-fade -----
  const srcB = audioCtx.createBufferSource();
  srcB.buffer = buffer;
  srcB.loop = true;

  srcB.loopStart = loopStart;
  srcB.loopEnd = loopEnd;

  const gainB = audioCtx.createGain();
  gainB.gain.value = 0;

  srcB.connect(gainB).connect(audioCtx.destination);

  const startTimeB = audioCtx.currentTime + loopStart;

  srcB.start(startTimeB, loopStart);

  // ----- Cross-Fade -----
  const FADE = 0.5;
  gainA.gain.setValueAtTime(volume, startTimeB - 0.05);
  gainA.gain.linearRampToValueAtTime(0, startTimeB + FADE);

  gainB.gain.setValueAtTime(0, startTimeB - 0.05);
  gainB.gain.linearRampToValueAtTime(volume, startTimeB + FADE);

  // 儲存
  nodes.A = { src: srcA, gain: gainA };
  nodes.B = { src: srcB, gain: gainB };
}

function stopPolyCelloNote(note, pid) {
  const nodes = polySources[pid]?.[note];
  if (!nodes) return;

  ["A", "B"].forEach((k) => {
    if (nodes[k]) {
      try {
        nodes[k].src.stop();
      } catch {}
      nodes[k] = null;
    }
  });
}

function unloadAudioForPiano(pid) {
  // 停止一般播放
  if (playingSources[pid]) {
    Object.values(playingSources[pid]).forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    delete playingSources[pid];
  }

  // 停止 cello polyphonic 播放
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
  loadAudioFilesForSound,
  unloadAudioForPiano,
  soundSettings,
  allAudioLoaded,
};
