// ==== 全域變數與設定 ====

// Polyphonic cross-fade 狀態（不用再用 crossFadeActive）
const polySources = {}; // pianoId → note → { A:{src,gain}, B:{src,gain} }

const pianoAudioFiles = {};
const audioPlaying = {};
const audioReady = {};
const allAudioLoaded = {};
const availableSounds = ["piano", "pipeorgan", "cello"];
const layout = [
  [0, false],
  [0, true],
  [1, false],
  [1, true],
  [2, false],
  [3, false],
  [3, true],
  [4, false],
  [4, true],
  [5, false],
  [5, true],
  [6, false],
];
const noteMapping = {
  A0: 21,
  Asharp0: 22,
  B0: 23,
  C1: 24,
  Csharp1: 25,
  D1: 26,
  Dsharp1: 27,
  E1: 28,
  F1: 29,
  Fsharp1: 30,
  G1: 31,
  Gsharp1: 32,
  A1: 33,
  Asharp1: 34,
  B1: 35,
  C2: 36,
  Csharp2: 37,
  D2: 38,
  Dsharp2: 39,
  E2: 40,
  F2: 41,
  Fsharp2: 42,
  G2: 43,
  Gsharp2: 44,
  A2: 45,
  Asharp2: 46,
  B2: 47,
  C3: 48,
  Csharp3: 49,
  D3: 50,
  Dsharp3: 51,
  E3: 52,
  F3: 53,
  Fsharp3: 54,
  G3: 55,
  Gsharp3: 56,
  A3: 57,
  Asharp3: 58,
  B3: 59,
  C4: 60,
  Csharp4: 61,
  D4: 62,
  Dsharp4: 63,
  E4: 64,
  F4: 65,
  Fsharp4: 66,
  G4: 67,
  Gsharp4: 68,
  A4: 69,
  Asharp4: 70,
  B4: 71,
  C5: 72,
  Csharp5: 73,
  D5: 74,
  Dsharp5: 75,
  E5: 76,
  F5: 77,
  Fsharp5: 78,
  G5: 79,
  Gsharp5: 80,
  A5: 81,
  Asharp5: 82,
  B5: 83,
  C6: 84,
  Csharp6: 85,
  D6: 86,
  Dsharp6: 87,
  E6: 88,
  F6: 89,
  Fsharp6: 90,
  G6: 91,
  Gsharp6: 92,
  A6: 93,
  Asharp6: 94,
  B6: 95,
  C7: 96,
  Csharp7: 97,
  D7: 98,
  Dsharp7: 99,
  E7: 100,
  F7: 101,
  Fsharp7: 102,
  G7: 103,
  Gsharp7: 104,
  A7: 105,
  Asharp7: 106,
  B7: 107,
  C8: 108,
};

const soundSettings = {};
const midiDeviceSettings = {};
let pianoCount = 1;

// ==== Web Audio + Cello Polyphonic Cross-Fade 播放器 ====
let audioCtx = null;
const celloBuffers = {}; // pianoId → Map<midiNumber,AudioBuffer>
const celloIsPlaying = {}; // pianoId → Map<midiNumber,boolean>

// 一次性播放（one-shot）
function playCelloOneShot(num, pid, vel) {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = celloBuffers[pid].get(num);
  const src = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  gain.gain.value = (vel / 127) * soundSettings[pid].volume;
  src.buffer = buf;
  src.connect(gain).connect(audioCtx.destination);
  src.start();
}

