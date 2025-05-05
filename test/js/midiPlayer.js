import { playSound, stopSound } from "./audioManager.js";

let currentMidi = null;
let pianoTarget = null;
let startTime = 0;
let pauseTime = 0;
let isPlaying = false;

let scheduledEvents = [];
let activeNotes = new Set();

let audioCtx = null;
let globalVelocityMultiplier = 1.0;

let manualPlayMode = false;

let manualTimeIndex = 0;
let manualTimeList = [];

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function parseMidiFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
      const midi = new Midi(data);
      resolve(midi);
    };
    reader.readAsArrayBuffer(file);
  });
}

function playMidi(midi, pianoId) {
  stopMidiPlayback();
  initAudioContext();

  currentMidi = midi;
  pianoTarget = pianoId;
  isPlaying = true;
  startTime = audioCtx.currentTime;
  pauseTime = 0;

  scheduledEvents = [];
  activeNotes.clear();

  prepareManualTimeList();

  scheduleAllNotes();
}

function scheduleAllNotes() {
  const whenStart = startTime;

  currentMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const noteStart = note.time + whenStart;
      const noteEnd = note.time + note.duration + whenStart;
      const midiNumber = note.midi;
      const velocity = note.velocity * 127;
      const actualVelocity = Math.min(velocity * globalVelocityMultiplier, 127);

      const onId = scheduleAt(noteStart, () => {
        if (!isPlaying) return;
        stopSound(midiNumber, pianoTarget);
        playSound(midiNumber, pianoTarget, actualVelocity);
        activeNotes.add(midiNumber);

        const keyEl = document.querySelector(
          `#${pianoTarget} [data-number="${midiNumber}"]`
        );
        if (keyEl) keyEl.classList.add("pressed");
      });

      const offId = scheduleAt(noteEnd, () => {
        stopSound(midiNumber, pianoTarget);
        activeNotes.delete(midiNumber);
        const keyEl = document.querySelector(
          `#${pianoTarget} [data-number="${midiNumber}"]`
        );
        if (keyEl) keyEl.classList.remove("pressed");
      });

      scheduledEvents.push(onId, offId);
    });
  });
}

function scheduleAt(timeInAudioCtx, callback) {
  const delay = Math.max(0, (timeInAudioCtx - audioCtx.currentTime) * 1000);
  return setTimeout(callback, delay);
}

function stopMidiPlayback() {
  isPlaying = false;
  scheduledEvents.forEach(clearTimeout);
  scheduledEvents = [];

  for (const note of activeNotes) {
    stopSound(note, pianoTarget);
    const keyEl = document.querySelector(
      `#${pianoTarget} [data-number="${note}"]`
    );
    if (keyEl) keyEl.classList.remove("pressed");
  }
  activeNotes.clear();
}

function pauseMidiPlayback() {
  if (!isPlaying) return;
  pauseTime = audioCtx.currentTime - startTime;
  stopMidiPlayback();
}

function resumeMidiPlayback() {
  if (!currentMidi || isPlaying) return;
  isPlaying = true;
  startTime = audioCtx.currentTime - pauseTime;
  scheduledEvents = [];
  activeNotes.clear();
  scheduleRemainingNotes();
}

function scheduleRemainingNotes() {
  const whenStart = startTime;

  currentMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const noteStart = note.time + whenStart;
      const noteEnd = note.time + note.duration + whenStart;
      if (noteStart >= audioCtx.currentTime) {
        const midiNumber = note.midi;
        const velocity = note.velocity * 127;
        const actualVelocity = Math.min(
          velocity * globalVelocityMultiplier,
          127
        );

        const onId = scheduleAt(noteStart, () => {
          if (!isPlaying) return;
          stopSound(midiNumber, pianoTarget);
          playSound(midiNumber, pianoTarget, actualVelocity);
          activeNotes.add(midiNumber);
          const keyEl = document.querySelector(
            `#${pianoTarget} [data-number="${midiNumber}"]`
          );
          if (keyEl) keyEl.classList.add("pressed");
        });

        const offId = scheduleAt(noteEnd, () => {
          stopSound(midiNumber, pianoTarget);
          activeNotes.delete(midiNumber);
          const keyEl = document.querySelector(
            `#${pianoTarget} [data-number="${midiNumber}"]`
          );
          if (keyEl) keyEl.classList.remove("pressed");
        });

        scheduledEvents.push(onId, offId);
      }
    });
  });
}

