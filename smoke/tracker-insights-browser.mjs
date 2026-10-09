// Native browser layout/workflow smoke. Auth, charts and API responses are
// fixtures; every request is intercepted, so this cannot mutate production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
const base='http://localhost:4199';
const errors=[];
const mobileOverflow={};
const overflowElements=()=>[...document.querySelectorAll('body *')].filter(el=>{
  if(el.getBoundingClientRect().right<=innerWidth+1)return false;
  for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(parent).overflowX)&&parent.getBoundingClientRect().right<=innerWidth+1)return false;}
  return true;
}).slice(0,15).map(el=>({tag:el.tagName,id:el.id,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,overflow:getComputedStyle(el).overflowX,minWidth:getComputedStyle(el).minWidth}));
const fixtureAuth = `const fixtureUser={uid:'fixture',email:'fixture@example.test',getIdToken:async()=> 'fixture-token'}; const fixtureAuth={currentUser:fixtureUser}; const getAuth=()=>fixtureAuth; class GoogleAuthProvider{setCustomParameters(){}} const getRedirectResult=async()=>null; const onAuthStateChanged=(_auth,callback)=>{queueMicrotask(()=>callback(fixtureUser));return ()=>{}}; const signInWithPopup=async()=>null; const signInWithRedirect=async()=>null; const signOut=async()=>null; const setPersistence=async()=>null; const browserLocalPersistence={};`;
const chartFixture = `class Chart{static defaults={font:{}};static owners=new Map();constructor(canvas){if(Chart.owners.has(canvas))throw new Error('Canvas already in use');this.canvas=canvas;Chart.owners.set(canvas,this)}destroy(){Chart.owners.delete(this.canvas)}}`;
const accounts=[{handle:'alpha',group:'sentient',followers:1000,full_name:'Alpha Studio'},{handle:'beta',group:'competitors',followers:2000,full_name:'Beta Studio'}];
const posts=Array.from({length:8},(_,index)=>({a:index%2?'beta':'alpha',d:`2026-10-0${index%3+1}T12:00:00Z`,l:100+index*100,c:4+index,v:1000+index*300,t:'Video',pt:'clips',ocr:'Practical AI video tutorial',h:'tutorial,creativity',u:`https://instagram.com/p/fixture${index}/`}));
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===base){
    const asset=path.resolve('public',url.pathname.slice(1));
    if(!asset.startsWith(path.resolve('public')+path.sep)||!fs.existsSync(asset)){await route.fulfill({status:404,body:''});return;}
    let body=fs.readFileSync(asset,'utf8');
    if(url.pathname.endsWith('.html')){
      body=body.replace(/<script src="[^"]*chart\.js[^"]*"><\/script>/g,`<script>${chartFixture}</script>`)
        .replace(/import \{ initializeApp \} from 'https:\/\/www\.gstatic\.com\/[^']+';/,"const initializeApp=()=>({});")
        .replace(/import \{\s*getAuth,[\s\S]+?\} from 'https:\/\/www\.gstatic\.com\/[^']+';/,fixtureAuth);
    }
    await route.fulfill({contentType:url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body});return;
  }
  if(url.hostname==='cortex-api-db2e.onrender.com'){
    assert.ok(route.request().method()==='GET'||url.pathname.endsWith('/me/preferences'),'Only mock preference writes are allowed');
    let data={};
    if(url.pathname==='/api/tracker/summary')data={tracking_since:'2026-09-01',accounts};
    else if(url.pathname.startsWith('/api/tracker/accounts/'))data={followers_history:[{date:'2026-10-01',followers:900},{date:'2026-10-03',followers:1000}],engagement_weekly:[]};
    else if(url.pathname==='/api/insights/posts')data={posts,accounts};
    else if(url.pathname==='/api/insights/follower-growth')data={accounts:[],peaks:[]};
    else if(url.pathname==='/api/dashboard/me')data={is_admin:false,is_dev:false,operating_roles:['vc'],email:'fixture@example.test'};
    else if(url.pathname.endsWith('/me/preferences'))data={preferences:{theme:'dark',language:'en'}};
    else if(url.pathname.endsWith('/refresh-allowance'))data={unlimited:false,windowSeconds:3600,retryAfterSeconds:0};
    await route.fulfill({json:data});return;
  }
  await route.fulfill({status:404,body:''});
});

