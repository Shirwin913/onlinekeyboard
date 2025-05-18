import {
  setMidiProgress,
  setGlobalVelocityMultiplier,
  manualPlayNextNote,
  isManualPlayMode,
  stopManualNotes,
  setManualTriggerKey,
  getManualTriggerKey,
} from "./midiplayer.js";

import { setKeyVisualState, clearKeyVisualState } from "./pianoRenderer.js";
import { audioBuffers, soundSettings } from "./audioManager.js";

import { playSound, stopSound } from "./audioManager.js";

// 追蹤 MIDI 裝置對應的 piano
const deviceToPianoMap = new Map();
const inputWithListener = new WeakSet();

// ---- 防止多鍵跳拍 debounce ----
let manualPlayLock = false;
let manualPlayLockTimeout = null;

// 處理 MIDI 訊息
function onMIDIMessage(event, pianoId) {
  const [status, note, velocity] = event.data;

  console.log("MIDI Event:", status, note, velocity);

  // ==== 手動播放模式 ====
  if (isManualPlayMode()) {
    if (status === 144 && velocity > 0) {
      console.log("Note On received in manual mode");

      if (!manualPlayLock) {
        manualPlayLock = true;
        manualPlayNextNote(velocity, note); // ⭐ 傳入是哪顆鍵觸發
        setManualTriggerKey(note); // ⭐ 記錄這次是哪顆鍵
        manualPlayLockTimeout = setTimeout(() => {
          manualPlayLock = false;
        }, 100);
      }
      return;
    }

    if (status === 128 || (status === 144 && velocity === 0)) {
      console.log("Note Off received in manual mode");

      // ⭐ 只有當放開的鍵是觸發鍵，才停止音
      if (note === getManualTriggerKey()) {
        console.log("Stop manual notes because trigger key released");
        stopManualNotes();
        setManualTriggerKey(null); // 重置
      } else {
        console.log("Different key released, do nothing.");
      }
      return;
    }
  }

  // ==== 正常模式：MIDI 控制鋼琴鍵 ====
  const keyEl = document.querySelector(`#${pianoId} [data-number="${note}"]`);
  if (!keyEl) return;

  if (status === 144 && velocity > 0) {
    const sound = soundSettings[pianoId]?.sound;
    const bufferMap = audioBuffers[pianoId]?.[sound];
    const hasBuffer =
      bufferMap instanceof Map
        ? bufferMap.has(note)
        : bufferMap?.[note] !== undefined;

    setKeyVisualState(pianoId, note, hasBuffer);
    playSound(note, pianoId, velocity);
  } else if (status === 128 || (status === 144 && velocity === 0)) {
    clearKeyVisualState(pianoId, note);
    stopSound(note, pianoId);
  }
}

// 監聽 MIDI 裝置訊號
function listenEvent(inputs, selectedIndex, pianoId) {
  inputs.forEach((input, idx) => {
    if (selectedIndex === idx || selectedIndex < 0) {
      // 第一次綁定 input → 加入 listener
      if (!inputWithListener.has(input)) {
        input.onmidimessage = (event) => {
          const pianos = deviceToPianoMap.get(input);
          if (pianos) {
            for (const pid of pianos) {
              onMIDIMessage(event, pid);
            }
          }
        };
        inputWithListener.add(input);
      }

      // 建立 input → piano 的對應
      if (!deviceToPianoMap.has(input)) {
        deviceToPianoMap.set(input, new Set());
      }
      deviceToPianoMap.get(input).add(pianoId);
    }
  });
}

function removePianoFromDevices(pianoId) {
  for (const [input, pianoSet] of deviceToPianoMap.entries()) {
    pianoSet.delete(pianoId);
    if (pianoSet.size === 0) {
      input.onmidimessage = null;
      deviceToPianoMap.delete(input);
      inputWithListener.delete(input);
    }
  }
}

// ==== 匯出 ====
export { listenEvent, removePianoFromDevices };