function setGlobalVelocityMultiplier(multiplier) {
  globalVelocityMultiplier = multiplier;
}

function setMidiProgress(percent) {
  if (!currentMidi) return;
  const maxTime = Math.max(
    ...currentMidi.tracks.flatMap((t) =>
      t.notes.map((n) => n.time + n.duration)
    )
  );
  pauseTime = maxTime * percent;
  resumeMidiPlayback();
}

function prepareManualTimeList() {
  if (!currentMidi) return;
  manualTimeIndex = 0;
  manualTimeList = [];
  const times = new Set();
  currentMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => times.add(note.time));
  });
  manualTimeList = Array.from(times).sort((a, b) => a - b);
}

let previousManualNotes = []; // 紀錄上次播放的音符

function manualPlayNextNote(velocity) {
  if (!currentMidi || !pianoTarget) return;
  if (manualTimeList.length === 0) prepareManualTimeList();
  if (manualTimeIndex >= manualTimeList.length) manualTimeIndex = 0;

  const targetTime = manualTimeList[manualTimeIndex++];

  // ---- 1️⃣ 先停止上一次的音 ----
  previousManualNotes.forEach((midiNumber) => {
    stopSound(midiNumber, pianoTarget);
    const keyEl = document.querySelector(
      `#${pianoTarget} [data-number="${midiNumber}"]`
    );
    if (keyEl) keyEl.classList.remove("pressed");
  });
  previousManualNotes = [];

  // ---- 2️⃣ 播放這次的音 ----
  const notesToPlay = [];
  currentMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      if (note.time === targetTime) notesToPlay.push(note);
    });
  });

  notesToPlay.forEach((note) => {
    const midiNumber = note.midi;
    const actualVelocity = Math.min(velocity * globalVelocityMultiplier, 127);

    playSound(midiNumber, pianoTarget, actualVelocity);

    const keyEl = document.querySelector(
      `#${pianoTarget} [data-number="${midiNumber}"]`
    );
    if (keyEl) keyEl.classList.add("pressed");

    // 把這次播放的音記錄起來，下一次會停止這些音
    previousManualNotes.push(midiNumber);
  });
}

function setManualPlayMode(mode) {
  manualPlayMode = mode;
  if (manualPlayMode && currentMidi) prepareManualTimeList();
}

function isManualPlayMode() {
  return manualPlayMode;
}

function setCurrentMidiAndTarget(midi, pianoId) {
  currentMidi = midi;
  pianoTarget = pianoId;
  prepareManualTimeList();
}

function stopManualNotes() {
  previousManualNotes.forEach((midiNumber) => {
    // 延遲 0.5 秒再停止
    setTimeout(() => {
      stopSound(midiNumber, pianoTarget);
      const keyEl = document.querySelector(
        `#${pianoTarget} [data-number="${midiNumber}"]`
      );
      if (keyEl) keyEl.classList.remove("pressed");
    }, 110); // 500ms 延遲
  });
  previousManualNotes = [];
}

export {
  parseMidiFile,
  playMidi,
  stopMidiPlayback,
  pauseMidiPlayback,
  resumeMidiPlayback,
  setMidiProgress,
  setGlobalVelocityMultiplier,
  manualPlayNextNote,
  setManualPlayMode,
  isManualPlayMode,
  setCurrentMidiAndTarget,
  stopManualNotes,
};
