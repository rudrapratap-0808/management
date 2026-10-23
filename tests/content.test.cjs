const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function loadContent(savedSettings, { storageFailure = false, deferredRead = false } = {}) {
  const attributes = new Map();
  const properties = new Map();
  const storageListeners = [];
  const documentListeners = new Map();
  let resolveRead;
  const documentElement = {
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: name => attributes.get(name) ?? null,
    removeAttribute: name => attributes.delete(name),
    hasAttribute: name => attributes.has(name),
    style: {
      setProperty: (name, value) => properties.set(name, String(value)),
      getPropertyValue: name => properties.get(name) ?? '',
      removeProperty: name => properties.delete(name)
    }
  };
  const document = {
    documentElement,
    readyState: 'complete',
    addEventListener: (type, callback) => documentListeners.set(type, callback),
    removeEventListener: type => documentListeners.delete(type)
  };
  const context = vm.createContext({
    chrome: {
      storage: {
        local: {
          get: async () => {
            if (storageFailure) throw new Error('Storage unavailable');
            if (deferredRead) return new Promise(resolve => { resolveRead = resolve; });
            return savedSettings === undefined ? {} : { ytGlassSettings: savedSettings };
          }
        },
        onChanged: { addListener: callback => storageListeners.push(callback) }
      }
    },
    document,
    window: { document },
    console: { warn() {}, error() {}, log() {} },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: callback => callback()
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context, { filename: 'content.js' });
  await settle();
  return {
    attributes,
    properties,
    documentListeners,
    async resolveInitial(value) {
      resolveRead({ ytGlassSettings: value });
      await settle();
    },
    async change(value, area = 'local', key = 'ytGlassSettings') {
      for (const listener of storageListeners) {
        listener({ [key]: { newValue: value } }, area);
      }
      await settle();
    }
  };
}

test('applies the default theme when no settings have been saved', async () => {
  const page = await loadContent();
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'violet');
  assert.equal(page.attributes.has('data-yt-glass-motion'), false);
  assert.match(page.properties.get('--ytg-blur'), /^\d+(?:\.\d+)?px$/);
  assert.ok(Number.isFinite(Number(page.properties.get('--ytg-glow'))));
});

test('restores saved accent, intensity, and motion preferences', async () => {
  const page = await loadContent({ enabled: true, accent: 'mint', intensity: 20, reduceMotion: true });
  const defaultPage = await loadContent();
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'mint');
  assert.equal(page.attributes.get('data-yt-glass-motion'), 'reduced');
  assert.ok(parseFloat(page.properties.get('--ytg-blur')) < parseFloat(defaultPage.properties.get('--ytg-blur')));
  assert.ok(Number(page.properties.get('--ytg-glow')) < Number(defaultPage.properties.get('--ytg-glow')));
});

test('updates open pages immediately and fully removes theme state when disabled', async () => {
  const page = await loadContent();
  await page.change({ enabled: true, accent: 'rose', intensity: 100, reduceMotion: true });
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'rose');
  assert.equal(page.attributes.get('data-yt-glass-motion'), 'reduced');
  await page.change({ enabled: false, accent: 'rose', intensity: 100, reduceMotion: true });
  assert.equal(page.attributes.has('data-yt-glass'), false);
  assert.equal(page.attributes.has('data-yt-glass-accent'), false);
  assert.equal(page.attributes.has('data-yt-glass-motion'), false);
  assert.equal(page.properties.has('--ytg-blur'), false);
  assert.equal(page.properties.has('--ytg-glow'), false);
  await page.change({ enabled: true, accent: 'blue', intensity: 40, reduceMotion: false });
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'blue');
  assert.equal(page.attributes.has('data-yt-glass-motion'), false);
});

test('keeps the native page untouched when saved settings disable the theme', async () => {
  const page = await loadContent({ enabled: false });
  assert.equal(page.attributes.has('data-yt-glass'), false);
  assert.equal(page.properties.size, 0);
});

test('ignores unrelated keys and storage areas', async () => {
  const page = await loadContent();
  await page.change({ enabled: false }, 'sync');
  await page.change({ enabled: false }, 'local', 'anotherExtensionSetting');
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'violet');
});

test('deleting saved settings reapplies defaults', async () => {
  const page = await loadContent({ enabled: false, accent: 'blue' });
  await page.change(undefined);
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'violet');
});

test('invalid stored values cannot inject CSS or invalid theme attributes', async () => {
  const page = await loadContent({ enabled: 'false', accent: 'red; background: url(https://example.com)', intensity: 'broken', reduceMotion: 'false' });
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'violet');
  assert.equal(page.attributes.has('data-yt-glass-motion'), false);
  assert.match(page.properties.get('--ytg-blur'), /^\d+(?:\.\d+)?px$/);
  assert.ok(Number.isFinite(Number(page.properties.get('--ytg-glow'))));
});

test('out of range intensity is clamped to supported endpoints', async () => {
  const high = await loadContent({ intensity: 1000 });
  const maximum = await loadContent({ intensity: 100 });
  const low = await loadContent({ intensity: -100 });
  const minimum = await loadContent({ intensity: 0 });
  assert.equal(high.properties.get('--ytg-blur'), maximum.properties.get('--ytg-blur'));
  assert.equal(high.properties.get('--ytg-glow'), maximum.properties.get('--ytg-glow'));
  assert.equal(low.properties.get('--ytg-blur'), minimum.properties.get('--ytg-blur'));
  assert.equal(low.properties.get('--ytg-glow'), minimum.properties.get('--ytg-glow'));
});

test('storage errors still leave a working default theme', async () => {
  const page = await loadContent(undefined, { storageFailure: true });
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'violet');
});

test('a late initial storage read cannot override a newer user update', async () => {
  const page = await loadContent(undefined, { deferredRead: true });
  await page.change({ enabled: true, accent: 'mint', intensity: 30, reduceMotion: true });
  await page.resolveInitial({ enabled: false, accent: 'rose', intensity: 90, reduceMotion: false });
  assert.equal(page.attributes.get('data-yt-glass'), 'on');
  assert.equal(page.attributes.get('data-yt-glass-accent'), 'mint');
  assert.equal(page.attributes.get('data-yt-glass-motion'), 'reduced');
});

test('corrupt non-object settings safely use defaults', async () => {
  for (const saved of [null, [], 'invalid', 42]) {
    const page = await loadContent(saved);
    assert.equal(page.attributes.get('data-yt-glass'), 'on');
    assert.equal(page.attributes.get('data-yt-glass-accent'), 'violet');
  }
});