try{
  await page.goto(`${base}/tracker.html`);
  await page.locator('#trackerSearch').waitFor();
  await page.locator('#authGate.hidden').waitFor({state:'attached'});
  assert.equal(await page.locator('.product-nav a[href="/hooks.html"]').isVisible(),false);
  await page.locator('#trackerSearch').fill('@alpha');
  assert.equal(await page.locator('tr[data-handle]').count(),1);
  await page.locator('tr[data-handle="alpha"]').click();
  await page.locator('#historyWindow').waitFor();
  await page.locator('#historyWindow').selectOption('7');
  await page.locator('#settingsTrigger').click();
  await page.locator('#settingsPanel [data-lang="es"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='es'&&document.querySelector('#app').textContent.includes('Estadísticas históricas'));
  assert.equal(await page.locator('#historyWindow').getAttribute('aria-label'),'Rango del historial de seguidores');
  assert.equal(await page.evaluate(()=>localStorage.getItem('sentient.language')),'es');
  await page.locator('#settingsPanel [data-lang="en"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.querySelector('#app').textContent.includes('Historical Stats'));
  await page.keyboard.press('Escape');
  await page.locator('#backBtn').click();
  await page.locator('#trackerSearch').waitFor();
  assert.equal(await page.locator('#trackerSearch').inputValue(),'@alpha');
  await page.setViewportSize({width:390,height:844});
  mobileOverflow.tracker=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  if(mobileOverflow.tracker) console.log('Tracker overflow elements:',await page.evaluate(overflowElements));
  assert.ok(mobileOverflow.tracker<=1,'Tracker page fits mobile viewport; wide tables scroll inside their container');

  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/insights.html`);
  await page.locator('#tAcc').waitFor();
  await page.locator('#authGate.hidden').waitFor({state:'attached'});
  assert.equal(await page.locator('.insight-post-row').count(),8);
  await page.locator('#settingsTrigger').click();
  await page.locator('#settingsPanel [data-lang="es"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='es'&&document.querySelector('#app').textContent.includes('Cuándo publicar'));
  assert.equal(await page.locator('#ftype option[value="Carousel"]').innerText(),'Carrusel');
  assert.equal(await page.locator('#ftype option[value="Carousel"]').getAttribute('value'),'Carousel');
  assert.match(await page.locator('.insight-post-row').first().innerText(),/Practical AI video tutorial/);
  await page.locator('#settingsPanel [data-lang="en"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.querySelector('#app').textContent.includes('When to post'));
  await page.keyboard.press('Escape');
  await page.locator('#tAcc th[data-k="h"]').click();
  assert.match(await page.locator('#tAcc tbody tr').first().innerText(),/@alpha/);
  await page.locator('#tAcc th[data-k="h"]').click();
  assert.match(await page.locator('#tAcc tbody tr').first().innerText(),/@beta/);
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  assert.match(await page.locator('#scope').innerText(),/0 posts/);
  await page.reload();
  await page.getByRole('button',{name:'Clear',exact:true}).waitFor();
  assert.match(await page.locator('#scope').innerText(),/0 posts/);
  await page.getByRole('button',{name:'All',exact:true}).focus();
  await page.keyboard.press('Enter');
  await page.locator('#tAcc').waitFor();
  assert.equal(await page.locator('.insight-post-row').count(),8);
  await page.setViewportSize({width:390,height:844});
  mobileOverflow.insights=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  if(mobileOverflow.insights) console.log('Insights overflow elements:',await page.evaluate(overflowElements));
  assert.ok(mobileOverflow.insights<=1,'Insights page fits mobile viewport; wide tables and the heatmap scroll inside their containers');
  assert.deepEqual(errors,[]);
  console.log('PASS Tracker/Insights browser fixtures: populated pages, search/detail/back/range, chart-safe sorting, keyboard filters, empty selection reload and role navigation; Firebase/API/Chart.js are mocked');
  console.log('Mobile page overflow in pixels:',mobileOverflow);
}finally{await browser.close();}
