// Local adversarial player checks. Synthetic video is a TEST FIXTURE, never a delivery asset.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ASSETS, ROOT } from './scroll-world.mjs';

const playwright = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = await import(playwright);
const run = join(ROOT, '.scroll-world/browser-tests');
const manifest = {version:1,status:'verified',architecture:'A',
  clips:Array.from({length:4},(_,i)=>({desktop:`media/leg-${i+1}.mp4`,mobile:`media/leg-${i+1}-m.mp4`,
    poster:`media/leg-${i+1}-poster.png`,posterMobile:`media/leg-${i+1}-m-poster.png`,duration:5,fps:24})),
  seams:Array.from({length:3},()=>({desktop:1,mobile:1}))};
const scenes = JSON.parse(readFileSync(join(ASSETS,'runtime/scenes.json')));
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/runtime/world.css"><style>body{margin:0}header,footer{height:900px}</style></head><body><header>Before the story</header><main class="aw-world"><div class="aw-pin"><div class="aw-controls"><a class="aw-skip" href="#after">Skip the story</a></div><div class="aw-scenes">${scenes.map((s,i)=>`<figure class="aw-scene"><div class="aw-visual"><img alt="${s.alt}" src="/assets/web/${s.still}"></div><figcaption class="aw-caption"><span class="aw-eyebrow">${s.eyebrow}</span><h2>${s.title}</h2><p>${s.body}</p>${i===3?'<a class="aw-cta" href="#after">Claim your stage</a>':''}</figcaption></figure>`).join('')}</div></div></main><footer id="after">After the story</footer><script type="module">import {mountScrollWorld} from '/assets/runtime/engine.mjs';window.events=[];window.mount=()=>mountScrollWorld(document.querySelector('.aw-world'),{base:'/assets/',onEvent:e=>events.push(e)});window.cleanup=window.mount();</script></body></html>`;
let server, browser, base, secureProxy, siteURL;
before(async () => {
  mkdirSync(run,{recursive:true});
  if(!existsSync(join(run,'fixture.mp4'))) execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','5','-an','-c:v','libx264','-pix_fmt','yuv420p','-g','4','-movflags','+faststart',join(run,'fixture.mp4')]);
  if(!existsSync(join(run,'poster.png'))) execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',join(run,'fixture.mp4'),'-frames:v','1',join(run,'poster.png')]);
  server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
    if(path==='/static'){res.setHeader('Content-Type','text/html');return res.end(readFileSync(join(ROOT,'apps/landing/index.html')));}
    if(path==='/assets/runtime/manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
    let file;
    if(/^\/assets\/media\/.+\.mp4$/.test(path))file=join(run,'fixture.mp4');
    else if(/^\/assets\/media\/.+\.png$/.test(path))file=join(run,'poster.png');
    else if(path.startsWith('/assets/scroll-world/'))file=resolve(ASSETS,path.slice('/assets/scroll-world/'.length));
    else if(path.startsWith('/assets/'))file=resolve(ASSETS,path.slice('/assets/'.length));
    if(!file||(!file.startsWith(ASSETS+'/')&&!file.startsWith(run+'/'))||!existsSync(file)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',({'.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.json':'application/json'})[extname(file)]||'application/octet-stream');
    res.end(readFileSync(file));
  }).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
  if (process.env.SCROLL_WORLD_SITE_URL) {
    const upstream = new URL(process.env.SCROLL_WORLD_SITE_URL);
    if (!['127.0.0.1','localhost'].includes(upstream.hostname) || upstream.protocol !== 'http:') throw new Error('Integration tests require a local HTTP Next.js server; the harness supplies TLS');
    const key=join(run,'localhost.key'),cert=join(run,'localhost.crt');
    if(!existsSync(cert))execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','2','-subj','/CN=localhost'],{stdio:'ignore'});
    // Preserve production CSP including upgrade-insecure-requests; terminate TLS locally.
    secureProxy=createSecureServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
      const forward=httpRequest(new URL(req.url,upstream),{method:req.method,headers:{...req.headers,'x-forwarded-proto':'https'}},answer=>{res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);});
      forward.on('error',()=>{res.statusCode=502;res.end();});req.pipe(forward);
    }).listen(0,'127.0.0.1');
    await new Promise(r=>secureProxy.once('listening',r));siteURL=`https://127.0.0.1:${secureProxy.address().port}${upstream.pathname}`;
  }
  browser=await (process.env.SCROLL_WORLD_WEBKIT ? webkit : chromium).launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));if(secureProxy)await new Promise(r=>secureProxy.close(r));});

