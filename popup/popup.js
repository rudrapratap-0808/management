"use strict";

(() => {
  const STORAGE_KEY = "ytGlassSettings";
  const DEFAULTS = Object.freeze({ enabled: true, accent: "violet", intensity: 70, reduceMotion: false });
  const ACCENTS = Object.freeze({
    violet: { color: "#ac94ff", rgb: "172,148,255", name: "Violet haze" },
    blue: { color: "#79b8ff", rgb: "121,184,255", name: "Ocean blue" },
    rose: { color: "#ff98b5", rgb: "255,152,181", name: "Rose glow" },
    mint: { color: "#7de2c3", rgb: "125,226,195", name: "Fresh mint" },
  });
  const elements = {
    enabled: document.getElementById("enabled"),
    themeStatus: document.getElementById("theme-status"),
    accentName: document.getElementById("accent-name"),
    accents: [...document.querySelectorAll('input[name="accent"]')],
    intensity: document.getElementById("intensity"),
    intensityValue: document.getElementById("intensity-value"),
    reduceMotion: document.getElementById("reduce-motion"),
    saveMessage: document.getElementById("save-message"),
  };
  const extensionStorage = typeof chrome !== "undefined" && chrome.storage?.local;
  let settings = { ...DEFAULTS };
  let saveQueue = Promise.resolve();

  function normalize(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULTS.enabled,
      accent: Object.hasOwn(ACCENTS, input.accent) ? input.accent : DEFAULTS.accent,
      intensity: typeof input.intensity === "number" && Number.isFinite(input.intensity)
        ? Math.round(Math.min(100, Math.max(0, input.intensity))) : DEFAULTS.intensity,
      reduceMotion: typeof input.reduceMotion === "boolean" ? input.reduceMotion : DEFAULTS.reduceMotion,
    };
  }

  function render() {
    const accent = ACCENTS[settings.accent];
    const style = document.documentElement.style;
    style.setProperty("--accent", accent.color);
    style.setProperty("--accent-rgb", accent.rgb);
    style.setProperty("--range-position", `${settings.intensity}%`);
    style.setProperty("--preview-blur", `${4 + settings.intensity * 0.2}px`);
    style.setProperty("--preview-opacity", `${0.04 + settings.intensity * 0.0012}`);
    document.body.dataset.enabled = String(settings.enabled);
    document.body.dataset.reduceMotion = String(settings.reduceMotion);
    elements.enabled.checked = settings.enabled;
    elements.themeStatus.textContent = settings.enabled
      ? "On. A little more atmosphere." : "Off. YouTube’s original look.";
    elements.accentName.textContent = accent.name;
    elements.accents.forEach((input) => { input.checked = input.value === settings.accent; });
    elements.intensity.value = String(settings.intensity);
    elements.intensityValue.value = `${settings.intensity}%`;
    elements.reduceMotion.checked = settings.reduceMotion;
  }

  function save(patch) {
    settings = normalize({ ...settings, ...patch });
    render();
    const snapshot = { ...settings };
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      try {
        if (extensionStorage) await extensionStorage.set({ [STORAGE_KEY]: snapshot });
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        document.body.dataset.saveError = "false";
        elements.saveMessage.textContent = "Saved automatically";
      } catch {
        document.body.dataset.saveError = "true";
        elements.saveMessage.textContent = "Couldn’t save. Please try again.";
      }
    });
  }

  async function initialize() {
    try {
      const saved = extensionStorage
        ? (await extensionStorage.get(STORAGE_KEY))[STORAGE_KEY]
        : JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      settings = normalize(saved);
    } catch {
      document.body.dataset.saveError = "true";
      elements.saveMessage.textContent = "Couldn’t load saved settings.";
    }
    render();
    elements.enabled.addEventListener("change", () => save({ enabled: elements.enabled.checked }));
    elements.accents.forEach((input) => input.addEventListener("change", () => {
      if (input.checked) save({ accent: input.value });
    }));
    elements.intensity.addEventListener("input", () => save({ intensity: Number(elements.intensity.value) }));
    elements.reduceMotion.addEventListener("change", () => save({ reduceMotion: elements.reduceMotion.checked }));
  }

  initialize();
})();
