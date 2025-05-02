import {
  playSound,
  stopSound,
  loadAudioFilesForSound,
  soundSettings,
  allAudioLoaded,
} from "./audioManager.js";
import { availableSounds, layout, noteMapping } from "./utils/constants.js";
import { listenEvent } from "./midiManager.js";

function togglePianoKeys(pid, enabled) {
  const keys = document.querySelectorAll(
    `#${pid} .white-key, #${pid} .black-key`
  );
  keys.forEach((key) => key.classList.toggle("disabled", !enabled));
}

function renderPiano(container, pid, midiInputs) {
  if (!soundSettings[pid]) {
    soundSettings[pid] = {
      sound: availableSounds[0],
      volume: 1.5,
      sustain: false,
    };
  }

  let whiteKeys = "",
    blackKeys = "";
  for (let i = 21; i < 109; i++) {
    const isBlack = layout[i % 12][1];
    const keyHTML = `<div data-number="${i}" class="${
      isBlack ? "black-key" : "white-key"
    }"></div>`;
    if (isBlack) blackKeys += keyHTML;
    else whiteKeys += keyHTML;
  }

  container.innerHTML = `
    <div class="white-keys">${whiteKeys}</div>
    <div class="black-keys">${blackKeys}</div>
    <button class="delete-btn">刪除鍵盤</button>
    <button class="auto-play-btn" id="auto-play-${pid}">鍵盤測試</button>
    <label>音量：</label>
    <input type="range" id="volume-${pid}" min="0" max="2" step="0.01" value="1.5" />
    <div class="selectors">
      <label>音色：</label>
      <select id="sound-select-${pid}">
        ${availableSounds
          .map((s) => `<option value="${s}">${s}</option>`)
          .join("")}
      </select>
      <label>MIDI 裝置：</label>
      <select id="midi-select-${pid}">
        <option value="-1">All Inputs</option>
        ${midiInputs
          .map((input, i) => `<option value="${i}">${input.name}</option>`)
          .join("")}
      </select>
    </div>
    <button id="sustain-${pid}">延音踏板</button>
    <div class="loading-spinner" id="loading-${pid}"></div>
  `;

  container.querySelectorAll(".white-key, .black-key").forEach((key) => {
    const num = Number(key.dataset.number);
    key.addEventListener("pointerdown", () => {
      key.classList.add("pressed");
      playSound(num, pid, 127);
    });
    key.addEventListener("pointerup", () => {
      key.classList.remove("pressed");
      stopSound(num, pid);
    });
    key.addEventListener("pointerleave", () => key.classList.remove("pressed"));
    key.addEventListener("pointercancel", () => key.classList.remove("pressed"));
  });

  container
    .querySelector(`#sound-select-${pid}`)
    .addEventListener("change", async (e) => {
      Object.values(noteMapping).forEach((n) => stopSound(n, pid));
      const sound = e.target.value;
      soundSettings[pid].sound = sound;

      togglePianoKeys(pid, false);
      container.querySelector(`#loading-${pid}`).style.display = "block";
      await loadAudioFilesForSound(pid, sound);
      container.querySelector(`#loading-${pid}`).style.display = "none";
      togglePianoKeys(pid, true);

      const sustainBtn = container.querySelector(`#sustain-${pid}`);
      if (sound === "cello") {
        soundSettings[pid].sustain = true;
        sustainBtn.style.display = "none";
      } else {
        soundSettings[pid].sustain = false;
        sustainBtn.style.display = "inline-block";
        sustainBtn.classList.remove("active");
        sustainBtn.textContent = "延音踏板";
      }
    });

  container
    .querySelector(`#midi-select-${pid}`)
    .addEventListener("change", (e) => {
      const midiIndex = parseInt(e.target.value);
      listenEvent(midiInputs, midiIndex, pid);
    });

  container.querySelector(`#sustain-${pid}`).addEventListener("click", (e) => {
    const sustain = !soundSettings[pid].sustain;
    soundSettings[pid].sustain = sustain;
    e.target.classList.toggle("active", sustain);
    e.target.textContent = sustain ? "延音踏板 (開啟)" : "延音踏板";
  });

  container.querySelector(`#volume-${pid}`).addEventListener("input", (e) => {
    soundSettings[pid].volume = parseFloat(e.target.value);
  });

  loadAudioFilesForSound(pid, soundSettings[pid].sound).then(() => {
    togglePianoKeys(pid, true);
  });
}

export { renderPiano };