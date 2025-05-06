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

  playingSources[pid][note] = { src, gainNode };
}

function stopSound(note, pid) {
  const sound = soundSettings[pid]?.sound;

  if (sound === "cello" && soundSettings[pid].sustain) {
    stopPolyCelloNote(note, pid);
    return;
  }

  const obj = playingSources[pid]?.[note];
  if (obj) {
    const { src, gainNode } = obj;

    try {
      const fadeTime = 0.1; // 100ms fade-out
      const now = audioCtx.currentTime;

      if (gainNode) {
        // 防止從 0 開始 exponential ramp（會報錯）
        const startGain = Math.max(gainNode.gain.value, 0.0001);
        gainNode.gain.setValueAtTime(startGain, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);

        src.stop(now + fadeTime + 0.02); // 稍微延遲
      } else {
        src.stop();
      }
    } catch {}

    delete playingSources[pid][note];
  }
}

// ----- Cello Polyphonic Cross-Fade 播放 -----

function findZeroCrossing(buffer, startTime, searchWidth = 0.5) {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.min(
    channelData.length - 1,
    Math.floor((startTime + searchWidth) * sampleRate)
  );

  for (let i = startSample; i < endSample - 1; i++) {
    if (channelData[i] <= 0 && channelData[i + 1] > 0) {
      return i / sampleRate;
    }
  }

  return startTime;
}

function playPolyCelloNote(note, pid, velocity) {
  stopPolyCelloNote(note, pid);

  const buffer = audioBuffers[pid]["cello"]?.get(note);
  if (!buffer) return;

  if (!polySources[pid][note]) {
    polySources[pid][note] = { A: null, B: null };
  }

  const nodes = polySources[pid][note];

  const defaultStart = 2.5;
  const loopStart = findZeroCrossing(buffer, defaultStart, 0.5);
  const loopEnd = buffer.duration;

  const srcA = audioCtx.createBufferSource();
  srcA.buffer = buffer;

  const gainA = audioCtx.createGain();
  const volume = Math.min((velocity / 127) * soundSettings[pid].volume, 1);
  gainA.gain.value = volume;

  srcA.connect(gainA).connect(audioCtx.destination);
  srcA.start(audioCtx.currentTime);

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

  const FADE = 0.5;
  gainA.gain.setValueAtTime(volume, startTimeB - 0.05);
  gainA.gain.linearRampToValueAtTime(0, startTimeB + FADE);

  gainB.gain.setValueAtTime(0, startTimeB - 0.05);
  gainB.gain.linearRampToValueAtTime(volume, startTimeB + FADE);

  nodes.A = { src: srcA, gain: gainA };
  nodes.B = { src: srcB, gain: gainB };
}

function stopPolyCelloNote(note, pid) {
  const nodes = polySources[pid]?.[note];
  if (!nodes) return;

  ["A", "B"].forEach((k) => {
    if (nodes[k]) {
      const { src, gain } = nodes[k];

      try {
        const fadeTime = 0.1; // 100ms
        const now = audioCtx.currentTime;

        // 防止起始值為 0（exponential ramp 不接受 0）
        const startGain = Math.max(gain.gain.value, 0.0001);
        gain.gain.setValueAtTime(startGain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);

        // 設定 stop 時間，等 fade 結束後
        src.stop(now + fadeTime + 0.02);
      } catch (e) {
        // 如果 stop 失敗就硬切
        try {
          src.stop();
        } catch {}
      }

      nodes[k] = null;
    }
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
  loadAudioFilesForSound,
  unloadAudioForPiano,
  soundSettings,
  allAudioLoaded,
};