// Polyphonic Cross-Fade 播放
function playPolyCelloNote(num, pid) {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (!polySources[pid]) polySources[pid] = {};
  if (!polySources[pid][num]) polySources[pid][num] = { A: null, B: null };

  const JUMP = 2,
    FADE = 0.2,
    STEPS = 256;
  const nodes = polySources[pid][num];
  // 停掉舊來源
  ["A", "B"].forEach((k) => {
    if (nodes[k]) {
      try {
        nodes[k].src.stop();
      } catch {}
      nodes[k] = null;
    }
  });

  const buf = celloBuffers[pid].get(num);

  // Source A
  const srcA = audioCtx.createBufferSource();
  const gainA = audioCtx.createGain();
  srcA.buffer = buf;
  srcA.connect(gainA).connect(audioCtx.destination);
  gainA.gain.setValueAtTime(1, audioCtx.currentTime);
  srcA.start(audioCtx.currentTime, 0);

  // Source B
  const startB = audioCtx.currentTime + JUMP;
  const srcB = audioCtx.createBufferSource();
  const gainB = audioCtx.createGain();
  srcB.buffer = buf;
  srcB.loop = true;
  srcB.loopStart = JUMP;
  srcB.loopEnd = buf.duration;
  srcB.connect(gainB).connect(audioCtx.destination);
  srcB.start(startB, JUMP);

  // 淡入淡出曲線
  const inC = new Float32Array(STEPS),
    outC = new Float32Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);
    inC[i] = Math.sin((t * Math.PI) / 2);
    outC[i] = Math.cos((t * Math.PI) / 2);
  }
  gainA.gain.setValueCurveAtTime(outC, startB, FADE);
  gainB.gain.setValueCurveAtTime(inC, startB, FADE);

  nodes.A = { src: srcA, gain: gainA };
  nodes.B = { src: srcB, gain: gainB };
  celloIsPlaying[pid].set(num, true);
}

// 停止 polyphonic Cello
function stopPolyCelloNote(num, pid) {
  const nodes = polySources[pid]?.[num];
  if (!nodes) return;
  ["A", "B"].forEach((k) => {
    if (nodes[k]) {
      try {
        nodes[k].src.stop();
      } catch {}
      nodes[k] = null;
    }
  });
  celloIsPlaying[pid].set(num, false);
}

// ==== 載入音檔 ====
async function loadAudioFilesForSound(pid, sound) {
  if (!pianoAudioFiles[pid]) {
    pianoAudioFiles[pid] = {};
    audioPlaying[pid] = {};
    audioReady[pid] = {};
    allAudioLoaded[pid] = {};
  }
  // Cello 用 Web Audio
  if (sound === "cello") {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!celloBuffers[pid]) {
      celloBuffers[pid] = new Map();
      celloIsPlaying[pid] = new Map();
    }
    const tasks = Object.entries(noteMapping).map(async ([note, num]) => {
      const res = await fetch(`./samples/cello/piano_${note}.wav`);
      const ab = await res.arrayBuffer();
      const buf = await audioCtx.decodeAudioData(ab);
      celloBuffers[pid].set(num, buf);
      celloIsPlaying[pid].set(num, false);
    });
    await Promise.all(tasks);
    allAudioLoaded[pid][sound] = true;
    return;
  }
  // piano/pipeorgan HTMLAudio
  if (!pianoAudioFiles[pid][sound]) {
    pianoAudioFiles[pid][sound] = new Map();
    audioPlaying[pid][sound] = new Map();
    audioReady[pid][sound] = new Map();
    allAudioLoaded[pid][sound] = false;
    const ps = Object.entries(noteMapping).map(([note, num]) => {
      return new Promise((res, rej) => {
        const a = new Audio(`./samples/${sound}/piano_${note}.wav`);
        a.addEventListener("canplaythrough", () => {
          audioReady[pid][sound].set(num, true);
          res();
        });
        a.addEventListener("error", rej);
        pianoAudioFiles[pid][sound].set(num, a);
        audioReady[pid][sound].set(num, false);
      });
    });
    try {
      await Promise.all(ps);
      allAudioLoaded[pid][sound] = true;
    } catch (e) {
      console.error("載入失敗", e);
    }
  } else if (!allAudioLoaded[pid][sound]) {
    await new Promise((r) => {
      const id = setInterval(() => {
        if (allAudioLoaded[pid][sound]) {
          clearInterval(id);
          r();
        }
      }, 100);
    });
  }
}