async function pageFor(options={}, init) {
  const context=await browser.newContext({viewport:{width:1440,height:900},ignoreHTTPSErrors:!!siteURL,...options});
  const page=await context.newPage(); const requests=[],errors=[];
  page.on('request',r=>{if(r.url().endsWith('.mp4'))requests.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  if(init)await page.addInitScript(init);
  await page.goto(base);return {context,page,requests,errors};
}
async function scroll(page,progress) {
  await page.evaluate(p=>{const r=document.querySelector('.aw-world');const h=parseFloat(r.style.getPropertyValue('--aw-height'))||innerHeight;window.scrollTo({top:r.getBoundingClientRect().top+scrollY+(r.offsetHeight-h)*p,behavior:'instant'});},progress);
}
async function ready(page) {
  await page.locator('.aw-world').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.mode==='video');
}
async function seek(page,index,fraction) {
  await scroll(page,(index+fraction)/4);
  await page.waitForFunction(({index,fraction})=>{const v=document.querySelectorAll('.aw-scene')[index].querySelector('video');return v&&!v.seeking&&v.seekable.length&&Math.abs(v.currentTime-fraction*(v.duration-1/24))<.08;},{index,fraction});
}

test('no-JS keeps all four scenes and a working CTA',async()=>{
  const {context,page,requests}=await pageFor({javaScriptEnabled:false});
  assert.equal(await page.locator('.aw-scene').count(),4);
  assert.equal(await page.locator('.aw-cta').getAttribute('href'),'#after');
  assert.equal(requests.length,0);await context.close();
});
for (const preference of ['reduced-motion','data-saver']) test(`${preference}: no video requests, readable scenes`,async()=>{
  const {context,page,requests,errors}=await pageFor(preference==='reduced-motion'?{reducedMotion:'reduce'}:{},
    preference==='data-saver'?()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){}}}):undefined);
  await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.mode==='stills');
  assert.equal(await page.locator('.aw-world').getAttribute('data-reason'),preference);
  await scroll(page,.95);assert.equal(requests.length,0);assert.deepEqual(errors,[]);
  assert.equal(await page.locator('.aw-scene[inert]').count(),0);await context.close();
});
test('forward/reverse seeks, scoped pin, accessible route, bounded assets and cleanup',async()=>{
  const {context,page,requests,errors}=await pageFor();await ready(page);
  for(const [i,f] of [[0,.6],[1,.1],[2,.7],[3,.9],[2,.3],[0,.3]]) await seek(page,i,f);
  assert.ok(requests.length>=4);assert.ok(requests.every(x=>!x.endsWith('-m.mp4')));
  assert.ok(await page.locator('video').count()<=3);
  const pinY=await page.locator('.aw-pin').evaluate(e=>e.getBoundingClientRect().top);assert.ok(Math.abs(pinY)<1);
  await page.getByRole('button',{name:/Scene 3:/}).click();
  await page.waitForFunction(()=>document.activeElement===document.querySelectorAll('.aw-scene h2')[2]);
  await page.evaluate(()=>cleanup());assert.equal(await page.locator('video').count(),0);
  assert.equal(await page.locator('.aw-scene[inert]').count(),0);
  await page.evaluate(()=>window.cleanup=mount());await ready(page);await seek(page,1,.5);
  assert.deepEqual(errors,[]);await context.close();
});
for(const device of [{name:'phone',width:390,height:844,mobile:true},{name:'tablet',width:834,height:1194,mobile:false}]) test(`${device.name}: correct media tier, layout, resize and reverse scrubbing`,async()=>{
  const {context,page,requests,errors}=await pageFor({viewport:{width:device.width,height:device.height},screen:{width:device.width,height:device.height},isMobile:true,hasTouch:true});
  if(!process.env.SCROLL_WORLD_WEBKIT){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  await ready(page);await seek(page,0,.5);await page.locator('.aw-world').tap({position:{x:30,y:150}});
  await seek(page,3,.8);await seek(page,1,.2);
  assert.ok(requests.every(x=>x.endsWith('-m.mp4')===device.mobile));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const height=await page.locator('.aw-world').evaluate(e=>e.style.height);
  await page.setViewportSize({width:device.width,height:device.height-80});
  assert.equal(await page.locator('.aw-world').evaluate(e=>e.style.height),height);
  await page.setViewportSize({width:device.height,height:device.width});
  await page.waitForFunction(()=>Math.abs(parseFloat(document.querySelector('.aw-world').style.getPropertyValue('--aw-height'))-innerHeight)<1);
  await seek(page,3,.9);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await context.close();
});
test('media HTTP failure returns to all four stills',async()=>{
  const {context,page,errors}=await pageFor();
  await page.route('**/*.mp4',route=>route.fulfill({status:404,body:'missing'}));
  await page.locator('.aw-world').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.reason==='media-fetch-failed');
  assert.equal(await page.locator('video').count(),0);assert.equal(await page.locator('.aw-scene[inert]').count(),0);
  assert.deepEqual(errors,[]);await context.close();
});
test('decode errors retain content and remove unplayable videos',async()=>{
  const {context,page,errors}=await pageFor();
  await page.route('**/*.mp4',route=>route.fulfill({status:200,contentType:'video/mp4',body:'not a video'}));
  await page.locator('.aw-world').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.reason==='decode-error');
  assert.equal(await page.locator('video').count(),0);assert.deepEqual(errors,[]);await context.close();
});
test('reduced motion enabled during playback releases videos',async()=>{
  const {context,page,errors}=await pageFor();await ready(page);await seek(page,1,.5);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.reason==='reduced-motion');
  assert.equal(await page.locator('video').count(),0);assert.equal(await page.locator('.aw-scene[inert]').count(),0);
  assert.deepEqual(errors,[]);await context.close();
});
test('unsupported browser retains the complete static story',async()=>{
  const {context,page,requests,errors}=await pageFor({},()=>{window.matchMedia=undefined;});
  await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.reason==='unsupported-browser');
  assert.equal(await page.locator('.aw-scene').count(),4);assert.equal(requests.length,0);
  assert.deepEqual(errors,[]);await context.close();
});
test('rejected muted playback degrades instead of freezing (low-power proxy)',async()=>{
  const {context,page,errors}=await pageFor({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true},()=>{
    HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('Blocked','NotAllowedError'));};
  });
  await ready(page);await seek(page,0,.5);await page.locator('.aw-world').tap({position:{x:30,y:150}});
  await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.reason==='playback-blocked');
  assert.equal(await page.locator('video').count(),0);assert.deepEqual(errors,[]);await context.close();
});
test('actual static page has crawlable content and zero-video reduced-motion fallback',async()=>{
  const {context,page,requests}=await pageFor({reducedMotion:'reduce'});await page.goto(`${base}/static`);
  await page.waitForFunction(()=>document.querySelector('.aw-world')?.dataset.mode==='stills');
  assert.equal(await page.locator('.aw-scene h2').count(),4);assert.equal(await page.locator('.aw-cta').getAttribute('href'),'#begin');
  assert.equal(requests.length,0);await context.close();
});
test('static product rail exposes five phone views and flips by tab',async()=>{
  const {context,page,errors}=await pageFor({reducedMotion:'reduce'});await page.goto(`${base}/static`);
  assert.equal(await page.locator('[data-product-card]').count(),5);
  assert.equal(await page.locator('[data-product-tab]').count(),5);
  await page.locator('[data-product-tab="4"]').click();
  assert.equal(await page.locator('[data-product-tab="4"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-product-card="4"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);await context.close();
});
test('built Next.js route preserves assets, sticky scope and conversion target', {skip:!process.env.SCROLL_WORLD_SITE_URL}, async()=>{
  for(const mobile of [false,true]) {
    const {context,page,errors}=await pageFor(mobile?{viewport:{width:390,height:844},screen:{width:390,height:844},hasTouch:true,isMobile:true}:{});
    await page.route('**/site/scroll-world/runtime/manifest.json',r=>r.fulfill({json:manifest}));
    await page.route('**/site/scroll-world/media/*.mp4',r=>r.fulfill({path:join(run,'fixture.mp4'),contentType:'video/mp4'}));
    await page.route('**/site/scroll-world/media/*.png',r=>r.fulfill({path:join(run,'poster.png'),contentType:'image/png'}));
    await page.goto(siteURL);
    await page.locator('.aw-world').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.aw-world').dataset.mode==='video');
    assert.equal(await page.locator('.aw-scene').count(),4);
    await page.locator('.aw-scene').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:join(run,`next-stills-${mobile?'phone':'desktop'}.png`)});
    await ready(page);await seek(page,1,.5);
    assert.ok(Math.abs(await page.locator('.aw-pin').evaluate(e=>e.getBoundingClientRect().top))<1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await seek(page,3,.7);
    await page.screenshot({path:join(run,`next-${mobile?'phone':'desktop'}.png`)});
    await page.locator('.aw-world').getByRole('link',{name:'Claim your stage',exact:true}).click();
    await page.waitForFunction(()=>location.hash==='#offer');
    assert.deepEqual(errors,[]);await context.close();
  }
});
