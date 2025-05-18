import {
  playSound,
  stopSound,
  soundSettings,
  stopPolyCelloNote,
} from "./audioManager.js";

let previousTriggerKey = null;

let currentMidi = null; // current midi files
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

// midi parser
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

// load midi files, "midi" is a SMF
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

<<<<<<< HEAD

//--------------
// manual play
//--------------
// press keyboard
function manualPlayNextNote(velocity, triggeringNote) {
  if (!currentMidi || !pianoTarget)
    return;
=======
function manualPlayNextNote(velocity, triggeringNote) {
  if (!currentMidi) {
    alert("請先載入 MIDI 檔！");
    return;
  }
  if (!pianoTarget) {
    alert("沒有找到目標鋼琴！");
    return;
  }

  if (manualTimeList.length === 0) prepareManualTimeList();
  if (manualTimeIndex >= manualTimeList.length) manualTimeIndex = 0;
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91

  if (manualTimeList.length === 0) 
    prepareManualTimeList();
    
  if (manualTimeIndex >= manualTimeList.length) {
    manualTimeIndex = 0;
    // reset virtual piano keyboard
    for (var midiNumber = 21; midiNumber <= 108; midiNumber++) {
      const sound = soundSettings[pianoTarget]?.sound;
      const sustain = soundSettings[pianoTarget]?.sustain;
      const usePoly = sustain && ["cello", "violin", "Trombone"].includes(sound);

      if (usePoly) {
        stopPolyCelloNote(midiNumber, pianoTarget);
      } else {
        stopSound(midiNumber, pianoTarget);
      }

      const keyEl = document.querySelector(
        `#${pianoTarget} [data-number="${midiNumber}"]`
      );
      if (keyEl) keyEl.classList.remove("pressed");
    }
  }
    
  // time set
  const targetTime = manualTimeList[manualTimeIndex];
  const previousTime = manualTimeList[manualTimeIndex-1];
  manualTimeIndex++;
  // note to play & end
  const notesToPlay = [];
  const notesToEnd = [];
  currentMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      if (note.time === targetTime) 
        notesToPlay.push(note);
      if (((note.time + note.duration) <= targetTime) && 
          ((note.time + note.duration) >= previousTime)) 
        notesToEnd.push(note);
    });
  });
  // 1. noteoff that can noteoff
  notesToEnd.forEach((note) => {
    const midiNumber = note.midi;

    const sound = soundSettings[pianoTarget]?.sound;
    const sustain = soundSettings[pianoTarget]?.sustain;
    const usePoly = sustain && ["cello", "violin", "Trombone"].includes(sound);

    if (usePoly) {
      stopPolyCelloNote(midiNumber, pianoTarget);
    } else {
      stopSound(midiNumber, pianoTarget);
    }

    const keyEl = document.querySelector(
      `#${pianoTarget} [data-number="${midiNumber}"]`
    );
    if (keyEl) keyEl.classList.remove("pressed");
  });
<<<<<<< HEAD
  // 2. noteon!
=======
  previousManualNotes = [];

  // ---- 2️⃣ 播放這次的音 ----
  const notesToPlay = [];
  currentMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      if (note.time === targetTime) notesToPlay.push(note);
    });
  });

  if (notesToPlay.length === 0) {
    alert("找不到下一個音符，可能是 MIDI 檔案太短或已播放完。");
  }

>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
  notesToPlay.forEach((note) => {
    const midiNumber = note.midi;
    const actualVelocity = Math.min(velocity * globalVelocityMultiplier, 127);

    playSound(midiNumber, pianoTarget, actualVelocity);

    const keyEl = document.querySelector(
      `#${pianoTarget} [data-number="${midiNumber}"]`
    );
    if (keyEl) keyEl.classList.add("pressed");
  });

  previousTriggerKey = triggeringNote;
}

<<<<<<< HEAD
// release keyboard
function stopManualNotes() {
  const targetTime = manualTimeList[manualTimeIndex];
  const previousTime = manualTimeList[manualTimeIndex-1];
  const notesToEnd = [];
  currentMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      if (((note.time + note.duration) <= targetTime) && 
          ((note.time + note.duration) >= previousTime)) 
        notesToEnd.push(note);
    });
  });

  notesToEnd.forEach((note) => {
    const midiNumber = note.midi;

    const sound = soundSettings[pianoTarget]?.sound;
    const sustain = soundSettings[pianoTarget]?.sustain;
    const usePoly = sustain && ["cello", "violin", "Trombone"].includes(sound);

    if (usePoly) {
      stopPolyCelloNote(midiNumber, pianoTarget);
    } else {
      stopSound(midiNumber, pianoTarget);
    }

    const keyEl = document.querySelector(
      `#${pianoTarget} [data-number="${midiNumber}"]`
    );
    if (keyEl) keyEl.classList.remove("pressed");
  });
}

function setManualTriggerKey(note) {
  previousTriggerKey = note;
}
function getManualTriggerKey() {
  return previousTriggerKey;
}

=======
>>>>>>> af45f80732b600bd29504fed18c6d8f4f9185b91
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
  setManualTriggerKey,
  getManualTriggerKey,
  stopPolyCelloNote, // ✅ 加上這行
};
