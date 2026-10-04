// Real tool DOM and CSS in Chromium; every request is served from source or a
// fixture. No production reads, writes, AI calls or external browser navigation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const base='http://localhost:4197';
const api='https://cortex-api-db2e.onrender.com';
const outputDir=path.resolve('work/motion-qa');
fs.mkdirSync(outputDir,{recursive:true});
const bundled = await build({
  entryPoints: ['src/hooks.jsx','src/vault.jsx','src/promos.jsx','src/visual-theme.js'],
  bundle:true,write:false,outdir:'/motion-fixtures',format:'esm',platform:'browser',jsx:'automatic',target:'es2022',
  loader:{'.jpg':'dataurl','.png':'dataurl','.svg':'dataurl'},
  define:{'import.meta.env':JSON.stringify({BASE_URL:'/',VITE_API_BASE:api,VITE_HOOKS_API_BASE:api,MODE:'test',DEV:false,PROD:true})},
  alias:{'firebase/app':path.resolve('smoke/stub-firebase-app.js'),'firebase/auth':path.resolve('smoke/stub-firebase-auth.js')},
  plugins:[{name:'inline-css',setup(builder){
    builder.onResolve({filter:/\.css\?inline$/},args=>({path:path.resolve(args.resolveDir,args.path.split('?')[0]),namespace:'inline-css'}));
    builder.onLoad({filter:/.*/,namespace:'inline-css'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));
  }}],
});
const assets=new Map(bundled.outputFiles.map(file=>[path.basename(file.path),file.text]));
const fixtureAuth=`const fixtureUser={uid:'motion-fixture',email:'user03@example.com',getIdToken:async()=> 'fixture-token'};const fixtureAuth={currentUser:fixtureUser};const getAuth=()=>fixtureAuth;class GoogleAuthProvider{setCustomParameters(){}}const getRedirectResult=async()=>null;const onAuthStateChanged=(_auth,callback)=>{queueMicrotask(()=>callback(fixtureUser));return ()=>{}};const signInWithPopup=async()=>null;const signInWithRedirect=async()=>null;const signOut=async()=>null;const setPersistence=async()=>null;const browserLocalPersistence={};`;
const chartFixture=`class Chart{static defaults={font:{}};static owners=new Map();constructor(canvas){if(Chart.owners.has(canvas))throw new Error('Canvas already in use');this.canvas=canvas;Chart.owners.set(canvas,this)}destroy(){Chart.owners.delete(this.canvas)}}`;
const image='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="a"><stop stop-color="#25483d"/><stop offset="1" stop-color="#39325a"/></linearGradient></defs><rect width="800" height="600" fill="url(#a)"/><circle cx="560" cy="200" r="130" fill="#7da59c" opacity=".25"/><text x="65" y="430" fill="#e8eee9" font-size="44" font-family="sans-serif">A useful creative idea</text></svg>';
const hooks=[
  {id:'caption:alpha',account:'alpha',shortcode:'ALPHA',source_kind:'caption',hook_text:'These 5 ChatGPT prompts save me hours every week.',published_at:'2026-10-01T12:00:00Z',likes:12000,primary_topic:'ai_tools',categories:['list_number','benefit'],matchType:'exact',categorized_at:'2026-10-01T12:00:00Z',permalink:'https://instagram.com/p/ALPHA/'},
  {id:'ocr:beta',account:'beta',shortcode:'BETA',source_kind:'ocr',hook_text:'Stop writing prompts like this.',published_at:'2026-10-02T12:00:00Z',likes:4000,primary_topic:'ai_tools',categories:['direct_command'],matchType:'related',categorized_at:'2026-10-01T12:00:00Z',permalink:'https://instagram.com/p/BETA/'},
];
const vault=[
  {id:'vault-a',title:'A useful creative idea',url:'https://example.com/a',priority:0,discarded:0,tweet_text:'A thoughtful example worth keeping for our next creative session. '+ 'It starts with a clear, useful idea. '.repeat(20),tweet_image:'https://images.example.test/vault.svg',source:'Creative team',shared_at:'2026-10-01T12:00:00Z'},
  {id:'vault-b',title:'A second direction to explore',url:'https://example.com/b',priority:1,discarded:0,tweet_text:'A simple alternative with a different opening and a useful product demonstration.',source:'Creative team',shared_at:'2026-10-02T12:00:00Z'},
];
const accounts=[{handle:'alpha',full_name:'Alpha Studio',group:'sentient',followers:1000},{handle:'beta',full_name:'Beta Studio',group:'competitors',followers:2400}];
const insightsPosts=Array.from({length:8},(_,index)=>({a:index%2?'beta':'alpha',d:`2026-10-0${index%3+1}T12:00:00Z`,l:100+index*100,c:index+5,v:1000+index*300,t:'Video',pt:'clips',ocr:'Useful creative tutorial',h:'creativity,tutorial',u:`https://instagram.com/p/fixture${index}/`}));
const promos=[
  {account:'alpha',shortcode:'PROMO_A',client:'Studio One',product:'Video editor',classification:'disclosed',review_status:'new',published_at:'2026-10-02T12:00:00Z',first_detected_at:'2026-10-03T12:00:00Z',caption:'Sponsored by Studio One. Try the video editor today.',evidence:[{family:'explicit',rule:'sponsored',source:'caption',text:'Sponsored by Studio One.'}],client_candidates:[{name:'Studio One',source:'caption'}],permalink:'https://instagram.com/p/PROMO_A/',cover_source_url:'https://images.example.test/promo-a.svg'},
  {account:'beta',shortcode:'PROMO_B',client:'Studio Two',product:'Creative workspace',classification:'likely',review_status:'new',published_at:'2026-10-01T12:00:00Z',first_detected_at:'2026-10-02T12:00:00Z',caption:'Try Studio Two with my affiliate link.',evidence:[{family:'affiliate',rule:'affiliate',source:'caption',text:'my affiliate link'}],permalink:'https://instagram.com/p/PROMO_B/',cover_source_url:'https://images.example.test/promo-b.svg'},
];
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(fs.existsSync(chrome)?chrome:undefined)});
const errors=[];
const pages=[];

