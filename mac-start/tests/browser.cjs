// UI checks use routed local assets and a simulated Chrome storage API.
// No external website is contacted and no browser policy is changed.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const origin = 'https://mac-start.test';
let stored;
let navigation;
const errors=[];

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,timezoneId:process.env.PREVIEW_TIMEZONE||'Asia/Kolkata'});
    await context.exposeBinding('__storageBridge',async(source,action,value)=>{
      if(action==='get')return stored?{macStartSettings:stored}:{};
      const oldValue=stored;stored=value.macStartSettings;
      await Promise.all(context.pages().filter(p=>!p.isClosed()&&p.url().startsWith(origin)).map(p=>p.evaluate(change=>{for(const listener of window.__storageListeners||[])listener(change,'local');},{macStartSettings:{oldValue,newValue:stored}})));
    });
    await context.addInitScript(()=>{
      window.__storageListeners=[];window.chrome ||= {};
      chrome.storage={local:{get:()=>window.__storageBridge('get'),set:value=>window.__storageBridge('set',value)},onChanged:{addListener:listener=>window.__storageListeners.push(listener)}};
    });
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin){
        const relative=url.pathname==='/'?'newtab.html':decodeURIComponent(url.pathname).slice(1);
        const file=path.resolve(root,relative);
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
        const ext=path.extname(file);const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
        return route.fulfill({status:200,contentType:types[ext]||'text/plain',body:fs.readFileSync(file),headers:{'content-security-policy':"script-src 'self'; object-src 'none'"}});
      }
      if(route.request().isNavigationRequest()){navigation=url.href;return route.fulfill({status:200,contentType:'text/html',body:'<title>Intercepted navigation</title><p>Test navigation intercepted locally.</p>'});}
      return route.abort();
    });
    context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/content security policy|refused to|uncaught/i.test(m.text()))errors.push(m.text());});});
    const page=await context.newPage();await page.goto(origin);
    await page.waitForFunction(()=>document.querySelectorAll('#favorites-grid .favorite').length===9);
    await page.evaluate(()=>Promise.all(['desktop','sky','coast','dusk'].map(async name=>{const image=new Image();image.src=`assets/${name}.svg`;await image.decode();})));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(root,'../mac-start-preview.png')});
    console.log('PASS: initial desktop UI, eight favorites, local assets, no horizontal overflow');

    await page.locator('.favorite-add').click();
    await page.locator('#favorite-name').fill('My notes');await page.locator('#favorite-url').fill('javascript:alert(1)');
    await page.locator('#favorite-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#favorite-error').textContent.includes('valid'));
    assert.equal(await page.locator('#favorite-dialog').evaluate(el=>el.open),true);
    await page.locator('#favorite-url').fill('example.com/notes');await page.locator('#favorite-color').selectOption('violet');await page.locator('#favorite-form button[type=submit]').click();
    await page.getByRole('link',{name:'My notes',exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'My notes',exact:true}).getAttribute('href'),'https://example.com/notes');
    await page.locator('#edit-favorites').click();await page.getByRole('button',{name:'Edit My notes',exact:true}).click();
    await page.locator('#favorite-name').fill('Notebook');await page.locator('#favorite-form button[type=submit]').click();
    await page.getByRole('button',{name:'Edit Notebook',exact:true}).click();await page.locator('#remove-favorite').click();await page.locator('#edit-favorites').click();
    await page.waitForFunction(()=>document.querySelectorAll('#favorites-grid .favorite').length===9);
    console.log('PASS: create, validate, rename, and remove favorites');

    await page.locator('.toolbar .open-settings').click();
    await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
    await page.screenshot({path:path.join(root,'../mac-start-customize-preview.png')});
    await page.locator('#display-name').fill('<Rudra>');
    await page.locator('#search-engine').selectOption('duckduckgo');
    await page.locator('[data-setting=showPrivacy]').uncheck();
    await page.locator('[data-setting=reduceMotion]').check();
    await page.locator('[data-wallpaper=coast]').click();
    assert.equal(await page.locator('#privacy-section').isVisible(),false);
    assert.equal(await page.locator('#greeting').textContent().then(t=>t.includes('<Rudra>')),true);
    assert.equal(await page.locator('#greeting').locator('*').count(),0);
    await page.waitForFunction(()=>document.querySelector('#settings-status').textContent==='Saved on this device');
    await page.keyboard.press('Escape');
    await page.reload();await page.waitForFunction(()=>document.querySelector('#page-surface').dataset.wallpaper==='coast');
    assert.equal(await page.locator('#privacy-section').isVisible(),false);
    assert.equal(await page.locator('body').getAttribute('data-reduce-motion'),'true');
    console.log('PASS: customization, safe text rendering, and settings persist after reload');

    const second=await context.newPage();await second.goto(origin);await second.waitForFunction(()=>document.querySelector('#page-surface').dataset.wallpaper==='coast');
    await page.locator('.toolbar .open-settings').click();await page.locator('[data-wallpaper=dusk]').click();
    await second.waitForFunction(()=>document.querySelector('#page-surface').dataset.wallpaper==='dusk');
    await page.locator('#wallpaper-upload').setInputFiles(path.join(root,'assets/icon128.png'));
    await page.waitForFunction(()=>document.querySelector('#page-surface').dataset.wallpaper==='custom');
    assert.match(await page.locator('#page-surface').evaluate(el=>el.style.backgroundImage),/data:image\/png;base64/);
    await page.locator('#wallpaper-upload').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
    await page.getByRole('status').filter({hasText:'Choose a JPG'}).waitFor();
    await page.locator('#reset-appearance').click();await page.waitForFunction(()=>document.querySelector('#page-surface').dataset.wallpaper==='sky');
    assert.equal(await page.locator('#privacy-section').isVisible(),true);
    assert.equal(await page.locator('#search-engine').inputValue(),'duckduckgo');
    await page.locator('#display-name').fill('');await page.keyboard.press('Escape');
    console.log('PASS: two-tab updates, custom image upload, invalid image rejection, and appearance reset');

    await page.locator('#sidebar-toggle').click();assert.equal(await page.locator('#sidebar').isVisible(),true);assert.equal(await page.locator('#sidebar-links a').count(),8);await page.locator('#sidebar-toggle').click();
    await page.keyboard.press('Control+k');assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);
    await page.locator('#search').fill('calm & clear');await page.locator('#search-form').evaluate(form=>form.requestSubmit());
    await page.waitForURL('https://duckduckgo.com/**');assert.equal(navigation,'https://duckduckgo.com/?q=calm%20%26%20clear');
    await page.goto(origin);await page.waitForFunction(()=>document.querySelectorAll('#favorites-grid .favorite').length===9);
    await page.locator('#search').fill('example.com/hello');await page.locator('#search-form').evaluate(form=>form.requestSubmit());await page.waitForURL('https://example.com/hello');
    console.log('PASS: sidebar, keyboard shortcut, encoded search, and direct URL navigation');

    await page.goto(origin);await page.waitForFunction(()=>document.querySelectorAll('#favorites-grid .favorite').length===9);await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('.browser-window').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);
    await page.locator('.toolbar .open-settings').click();
    assert.equal(await page.locator('#settings-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true);
    await page.keyboard.press('Escape');await page.screenshot({path:path.join(root,'../mac-start-mobile-preview.png')});
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.dock-app').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile layout, accessible dialog bounds, OS reduced motion, no JS/CSP errors');
    console.log('Browser checks use simulated Chrome APIs; native extension installation remains unverified.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
