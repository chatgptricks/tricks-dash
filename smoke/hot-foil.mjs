// Browser pixel regression for source-derived HOT highlights. Every request is
// intercepted: no API, live images, AI calls, or production mutations occur.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';

const output = path.resolve('work/hot-foil');
fs.mkdirSync(output, { recursive:true });
const built = await esbuild.build({ entryPoints:['smoke/hot-foil-entry.jsx'], bundle:true, write:false, outdir:'out', format:'esm', platform:'browser', jsx:'automatic', target:'es2022', loader:{'.png':'dataurl','.jpg':'dataurl','.svg':'dataurl'}, define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.VITE_API_BASE':'"https://api.test"','import.meta.env.DEV':'false','import.meta.env.PROD':'true'}, alias:{'firebase/app':path.resolve('smoke/stub-firebase-app.js'),'firebase/auth':path.resolve('smoke/stub-firebase-auth.js')} });
const bundle = suffix => built.outputFiles.find(file => file.path.endsWith(suffix)).text;
const base = 'http://hot-foil.test';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
const page = await browser.newPage({ viewport:{width:1360,height:1100}, deviceScaleFactor:1 });
const errors = [], requests = [], metrics = {};
page.on('pageerror', error => errors.push(error.message));
const svg = name => {
  const shape = name === 'horizontal' ? '<rect x="0" y="120" width="240" height="80" fill="#c0c0c0"/>' : name === 'flat' ? '' : '<rect x="80" y="0" width="80" height="320" fill="#c0c0c0"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="${name === 'wide' ? '120' : '320'}"><rect width="240" height="320" fill="#606060"/>${shape}</svg>`;
};
await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  requests.push({url:request.url(),method:request.method(),type:request.resourceType()});
  assert.equal(request.method(), 'GET', 'Foil rendering never mutates data');
  if (url.origin === base) {
    if (url.pathname === '/entry.js') return route.fulfill({contentType:'text/javascript',body:bundle('.js')});
    if (url.pathname === '/entry.css') return route.fulfill({contentType:'text/css',body:bundle('.css')});
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark" data-effects="immersive"><head><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>'});
  }
  // Deliberately omit Access-Control-Allow-Origin. CSS SourceGraphic must work
  // with an ordinary remote cover that would taint a canvas readback.
  if (url.hostname === 'foil-covers.test' && !url.pathname.includes('broken')) return route.fulfill({contentType:'image/svg+xml',body:svg(url.pathname.slice(1,-4))});
  return route.fulfill({status:404,body:''});
});

const probe = name => `[data-probe="${name}"]`;
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function effects(value) {
  await page.evaluate(value => { document.documentElement.dataset.effects = value; }, value);
  await settle();
}
async function point(name, x, y, pointerType = 'mouse') {
  await page.locator(`${probe(name)} .post-media`).evaluate((element, {x,y,pointerType}) => {
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,clientX:bounds.left+bounds.width*x,clientY:bounds.top+bounds.height*y,pointerType}));
  }, {x,y,pointerType});
  await settle();
}
async function leave(name) {
  await page.locator(probe(name)).dispatchEvent('pointerout', {pointerType:'mouse',relatedTarget:null});
  await settle();
}
async function capture(name, label = name) {
  const selector=name.startsWith('#')?name:`${probe(name)} .post-media`;
  const buffer = await page.locator(selector).screenshot({path:path.join(output,`${label}.png`)});
  // Decode only the browser screenshot, never the remote source. This measures
  // actual composited filter pixels and needs no PNG package or CORS privilege.
  return page.evaluate(async encoded => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);
    return {width:image.width,height:image.height,data:[...context.getImageData(0,0,image.width,image.height).data]};
  }, buffer.toString('base64'));
}
function delta(on, off) {
  assert.equal(on.width,off.width);assert.equal(on.height,off.height);
  return {width:on.width,height:on.height,data:Array.from({length:on.width*on.height},(_,i) => (on.data[i*4]-off.data[i*4]+on.data[i*4+1]-off.data[i*4+1]+on.data[i*4+2]-off.data[i*4+2])/3)};
}
function mean(image, region = () => true) {
  let sum=0,count=0;
  for(let y=12;y<image.height-12;y++)for(let x=12;x<image.width-12;x++)if(region(x,y)){sum+=Math.abs(image.data[y*image.width+x]);count++;}
  return sum/count;
}
function difference(a,b) { return mean({width:a.width,height:a.height,data:a.data.map((value,i)=>value-b.data[i])}); }
function residual(a,b) { return {width:a.width,height:a.height,data:a.data.map((value,i)=>value-b.data[i])}; }
const verticalEdges = x => Math.abs(x-80)<7||Math.abs(x-160)<7;
const horizontalEdges = (_x,y) => Math.abs(y-120)<7||Math.abs(y-200)<7;

