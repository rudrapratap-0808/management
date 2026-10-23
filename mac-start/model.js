/* Shared, dependency-free validation for storage and navigation. */
(() => {
  'use strict';
  const COLORS = ['blue', 'violet', 'rose', 'mint', 'orange', 'slate'];
  const FAVORITES = [
    { id:'google', name:'Google', url:'https://www.google.com/', color:'blue', icon:'google' },
    { id:'youtube', name:'YouTube', url:'https://www.youtube.com/', color:'rose', icon:'youtube' },
    { id:'gmail', name:'Gmail', url:'https://mail.google.com/', color:'blue', icon:'mail' },
    { id:'github', name:'GitHub', url:'https://github.com/', color:'slate', icon:'github' },
    { id:'figma', name:'Figma', url:'https://www.figma.com/', color:'violet', icon:'figma' },
    { id:'notion', name:'Notion', url:'https://www.notion.so/', color:'slate', icon:'notion' },
    { id:'spotify', name:'Spotify', url:'https://open.spotify.com/', color:'mint', icon:'spotify' },
    { id:'wikipedia', name:'Wikipedia', url:'https://www.wikipedia.org/', color:'slate', icon:'wikipedia' },
  ];
  const DEFAULTS = { wallpaper:'sky', customImage:'', showFavorites:true, showPrivacy:true, showInspiration:true, showDock:true, reduceMotion:false, sidebar:false, displayName:'', searchEngine:'google', favorites:FAVORITES };
  const ENGINES = { google:'https://www.google.com/search?q=', duckduckgo:'https://duckduckgo.com/?q=', bing:'https://www.bing.com/search?q=' };
  function website(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || /\s/.test(trimmed)) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (!url.hostname.includes('.') && url.hostname !== 'localhost')) return null;
      return url.href;
    } catch { return null; }
  }
  function normalize(value) {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = { ...DEFAULTS, favorites:FAVORITES.map(f => ({...f})) };
    for (const key of ['showFavorites','showPrivacy','showInspiration','showDock','reduceMotion','sidebar']) if (typeof v[key] === 'boolean') result[key] = v[key];
    if (['sky','coast','dusk','custom'].includes(v.wallpaper)) result.wallpaper = v.wallpaper;
    if (typeof v.customImage === 'string' && v.customImage.length <= 4300000 && /^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(v.customImage)) result.customImage = v.customImage;
    if (result.wallpaper === 'custom' && !result.customImage) result.wallpaper = 'sky';
    if (typeof v.displayName === 'string') result.displayName = v.displayName.trim().slice(0,24);
    if (Object.hasOwn(ENGINES, v.searchEngine)) result.searchEngine = v.searchEngine;
    if (Array.isArray(v.favorites)) {
      const ids = new Set();
      result.favorites = v.favorites.slice(0,24).filter(f => f && typeof f.id === 'string' && f.id.length > 0 && f.id.length <= 80 && !ids.has(f.id) && ids.add(f.id) && typeof f.name === 'string' && f.name.trim() && website(f.url)).map(f => ({
        id:f.id.slice(0,80), name:f.name.trim().slice(0,30), url:website(f.url), color:COLORS.includes(f.color) ? f.color : 'blue', icon:FAVORITES.some(p => p.icon === f.icon) ? f.icon : '',
      }));
    }
    return result;
  }
  function destination(value, engine = 'google') {
    const query = String(value || '').trim();
    if (!query) return null;
    return website(query) || (ENGINES[engine] || ENGINES.google) + encodeURIComponent(query);
  }
  const model = { DEFAULTS, COLORS, normalize, website, destination };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else globalThis.MacStartModel = model;
})();
