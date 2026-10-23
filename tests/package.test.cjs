const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('uses Manifest V3 and only local settings permission', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('content scripts are limited to desktop YouTube pages', () => {
  assert.ok(manifest.content_scripts.length > 0);
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, ['https://www.youtube.com/*']);
    assert.notEqual(script.all_frames, true);
    assert.equal(script.run_at, 'document_start');
  }
});

test('all popup, content, and icon files referenced by the manifest exist', () => {
  const assets = [
    manifest.action.default_popup,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {}),
    ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])])
  ];
  for (const asset of assets) {
    assert.equal(typeof asset, 'string');
    assert.ok(fs.statSync(path.join(root, asset)).isFile(), `Missing asset: ${asset}`);
  }
});

test('popup loads local scripts under the extension CSP', () => {
  const popupPath = path.join(root, manifest.action.default_popup);
  const html = fs.readFileSync(popupPath, 'utf8');
  assert.doesNotMatch(html, /\son\w+\s*=/i, 'Inline event handlers violate the MV3 CSP');
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(script[1], /\bsrc=["'][^"']+["']/i, 'Use a local external script');
    assert.equal(script[2].trim(), '', 'Inline scripts violate the MV3 CSP');
    const src = script[1].match(/\bsrc=["']([^"']+)["']/i)[1];
    assert.doesNotMatch(src, /^(?:https?:|\/\/)/);
    assert.ok(fs.existsSync(path.resolve(path.dirname(popupPath), src)));
  }
});

test('theme styles remain scoped to the enabled extension state', () => {
  const cssPath = manifest.content_scripts.flatMap(script => script.css || [])[0];
  assert.ok(cssPath, 'Declare a static theme stylesheet');
  const css = fs.readFileSync(path.join(root, cssPath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /@import\b/i, 'Keep the extension self contained');
  assert.doesNotMatch(css, /url\(\s*["']?https?:/i, 'Keep the extension self contained');

  const headers = [];
  let start = 0;
  let inString = '';
  let parenDepth = 0;
  let inDeclarations = false;
  let depth = 0;
  let declarationDepth = 0;
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (inString) {
      if (char === '\\') { i++; continue; }
      if (char === inString) inString = '';
      continue;
    }
    if (char === '"' || char === "'") { inString = char; continue; }
    if (char === '(') { parenDepth++; continue; }
    if (char === ')') { parenDepth--; continue; }
    if (parenDepth) continue;
    if (char === '{') {
      depth++;
      if (!inDeclarations) {
        const header = css.slice(start, i).trim();
        if (!header.startsWith('@')) {
          headers.push(header);
          inDeclarations = true;
          declarationDepth = depth;
        } else if (!/^@(?:media|supports|layer|container)\b/i.test(header)) {
          // Keyframes and declaration-only at-rules have their own syntax.
          inDeclarations = true;
          declarationDepth = depth;
        }
      }
      start = i + 1;
    } else if (char === '}') {
      if (depth === declarationDepth) inDeclarations = false;
      depth--;
      start = i + 1;
    } else if (char === ';' && !inDeclarations) start = i + 1;
  }
  assert.ok(headers.length > 0);
  for (const header of headers) {
    assert.match(header, /\[data-yt-glass\s*=\s*(["']?)on\1\s*\]/, `Ungated CSS rule: ${header}`);
  }
});
