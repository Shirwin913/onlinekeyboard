import { renderPiano } from "./pianoRenderer.js";
import {
  loadAudioFilesForSound,
  playSound,
  stopSound,
  soundSettings,
  allAudioLoaded,
  unloadAudioForPiano,
} from "./audioManager.js";
import { noteMapping } from "./utils/constants.js";
import { removePianoFromDevices } from "./midiManager.js";
import {
  parseMidiFile,
  playMidi,
  stopMidiPlayback,
  pauseMidiPlayback,
  resumeMidiPlayback,
  setCurrentMidiAndTarget,
  setManualPlayMode,
  isManualPlayMode,
} from "./midiPlayer.js";

let pianoCount = 1;
const midiDeviceSettings = {};
let currentMidiData = null;

// 鍵盤對應
const keyToNoteOffset = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
};
const activeKeys = new Set();
let activeKeyboardTargetId = "piano";
let octaveOffset = 4;

function setupKeyboardControl() {
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key === "arrowup") {
      if (octaveOffset < 7) octaveOffset++;
      return;
    }
    if (key === "arrowdown") {
      if (octaveOffset > 1) octaveOffset--;
      return;
    }
    if (activeKeys.has(key)) return;

    const noteOffset = keyToNoteOffset[key];
    if (noteOffset !== undefined) {
      const note = 12 * octaveOffset + noteOffset;
      const el = document.querySelector(
        `#${activeKeyboardTargetId} [data-number="${note}"]`
      );
      if (el) el.classList.add("pressed");
      playSound(note, activeKeyboardTargetId, 127);
      activeKeys.add(key);
    }
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    const noteOffset = keyToNoteOffset[key];
    if (noteOffset !== undefined) {
      const note = 12 * octaveOffset + noteOffset;
      const el = document.querySelector(
        `#${activeKeyboardTargetId} [data-number="${note}"]`
      );
      if (el) el.classList.remove("pressed");
      stopSound(note, activeKeyboardTargetId);
      activeKeys.delete(key);
    }
  });
}

function addPiano(inputs) {
  pianoCount++;
  const pid = `piano${pianoCount}`;
  const container = document.createElement("div");
  container.id = pid;
  container.classList.add("piano-container");
  document.getElementById("piano-container").appendChild(container);

  renderPiano(container, pid, inputs);
  container.addEventListener("pointerdown", () => {
    activeKeyboardTargetId = pid;
  });

  container
    .querySelector(`#auto-play-${pid}`)
    .addEventListener("click", () => autoPlayPiano(pid));
  container.querySelector(".delete-btn").addEventListener("click", () => {
    container.remove();
    cleanupPianoState(pid);
  });
}

function autoPlayPiano(pid) {
  const soundType = soundSettings[pid]?.sound;
  if (!allAudioLoaded[pid]?.[soundType]) return;

  const notes = Object.values(noteMapping);
  let index = 0;

  function next() {
    if (index >= notes.length) return;
    const n = notes[index++];
    const keyEl = document.querySelector(`#${pid} [data-number="${n}"]`);
    if (keyEl) {
      keyEl.classList.add("pressed");
      playSound(n, pid, 127);
      const releaseTime = 100 + Math.floor(Math.random() * 80);
      setTimeout(() => {
        keyEl.classList.remove("pressed");
        stopSound(n, pid);
      }, releaseTime);
    }
    const interval = 70 + Math.floor(Math.random() * 50);
    setTimeout(next, interval);
  }

  next();
}

function cleanupPianoState(pid) {
  delete soundSettings[pid];
  unloadAudioForPiano(pid);
  removePianoFromDevices(pid);
}

async function main() {
  try {
    const midiAccess = await navigator.requestMIDIAccess();
    const inputs = [...midiAccess.inputs.values()];
    renderPiano(document.getElementById("piano"), "piano", inputs);

    document
      .querySelector(`#auto-play-piano`)
      .addEventListener("click", () => autoPlayPiano("piano"));
    document
      .querySelector(`#piano .delete-btn`)
      .addEventListener("click", () => {
        document.getElementById("piano").remove();
        cleanupPianoState("piano");
      });

    document
      .getElementById("add-piano-btn")
      .addEventListener("click", () => addPiano(inputs));
    document.getElementById("piano").addEventListener("pointerdown", () => {
      activeKeyboardTargetId = "piano";
    });

    setupKeyboardControl();
  } catch (err) {
    alert("無法取得 MIDI 裝置：" + err);
  }
}

main();

// ===== MIDI 控制區 =====

document.getElementById("midi-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    currentMidiData = await parseMidiFile(file);

    // ===== 關鍵：載入時就設定 currentMidi 和 pianoTarget =====
    setCurrentMidiAndTarget(currentMidiData, "piano");

    alert("MIDI 檔案載入完成！");
  }
});

document.getElementById("midi-play-btn").addEventListener("click", () => {
  if (currentMidiData) {
    playMidi(currentMidiData, "piano");
  } else {
    alert("請先載入 MIDI 檔！");
  }
});

document.getElementById("midi-stop-btn").addEventListener("click", () => {
  stopMidiPlayback();
});

document.getElementById("midi-pause-btn").addEventListener("click", () => {
  pauseMidiPlayback();
});

document.getElementById("midi-resume-btn").addEventListener("click", () => {
  resumeMidiPlayback();
});

document.getElementById("manual-play-btn").addEventListener("click", () => {
  const newMode = !isManualPlayMode();
  setManualPlayMode(newMode);
  alert(newMode ? "手動播放模式啟動" : "手動播放模式關閉");
});
