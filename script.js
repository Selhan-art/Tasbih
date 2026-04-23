const menuScreen = document.getElementById("menu-screen");
const counterScreen = document.getElementById("counter-screen");
const menuButtonsContainer = document.getElementById("menu-buttons");
const addFieldBtn = document.getElementById("add-field-btn");
const totalCountNode = document.getElementById("total-count");
const resetAllBtn = document.getElementById("reset-all-btn");
const confirmModal = document.getElementById("confirm-modal");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
const addModal = document.getElementById("add-modal");
const addFieldInput = document.getElementById("add-field-input");
const addFieldError = document.getElementById("add-field-error");
const confirmAddBtn = document.getElementById("confirm-add-btn");
const cancelAddBtn = document.getElementById("cancel-add-btn");
const resetModal = document.getElementById("reset-modal");
const confirmResetAllBtn = document.getElementById("confirm-reset-all-btn");
const cancelResetAllBtn = document.getElementById("cancel-reset-all-btn");
const vibrateModeBtn = document.getElementById("vibrate-mode-btn");
const silentModeBtn = document.getElementById("silent-mode-btn");
const zikrTitle = document.getElementById("zikr-title");
const counterValue = document.getElementById("counter-value");
const tapArea = document.getElementById("counter-tap-area");
const backBtn = document.getElementById("back-btn");
const resetBtn = document.getElementById("reset-btn");

const STORAGE_KEY = "zikr-counts-v1";
const FEEDBACK_MODE_KEY = "zikr-feedback-mode-v1";
const DEFAULT_ZIKRS = ["Subhanallah", "Elhamdulillah", "Allahu Ekber"];

let counts = {};
let activeZikr = null;
let audioContext = null;
let pendingDeleteName = null;
let feedbackMode = "sound";

const bongAudio = new Audio("Sounds/ding.mp3");
bongAudio.preload = "auto";
const clickAudio = new Audio("Sounds/click.mp3");
clickAudio.preload = "auto";
const resetAudio = new Audio("Sounds/ovoz.mp3");
resetAudio.preload = "auto";

function sanitizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function saveCounts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
}

function saveFeedbackMode() {
  localStorage.setItem(FEEDBACK_MODE_KEY, feedbackMode);
}

function loadFeedbackMode() {
  const storedMode = localStorage.getItem(FEEDBACK_MODE_KEY);
  if (storedMode === "vibrate" || storedMode === "silent" || storedMode === "sound") {
    feedbackMode = storedMode;
  } else {
    feedbackMode = "sound";
  }
}

function loadCounts() {
  counts = {};
  DEFAULT_ZIKRS.forEach((name) => {
    counts[name] = 0;
  });

  const rawCounts = localStorage.getItem(STORAGE_KEY);
  if (!rawCounts) return;

  try {
    const parsed = JSON.parse(rawCounts);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;

    Object.entries(parsed).forEach(([key, value]) => {
      const normalizedKey = sanitizeName(key);
      if (!normalizedKey) return;
      const safeValue = Number(value);
      counts[normalizedKey] =
        Number.isFinite(safeValue) && safeValue >= 0 ? Math.floor(safeValue) : 0;
    });
  } catch {
    counts = {};
    DEFAULT_ZIKRS.forEach((name) => {
      counts[name] = 0;
    });
  }
}

function renderMenuButtons() {
  const fragment = document.createDocumentFragment();
  Object.keys(counts).forEach((zikrName) => {
    const row = document.createElement("div");
    row.className = "menu-row";

    const button = document.createElement("button");
    button.className = "menu-btn";
    button.type = "button";
    button.dataset.zikr = zikrName;

    const label = document.createElement("span");
    label.className = "menu-btn-label";
    label.textContent = zikrName;

    const count = document.createElement("span");
    count.className = "menu-btn-count";
    count.dataset.countFor = zikrName;
    count.textContent = `${counts[zikrName]}+`;

    button.append(label, count);
    row.appendChild(button);

    if (!DEFAULT_ZIKRS.includes(zikrName)) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-field-btn";
      deleteBtn.type = "button";
      deleteBtn.dataset.deleteFor = zikrName;
      deleteBtn.setAttribute("aria-label", `Obrisi polje ${zikrName}`);
      deleteBtn.textContent = "X";
      row.appendChild(deleteBtn);
    }

    fragment.appendChild(row);
  });

  menuButtonsContainer.innerHTML = "";
  menuButtonsContainer.appendChild(fragment);
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function primeAudio() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
}

function playTone({ frequency, duration, type, gainValue }) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playBell() {
  playTone({ frequency: 880, duration: 0.28, type: "sine", gainValue: 0.22 });
}