try {
  await page.goto(base);
  await page.waitForFunction(() => [...document.querySelectorAll('#pixel-probes .cover-image')].filter(image=>!image.src.includes('broken')).every(image=>image.complete&&image.naturalWidth&&image.classList.contains('is-loaded')) && document.querySelector('#flight-source img.cover-image')?.naturalWidth);
  await page.locator(`${probe('broken')} .cover-fallback`).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#hot-foil-definitions filter').length === 4);
  assert.equal(await page.locator('#hot-foil-definitions').count(),1,'Stable shared filters are installed once');
  assert.equal(await page.locator('#flight-source .obs-metal,#flight-source .obs-foil,#flight-source .obs-glare').count(),0,'Real HOT card has no generic gradient overlay');
  assert.equal(await page.locator(`${probe('cold')} [data-hot-foil]`).count(),0,'Ordinary covers are not classified as HOT');
  assert.equal(await page.locator(`${probe('vertical')} img`).evaluate(image => {
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.drawImage(image,0,0);
    try{context.getImageData(0,0,1,1);return false;}catch(error){return error.name==='SecurityError';}
  }),true,'The fixture really exercises a cross-origin cover without readback permission');

  await effects('off');
  const originals={};for(const name of ['vertical','horizontal','flat','wide','cold','missing','broken'])originals[name]=await capture(name,`${name}-off`);
  await effects('immersive');
  const rests={};for(const name of ['vertical','horizontal','flat','wide','cold','missing','broken'])rests[name]=delta(await capture(name,`${name}-rest`),originals[name]);
  const verticalRelief=residual(rests.vertical,rests.flat), horizontalRelief=residual(rests.horizontal,rests.flat);
  metrics.rest={vertical:mean(rests.vertical),horizontal:mean(rests.horizontal),flat:mean(rests.flat),edge:mean(verticalRelief,verticalEdges),offEdge:mean(verticalRelief,(x)=>!verticalEdges(x))};
  assert.ok(difference(rests.vertical,rests.flat)>.15,'Identical lighting reacts to image relief, not only card coordinates');
  assert.ok(mean(verticalRelief,verticalEdges)>mean(verticalRelief,(x)=>!verticalEdges(x))+.5,'Vertical image edges change local specular response relative to the flat control');
  assert.ok(mean(horizontalRelief,horizontalEdges)>mean(horizontalRelief,(_x,y)=>!horizontalEdges(0,y))+.5,'Rotating image relief rotates the source-conditioned specular response');
  for(const name of ['cold','missing','broken'])assert.ok(mean(rests[name])<.05,`${name}: no unrelated foil is painted`);
  assert.ok(mean(rests.wide,(_x,y)=>y<85||y>235)<.05,'Contain letterboxes remain untouched by the image filter');

  await point('vertical',.05,.5);const left=delta(await capture('vertical','vertical-left'),originals.vertical);
  await point('vertical',.95,.5);const right=delta(await capture('vertical','vertical-right'),originals.vertical);
  metrics.pointer={difference:difference(left,right),leftEdgeLeft:mean(left,x=>Math.abs(x-80)<7),rightEdgeLeft:mean(left,x=>Math.abs(x-160)<7),leftEdgeRight:mean(right,x=>Math.abs(x-80)<7),rightEdgeRight:mean(right,x=>Math.abs(x-160)<7)};
  assert.ok(difference(left,right)>.1,'Pointer light changes composited image highlights');
  assert.ok((metrics.pointer.leftEdgeLeft-metrics.pointer.rightEdgeLeft)*(metrics.pointer.leftEdgeRight-metrics.pointer.rightEdgeRight)<0,'Opposite lighting changes which image slope is illuminated');
  await leave('vertical');
  await effects('subtle');const subtle=delta(await capture('vertical','vertical-subtle'),originals.vertical);
  assert.ok(mean(subtle)<mean(rests.vertical)*.7&&mean(subtle)>0,'Subtle retains weaker source-specific relief');

  await effects('immersive');await point('vertical',.9,.2);
  await page.emulateMedia({reducedMotion:'reduce'});await settle();
  assert.equal(await page.locator(`${probe('vertical')}[data-foil-active]`).count(),0,'Changing reduced motion resets active lighting');
  const reduced=delta(await capture('vertical','vertical-reduced'),originals.vertical);
  await point('vertical',.1,.8);assert.ok(difference(delta(await capture('vertical','vertical-reduced-move'),originals.vertical),reduced)<.05,'Reduced motion keeps static source-derived relief');
  await page.emulateMedia({reducedMotion:'no-preference'});await point('vertical',.1,.8,'touch');
  assert.equal(await page.locator(`${probe('vertical')}[data-foil-active]`).count(),0,'Touch does not move the light');
  await point('vertical',.9,.2);await effects('off');await point('vertical',.1,.8);
  assert.ok(mean(delta(await capture('vertical','vertical-disabled-move'),originals.vertical))<.05,'Effects off restores exact unfiltered cover pixels');
  assert.equal(await page.locator(`${probe('vertical')}[data-foil-active]`).count(),0);

  await effects('immersive');await page.locator('#flight-source .post-media').click();
  await page.waitForFunction(()=>document.querySelector('#flight-inspector')?.dataset.obsPhase==='ready');
  const clone=page.locator('#flight-inspector .obs-card-front img.cover-image');
  assert.equal(await clone.count(),1,'A physical source-card clone lands in the inspector');
  assert.match(await clone.evaluate(image=>getComputedStyle(image).filter),/hot-foil-rest/,'Physical clones retain source relief with resting illumination');
  assert.equal(await page.locator('#hot-foil-definitions').count(),1,'Cloning never duplicates filter IDs');
  const landed=await capture('#flight-inspector .obs-card-front .post-media','landed-rest');
  await effects('off');const landedOff=await capture('#flight-inspector .obs-card-front .post-media','landed-off');
  assert.ok(mean(delta(landed,landedOff))>1,'The landed clone actually renders filtered pixels, not just an unresolved filter URL');
  await effects('immersive');
  await page.evaluate(()=>window.__foilFixture.replaceCover('horizontal'));
  await page.waitForFunction(()=>document.querySelector('#flight-inspector .obs-card-front img')?.src.includes('/horizontal.svg')&&document.querySelector('#flight-inspector .obs-card-front img')?.naturalWidth>0);
  await page.screenshot({path:path.join(output,'physical-clone.png')});
  await page.evaluate(()=>window.__foilFixture.close());
  await page.locator('#flight-inspector').waitFor({state:'detached',timeout:2200});
  assert.equal(await page.locator('.obs-persistent-card,.obs-return-cover,.obs-in-transit').count(),0,'Return removes physical clones and restores the source');
  await page.mouse.move(0,0);await settle();
  assert.match(await page.locator('#flight-source img.cover-image').evaluate(image=>getComputedStyle(image).filter),/hot-foil-rest/);

  // The first-ever HOT cover can finish loading only after its React owner is
  // gone. Document-owned filter definitions must already exist and survive.
  let releaseCovers;
  const coverGate=new Promise(resolve=>{releaseCovers=resolve;});
  await page.route('https://foil-covers.test/**',async route=>{
    await coverGate;
    const name=new URL(route.request().url()).pathname.slice(1,-4);
    return route.fulfill(name==='broken'?{status:404,body:''}:{contentType:'image/svg+xml',body:svg(name)});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#hot-foil-definitions')&&document.querySelector('[data-probe="vertical"] img'));
  assert.equal(await page.locator(`${probe('vertical')} img`).evaluate(image=>image.naturalWidth),0,'The first image is still loading');
  await page.evaluate(()=>{
    window.__firstFoilDefinitions=document.getElementById('hot-foil-definitions');
    const copy=document.querySelector('[data-probe="vertical"]').cloneNode(true);
    copy.id='late-clone';copy.classList.add('obs-card-front');
    Object.assign(copy.style,{width:'240px',height:'320px',borderRadius:'0',transform:'none'});
    Object.assign(copy.querySelector('.post-media').style,{width:'240px',height:'320px'});
    const image=copy.querySelector('img');image.loading='eager';
    image.addEventListener('load',()=>{image.classList.add('is-loaded');copy.querySelector('.cover-image-skeleton')?.remove();},{once:true});
    document.body.append(copy);window.__unmountFoilFixture();
  });
  releaseCovers();
  await page.waitForFunction(()=>document.querySelector('#late-clone img')?.classList.contains('is-loaded'));
  assert.equal(await page.evaluate(()=>window.__firstFoilDefinitions===document.getElementById('hot-foil-definitions')),true,'Unmounting every React source preserves the original shared filter definitions');
  const late=await capture('#late-clone .post-media','late-clone-rest');
  await effects('off');const lateOff=await capture('#late-clone .post-media','late-clone-off');
  assert.ok(mean(delta(late,lateOff))>1,'A late-loading clone remains image-filtered after the original unmounts');
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests.filter(request=>request.url.startsWith('https://api.test')&&request.type!=='image'),[],'Only mocked avatar images may use the fixture API hostname');
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(metrics,null,2));
  console.log('PASS HOT foil: image-relative pixels, directional light, no-CORS covers, fallback/letterbox, subtle/reduced/off, physical clones and return');
} finally {
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(metrics,null,2));
  await browser.close();
}
