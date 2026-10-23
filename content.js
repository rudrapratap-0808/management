(() => {
  'use strict';

  const STORAGE_KEY = 'ytGlassSettings';
  const DEFAULTS = Object.freeze({
    enabled: true,
    accent: 'violet',
    intensity: 70,
    reduceMotion: false,
  });
  const ACCENTS = new Set(['violet', 'blue', 'rose', 'mint']);
  const ATTRIBUTES = ['data-yt-glass', 'data-yt-glass-accent', 'data-yt-glass-motion'];
  const PROPERTIES = ['--ytg-blur', '--ytg-glow'];
  let revision = 0;

  function normalize(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULTS.enabled,
      accent: ACCENTS.has(input.accent) ? input.accent : DEFAULTS.accent,
      intensity: typeof input.intensity === 'number' && Number.isFinite(input.intensity)
        ? Math.min(100, Math.max(0, input.intensity))
        : DEFAULTS.intensity,
      reduceMotion: typeof input.reduceMotion === 'boolean' ? input.reduceMotion : DEFAULTS.reduceMotion,
    };
  }

  function apply(value) {
    const root = document.documentElement;
    if (!root) return;
    const settings = normalize(value);

    if (!settings.enabled) {
      ATTRIBUTES.forEach((attribute) => root.removeAttribute(attribute));
      PROPERTIES.forEach((property) => root.style.removeProperty(property));
      return;
    }

    root.setAttribute('data-yt-glass', 'on');
    root.setAttribute('data-yt-glass-accent', settings.accent);
    if (settings.reduceMotion) root.setAttribute('data-yt-glass-motion', 'reduced');
    else root.removeAttribute('data-yt-glass-motion');
    root.style.setProperty('--ytg-blur', `${Number((settings.intensity * 0.32).toFixed(2))}px`);
    root.style.setProperty('--ytg-glow', String(settings.intensity / 100));
  }

  // A root attribute keeps the stylesheet effective on YouTube's client-side routes
  // and newly loaded cards without watching or rewriting the page's DOM.
  apply(DEFAULTS);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;
    revision += 1;
    apply(changes[STORAGE_KEY].newValue);
  });

  const initialRevision = revision;
  chrome.storage.local.get(STORAGE_KEY)
    .then((result) => {
      if (revision === initialRevision) apply(result[STORAGE_KEY]);
    })
    .catch(() => {
      // YouTube remains usable if storage is temporarily unavailable.
      if (revision === initialRevision) apply(DEFAULTS);
    });
})();
