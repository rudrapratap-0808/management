(() => {
  'use strict';
  const { normalize, website, destination } = MacStartModel;
  const KEY = 'macStartSettings';
  const $ = id => document.getElementById(id);
  const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;
  let settings = normalize();
  let editing = false;
  let editingId = null;
  let saveQueue = Promise.resolve();
  let toastTimer;
  let lastUpdated = 0;
  const icons = { youtube:'i-play', github:'i-github', mail:'i-mail' };

  function svgIcon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  }
  function notify(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
  }
  function persist(patch, rerender = true) {
    settings = normalize({ ...settings, ...patch });
    lastUpdated += 1;
    if (rerender) render();
    const snapshot = structuredClone(settings);
    $('settings-status').textContent = 'Saving…';
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      try {
        if (hasChromeStorage) await chrome.storage.local.set({ [KEY]:snapshot });
        else localStorage.setItem(KEY, JSON.stringify(snapshot));
        $('settings-status').textContent = 'Saved on this device';
      } catch {
        $('settings-status').textContent = 'Couldn’t save';
        notify('Your changes could not be saved. Storage may be full. Try a smaller background image.');
      }
    });
    return saveQueue;
  }
  function logo(favorite) {
    const tile = document.createElement('span');
    tile.className = 'favorite-tile';
    tile.dataset.color = favorite.color;
    tile.dataset.icon = favorite.icon || '';
    if (icons[favorite.icon]) tile.append(svgIcon(icons[favorite.icon]));
    else if (favorite.icon === 'google') {
      const letter = document.createElement('b'); letter.className = 'google-mark'; letter.textContent = 'G'; tile.append(letter);
    } else if (favorite.icon === 'figma') {
      const mark = document.createElement('span'); mark.className = 'figma-mark';
      for (let i=0;i<5;i++) mark.append(document.createElement('i'));
      tile.append(mark);
    } else tile.textContent = ({notion:'N',spotify:'≋',wikipedia:'W'})[favorite.icon] || favorite.name.slice(0,1).toLocaleUpperCase();
    tile.setAttribute('aria-hidden','true');
    return tile;
  }
  function renderFavorites() {
    const grid = $('favorites-grid'); grid.replaceChildren();
    grid.classList.toggle('editing', editing);
    $('edit-favorites').setAttribute('aria-pressed', String(editing));
    $('edit-favorites').replaceChildren(document.createTextNode(editing ? 'Done' : 'Edit'), svgIcon(editing ? 'i-x' : 'i-edit'));
    for (const favorite of settings.favorites) {
      const item = document.createElement(editing ? 'button' : 'a');
      item.className = 'favorite';
      if (editing) {
        item.type = 'button';
        item.setAttribute('aria-label', `Edit ${favorite.name}`);
        item.addEventListener('click', () => openFavorite(favorite.id));
        const edit = document.createElement('span'); edit.className = 'edit-indicator'; edit.append(svgIcon('i-edit')); item.append(edit);
      } else { item.href = favorite.url; item.title = favorite.url; }
      item.append(logo(favorite));
      const name = document.createElement('span'); name.className = 'favorite-name'; name.textContent = favorite.name; item.append(name); grid.append(item);
    }
    if (settings.favorites.length < 24) {
      const add = document.createElement('button'); add.className = 'favorite favorite-add'; add.type = 'button'; add.setAttribute('aria-label','Add a favorite');
      const tile = document.createElement('span'); tile.className = 'favorite-tile'; tile.append(svgIcon('i-plus'));
      const caption = document.createElement('span'); caption.className = 'favorite-name'; caption.textContent = 'Add favorite'; add.append(tile,caption); add.addEventListener('click',()=>openFavorite()); grid.append(add);
    }
    const side = $('sidebar-links'); side.replaceChildren();
    for (const favorite of settings.favorites) {
      const a = document.createElement('a'); a.href = favorite.url;
      const initial = document.createElement('i'); initial.textContent = favorite.name.slice(0,1).toLocaleUpperCase(); initial.setAttribute('aria-hidden','true');
      const name = document.createElement('span'); name.textContent = favorite.name; a.append(initial,name); side.append(a);
    }
    $('add-toolbar').disabled = settings.favorites.length >= 24;
  }
  function render() {
    const sections = { showFavorites:'favorites-section', showPrivacy:'privacy-section', showInspiration:'inspiration-section', showDock:'dock', sidebar:'sidebar' };
    for (const [key,id] of Object.entries(sections)) $(id).hidden = !settings[key];
    $('sidebar-toggle').setAttribute('aria-expanded',String(settings.sidebar));
    $('sidebar-toggle').setAttribute('aria-label',settings.sidebar ? 'Hide shortcuts sidebar' : 'Show shortcuts sidebar');
    document.body.dataset.reduceMotion = String(settings.reduceMotion);
    document.body.dataset.dock = String(settings.showDock);
    const surface = $('page-surface');
    surface.dataset.wallpaper = settings.wallpaper;
    if (settings.wallpaper === 'custom') surface.style.backgroundImage = `url("${settings.customImage}")`;
    else surface.style.removeProperty('background-image');
    for (const checkbox of document.querySelectorAll('[data-setting]')) checkbox.checked = settings[checkbox.dataset.setting];
    for (const button of document.querySelectorAll('.wallpaper-option[data-wallpaper]')) button.setAttribute('aria-pressed', String(settings.wallpaper === button.dataset.wallpaper));
    if (document.activeElement !== $('display-name')) $('display-name').value = settings.displayName;
    $('search-engine').value = settings.searchEngine;
    renderFavorites(); updateClock();
  }
  function updateClock() {
    const now = new Date();
    $('menu-clock').textContent = new Intl.DateTimeFormat(undefined,{weekday:'short',hour:'2-digit',minute:'2-digit'}).format(now);
    $('menu-clock').dateTime = now.toISOString();
    $('today').textContent = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(now);
    $('dock-day').textContent = String(now.getDate());
    $('dock-month').textContent = new Intl.DateTimeFormat(undefined,{month:'short'}).format(now).toLocaleUpperCase();
    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = settings.displayName ? `${greeting}, ${settings.displayName}.` : 'Make yourself at home.';
  }
  function openFavorite(id = null) {
    if (!id && settings.favorites.length >= 24) { notify('You can keep up to 24 favorites. Edit one to make room.'); return; }
    const favorite = settings.favorites.find(f=>f.id === id);
    editingId = favorite?.id || null;
    $('favorite-dialog-title').textContent = favorite ? 'Edit favorite' : 'Add a favorite';
    $('favorite-name').value = favorite?.name || '';
    $('favorite-url').value = favorite?.url || '';
    $('favorite-color').value = favorite?.color || 'blue';
    $('favorite-error').textContent = '';
    $('remove-favorite').hidden = !favorite;
    $('favorite-dialog').showModal();
    $('favorite-name').focus();
  }
  function wireEvents() {
    $('search-form').addEventListener('submit',event=>{
      event.preventDefault(); const target = destination($('search').value,settings.searchEngine); if (target) location.assign(target);
    });
    const focusSearch = () => { $('search').focus(); $('search').select(); };
    $('dock-search').addEventListener('click',focusSearch);
    document.addEventListener('keydown',event=>{ if ((event.metaKey||event.ctrlKey) && event.key.toLowerCase()==='k' && !document.querySelector('dialog[open]')) { event.preventDefault(); focusSearch(); } });
    $('sidebar-toggle').addEventListener('click',()=>persist({sidebar:!settings.sidebar}));
    $('home-button').addEventListener('click',()=>{ $('page-surface').scrollTo({top:0,behavior:settings.reduceMotion?'instant':'smooth'}); if (matchMedia('(max-width:760px)').matches) persist({sidebar:false}); });
    $('add-toolbar').addEventListener('click',()=>openFavorite());
    $('edit-favorites').addEventListener('click',()=>{ editing=!editing;renderFavorites(); });
    for (const button of document.querySelectorAll('.open-settings')) button.addEventListener('click',()=>{render();$('settings-dialog').showModal();});
    for (const button of document.querySelectorAll('.close-dialog')) button.addEventListener('click',()=>button.closest('dialog').close());
    for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    $('favorite-form').addEventListener('submit',event=>{
      event.preventDefault();
      const name=$('favorite-name').value.trim(); const url=website($('favorite-url').value);
      if(!name||!url){$('favorite-error').textContent='Enter a name and a valid http:// or https:// website, such as example.com.';return;}
      const old=settings.favorites.find(f=>f.id===editingId);
      const item={id:editingId||crypto.randomUUID(),name,url,color:$('favorite-color').value,icon:old&&old.url===url?old.icon:''};
      const favorites=editingId?settings.favorites.map(f=>f.id===editingId?item:f):[...settings.favorites,item];
      persist({favorites}); $('favorite-dialog').close(); notify(editingId?'Favorite updated.':'A new favorite, right at home.');
    });
    $('remove-favorite').addEventListener('click',()=>{persist({favorites:settings.favorites.filter(f=>f.id!==editingId)});$('favorite-dialog').close();notify('Favorite removed.');});
    for(const checkbox of document.querySelectorAll('[data-setting]'))checkbox.addEventListener('change',()=>persist({[checkbox.dataset.setting]:checkbox.checked}));
    for(const button of document.querySelectorAll('.wallpaper-option[data-wallpaper]'))button.addEventListener('click',()=>persist({wallpaper:button.dataset.wallpaper}));
    $('display-name').addEventListener('input',()=>{persist({displayName:$('display-name').value},false);updateClock();});
    $('display-name').addEventListener('blur',()=>{$('display-name').value=settings.displayName;});
    $('search-engine').addEventListener('change',()=>persist({searchEngine:$('search-engine').value}));
    $('wallpaper-upload').addEventListener('change',async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024){notify('Choose a JPG, PNG or WebP image smaller than 3 MB.');return;}
      try{
        const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
        await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=image;});
        await persist({wallpaper:'custom',customImage:image});
      }catch{notify('That image could not be opened. Please try another image.');}
    });
    $('reset-appearance').addEventListener('click',()=>{persist({wallpaper:'sky',customImage:'',showFavorites:true,showPrivacy:true,showInspiration:true,showDock:true,reduceMotion:false,sidebar:false});notify('The original look is back.');});
  }
  async function initialize(){
    // Bind after loading so a slow storage read cannot overwrite a user edit.
    try{const saved=hasChromeStorage?(await chrome.storage.local.get(KEY))[KEY]:JSON.parse(localStorage.getItem(KEY)||'null');settings=normalize(saved);}
    catch{notify('Saved settings could not be loaded. You can still use the start page.');}
    render();wireEvents();setInterval(updateClock,15000);
    document.querySelector('.search-key').textContent=navigator.platform.includes('Mac')?'⌘ K':'Ctrl K';
    // Each tab's serialized saves are handled locally; other open tabs update too.
    if(hasChromeStorage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY]){const revision=++lastUpdated;saveQueue.finally(()=>{if(revision===lastUpdated){settings=normalize(changes[KEY].newValue);render();}});}});
    else window.addEventListener('storage',event=>{if(event.key===KEY){try{settings=normalize(JSON.parse(event.newValue));render();}catch{}}});
  }
  initialize();
})();