async function pageFixture({reduced=false,effects='immersive',touch=false,theme='dark'}={}){
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:1050},hasTouch:touch,isMobile:touch,reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage();pages.push(page);
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({effects,theme})=>{localStorage.setItem('sentient.effects',effects);localStorage.setItem('sentient.theme',theme);localStorage.setItem('sentient.lang','en');},{effects,theme});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===base){
      if(url.pathname.startsWith('/__motion/')){const file=path.basename(url.pathname);await route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:assets.get(file)||''});return;}
      let file=path.resolve('public',url.pathname.slice(1));
      if(['/hooks.html','/vault.html','/promos.html'].includes(url.pathname))file=path.resolve(url.pathname.slice(1));
      if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){await route.fulfill({status:404,body:''});return;}
      let body=fs.readFileSync(file,'utf8');
      if(url.pathname.endsWith('.html')){
        const tool=path.basename(url.pathname,'.html');
        if(assets.has(`${tool}.js`))body=body.replace(`/src/${tool}.jsx`,`/__motion/${tool}.js`).replace('/src/visual-theme.js','/__motion/visual-theme.js').replace('</head>',`<link rel="stylesheet" href="/__motion/${tool}.css"></head>`);
        body=body.replace(/<script src="[^"]*chart\.js[^"]*"><\/script>/g,`<script>${chartFixture}</script>`).replace(/import \{ initializeApp \} from 'https:\/\/www\.gstatic\.com\/[^']+';/,'const initializeApp=()=>({});').replace(/import \{\s*getAuth,[\s\S]+?\} from 'https:\/\/www\.gstatic\.com\/[^']+';/,fixtureAuth);
      }
      await route.fulfill({contentType:url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body});return;
    }
    if(url.origin===api){
      const method=route.request().method();
      assert.ok(method==='GET'||url.pathname.endsWith('/me/preferences'),'Motion QA must not issue content mutations');
      let data={};
      if(url.pathname==='/api/dashboard/me')data={is_dev:true,is_admin:true,operating_roles:['admin','vc'],queue_role_preview_active:false,email:'user03@example.com'};
      else if(url.pathname.endsWith('/me/preferences'))data={preferences:{effects,theme,language:'en'}};
      else if(url.pathname==='/api/dashboard/vault')data={items:vault};
      else if(url.pathname==='/api/dashboard/hooks')data={results:hooks,status:{total:2,captions:1,ocr:1,categorized:2,pending:0,drafts:0}};
      else if(url.pathname==='/api/dashboard/hooks/drafts')data={drafts:[]};
      else if(url.pathname==='/api/admin/promos')data={items:promos,next_cursor:null};
      else if(url.pathname.startsWith('/api/admin/promos/'))data=promos.find(item=>url.pathname.endsWith(`/${item.account}/${item.shortcode}`))||{};
      else if(url.pathname==='/api/tracker/summary')data={accounts,tracking_since:'2026-09-01'};
      else if(url.pathname.startsWith('/api/tracker/accounts/'))data={followers_history:[{date:'2026-10-01',followers:900},{date:'2026-10-03',followers:1000}],engagement_weekly:[]};
      else if(url.pathname==='/api/tracker/refresh-allowance')data={unlimited:true};
      else if(url.pathname==='/api/insights/posts')data={accounts,posts:insightsPosts};
      else if(url.pathname==='/api/insights/follower-growth')data={accounts:[],peaks:[]};
      await route.fulfill({json:data});return;
    }
    if(route.request().resourceType()==='image'){await route.fulfill({contentType:'image/svg+xml',body:image});return;}
    await route.fulfill({status:404,body:''});
  });
  return page;
}

