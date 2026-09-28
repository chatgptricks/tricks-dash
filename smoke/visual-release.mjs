// Browser release gate. Firebase and every API request are mocked; no live writes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
// Self-contained: serves the app itself, so no separate `npm run dev` is needed.
const server = await createServer({ logLevel:'error', server:{ host:'localhost', port:4178 } });
await server.listen();
const base = (server.resolvedUrls?.local?.[0] || 'http://localhost:4178/').replace(/\/$/, '');
// Prefer an installed Chrome (CHROME_PATH or the macOS default); otherwise use
// Playwright's own Chromium (`npx playwright install chromium`).
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (fs.existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({executablePath, headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
await page.route('**/node_modules/.vite/deps/firebase_auth.js*', route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('smoke/stub-firebase-auth.js','utf8')}));
await page.route('**/node_modules/.vite/deps/firebase_app.js*', route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('smoke/stub-firebase-app.js','utf8')}));
const cover='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#18383d"/><text x="40" y="55" fill="white" font-size="25">TOP — complete cover</text><text x="40" y="750" fill="white" font-size="25">BOTTOM</text></svg>');
const posts=Array.from({length:5},(_,i)=>({id:i+1,postKey:`chatgptricks:VIS${i}`,shortcode:`VIS${i}`,account:'chatgptricks',caption:'A visual release validation caption. '.repeat(4),postType:'Carousel',type:'Carousel',likes:1000-i*40,comments:23,postDate:new Date(Date.now()-i*3600000).toISOString(),coverUrl:cover,permalink:`https://instagram.com/p/VIS${i}/`,...(i<3?{stackId:'visual-stack',stackSize:3}:{}),isHot:true,hotMultiplier:3}));
await page.route('https://cortex-api-db2e.onrender.com/**', async route=>{
 const url=route.request().url();let data={};
 if(url.includes('/posts/manifest'))data={revision:'visual-gate',sources:[{source:'canonical',upperBound:posts.length},{source:'dashboard',upperBound:0}]};
 else if(url.includes('/posts/page'))data={source:'canonical',afterId:0,nextCursor:posts.length,done:true,upperBound:posts.length,revision:'visual-gate',posts};
 else if(url.includes('/posts/media'))data={items:[]};
 else if(url.includes('/posts'))data={posts,summary:{},ranges:{}};
 else if(url.includes('/accounts'))data={accounts:[{handle:'chatgptricks',label:'ChatGPTricks',group:'sentient',active:1,is_active:true}]};
 else if(url.includes('/lists'))data={lists:[]};
 else if(url.includes('/admin/me'))data={role:'admin',is_dev:true,email:'user03@example.com'};
 await route.fulfill({json:data});
});
await page.addInitScript(()=>{localStorage.setItem('sentient.lang','en');localStorage.setItem('sentient.theme','dark');});
try {
 await page.goto(`${base}/index.html?desktop=1`);
 await page.waitForSelector('.gallery-grid .post-card',{timeout:20000});
 assert.equal(await page.locator('.obs-lab-dock').count(),0);
 const card=page.locator('.gallery-grid > .stack-card-shell .post-card').last();
 await card.locator('[aria-label="Post menu"]').click();
 assert.equal(await page.locator('.obs-inspector.is-open').count(),0);
 await page.keyboard.press('Escape');
 await card.locator('.post-media').click();await page.waitForTimeout(1150);
 // Clicking the card in Selected post opens the original in a new tab.
 await page.context().route(/instagram\.com/, route=>route.fulfill({contentType:'text/html',body:'<title>original</title>'}));
 const [original]=await Promise.all([page.waitForEvent('popup'),page.locator('.obs-inspector.is-open .obs-card-slot').click()]);
 assert.match(original.url(),/instagram\.com\/p\/VIS\d\//);await original.close();
 assert.equal(await page.locator('.obs-inspector.is-open').count(),1);
 // The "..." menu on the Selected post card is live: it opens, lists actions,
 // and Escape closes only the menu, not the inspector.
 await page.locator('.obs-inspector.is-open .obs-slot-menu [aria-label="Post menu"]').click();
 await page.waitForSelector('.obs-inspector.is-open .obs-slot-menu .post-menu-panel');
 assert.ok(await page.locator('.obs-slot-menu .post-menu-panel [role="menuitem"]').count()>=2);
 await page.keyboard.press('Escape');await page.waitForTimeout(100);
 assert.equal(await page.locator('.obs-slot-menu .post-menu-panel').count(),0);
 assert.equal(await page.locator('.obs-inspector.is-open').count(),1);
 await page.getByRole('button',{name:'Download media',exact:true}).click();
 await page.waitForSelector('.media-modal');
 assert.ok(await page.locator('.media-modal-backdrop').evaluate(e=>Number(getComputedStyle(e).zIndex)>11000));
 await page.keyboard.press('Escape');await page.waitForTimeout(100);
 assert.equal(await page.locator('.media-modal').count(),0);assert.equal(await page.locator('.obs-inspector.is-open').count(),1);
 await page.getByRole('button',{name:'Generate similar caption',exact:true}).click();await page.waitForSelector('.caption-generator-modal');await page.keyboard.press('Escape');await page.waitForTimeout(100);assert.equal(await page.locator('.obs-inspector.is-open').count(),1);
 for(const theme of ['dark','light']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.ok(await page.locator('.obs-inspector-info .panel').evaluateAll(es=>es.every(e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)')));
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 assert.ok(await page.locator('.obs-inspector.is-open').evaluate(e=>e.scrollWidth-e.clientWidth<=1));
 await page.keyboard.press('Escape');await page.waitForTimeout(1200);assert.equal(await page.locator('.obs-in-transit,.obs-persistent-card').count(),0);
 await page.setViewportSize({width:1440,height:1000});await page.locator('.post-stack-trigger').click();await page.waitForTimeout(1300);
 assert.equal(await page.locator('.post-stack-modal .post-card').count(),3);
 assert.ok(await page.locator('.post-stack-modal .post-media').evaluateAll(es=>es.every(e=>getComputedStyle(e).aspectRatio==='3 / 4')));
 await page.getByRole('button',{name:'Close stack',exact:true}).click();await page.waitForTimeout(1250);
 assert.equal(await page.locator('.post-stack-modal').count(),1); // final shuffle is still visible
 await page.waitForTimeout(650);assert.equal(await page.locator('.post-stack-modal').count(),0);
 const queueSource=fs.readFileSync('smoke/queue-entry.jsx','utf8');
 const queueFixture=queueSource.slice(queueSource.indexOf("window.localStorage"),queueSource.indexOf('let releaseInitialQueueFetch'))+`
payload.accountOnboarding.completed=true; window.__queueFixture=payload;`;
 await page.evaluate(queueFixture);const queueData=await page.evaluate(()=>window.__queueFixture);
 queueData.requests.forEach(task=>{task.post.caption='Long caption for layout validation. '.repeat(30);task.post.coverUrl=cover;});
 await page.addInitScript(queueFixture);
 await page.route('**/api/dashboard/queue/**',route=>{
  const url=route.request().url();
  return route.fulfill({json:url.includes('/history')?{events:Array.from({length:15},(_,i)=>({id:i,type:'scheduled',actorEmail:'user03@example.com',createdAt:new Date().toISOString()}))}:queueData});
 });
 await page.goto(`${base}/queue.html?desktop=1`);await page.waitForSelector('.scheduler-block.state-scheduled');
 await page.locator('.scheduler-block.state-scheduled').click();await page.waitForTimeout(1200);
 await page.waitForSelector('.queue-history li');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
  const geometry=await page.locator('.obs-inspector-info').evaluate(info=>{const children=[...info.children].filter(e=>e.getBoundingClientRect().height>0);return {overflow:info.scrollWidth-info.clientWidth,overlap:children.slice(1).some((e,i)=>e.getBoundingClientRect().top<children[i].getBoundingClientRect().bottom-1)}});
  assert.equal(geometry.overlap,false);assert.ok(geometry.overflow<=1);
 }
 await page.keyboard.press('Escape');await page.waitForTimeout(1200);assert.equal(await page.locator('.queue-request-rail,.obs-in-transit,.obs-persistent-card').count(),0);
 console.log('PASS browser Queue: real scheduler/detail, long caption and 15 history entries, desktop/mobile layout, clean return');
 assert.deepEqual(errors,[]);
 console.log('PASS browser Research: live components, menus, nested dialogs, themes, responsive detail, full covers and opaque closing shuffle');
} finally { await browser.close(); await server.close(); }