// ==== 播放 / 停止 分流 ====
function sound(num, pid, vel) {
  const cur = soundSettings[pid].sound;
  if (cur === "cello") {
    if (!allAudioLoaded[pid].cello) return;
    if (!soundSettings[pid].sustain) playCelloOneShot(num, pid, vel);
    else playPolyCelloNote(num, pid);
    return;
  }
  const aMap = pianoAudioFiles[pid][cur];
  if (aMap?.has(num) && audioReady[pid][cur].get(num)) {
    const a = aMap.get(num);
    if (audioPlaying[pid][cur].get(num)) {
      a.pause();
      a.currentTime = 0;
    }
    a.volume = (vel / 127) * soundSettings[pid].volume;
    a.play()
      .then(() => audioPlaying[pid][cur].set(num, true))
      .catch(() => {});
    a.addEventListener("ended", () => audioPlaying[pid][cur].set(num, false));
  }
}
function stopSound(num, pid) {
  const cur = soundSettings[pid].sound;
  if (cur === "cello") {
    if (!soundSettings[pid].sustain) return;
    stopPolyCelloNote(num, pid);
    return;
  }
  const aMap = pianoAudioFiles[pid][cur];
  if (aMap?.has(num)) {
    const a = aMap.get(num);
    if (soundSettings[pid].sustain) return;
    if (audioPlaying[pid][cur].get(num)) {
      a.pause();
      a.currentTime = 0;
      audioPlaying[pid][cur].set(num, false);
    }
  }
}

// ==== 渲染鍵盤 & 綁定事件 ====
function renderPiano(el, pid, inputs) {
  if (!soundSettings[pid])
    soundSettings[pid] = {
      sound: availableSounds[0],
      volume: 1,
      sustain: false,
    };
  let w = [],
    b = [];
  for (let i = 21; i < 109; i++) {
    const cls = layout[i % 12][1] ? "black-key" : "white-key";
    (layout[i % 12][1] ? b : w).push(
      `<div data-number="${i}" class="${cls}"></div>`
    );
  }
  el.innerHTML = `
    <div class="white-keys">${w.join("")}</div>
    <div class="black-keys">${b.join("")}</div>
    <button class="delete-btn">刪除鍵盤</button>
    <button class="auto-play-btn" id="auto-play-${pid}">鍵盤測試</button>
    <label>音量：</label>
    <input type="range" id="volume-${pid}" min="0" max="1" step="0.01" value="1" />
    <div class="selectors">
      <label>音色：</label>
      <select id="sound-select-${pid}">${availableSounds
    .map((s) => `<option value="${s}">${s}</option>`)
    .join("")}</select>
      <label>MIDI 裝置：</label>
      <select id="midi-select-${pid}"><option value="-1">All Inputs</option>${inputs
    .map((inp, i) => `<option value="${i}">${inp.name}</option>`)
    .join("")}</select>
    </div>
    <button id="sustain-${pid}">延音踏板</button>
    <div class="loading-spinner" id="loading-${pid}"></div>
  `;
  // 綁鍵盤事件
  el.querySelectorAll(".white-key,.black-key").forEach((key) => {
    const n = Number(key.dataset.number);
    key.addEventListener("pointerdown", () => sound(n, pid, 127));
    key.addEventListener("pointerup", () => stopSound(n, pid));
  });
  // 切音色
  el.querySelector(`#sound-select-${pid}`).addEventListener(
    "change",
    async (e) => {
      Object.values(noteMapping).forEach((n) => stopSound(n, pid));
      const s = e.target.value;
      soundSettings[pid].sound = s;
      togglePianoKeys(pid, false);
      document.getElementById(`loading-${pid}`).style.display = "block";
      await loadAudioFilesForSound(pid, s);
      document.getElementById(`loading-${pid}`).style.display = "none";
      togglePianoKeys(pid, true);

      const sustainBtn = el.querySelector(`#sustain-${pid}`);

      if (s === "cello") {
        soundSettings[pid].sustain = true; // 固定開啟延音踏板
        sustainBtn.style.display = "none"; // 隱藏延音踏板按鈕
      } else {
        soundSettings[pid].sustain = false; // 恢復預設延音踏板關閉
        sustainBtn.style.display = "inline-block"; // 恢復延音踏板按鈕顯示
        sustainBtn.classList.remove("active"); // 移除 active 狀態
        sustainBtn.textContent = "延音踏板"; // 恢復按鈕文字
      }
    }
  );

  // 切 MIDI
  el.querySelector(`#midi-select-${pid}`).addEventListener("change", (e) => {
    midiDeviceSettings[pid] = parseInt(e.target.value);
    listenEvent(inputs, midiDeviceSettings[pid], pid);
  });
  // 延音
  el.querySelector(`#sustain-${pid}`).addEventListener("click", (e) => {
    soundSettings[pid].sustain = !soundSettings[pid].sustain;
    e.target.classList.toggle("active", soundSettings[pid].sustain);
    e.target.textContent = soundSettings[pid].sustain
      ? "延音踏板 (開啟)"
      : "延音踏板";
  });
  // 音量
  el.querySelector(`#volume-${pid}`).addEventListener("input", (e) => {
    soundSettings[pid].volume = parseFloat(e.target.value);
  });
  loadAudioFilesForSound(pid, soundSettings[pid].sound).then(() => {
    togglePianoKeys(pid, true);
    const sustainBtn = el.querySelector(`#sustain-${pid}`);
    if (soundSettings[pid].sound === "cello") {
      soundSettings[pid].sustain = true;
      sustainBtn.style.display = "none";
    } else {
      sustainBtn.style.display = "inline-block";
      sustainBtn.classList.remove("active");
      sustainBtn.textContent = "延音踏板";
    }
  });
}

