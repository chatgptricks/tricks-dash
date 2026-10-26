// Browser workflow smoke: every network request is fulfilled locally, so this
// exercises the real Insights UI without reading or mutating production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
const base = 'http://localhost:4199';
const screenshotDir = '/tmp/sentient-music-qa';
fs.mkdirSync(screenshotDir,{recursive:true});
const errors = [];
const requests = [];
const originalIds = ['17890000000000001','17890000000000002'];
const unsafeTitle = '<img src=x onerror="window.musicInjected=true">';
const accounts = [
  {handle:'alpha',group:'sentient',followers:1000,full_name:'Alpha Studio'},
  {handle:'beta',group:'competitors',followers:2000,full_name:'Beta Studio'},
];
const overviewAccounts = [...accounts,{handle:'gamma',group:'competitors',followers:3000,full_name:'Active Outside Research'}];
const makePost = (sc, overrides={}) => ({
  a:'alpha',sc,d:'2026-10-01T12:00:00Z',l:100,c:3,v:1000,pl:1000,
  t:'Video',pt:'clips',aa:[],u:`https://www.instagram.com/p/${sc}/`,
  ms:null,ma:null,ai:null,oa:null,...overrides,
});
const song = {ms:'Bright Lights',ma:'The Test Band',ai:'60001',oa:false};
const night = {ms:'Night Road',ma:'Another Band',ai:'60002',oa:false};
const original = {ms:'Original audio',ma:'alpha',ai:originalIds[0],oa:true};
const posts = [
  makePost('bright1',{...song,l:100}),
  makePost('bright2',{...song,d:'2026-10-02T12:00:00Z',l:300}),
  makePost('bright3',{...song,a:'beta',d:'2026-10-03T12:00:00Z',l:null}),
  makePost('night1',{...night,a:'beta',d:'2026-10-04T12:00:00Z',l:800}),
  makePost('night2',{...night,a:'beta',d:'2026-10-05T12:00:00Z',t:'Carousel',l:0}),
  makePost('original1',{...original,d:'2026-10-06T12:00:00Z',l:600}),
  makePost('original2',{...original,ai:originalIds[1],d:'2026-10-07T12:00:00Z',l:200}),
  makePost('original3',{...original,a:'beta',d:'2026-10-08T12:00:00Z',l:100}),
  makePost('unknownlikes',{ms:'Unknown likes',ma:'Measured Later',ai:'60003',oa:false,d:'2026-10-09T12:00:00Z',l:null,c:null,v:null,pl:null}),
  makePost('untranslated',{ms:'Views',ma:'Comments',ai:'60004',oa:false,d:'2026-10-10T12:00:00Z',l:30}),
  makePost('unsafe',{ms:unsafeTitle,ma:'Safe <script>artist</script>',ai:'60005',oa:false,d:'2026-10-11T12:00:00Z',l:40}),
  makePost('withoutmusic1',{d:'2026-10-12T12:00:00Z',l:900}),
  makePost('withoutmusic2',{a:'beta',d:'2026-10-13T12:00:00Z',t:'Image',l:0}),
  makePost('untitled',{a:'beta',ai:'60006',d:'2026-10-14T12:00:00Z',l:50}),
];
let activePosts = posts;
let musicFailure = false;
let delayedMusic = null;
function deferred(){
  let resolve;
  const promise = new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
const fixtureAuth = `const fixtureUser={uid:'fixture',email:'fixture@example.test',getIdToken:async()=> 'fixture-token'}; const fixtureAuth={currentUser:fixtureUser}; const getAuth=()=>fixtureAuth; class GoogleAuthProvider{setCustomParameters(){}} const getRedirectResult=async()=>null; const onAuthStateChanged=(_auth,callback)=>{queueMicrotask(()=>callback(fixtureUser));return ()=>{}}; const signInWithPopup=async()=>null; const signInWithRedirect=async()=>null; const signOut=async()=>null; const setPersistence=async()=>null; const browserLocalPersistence={};`;
const chartFixture = `class Chart{static defaults={font:{}};static owners=new Map();constructor(canvas){if(Chart.owners.has(canvas))throw new Error('Canvas already in use');this.canvas=canvas;Chart.owners.set(canvas,this)}destroy(){Chart.owners.delete(this.canvas)}}`;
const page = await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(12000);
await page.clock.setFixedTime(new Date('2026-10-25T18:00:00Z'));
page.on('pageerror',error=>errors.push(error.message));
const intercept = async route=>{
  const url = new URL(route.request().url());
  if(url.origin===base){
    const asset = path.resolve('public',url.pathname.slice(1));
    if(!asset.startsWith(path.resolve('public')+path.sep)||!fs.existsSync(asset)){
      await route.fulfill({status:404,body:''});return;
    }
    let body = fs.readFileSync(asset,'utf8');
    if(url.pathname.endsWith('.html')){
      body = body.replace(/<script src="[^"]*chart\.js[^"]*"><\/script>/g,`<script>${chartFixture}</script>`)
        .replace(/import \{ initializeApp \} from 'https:\/\/www\.gstatic\.com\/[^']+';/,"const initializeApp=()=>({});")
        .replace(/import \{\s*getAuth,[\s\S]+?\} from 'https:\/\/www\.gstatic\.com\/[^']+';/,fixtureAuth);
    }
    await route.fulfill({contentType:url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body});return;
  }
  if(url.hostname==='cortex-api-db2e.onrender.com'){
    const method = route.request().method();
    assert.ok(method==='GET'||url.pathname.endsWith('/me/preferences'),'Only mocked preference writes are allowed');
    requests.push({path:url.pathname,method});
    let data = {};
    if(url.pathname==='/api/insights/music'){
      if(delayedMusic){
        const pending = delayedMusic;
        pending.started.resolve();
        await pending.release.promise;
      }
      if(musicFailure){await route.fulfill({status:503,json:{detail:'Fixture music service unavailable'}});return;}
      data = {posts:activePosts,accounts,coverage:{total:activePosts.length}};
    }else if(url.pathname==='/api/insights/posts')data={posts,accounts:overviewAccounts};
    else if(url.pathname==='/api/insights/follower-growth')data={accounts:[],peaks:[]};
    else if(url.pathname==='/api/dashboard/me')data={is_admin:false,is_dev:false,operating_roles:['vc'],email:'fixture@example.test'};
    else if(url.pathname.endsWith('/me/preferences'))data={preferences:{theme:'dark',language:'en'}};
    await route.fulfill({json:data});return;
  }
  await route.fulfill({status:404,body:''});
};
await page.route('**/*',intercept);

const tracks = () => page.locator('#musicRanking .music-track-open');
const rowFor = title => page.locator('#musicRanking tbody tr').filter({has:page.locator('.music-track-open').filter({hasText:title})});
async function countIs(key,count){
  await page.waitForFunction(({key,count})=>document.querySelector(`[data-music-count="${key}"]`)?.textContent.trim()===String(count),{key,count});
}
async function setSearch(text){
  await page.locator('#musicSearch').fill(text);
  await page.waitForFunction(text=>document.querySelector('#musicSearch')?.value===text,text);
}
async function clearMusicFilters(){
  await setSearch('');
  await page.locator('#musicKinds [data-kind="named"]').click();
  await page.locator('#musicMinUses').selectOption('1');
  await page.locator('#musicSort').selectOption('total');
}
async function setGlobalDate(id,date){
  await page.locator('#'+id).fill(date);
  await page.locator('#'+id).dispatchEvent('change');
}

try{
  await page.goto(`${base}/insights.html?view=music`);
  await page.locator('#musicRanking').waitFor();
  await page.locator('#authGate.hidden').waitFor({state:'attached'});
  assert.equal(await page.locator('#insightsMusic').getAttribute('aria-pressed'),'true');
  assert.ok(requests.some(request=>request.path==='/api/insights/music'),'The Music tab loads its dedicated endpoint');
  for(const [key,value] of Object.entries({total:14,detected:12,named:8,original:3,unknown:2}))await countIs(key,value);
  assert.equal(await page.locator('#musicKinds [data-kind="named"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#musicKind').count(),0,'Music has separate category lists instead of an all-audio selector');
  assert.equal(await page.locator('#musicRankingTitle').innerText(),'Songs');
  assert.equal(await tracks().count(),5,'The default list contains named songs only');
  for(const id of originalIds)assert.equal(await tracks().filter({hasText:id}).count(),0,'Original audio never appears in the song list');
  assert.match(await tracks().first().innerText(),/Night Road/,'The default ranking is ordered by total known likes');
  assert.equal(await page.locator('#musicRanking img').count(),0,'Source text must be escaped rather than interpreted as HTML');
  assert.equal(await page.evaluate(()=>Boolean(window.musicInjected)),false);
  assert.ok((await rowFor('Bright Lights').innerText()).includes('400'),'Known likes contribute to the total');
  assert.ok((await rowFor('Bright Lights').innerText()).match(/200/g)?.length>=2,'Null likes are excluded from both mean and median');
  assert.match(await rowFor('Unknown likes').innerText(),/[—–]/,'A track without known likes retains an unknown metric');
  assert.equal(await page.locator('#musicTopPosts tbody tr').count(),6,'The most-liked posts respect the selected song category and measured likes');
  assert.match(await page.locator('#musicTopPosts tbody tr').first().innerText(),/night1/);
  assert.equal(await page.locator('#musicTopPosts a[href*="withoutmusic"]').count(),0);

  await page.locator('#musicKinds [data-kind="original"]').click();
  assert.equal(await tracks().count(),2,'Different original audio IDs remain separate tracks');
  assert.equal(await page.locator('#musicRankingTitle').innerText(),'Original audio');
  assert.equal(await page.locator('#musicTopPosts tbody tr').count(),3);
  assert.equal(await tracks().filter({hasText:'Bright Lights'}).count(),0,'Songs never appear in the original-audio list');
  const originals = await tracks().allTextContents();
  for(const id of originalIds)assert.ok(originals.some(label=>label.includes(id)),`Original audio exposes the full ID ${id}`);
  assert.ok(originals.every(label=>label.includes('alpha')),'Original audio includes the creator for easier recognition');
  const originalListUrl = page.url();
  await page.reload();
  await page.locator('#musicRanking').waitFor();
  assert.equal(page.url(),originalListUrl);
  assert.equal(await page.locator('#musicKinds [data-kind="original"]').getAttribute('aria-pressed'),'true','Shared links retain the separate original-audio list');
  assert.equal(await tracks().count(),2);
  await page.locator('#musicKinds [data-kind="named"]').click();
  assert.equal(await tracks().count(),5);
  await page.locator('#musicKinds [data-kind="identified"]').click();
  assert.equal(await tracks().count(),1,'ID-only metadata is visible as an untitled sound');
  assert.match(await tracks().first().innerText(),/60006/);
  assert.equal(await page.locator('#musicTopPosts tbody tr').count(),1);
  await clearMusicFilters();

  await setSearch('The Test Band');
  await page.waitForFunction(()=>document.querySelectorAll('#musicRanking .music-track-open').length===1);
  await tracks().first().focus();
  await page.keyboard.press('Enter');
  await page.locator('#musicDetail').waitFor();
  assert.match(await page.locator('#musicDetail').innerText(),/Bright Lights/);
  for(const sc of ['bright1','bright2','bright3'])assert.equal(await page.locator(`#musicDetail a[href="https://www.instagram.com/p/${sc}/"]`).count(),1,'The drilldown links to every source post');
  assert.equal(await page.locator('#musicDetail a[href*="/night1/"]').count(),0);
  await page.locator('#musicClose').click();
  await page.locator('#musicDetail').waitFor({state:'hidden'});
  await page.locator('#musicSort').selectOption('mean');
  await page.locator('#musicMinUses').selectOption('3');
  const shareUrl = page.url();
  await page.reload();
  await page.locator('#musicRanking').waitFor();
  assert.equal(await page.locator('#insightsMusic').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#musicSearch').inputValue(),'The Test Band');
  assert.equal(await page.locator('#musicSort').inputValue(),'mean');
  assert.equal(await page.locator('#musicMinUses').inputValue(),'3');
  assert.equal(page.url(),shareUrl,'A shared link restores the same music filters');
  assert.equal(await tracks().count(),1);
  await page.locator('#musicMinUses').selectOption('5');
  assert.equal(await tracks().count(),0,'Minimum uses can produce an honest empty result');
  await clearMusicFilters();

  for(const sort of ['mean','median','uses','relative','topPosts']){
    await page.locator('#musicSort').selectOption(sort);
    assert.equal(await tracks().count(),5,`Sorting by ${sort} preserves only the selected category`);
    if(sort==='mean'||sort==='median')assert.match(await tracks().first().innerText(),/Night Road/);
  }
  await page.locator('#musicSort').selectOption('uses');
  assert.match(await tracks().first().innerText(),/Bright Lights/);
  await page.locator('#musicSort').selectOption('total');
  await page.locator('#ftype').selectOption('Carousel');
  await countIs('total',1);
  assert.equal(await tracks().count(),1);
  assert.match(await tracks().first().innerText(),/Night Road/);
  for(const cell of [4,5,6])assert.equal(await rowFor('Night Road').locator('td').nth(cell).innerText(),'0','Measured zero remains a real total, mean and median');
  await page.locator('#ftype').selectOption('');
  await setGlobalDate('from','2026-10-02');
  await setGlobalDate('to','2026-10-03');
  await countIs('total',2);
  assert.equal(await tracks().count(),1);
  await setGlobalDate('from','');
  await setGlobalDate('to','');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await countIs('total',0);
  assert.equal(await tracks().count(),0);
  await page.reload();
  await page.locator('#musicCoverage').waitFor();
  await countIs('total',0);
  await page.getByRole('button',{name:'@alpha',exact:true}).click();
  await countIs('total',8);
  await page.getByRole('button',{name:'All',exact:true}).click();
  await countIs('total',14);

  await page.locator('#settingsTrigger').click();
  await page.locator('#settingsPanel [data-lang="es"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='es'&&document.querySelector('#insightsMusic')?.textContent.trim()==='Música');
  assert.equal(await page.locator('#insightsOverview').innerText(),'Resumen');
  assert.equal(await page.locator('#musicMinUses option[value="1"]').innerText(),'1 publicación');
  assert.equal(await page.locator('#musicRankingTitle').innerText(),'Canciones');
  assert.match(await rowFor('Views').innerText(),/Views/,'Song titles retain their source language');
  assert.match(await rowFor('Views').innerText(),/Comments/,'Artist names retain their source language');
  assert.match(await rowFor(unsafeTitle).innerText(),/<img src=x/);
  await page.locator('#settingsPanel [data-theme-choice="light"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.keyboard.press('Escape');
  await page.locator('#musicKinds [data-kind="identified"]').click();
  assert.match(await tracks().filter({hasText:'60006'}).innerText(),/Audio sin título/);
  await page.locator('#musicKinds [data-kind="named"]').click();
  await page.screenshot({path:path.join(screenshotDir,'desktop-es-light.png'),fullPage:true});
  await page.locator('#musicKinds [data-kind="original"]').click();
  assert.equal(await page.locator('#musicRankingTitle').innerText(),'Audio original');
  await page.screenshot({path:path.join(screenshotDir,'desktop-es-light-original.png'),fullPage:true});
  await page.locator('#musicKinds [data-kind="named"]').click();
  await page.setViewportSize({width:390,height:844});
  const overflow = await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  assert.ok(overflow<=1,`Music fits a narrow viewport; page overflow was ${overflow}px`);
  // Native Chrome occasionally repeats composited viewport tiles in a very
  // tall fullPage capture. Scroll and capture actual phone-sized viewports.
  await page.locator('#musicExplorer h2').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(screenshotDir,'narrow-es-light-ranking.png')});
  assert.ok(await page.evaluate(()=>scrollY>0),'The narrow page scrolls naturally to its ranking');
  await page.locator('#musicPostsSection h2').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(screenshotDir,'narrow-es-light-top-posts.png')});
  await page.locator('.music-method h2').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(screenshotDir,'narrow-es-light-methodology.png')});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(screenshotDir,'narrow-es-light.png')});
  await page.setViewportSize({width:1440,height:1000});

  activePosts = Array.from({length:51},(_,index)=>makePost(`many${index}`,{ms:`Track ${String(index+1).padStart(2,'0')}`,ma:'Pagination Band',ai:String(70000+index),oa:false,l:100+index}));
  await page.goto(`${base}/insights.html?view=music`);
  await page.locator('#musicRanking').waitFor();
  assert.equal(await tracks().count(),50);
  await page.locator('#musicMore').click();
  assert.equal(await tracks().count(),51,'Show more reveals the remaining track groups');

  activePosts = [makePost('noaudio',{l:null}),makePost('noaudio2',{a:'beta',l:0})];
  await page.reload();
  await page.locator('#musicCoverage').waitFor();
  await countIs('total',2);
  await countIs('detected',0);
  await countIs('unknown',2);
  assert.equal(await tracks().count(),0,'A dataset without audio has no invented tracks');

  activePosts = posts;
  await page.goto(`${base}/insights.html`);
  await page.locator('#tAcc').waitFor();
  assert.equal(await page.locator('#insightsOverview').getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'@gamma',exact:true}).getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#scope').innerText(),/3 (accounts|cuentas)/);
  await page.locator('#insightsMusic').click();
  await page.locator('#musicRanking').waitFor();
  await countIs('total',14);
  assert.equal(await page.getByRole('button',{name:'@gamma',exact:true}).count(),0,'Music uses only its Research account roster');
  await page.locator('#insightsOverview').click();
  await page.locator('#tAcc').waitFor();
  assert.equal(await page.locator('#musicRanking').count(),0,'Overview and Music retain distinct content');
  assert.equal(await page.getByRole('button',{name:'@gamma',exact:true}).getAttribute('aria-pressed'),'true','The cached Overview restores its complete account roster');
  assert.match(await page.locator('#scope').innerText(),/3 (accounts|cuentas)/);
  const warmMusicRequests = requests.filter(request=>request.path==='/api/insights/music').length;
  await page.locator('#insightsMusic').click();
  await page.locator('#musicRanking').waitFor();
  assert.equal(await page.getByRole('button',{name:'@gamma',exact:true}).count(),0);
  assert.equal(requests.filter(request=>request.path==='/api/insights/music').length,warmMusicRequests,'Returning to Music reuses its successful response');

  await page.goto(`${base}/insights.html`);
  await page.locator('#tAcc').waitFor();
  await page.getByRole('button',{name:/^(Clear|Limpiar)$/}).click();
  await page.getByRole('button',{name:'@gamma',exact:true}).click();
  assert.match(await page.locator('#scope').innerText(),/1 (accounts|cuentas)/);
  await page.locator('#insightsMusic').click();
  await page.locator('#musicCoverage').waitFor();
  await countIs('total',0);
  assert.match(await page.locator('#scope').innerText(),/0 (accounts|cuentas)/,'A first Music load must not broaden an unavailable account subset to all accounts');
  assert.equal(await tracks().count(),0);
  await page.locator('#insightsOverview').click();
  await page.getByRole('button',{name:'@gamma',exact:true}).click();
  assert.match(await page.locator('#scope').innerText(),/1 (accounts|cuentas)/);
  const subsetMusicRequests = requests.filter(request=>request.path==='/api/insights/music').length;
  await page.locator('#insightsMusic').click();
  await page.locator('#musicCoverage').waitFor();
  await countIs('total',0);
  assert.match(await page.locator('#scope').innerText(),/0 (accounts|cuentas)/,'Cached Music applies the same account subset intersection as its first load');
  assert.equal(requests.filter(request=>request.path==='/api/insights/music').length,subsetMusicRequests);
  await page.reload();
  await page.locator('#musicCoverage').waitFor();
  await countIs('total',0);
  assert.match(await page.locator('#scope').innerText(),/0 (accounts|cuentas)/,'The empty subset remains empty after a shared-link reload');
  await page.goto(`${base}/insights.html?view=music&acc=gamma`);
  await page.locator('#musicCoverage').waitFor();
  await countIs('total',0);
  assert.match(await page.locator('#scope').innerText(),/0 (accounts|cuentas)/,'A direct link with unavailable account IDs does not silently select everyone');

  await page.goto(`${base}/insights.html`);
  await page.locator('#tAcc').waitFor();
  delayedMusic = {started:deferred(),release:deferred()};
  await page.locator('#insightsMusic').click();
  await delayedMusic.started.promise;
  await page.locator('#insightsOverview').click();
  await page.locator('#tAcc').waitFor();
  const staleResponse = page.waitForResponse(response=>response.url().endsWith('/api/insights/music'));
  delayedMusic.release.resolve();
  await (await staleResponse).finished();
  delayedMusic = null;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#insightsOverview').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#tAcc').count(),1,'A late music response must not replace the newly selected Overview');
  assert.equal(await page.locator('#musicRanking').count(),0);
  await page.locator('#insightsMusic').click();
  await page.locator('#musicRanking').waitFor();
  await countIs('total',14);

  musicFailure = true;
  await page.goto(`${base}/insights.html?view=music`);
  await page.getByRole('button',{name:/Retry|Reintentar/,exact:true}).waitFor();
  assert.equal(await page.locator('#musicRanking').count(),0,'A music endpoint failure cannot look like an empty successful ranking');
  musicFailure = false;
  await page.getByRole('button',{name:/Retry|Reintentar/,exact:true}).click();
  await page.locator('#musicRanking').waitFor();
  await countIs('total',14);
  assert.deepEqual(errors,[]);

  const phone = await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  phone.on('pageerror',error=>errors.push(error.message));
  await phone.route('**/*',intercept);
  await phone.clock.setFixedTime(new Date('2026-10-25T18:00:00Z'));
  await phone.goto(`${base}/insights.html?view=music`);
  await phone.locator('#musicRanking').waitFor();
  assert.equal(new URL(phone.url()).pathname,'/insights.html','The Music link opens the responsive explorer on a phone');
  await phone.locator('#musicKinds [data-kind="original"]').click();
  const phoneUrl = phone.url();
  assert.ok(new URL(phoneUrl).searchParams.has('r'),'Phone filter state is saved in the shared encoded route');
  await phone.reload();
  await phone.locator('#musicRanking').waitFor();
  assert.equal(phone.url(),phoneUrl,'A phone reload preserves the encoded music link');
  assert.equal(await phone.locator('#musicKinds [data-kind="original"]').getAttribute('aria-pressed'),'true');
  assert.equal(await phone.locator('#musicRanking .music-track-open').count(),2);
  assert.equal(await phone.evaluate(()=>sessionStorage.getItem('sentient.forceDesktop')),null,'Music does not force the rest of the app into desktop mode');
  await phone.close();
  assert.deepEqual(errors,[]);
  console.log('PASS Insights Music browser: coverage, aggregation, distinct original audio IDs, source safety, drilldown, search, sort, minimum uses, URL reload, account/date/format filters, unknown/zero likes, empty states, pagination, tab cache/stale-response isolation, API recovery, Spanish/light, narrow layout and phone direct/encoded links.');
  console.log('Music screenshots:',screenshotDir);
}finally{
  await browser.close();
}
