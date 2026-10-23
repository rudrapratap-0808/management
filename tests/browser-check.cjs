// Browser checks use a local YouTube fixture and a shared Chrome-storage mock.
// Managed Chromium blocks unpacked extension installs in this environment.
// These checks validate UI, settings propagation, and computed CSS; they do not
// claim to validate installation or content-script injection on live YouTube.
// All page requests are intercepted; no real website is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const extensionPath = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'youtube.html'), 'utf8')
  .replace('<head>', '<head><link rel="stylesheet" href="/__glass-preview/theme.css"><script defer src="/__glass-preview/content.js"></script>');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-glass-browser-'));
const outputDirectory = path.dirname(extensionPath);
const errors = [];
const popupUrl = 'https://extension-preview.local/popup/popup.html';
const previewAssets = new Map([
  ['/popup/popup.html', ['popup/popup.html', 'text/html']],
  ['/popup/popup.css', ['popup/popup.css', 'text/css']],
  ['/popup/popup.js', ['popup/popup.js', 'text/javascript']],
]);

async function waitForTheme(page, accent = 'violet') {
  await page.waitForFunction(expected => {
    const root = document.documentElement;
    return root.getAttribute('data-yt-glass') === 'on'
      && root.getAttribute('data-yt-glass-accent') === expected;
  }, accent);
}

async function styles(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const css = getComputedStyle(root);
    const masthead = getComputedStyle(document.querySelector('ytd-masthead'));
    const card = getComputedStyle(document.querySelector('ytd-rich-grid-media'));
    return {
      background: css.backgroundColor,
      image: css.backgroundImage,
      accent: css.getPropertyValue('--ytg-accent').trim(),
      blur: root.style.getPropertyValue('--ytg-blur'),
      glow: root.style.getPropertyValue('--ytg-glow'),
      motion: root.getAttribute('data-yt-glass-motion'),
      backdrop: masthead.backdropFilter,
      radius: card.borderRadius,
      transition: card.transitionDuration,
    };
  });
}

async function setCheckbox(page, id, checked) {
  const input = page.locator(`#${id}`);
  if (await input.isChecked() !== checked) {
    // Custom switches paint a track above the visually hidden native input.
    // Clicking the containing label follows the user's actual interaction.
    await page.locator(`label.switch:has(#${id})`).click();
  }
  assert.equal(await input.isChecked(), checked);
}

