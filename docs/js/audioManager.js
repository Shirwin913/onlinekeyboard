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
<<<<<<< HEAD
      const ext = "mp3"; // ⭐ 改為一律使用 mp3
=======
      let ext = "mp3";
      if (
        sound === "piano" ||
        sound === "pipeorgan" ||
        sound === "cello" ||
        sound === "cello-1"
      ) {
        ext = "wav";
      }
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
      try {
        const res = await fetch(`./samples/${sound}/piano_${note}.${ext}`);
        if (!res.ok) throw new Error(`找不到檔案 piano_${note}.${ext}`);
        const ab = await res.arrayBuffer();
        const buf = await audioCtx.decodeAudioData(ab);
        sharedBuffers[sound].set(num, buf);
      } catch (e) {
        console.warn(`載入 ${sound} 的 piano_${note}.${ext} 失敗：`, e);
<<<<<<< HEAD
=======
        // 沒有這個音就跳過
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
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

<<<<<<< HEAD
  if (
    (sound === "cello" || sound === "violin" || sound === "Trombone") &&
    soundSettings[pid].sustain
  ) {
=======
  if (sound === "cello" && soundSettings[pid].sustain) {
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
    stopPolyCelloNote(note, pid);
    return;
  }

  const obj = playingSources[pid]?.[note];
  if (obj) {
    const { src, gainNode } = obj;

    try {
<<<<<<< HEAD
      const fadeTime = 0.3;
=======
      const fadeTime = 0.3; // 100ms fade-out
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
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

<<<<<<< HEAD
// Equal power crossfade curve function (better than linear crossfade)
function equalPowerCrossfade(x) {
  // Where x goes from 0 to 1, this returns values for fading out the first sound
  // For the second sound's volume, use 1-x as input
  return Math.cos(x * Math.PI / 2);
=======
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
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
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

<<<<<<< HEAD
  // Analyze buffer to find better loop points
  // For this version we'll use more conservative values based on experimentation
  const bufferDuration = buffer.duration;
  // Initial attack portion (typically first 1-2 seconds, but varies by instrument)
  const attackDuration = Math.min(2.0, bufferDuration * 0.3);
  // Leave some buffer at the end to avoid clicks
  const tailBuffer = 0.2;
  
  // The loopStart should be after the initial attack but with enough sustain material
  const loopStart = attackDuration;
  const loopEnd = bufferDuration - tailBuffer;
  
  // Skip the crossfade if the sample is too short
  const hasSufficientLength = (loopEnd - loopStart) > 1.0;

  const volume = Math.min((velocity / 127) * soundSettings[pid].volume, 1);
  const cutoff = mapVelocityToFrequency(velocity);
  
  // Add subtle variations to make it more natural
  const pitchVariation = 1.0 + (Math.random() * 0.001 - 0.0005); // ±0.05% pitch variation
  
  // A segment - initial attack portion
=======
  const defaultStart = 2.5;
  const loopStart = findZeroCrossing(buffer, defaultStart, 0.5);
  const loopEnd = buffer.duration;

>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
  const srcA = audioCtx.createBufferSource();
  srcA.buffer = buffer;
  srcA.playbackRate.value = pitchVariation;

  const filterA = audioCtx.createBiquadFilter();
  filterA.type = "lowpass";
  filterA.frequency.value = cutoff;

  const gainA = audioCtx.createGain();
  gainA.gain.value = volume;

  srcA.connect(filterA).connect(gainA).connect(audioCtx.destination);
  srcA.start(audioCtx.currentTime);
  
  // Skip the loop setup if the sample is too short
  if (!hasSufficientLength) {
    nodes.A = { src: srcA, gain: gainA };
    return;
  }

<<<<<<< HEAD
  // B segment (loop)
=======
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
  const srcB = audioCtx.createBufferSource();
  srcB.buffer = buffer;
  srcB.loop = true;
  srcB.loopStart = loopStart;
  srcB.loopEnd = loopEnd;
  // Apply slightly different pitch variation to the loop for natural evolution
  srcB.playbackRate.value = pitchVariation * (1 + (Math.random() * 0.0004 - 0.0002));

  const filterB = audioCtx.createBiquadFilter();
  filterB.type = "lowpass";
  filterB.frequency.value = cutoff;

  const gainB = audioCtx.createGain();
  gainB.gain.value = 0;

  srcB.connect(filterB).connect(gainB).connect(audioCtx.destination);

  // Start B segment slightly before the crossfade to ensure seamless transition
  const crossfadeDuration = 1.2; // Slightly shorter crossfade
  const startTimeB = audioCtx.currentTime + loopStart - 0.05; // Overlap slightly
  srcB.start(startTimeB, loopStart);

<<<<<<< HEAD
  // Use equal power crossfade curve for more natural transition
  const steps = 50; // For smoother curve approximation
  const now = audioCtx.currentTime;
  
  // Set initial values
  gainA.gain.setValueAtTime(volume, now);
  gainB.gain.setValueAtTime(0, startTimeB);
  
  // Create crossfade curve points
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const time = startTimeB + t * crossfadeDuration;
    
    // Equal power crossfade curve
    const fadeOutValue = equalPowerCrossfade(t) * volume;
    const fadeInValue = equalPowerCrossfade(1-t) * volume;
    
    gainA.gain.linearRampToValueAtTime(fadeOutValue, time);
    gainB.gain.linearRampToValueAtTime(fadeInValue, time);
  }

  // Final cleanup after crossfade
  gainA.gain.setValueAtTime(0, startTimeB + crossfadeDuration + 0.01);
  
=======
  const FADE = 0.5;
  gainA.gain.setValueAtTime(volume, startTimeB - 0.05);
  gainA.gain.linearRampToValueAtTime(0, startTimeB + FADE);

  gainB.gain.setValueAtTime(0, startTimeB - 0.05);
  gainB.gain.linearRampToValueAtTime(volume, startTimeB + FADE);

>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
  nodes.A = { src: srcA, gain: gainA };
  nodes.B = { src: srcB, gain: gainB };
}

function stopPolyCelloNote(note, pid) {
  const nodes = polySources[pid]?.[note];
  if (!nodes) return;

  const now = audioCtx.currentTime;

  ["A", "B"].forEach((k) => {
<<<<<<< HEAD
    const entry = nodes[k];
    if (!entry) return;

    const { src, gain } = entry;

    try {
      gain.gain.cancelScheduledValues(now);

      const fadeOutTime = 0.05; // 快速淡出
      const currentGain = gain.gain.value;
      gain.gain.setValueAtTime(Math.max(currentGain, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutTime);

      src.stop(now + fadeOutTime + 0.01);
    } catch (e) {
      try { src.stop(); } catch {}
=======
    if (nodes[k]) {
      const { src, gain } = nodes[k];
      try {
        const fadeTime = 0.1;
        const now = audioCtx.currentTime;

        const startGain = Math.max(gain.gain.value, 0.0001);
        gain.gain.setValueAtTime(startGain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
        src.stop(now + fadeTime + 0.02);
      } catch (e) {
        try {
          src.stop();
        } catch {}
      }

      nodes[k] = null;
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
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