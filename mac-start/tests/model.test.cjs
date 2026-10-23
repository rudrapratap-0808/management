const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {normalize,website,destination} = require('../model.js');

test('favorites accept web addresses and reject dangerous protocols and credentials',()=>{
  assert.equal(website('example.com/docs'),'https://example.com/docs');
  assert.equal(website('https://example.com/'),'https://example.com/');
  assert.equal(website('http://localhost:8080/'),'http://localhost:8080/');
  for(const input of ['javascript:alert(1)','data:text/html,<h1>Hi</h1>','file:///etc/passwd','chrome://settings','https://name:password@example.com','not a website',''])assert.equal(website(input),null,input);
});
test('search uses the selected engine, encodes queries, and navigates web addresses directly',()=>{
  assert.equal(destination('hello & goodbye','duckduckgo'),'https://duckduckgo.com/?q=hello%20%26%20goodbye');
  assert.equal(destination('github.com'),'https://github.com/');
  assert.equal(destination('javascript:alert(1)'),'https://www.google.com/search?q=javascript%3Aalert(1)');
  assert.equal(destination(''),null);
});
test('corrupt settings fall back safely and copies cannot mutate defaults',()=>{
  for(const value of [undefined,null,[],42,'bad']){const valueNormalized=normalize(value);assert.equal(valueNormalized.wallpaper,'sky');assert.equal(valueNormalized.favorites.length,8);}
  const first=normalize();first.favorites[0].name='Changed';assert.equal(normalize().favorites[0].name,'Google');
  const corrupt=normalize({showDock:'false',wallpaper:'unknown',searchEngine:'toString',displayName:'x'.repeat(50)});
  assert.equal(corrupt.showDock,true);assert.equal(corrupt.wallpaper,'sky');assert.equal(corrupt.searchEngine,'google');assert.equal(corrupt.displayName.length,24);
});
test('stored links are bounded, sanitized, and duplicate IDs removed',()=>{
  const f={id:'a',name:' Fine ',url:'example.com',color:'invalid',icon:'malicious'};
  const value=normalize({favorites:[f,f,{id:'b',name:'Bad',url:'javascript:alert(1)'}]});
  assert.equal(value.favorites.length,1);assert.equal(value.favorites[0].name,'Fine');assert.equal(value.favorites[0].color,'blue');assert.equal(value.favorites[0].icon,'');
  assert.equal(normalize({favorites:[]}).favorites.length,0);
  assert.equal(normalize({favorites:Array.from({length:50},(_,i)=>({...f,id:String(i)}))}).favorites.length,24);
});
test('custom wallpaper only accepts bounded raster image data',()=>{
  assert.equal(normalize({wallpaper:'custom',customImage:'https://tracker.example/pixel.png'}).wallpaper,'sky');
  assert.equal(normalize({wallpaper:'custom',customImage:'data:image/svg+xml;base64,PHN2Zz4='}).wallpaper,'sky');
  assert.equal(normalize({wallpaper:'custom',customImage:'data:image/png;base64,aGVsbG8='}).wallpaper,'custom');
  assert.equal(normalize({wallpaper:'custom',customImage:'data:image/png;base64,'+'a'.repeat(4400000)}).wallpaper,'sky');
});
test('manifest and all linked files are local and require only storage',()=>{
  const root=path.resolve(__dirname,'..');const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  assert.equal(m.manifest_version,3);assert.deepEqual(m.permissions,['storage']);assert.equal(m.host_permissions,undefined);assert.equal(m.content_scripts,undefined);
  for(const asset of [m.chrome_url_overrides.newtab,m.background.service_worker,...Object.values(m.icons)])assert.ok(fs.existsSync(path.join(root,asset)),asset);
  const html=fs.readFileSync(path.join(root,'newtab.html'),'utf8');assert.doesNotMatch(html,/\son\w+\s*=/i);
  for(const match of html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)){assert.equal(match[2],'');assert.ok(fs.existsSync(path.join(root,match[1])));assert.doesNotMatch(match[1],/^https?:/);}
  assert.doesNotMatch(fs.readFileSync(path.join(root,'newtab.css'),'utf8'),/@import|url\(['"]?https?:/);
});