async function main() {
  let context;
  let savedSettings;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      viewport: { width: 1440, height: 940 },
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    await context.exposeBinding('__glassStorageBridge', async (_source, operation, payload) => {
      if (operation === 'get') return savedSettings === undefined ? {} : { ytGlassSettings: savedSettings };
      if (operation !== 'set') throw new Error(`Unsupported mock storage operation: ${operation}`);
      const oldValue = savedSettings;
      savedSettings = payload.ytGlassSettings;
      await Promise.all(context.pages().filter(page => !page.isClosed()).map(page => page.evaluate(change => {
        if (window.__glassStorageDispatch) window.__glassStorageDispatch(change);
      }, { ytGlassSettings: { oldValue, newValue: savedSettings } })));
    });
    await context.addInitScript(() => {
      const listeners = [];
      window.__glassStorageDispatch = changes => listeners.forEach(listener => listener(changes, 'local'));
      window.chrome ||= {};
      window.chrome.storage = {
        local: {
          get: () => window.__glassStorageBridge('get'),
          set: value => window.__glassStorageBridge('set', value),
        },
        onChanged: { addListener: listener => listeners.push(listener) },
      };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'https:' && url.hostname === 'www.youtube.com' && route.request().isNavigationRequest()) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: fixture });
      }
      if (url.protocol === 'https:' && url.hostname === 'www.youtube.com' && url.pathname.startsWith('/__glass-preview/')) {
        const asset = url.pathname.slice('/__glass-preview/'.length);
        if (asset === 'theme.css' || asset === 'content.js') {
          return route.fulfill({ status: 200, contentType: asset.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join(extensionPath, asset), 'utf8') });
        }
      }
      if (url.protocol === 'https:' && url.hostname === 'extension-preview.local' && previewAssets.has(url.pathname)) {
        const [asset, contentType] = previewAssets.get(url.pathname);
        return route.fulfill({
          status: 200,
          contentType,
          headers: { 'content-security-policy': "script-src 'self'; object-src 'self'" },
          body: fs.readFileSync(path.join(extensionPath, asset), 'utf8'),
        });
      }
      return route.abort();
    });
    context.on('page', page => {
      page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error' && /(?:content security policy|refused to|uncaught)/i.test(message.text())) {
          errors.push(`${page.url()}: ${message.text()}`);
        }
      });
    });
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([first.goto('https://www.youtube.com/'), second.goto('https://www.youtube.com/results?search_query=fixture')]);
    await Promise.all([waitForTheme(first), waitForTheme(second)]);
    let applied = await styles(first);
    assert.equal(applied.background, 'rgb(12, 14, 24)');
    assert.equal(applied.blur, '22.4px');
    assert.equal(applied.glow, '0.7');
    assert.equal(applied.radius, '22px');
    assert.match(applied.backdrop, /blur\(22\.4px\)/);
    assert.notEqual(applied.image, 'none');
    console.log('LOCAL FIXTURE CHECKS: simulated Chrome storage, routed assets; no unpacked extension install or live YouTube access.');
    console.log('PASS: content-script behavior and dark glass computed styles on two fixture tabs');

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 620 });
    await popup.goto(popupUrl);
    await popup.waitForFunction(() => document.getElementById('intensity').value === '70');
    await popup.locator('body').screenshot({ path: path.join(outputDirectory, 'youtube-glass-preview.png') });
    await first.screenshot({ path: path.join(outputDirectory, 'youtube-glass-theme-preview.png'), fullPage: true });

    await popup.locator('input[name="accent"][value="mint"]').check();
    await Promise.all([waitForTheme(first, 'mint'), waitForTheme(second, 'mint')]);
    await popup.locator('#intensity').fill('25');
    await Promise.all([first, second].map(page => page.waitForFunction(() => document.documentElement.style.getPropertyValue('--ytg-blur') === '8px')));
    await setCheckbox(popup, 'reduce-motion', true);
    await Promise.all([first, second].map(page => page.waitForFunction(() => document.documentElement.getAttribute('data-yt-glass-motion') === 'reduced')));
    applied = await styles(first);
    assert.equal(applied.accent, '67, 192, 165');
    assert.equal(applied.glow, '0.25');
    assert.equal(applied.transition, '0s');
    assert.match(applied.backdrop, /blur\(8px\)/);
    console.log('PASS: accent, intensity, and motion changes propagate to both open tabs');

    await first.evaluate(() => {
      const added = document.querySelector('ytd-rich-grid-media').cloneNode(true);
      added.id = 'dynamic-card';
      document.querySelector('.grid').append(added);
      history.pushState({}, '', '/feed/subscriptions');
    });
    assert.equal(await first.locator('#dynamic-card').evaluate(card => getComputedStyle(card).borderRadius), '22px');
    assert.equal((await styles(first)).accent, '67, 192, 165');
    console.log('PASS: dynamically added cards and SPA route changes keep the theme');

    await first.evaluate(() => document.documentElement.removeAttribute('dark'));
    assert.equal((await styles(first)).background, 'rgb(239, 241, 248)');
    await first.emulateMedia({ contrast: 'more' });
    assert.equal(await first.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ytg-surface').trim()), 'rgba(255, 255, 255, 0.94)');
    await first.evaluate(() => document.documentElement.setAttribute('dark', ''));
    assert.equal(await first.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ytg-surface').trim()), 'rgba(24, 27, 43, 0.96)');
    await first.emulateMedia({ contrast: 'no-preference' });
    await setCheckbox(popup, 'reduce-motion', false);
    await first.waitForFunction(() => !document.documentElement.hasAttribute('data-yt-glass-motion'));
    await first.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal((await styles(first)).transition, '0s');
    await first.emulateMedia({ reducedMotion: 'no-preference' });
    console.log('PASS: native light/dark appearance, OS high contrast, and reduced motion');

    await setCheckbox(popup, 'enabled', false);
    await Promise.all([first, second].map(page => page.waitForFunction(() => !document.documentElement.hasAttribute('data-yt-glass'))));
    const disabled = await styles(first);
    assert.equal(disabled.background, 'rgb(15, 15, 15)');
    assert.equal(disabled.image, 'none');
    assert.equal(disabled.blur, '');
    assert.equal(disabled.glow, '');
    assert.equal(disabled.backdrop, 'none');
    assert.equal(disabled.radius, '0px');
    console.log('PASS: disabling restores native computed styles on both tabs');

    await popup.close();
    const reopened = await context.newPage();
    await reopened.goto(popupUrl);
    await reopened.waitForFunction(() => !document.getElementById('enabled').checked);
    assert.equal(await reopened.locator('input[name="accent"][value="mint"]').isChecked(), true);
    assert.equal(await reopened.locator('#intensity').inputValue(), '25');
    await setCheckbox(reopened, 'enabled', true);
    await Promise.all([waitForTheme(first, 'mint'), waitForTheme(second, 'mint')]);
    assert.equal((await styles(first)).blur, '8px');
    assert.deepEqual(errors, [], `Unexpected browser errors: ${errors.join('\n')}`);
    console.log('PASS: preferences persist on popup reopen; no script or CSP errors');
    console.log(`Preview screenshots: ${path.join(outputDirectory, 'youtube-glass-preview.png')} and ${path.join(outputDirectory, 'youtube-glass-theme-preview.png')}`);
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
