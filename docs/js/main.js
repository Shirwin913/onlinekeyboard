import { renderPiano, updateLatestMidiInputs } from "./pianoRenderer.js";
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
  manualPlayNextNote,
  stopManualNotes,
  setManualTriggerKey, // ⭐ 要加
  getManualTriggerKey, // ⭐ 要加
} from "./midiPlayer.js";

let pianoCount = 1;
let midiAccess = null;
let midiInputs = [];
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

    if (isManualPlayMode()) {
      manualPlayNextNote(127, key); // ⭐ 播放下一組音
      setManualTriggerKey(key); // ⭐ 記錄這次是哪個按鍵觸發
      activeKeys.add(key);
      return;
    }

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

    if (isManualPlayMode()) {
      // ⭐ 只有當放開的鍵是觸發鍵才停止音
      if (key === getManualTriggerKey()) {
        stopManualNotes();
        setManualTriggerKey(null); // 重置觸發鍵
      }
      activeKeys.delete(key);
      return;
    }

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

function addPiano() {
  pianoCount++;
  const pid = `piano${pianoCount}`;
  const container = document.createElement("div");
  container.id = pid;
  container.classList.add("piano-container");
  document.getElementById("piano-container").appendChild(container);

  renderPiano(container, pid, midiInputs);

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

async function updateMidiInputs() {
  midiInputs = Array.from(midiAccess.inputs.values());
}

function updateAllMidiSelects() {
  document.querySelectorAll('select[id^="midi-select-"]').forEach((select) => {
    const pid = select.id.replace("midi-select-", "");
    const previousValue = select.value;

    select.innerHTML = `<option value="-1">All Inputs</option>`;
    midiInputs.forEach((input, i) => {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = input.name;
      select.appendChild(option);
    });

    if (previousValue >= 0 && previousValue < midiInputs.length) {
      select.value = previousValue;
    } else {
      select.value = -1;
    }
  });
}

async function main() {
  let midiError = null;
  try {
    midiAccess = await navigator.requestMIDIAccess();
    await updateMidiInputs();

    // 裝置插拔
    midiAccess.onstatechange = async (e) => {
      console.log("MIDI 裝置變化:", e.port.name, e.port.state);
      await updateMidiInputs();
      updateAllMidiSelects();
      updateLatestMidiInputs(midiInputs);
    };
  } catch (err) {
    midiError = err;
    console.warn("無法取得 MIDI 裝置，將以純鍵盤模式運作：", err);
    midiInputs = []; // 保證是空陣列
  }

  // ⭐ 不管有沒有 MIDI，照樣 render 鋼琴
  renderPiano(document.getElementById("piano"), "piano", midiInputs);

  updateLatestMidiInputs(midiInputs);

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
    .addEventListener("click", () => addPiano());

  document.getElementById("piano").addEventListener("pointerdown", () => {
    activeKeyboardTargetId = "piano";
  });

  setupKeyboardControl();

  // 如果是 MIDI 錯誤，友善通知，但不阻止操作
  if (midiError) {
    const errorLog = document.getElementById("error-log");
    errorLog.textContent =
      "⚠ 無法取得 MIDI 裝置，已切換為純鍵盤／滑鼠模式。";
  }
}

main();

// ===== MIDI 控制區 =====

document.getElementById("midi-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    currentMidiData = await parseMidiFile(file);
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
