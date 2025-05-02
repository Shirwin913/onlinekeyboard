import {
  setMidiProgress,
  setGlobalVelocityMultiplier,
  manualPlayNextNote,
  isManualPlayMode,
} from "./midiPlayer.js";

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

  // ==== 手動播放模式 ====
  if (isManualPlayMode() && status === 144 && velocity > 0) {
    // ---- 防止多次觸發 ----
    if (!manualPlayLock) {
      manualPlayLock = true;
      manualPlayNextNote(velocity);

      manualPlayLockTimeout = setTimeout(() => {
        manualPlayLock = false;
      }, 100); // 可以調整，100ms debounce
    }

    return; // 不做其他事
  }

  // ==== 播放進度控制 ====
  if (status === 144 && velocity > 0) {
    if (note === 36) setMidiProgress(0); // C1 → 0%
    else if (note === 38) setMidiProgress(0.25); // D1 → 25%
    else if (note === 40) setMidiProgress(0.5); // E1 → 50%
    else if (note === 41) setMidiProgress(0.75); // F1 → 75%

    // 力度控制
    if (note === 53) {
      const multiplier = velocity / 127;
      setGlobalVelocityMultiplier(multiplier);
    }
  }

  // ==== 正常模式：MIDI 鍵盤控制鋼琴鍵 ====
  const keyEl = document.querySelector(`#${pianoId} [data-number="${note}"]`);
  if (!keyEl) return;

  if (status === 144 && velocity > 0) {
    keyEl.classList.add("pressed");
    playSound(note, pianoId, velocity);
  } else if (status === 128 || (status === 144 && velocity === 0)) {
    keyEl.classList.remove("pressed");
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