// ==== MIDI 事件 ====
function onMIDIMessage(ev, pianoId) {
  const [st, num, vel] = ev.data;
  const el = document.querySelector(`#${pianoId} [data-number="${num}"]`);
  if (!el) return;
  if (st === 144 && vel > 0) {
    el.classList.add("pressed");
    sound(num, pianoId, vel);
  } else {
    el.classList.remove("pressed");
    stopSound(num, pianoId);
  }
}
function listenEvent(inputs, index, pianoId) {
  inputs.forEach((inp, i) => {
    inp.onmidimessage =
      i === index || index < 0 ? (e) => onMIDIMessage(e, pianoId) : null;
  });
}

// ==== 新增/刪除/初始/自動播放 ====
function addPiano(inputs) {
  pianoCount++;
  const div = document.createElement("div");
  div.id = `piano${pianoCount}`;
  div.classList.add("piano-container");
  document.getElementById("piano-container").appendChild(div);
  renderPiano(div, `piano${pianoCount}`, inputs);
}
async function main() {
  try {
    const mid = await navigator.requestMIDIAccess();
    const inputs = [...mid.inputs.values()];
    renderPiano(document.getElementById("piano"), "piano", inputs);
  } catch (e) {
    alert("無法取得 MIDI 裝置：" + e);
  }
}
main();
document.getElementById("add-piano-btn").addEventListener("click", () =>
  navigator
    .requestMIDIAccess()
    .then((m) => addPiano([...m.inputs.values()]))
    .catch(console.error)
);

function autoPlayPiano(pid) {
  const cur = soundSettings[pid].sound;
  if (!allAudioLoaded[pid][cur]) return;
  const notes = Object.values(noteMapping),
    dur = 100,
    intv = 10;
  let idx = 0;
  function next() {
    if (idx >= notes.length) return;
    const n = notes[idx++];
    const el = document.querySelector(`#${pid} [data-number="${n}"]`);
    if (el) {
      el.classList.add("pressed");
      sound(n, pid, 127);
      setTimeout(() => {
        el.classList.remove("pressed");
        stopSound(n, pid);
      }, dur);
    }
    setTimeout(next, intv);
  }
  next();
}
function deletePiano(pid) {
  const el = document.getElementById(pid);
  if (!el) return;
  el.remove();
  [
    pianoAudioFiles,
    audioPlaying,
    audioReady,
    allAudioLoaded,
    soundSettings,
    midiDeviceSettings,
  ].forEach((obj) => delete obj[pid]);
}
function togglePianoKeys(pid, en) {
  document
    .querySelectorAll(`#${pid} .white-key,#${pid} .black-key`)
    .forEach((key) => {
      key.style.pointerEvents = en ? "auto" : "none";
      key.style.opacity = en ? 1 : 0.5;
    });
}