function playBong() {
  bongAudio.currentTime = 0;
  const playPromise = bongAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      playTone({ frequency: 196, duration: 1.1, type: "sine", gainValue: 0.3 });
    });
  }
}

function playTick() {
  clickAudio.currentTime = 0;
  const playPromise = clickAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      playTone({ frequency: 1200, duration: 0.06, type: "square", gainValue: 0.06 });
    });
  }
}

function playResetSound() {
  resetAudio.currentTime = 0;
  const playPromise = resetAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      // Fallback if custom reset audio cannot play/load.
      playTone({ frequency: 980, duration: 0.16, type: "sawtooth", gainValue: 0.08 });
      setTimeout(() => {
        playTone({ frequency: 760, duration: 0.14, type: "sawtooth", gainValue: 0.08 });
      }, 65);
      setTimeout(() => {
        playTone({ frequency: 560, duration: 0.12, type: "sawtooth", gainValue: 0.07 });
      }, 125);
      setTimeout(() => {
        playTone({ frequency: 360, duration: 0.11, type: "triangle", gainValue: 0.1 });
      }, 190);
      setTimeout(() => {
        playTone({ frequency: 250, duration: 0.34, type: "sine", gainValue: 0.12 });
      }, 260);
      setTimeout(() => {
        playTone({ frequency: 195, duration: 0.36, type: "sine", gainValue: 0.1 });
      }, 390);
    });
  }
}

function animateCounterPop() {
  counterValue.classList.remove("counter-pop");
  void counterValue.offsetWidth;
  counterValue.classList.add("counter-pop");
  setTimeout(() => {
    counterValue.classList.remove("counter-pop");
  }, 90);
}

function updateFeedbackButtonsUI() {
  vibrateModeBtn.classList.toggle("active", feedbackMode === "vibrate");
  silentModeBtn.classList.toggle("active", feedbackMode === "silent");
}

function setFeedbackMode(mode) {
  feedbackMode = mode;
  saveFeedbackMode();
  updateFeedbackButtonsUI();
}

function toggleVibrateMode() {
  setFeedbackMode(feedbackMode === "vibrate" ? "sound" : "vibrate");
}

function toggleSilentMode() {
  setFeedbackMode(feedbackMode === "silent" ? "sound" : "silent");
}

function runCountFeedback(current) {
  if (feedbackMode === "silent") return;

  if (feedbackMode === "vibrate") {
    if (navigator.vibrate) {
      if (current % 100 === 0) {
        navigator.vibrate([130, 40, 130]);
      } else if (current === 33 || current === 66 || current === 99) {
        navigator.vibrate(90);
      } else {
        navigator.vibrate(35);
      }
    }
    return;
  }

  if (current % 100 === 0) {
    playBong();
    return;
  }

  if (current === 33 || current === 66 || current === 99) {
    playBell();
    return;
  }

  playTick();
}

function updateMenuCounts() {
  let total = 0;
  const menuCountValues = document.querySelectorAll(".menu-btn-count");
  menuCountValues.forEach((countNode) => {
    const zikrName = countNode.dataset.countFor;
    const value = counts[zikrName] ?? 0;
    countNode.textContent = `${value}+`;
    total += value;
  });
  totalCountNode.textContent = `Ukupan zbir zikrova: ${total}`;
}

function updateCounterUI() {
  if (!activeZikr) return;
  zikrTitle.textContent = activeZikr;
  counterValue.textContent = counts[activeZikr] ?? 0;
}

function openCounter(zikrName) {
  if (!(zikrName in counts)) return;
  activeZikr = zikrName;
  primeAudio();
  updateCounterUI();
  menuScreen.classList.remove("screen-active");
  counterScreen.classList.add("screen-active");
}

function openMenu() {
  activeZikr = null;
  updateMenuCounts();
  counterScreen.classList.remove("screen-active");
  menuScreen.classList.add("screen-active");
}

function incrementCounter() {
  if (!activeZikr) return;
  if (feedbackMode === "sound") {
    primeAudio();
  }
  counts[activeZikr] += 1;
  const current = counts[activeZikr];
  counterValue.textContent = current;
  animateCounterPop();
  saveCounts();
  updateMenuCounts();
  runCountFeedback(current);
}

function resetCounter() {
  if (!activeZikr) return;
  if ((counts[activeZikr] ?? 0) === 0) return;
  counts[activeZikr] = 0;
  counterValue.textContent = 0;
  saveCounts();
  updateMenuCounts();
}