const ready={hooks:'.hook-card',vault:'.vault-card',promos:'.promo-card',tracker:'#tLeaderboard',insights:'#tAcc'};
const surface={hooks:'.hook-card',vault:'.vault-card',promos:'.promo-card',tracker:'.kpi',insights:'.kpi'};
async function openTool(page,tool){
  await page.goto(`${base}/${tool}.html`);
  await page.locator(ready[tool]).first().waitFor({timeout:20000});
  await page.waitForFunction(()=>document.documentElement.dataset.effects!==undefined);
  await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].every(element=>{
    for(let current=element;current&&current!==document.body;current=current.parentElement){if(Number(getComputedStyle(current).opacity)<.99)return false;}
    return !element.getAnimations().some(animation=>animation.playState==='running'&&animation.effect.getComputedTiming().iterations!==Infinity);
  }),surface[tool],{timeout:2500});
  assert.equal(await page.locator('.app-recovery').count(),0,`${tool} must render the real workspace`);
}
async function assertVisibleAndStable(page,selector,label){
  assert.ok(await page.locator(selector).first().isVisible(),`${label}: content remains visible`);
  const state=await page.locator(selector).first().evaluate(element=>{
    let opacity=1;for(let current=element;current&&current!==document.body;current=current.parentElement)opacity*=Number(getComputedStyle(current).opacity);
    return {opacity,transform:getComputedStyle(element).transform,inert:Boolean(element.closest('[inert]'))};
  });
  assert.ok(state.opacity>.99,`${label}: finished transitions must not leave content translucent (${state.opacity})`);
  assert.equal(state.inert,false,`${label}: content must be interactive after motion`);
}
async function assertNoTransform(page,selector,label){
  const transforms=await page.locator(selector).evaluateAll(elements=>elements.map(element=>{
    const style=getComputedStyle(element);const matrix=style.transform==='none'?null:new DOMMatrixReadOnly(style.transform);
    return {transform:style.transform,identity:!matrix||matrix.isIdentity,translate:style.translate,scale:style.scale,rotate:style.rotate};
  }));
  assert.ok(transforms.every(value=>value.identity&&['none','0px','0px 0px'].includes(value.translate)&&['none','1'].includes(value.scale)&&['none','0deg'].includes(value.rotate)),`${label}: resting transforms ${JSON.stringify(transforms)}`);
}
async function assertNoMotion(page,selector,label){
  const moving=await page.locator(selector).evaluateAll(elements=>elements.flatMap(element=>element.getAnimations({subtree:true})).filter(animation=>animation.playState==='running').map(animation=>({name:animation.animationName||animation.transitionProperty||'WAAPI',duration:animation.effect?.getComputedTiming().duration})));
  assert.deepEqual(moving,[],`${label}: opted-out content must not keep animating`);
}
async function assertWidth(page,label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label}: motion must not introduce page overflow`);}
async function menuCycle(page,tool,noMotion=false){
  const button=page.locator('.settings-menu-trigger').first();
  if(!await button.count())return;
  await button.click();
  const panel=page.locator('.settings-menu-panel').first();
  await panel.waitFor({state:'visible'});
  if(noMotion){
    await assertNoMotion(page,'.settings-menu-panel',`${tool} opted-out settings menu`);
    await assertVisibleAndStable(page,'.settings-menu-panel',`${tool} immediate settings menu`);
  }
  await page.waitForTimeout(450);
  await assertVisibleAndStable(page,'.settings-menu-panel',`${tool} settings menu`);
  await page.keyboard.press('Escape');
  await panel.waitFor({state:'hidden'});
  await assertVisibleAndStable(page,surface[tool],`${tool} after settings close`);
}

async function heldSearchWithoutMotion(page,label){
  let release;
  const hold=new Promise(resolve=>{release=resolve;});
  const pattern=`${api}/api/dashboard/hooks?**`;
  const handler=async route=>{await hold;await route.fulfill({json:{results:hooks,status:{total:2,captions:1,ocr:1,categorized:2}}});};
  await page.route(pattern,handler);
  try{
    await page.getByRole('textbox',{name:'Search hooks',exact:true}).fill('motion fixture');
    await page.getByRole('button',{name:'Search hooks',exact:true}).click();
    await page.locator('.hooks-search-button .spin').waitFor({state:'visible'});
    await assertNoMotion(page,'.hooks-search-button',`Hooks ${label} pending search`);
    await assertVisibleAndStable(page,'.hook-card',`Hooks ${label} retains results while searching`);
  }finally{release();}
  await page.locator('.hooks-search-button .spin').waitFor({state:'detached'});
  await page.unroute(pattern,handler);
}

try{
  const normal=await pageFixture({theme:'light'});
  for(const tool of ['hooks','vault','tracker','insights']){
    await openTool(normal,tool);
    if(['hooks','vault'].includes(tool))assert.equal(await normal.evaluate(()=>document.documentElement.dataset.theme),'dark',`${tool} preserves its fixed dark appearance`);
    const hoverSelector=tool==='vault'?'.vault-media-link img':tool==='hooks'?'.hook-card':tool==='tracker'?'.side-item':'.chip';
    await normal.locator(hoverSelector).first().hover();
    await normal.waitForTimeout(350);
    await normal.mouse.move(1,1);
    await normal.waitForTimeout(450);
    await assertNoTransform(normal,hoverSelector,`${tool} hover leave`);
    await menuCycle(normal,tool);
    await normal.screenshot({path:path.join(outputDir,`${tool}-desktop.png`),fullPage:false});
    await normal.setViewportSize({width:390,height:844});
    await normal.waitForTimeout(350);
    await assertWidth(normal,`${tool} mobile`);
    await assertVisibleAndStable(normal,surface[tool],`${tool} mobile`);
    const mobileGeometry=await normal.evaluate(()=>({
      viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},
      headers:[...document.querySelectorAll('.product-header')].map(element=>({bounds:element.getBoundingClientRect().toJSON(),position:getComputedStyle(element).position})),
      nearBottom:document.elementFromPoint(innerWidth/2,innerHeight-40)?.className,
    }));
    assert.equal(mobileGeometry.headers.length,1,`${tool}: one shared header after viewport resize`);
    fs.writeFileSync(path.join(outputDir,`${tool}-mobile-layout.json`),JSON.stringify(mobileGeometry,null,2));
    await normal.screenshot({path:path.join(outputDir,`${tool}-mobile.png`),fullPage:false});
    await normal.setViewportSize({width:1440,height:1050});
    if(['tracker','insights'].includes(tool)){
      const original=await normal.locator(surface[tool]).first().boundingBox();
      await normal.evaluate(()=>document.documentElement.dataset.theme='dark');
      await normal.waitForTimeout(400);
      const next=await normal.locator(surface[tool]).first().boundingBox();
      assert.ok(Math.abs(original.width-next.width)<1&&Math.abs(original.height-next.height)<1,`${tool}: theme color changes preserve geometry`);
      await assertVisibleAndStable(normal,surface[tool],`${tool} dark theme`);
    }
  }
  for(const mode of ['reduced','reduced-subtle','off']){
    const page=await pageFixture({reduced:mode.startsWith('reduced'),effects:mode==='off'?'off':mode==='reduced-subtle'?'subtle':'immersive'});
    for(const tool of ['hooks','vault','tracker','insights']){
      await openTool(page,tool);
      if(tool==='hooks')await page.locator('.hook-use').first().click();
      const target=tool==='vault'?'.vault-media-link img':surface[tool];
      await page.locator(target).first().hover();
      await page.waitForTimeout(100);
      await assertNoTransform(page,target,`${tool} ${mode}`);
      await assertNoMotion(page,surface[tool],`${tool} ${mode}`);
      await assertVisibleAndStable(page,surface[tool],`${tool} ${mode}`);
      if(tool==='hooks')await heldSearchWithoutMotion(page,mode);
      if(tool==='vault'){
        await page.getByRole('button',{name:'+ Add link',exact:true}).click();
        await assertVisibleAndStable(page,'.vault-add',`${tool} ${mode} add form`);
        await assertNoMotion(page,'.vault-add',`${tool} ${mode} add form`);
      }
      await menuCycle(page,tool,true);
    }
  }
  const touch=await pageFixture({touch:true});
  for(const tool of ['hooks','vault']){
    await openTool(touch,tool);
    assert.equal(await touch.evaluate(()=>matchMedia('(hover: hover)').matches),false);
    await touch.locator(tool==='hooks'?'.hook-use':'.vault-card .product-card-body').first().tap();
    await touch.waitForTimeout(400);
    await assertNoTransform(touch,tool==='hooks'?'.hook-card':'.vault-media-link img',`${tool} touch`);
    await assertWidth(touch,`${tool} touch`);
  }

  const modalPage=await pageFixture();
  await openTool(modalPage,'promos');
  const overflowBefore=await modalPage.evaluate(()=>document.body.style.overflow);
  for(const mode of ['normal','dynamic-off','dynamic-reduced']){
    await modalPage.emulateMedia({reducedMotion:'no-preference'});
    await modalPage.evaluate(()=>document.documentElement.dataset.effects='immersive');
    await modalPage.locator('.promo-card').first().click();
    await modalPage.locator('.promo-review-dialog').waitFor({state:'attached'});
    if(mode==='dynamic-off')await modalPage.evaluate(()=>document.documentElement.dataset.effects='off');
    if(mode==='dynamic-reduced')await modalPage.emulateMedia({reducedMotion:'reduce'});
    // Media changes and pending WAAPI starts settle on browser frames, not a
    // fixed wall-clock delay. Wait only for lifecycle completion; the separate
    // assertions below must still catch a settled but invisible/stuck modal.
    await modalPage.waitForFunction(mode=>{
      if(matchMedia('(prefers-reduced-motion: reduce)').matches!==(mode==='dynamic-reduced'))return false;
      if(document.documentElement.dataset.effects!==(mode==='dynamic-off'?'off':'immersive'))return false;
      const modal=document.querySelector('.promo-review-modal');
      if(!modal)return false;
      return modal.getAnimations({subtree:true}).every(animation=>{
        if(!Number.isFinite(animation.effect?.getComputedTiming().endTime))return true;
        return !animation.pending&&['finished','idle'].includes(animation.playState);
      });
    },mode,{timeout:1800});
    await assertVisibleAndStable(modalPage,'.promo-review-dialog',`Promos ${mode} modal`);
    await assertNoTransform(modalPage,'.promo-review-dialog',`Promos ${mode} settled modal`);
    if(mode!=='normal')await assertNoMotion(modalPage,'.promo-review-dialog',`Promos ${mode}`);
    await modalPage.getByRole('button',{name:'Close promotion review'}).click();
    await modalPage.locator('.promo-review-modal').waitFor({state:'detached',timeout:1800});
    assert.equal(await modalPage.locator('#root').evaluate(element=>element.inert),false,`${mode}: modal close releases app interaction`);
    assert.equal(await modalPage.evaluate(()=>document.body.style.overflow),overflowBefore,`${mode}: modal close restores scrolling`);
    await assertVisibleAndStable(modalPage,'.promo-card',`Promos after ${mode} close`);
  }
  // Close during the opening flight, then open again: cancellation must not
  // strand an invisible backdrop or leave the next dialog non-interactive.
  await modalPage.emulateMedia({reducedMotion:'no-preference'});
  await modalPage.evaluate(()=>document.documentElement.dataset.effects='immersive');
  await modalPage.locator('.promo-card').first().click();
  await modalPage.locator('.promo-review-dialog').waitFor({state:'attached'});
  await modalPage.keyboard.press('Escape');
  await modalPage.locator('.promo-review-modal').waitFor({state:'detached',timeout:1800});
  await modalPage.locator('.promo-card').first().click();
  await modalPage.locator('.promo-review-dialog').waitFor();
  await modalPage.waitForTimeout(450);
  await assertVisibleAndStable(modalPage,'.promo-review-dialog','Promos reopened after interrupted entry');
  await modalPage.screenshot({path:path.join(outputDir,'promos-review-desktop.png')});
  await modalPage.keyboard.press('Escape');
  await modalPage.locator('.promo-review-modal').waitFor({state:'detached',timeout:1800});
  assert.deepEqual(errors,[],'No animation lifecycle or render errors');
  console.log('PASS motion: native tool reveals, hover leave, touch, reduced motion including subtle effects, effects off, pending search spinner, theme geometry, mobile width, interrupted Promos entry and modal cleanup');
  console.log(`Visual fixtures: ${outputDir}`);
}finally{await browser.close();}