function resetAllCounts() {
  const hasAnyCount = Object.values(counts).some((value) => value > 0);
  if (!hasAnyCount) return;
  primeAudio();
  playResetSound();
  Object.keys(counts).forEach((key) => {
    counts[key] = 0;
  });
  saveCounts();
  updateMenuCounts();
  if (activeZikr) {
    counterValue.textContent = 0;
  }
}

function openResetModal() {
  const hasAnyCount = Object.values(counts).some((value) => value > 0);
  if (!hasAnyCount) return;
  resetModal.classList.add("modal-open");
  resetModal.setAttribute("aria-hidden", "false");
}

function closeResetModal() {
  resetModal.classList.remove("modal-open");
  resetModal.setAttribute("aria-hidden", "true");
}

function confirmResetAll() {
  resetAllCounts();
  closeResetModal();
}

function openDeleteModal(zikrName) {
  pendingDeleteName = zikrName;
  confirmModal.classList.add("modal-open");
  confirmModal.setAttribute("aria-hidden", "false");
}

function closeDeleteModal() {
  pendingDeleteName = null;
  confirmModal.classList.remove("modal-open");
  confirmModal.setAttribute("aria-hidden", "true");
}

function deleteField() {
  if (!pendingDeleteName || DEFAULT_ZIKRS.includes(pendingDeleteName)) {
    closeDeleteModal();
    return;
  }

  delete counts[pendingDeleteName];
  if (activeZikr === pendingDeleteName) {
    openMenu();
  }
  saveCounts();
  renderMenuButtons();
  updateMenuCounts();
  closeDeleteModal();
}

function addNewZikrField() {
  addFieldError.textContent = "";
  addFieldInput.value = "";
  addModal.classList.add("modal-open");
  addModal.setAttribute("aria-hidden", "false");
  setTimeout(() => addFieldInput.focus(), 0);
}

function closeAddModal() {
  addModal.classList.remove("modal-open");
  addModal.setAttribute("aria-hidden", "true");
}

function confirmAddField() {
  const zikrName = sanitizeName(addFieldInput.value);
  if (!zikrName) {
    addFieldError.textContent = "Naziv polja je obavezan.";
    return;
  }

  if (counts[zikrName] !== undefined) {
    addFieldError.textContent = "Ovo polje vec postoji.";
    return;
  }

  const lettersOnly = /^[A-Za-zČĆŽŠĐčćžšđ\s]+$/;
  if (!lettersOnly.test(zikrName)) {
    addFieldError.textContent = "Ubacite tekst.";
    return;
  }

  counts[zikrName] = 0;
  saveCounts();
  renderMenuButtons();
  updateMenuCounts();
  closeAddModal();
}

menuButtonsContainer.addEventListener("click", (event) => {
  const deleteTarget = event.target.closest(".delete-field-btn");
  if (deleteTarget) {
    openDeleteModal(deleteTarget.dataset.deleteFor);
    return;
  }

  const button = event.target.closest(".menu-btn");
  if (!button) return;
  openCounter(button.dataset.zikr);
});

tapArea.addEventListener("click", incrementCounter);
tapArea.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    incrementCounter();
  }
});

addFieldBtn.addEventListener("click", addNewZikrField);
confirmAddBtn.addEventListener("click", confirmAddField);
cancelAddBtn.addEventListener("click", closeAddModal);
addFieldInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    confirmAddField();
  }
});
addModal.addEventListener("click", (event) => {
  if (event.target === addModal) {
    closeAddModal();
  }
});
vibrateModeBtn.addEventListener("click", toggleVibrateMode);
silentModeBtn.addEventListener("click", toggleSilentMode);
backBtn.addEventListener("click", openMenu);
resetBtn.addEventListener("click", resetCounter);
resetAllBtn.addEventListener("click", openResetModal);
confirmDeleteBtn.addEventListener("click", deleteField);
cancelDeleteBtn.addEventListener("click", closeDeleteModal);
confirmResetAllBtn.addEventListener("click", confirmResetAll);
cancelResetAllBtn.addEventListener("click", closeResetModal);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) {
    closeDeleteModal();
  }
});
resetModal.addEventListener("click", (event) => {
  if (event.target === resetModal) {
    closeResetModal();
  }
});

loadCounts();
loadFeedbackMode();
renderMenuButtons();
updateMenuCounts();
updateFeedbackButtonsUI();



const numberOfStars = 100;

for (let i = 0; i < numberOfStars; i++) {
  const star = document.createElement("div");
  star.classList.add("star");

  star.style.top = Math.random() * 100 + "vh";
  star.style.left = Math.random() * 100 + "vw";

  star.style.animationDuration = (Math.random() * 3 + 2) + "s";
  star.style.animationDelay = Math.random() * 5 + "s";

  document.body.appendChild(star);
}