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
const preferenceWrites=[];
const cover='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#18383d"/><text x="40" y="55" fill="white" font-size="25">TOP — complete cover</text><text x="40" y="750" fill="white" font-size="25">BOTTOM</text></svg>');
const posts=Array.from({length:5},(_,i)=>({id:i+1,postKey:`chatgptricks:VIS${i}`,shortcode:i===3?'DDJF3IQTVUD':`VIS${i}`,account:'chatgptricks',caption:'A visual release validation caption. '.repeat(4),postType:'Carousel',type:'Carousel',likes:1000-i*40,comments:23,postDate:new Date(Date.now()-i*3600000).toISOString(),coverUrl:cover,permalink:`https://instagram.com/p/VIS${i}/`,...(i<3?{stackId:'visual-stack',stackSize:3}:{}),isHot:true,hotMultiplier:3}));
await page.route('https://cortex-api-db2e.onrender.com/**', async route=>{
 const url=route.request().url();let data={};
 if(url.includes('/posts/manifest'))data={revision:'visual-gate',sources:[{source:'canonical',upperBound:posts.length},{source:'dashboard',upperBound:0}]};
 else if(url.includes('/posts/page'))data={source:'canonical',afterId:0,nextCursor:posts.length,done:true,upperBound:posts.length,revision:'visual-gate',posts};
 else if(url.includes('/posts/media'))data={items:[]};
 else if(url.includes('/posts'))data={posts,summary:{},ranges:{}};
 else if(url.includes('/accounts'))data={accounts:[{handle:'chatgptricks',label:'ChatGPTricks',group:'sentient',active:1,is_active:true}]};
 else if(url.includes('/lists'))data={lists:[]};
 else if(url.includes('/me/preferences')){if(route.request().method()==='POST'){preferenceWrites.push(route.request().postDataJSON());data={preferences:{}};}else data={preferences:{accent:'blue'}};}
 else if(url.includes('/golden-nuggets'))data={items:[{account:'chatgptricks',shortcode:'VIS4',label:'golden_nugget',targetAccount:'chatgptricks',score:0.8}]};
 else if(url.includes('/admin/me'))data={role:'admin',is_dev:true,email:'esteban@sentientagency.io'};
 await route.fulfill({json:data});
});
await page.addInitScript(()=>{localStorage.setItem('sentient.lang','en');localStorage.setItem('sentient.theme','dark');});
try {
 await page.goto(`${base}/index.html?desktop=1`);
 await page.waitForSelector('.gallery-grid .post-card',{timeout:20000});
 assert.equal(await page.locator('.obs-lab-dock').count(),0);
 // Preferences are per user on the server: its value wins over the browser
 // copy, and this browser's other settings are uploaded once.
 await page.waitForFunction(()=>document.documentElement.getAttribute('data-accent')==='blue');
 await page.waitForTimeout(600);
 assert.ok(preferenceWrites.some(body=>body.preferences?.language==='en'&&body.preferences?.theme==='dark'&&!('accent' in body.preferences)));
 // Golden nuggets render as a gold card, not the dark obsidian surface.
 const golden=page.locator('.post-card-golden-nugget').first();
 assert.match(await golden.evaluate(e=>getComputedStyle(e).backgroundImage),/rgb\(214, 169, 46\)/);
 // Shared marks from the backend reach every user, not only the DEV reviewer.
 const shared=page.locator('.post-card[data-context-shortcode="VIS4"]');
 await shared.first().waitFor();
 assert.equal(await shared.first().evaluate(e=>e.classList.contains('post-card-golden-nugget')),true);
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
 // A Jev rejection carries an object detail; the modal must show its message.
 await page.route('**/api/dashboard/posts/generate-caption',route=>route.fulfill({status:502,json:{detail:{message:'The generated caption did not pass Jev verification.',verification:{accepted:false}}}}));
 await page.getByRole('button',{name:'Generate similar caption',exact:true}).click();await page.waitForSelector('.caption-generator-modal');
 const captionSelects=page.locator('.caption-generator-modal select');
 await captionSelects.nth(0).selectOption('chatgptricks');await captionSelects.nth(1).selectOption('en');
 await page.locator('.caption-generator-modal button[type="submit"]').click();
 await page.waitForSelector('.caption-generator-modal .queue-assign-error');
 assert.equal(await page.locator('.caption-generator-modal .queue-assign-error').textContent(),'The generated caption did not pass Jev verification.');
 // A flagged caption is still returned for editing, with Jev's review note.
 await page.unroute('**/api/dashboard/posts/generate-caption');
 await page.route('**/api/dashboard/posts/generate-caption',route=>route.fulfill({json:{caption:'Flagged but editable caption',jevVerification:{accepted:false},jevWarning:'Jev flagged this caption. Check its facts and CTA before publishing.'}}));
 await page.locator('.caption-generator-modal button[type="submit"]').click();
 await page.waitForSelector('.caption-generator-modal .caption-generator-review');
 assert.equal(await page.locator('.caption-generator-modal .caption-generator-result textarea').inputValue(),'Flagged but editable caption');
 assert.equal(await page.locator('.caption-generator-modal .queue-assign-error').count(),0);
 await page.keyboard.press('Escape');await page.waitForTimeout(100);assert.equal(await page.locator('.obs-inspector.is-open').count(),1);
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
 queueData.requests.forEach(task=>{task.post.caption='Long caption for layout validation. '.repeat(30);task.post.coverUrl='https://covers.test/queue-cover.svg';task.notes='Manual note left when the post was created from scratch.';});
 await page.addInitScript(queueFixture);
 // The first cover attempt fails, as a cold cover endpoint can; React retries,
 // and the landed Selected post card must follow it instead of staying grey.
 await page.route('https://covers.test/**',route=>route.request().url().includes('cover_attempt=0')?route.fulfill({status:503,body:''}):route.fulfill({contentType:'image/svg+xml',body:decodeURIComponent(cover.slice(cover.indexOf(',')+1))}));
 await page.route('**/api/dashboard/queue/**',route=>{
  const url=route.request().url();
  return route.fulfill({json:url.includes('/history')?{events:Array.from({length:15},(_,i)=>({id:i,type:'scheduled',actorEmail:'esteban@sentientagency.io',createdAt:new Date().toISOString()}))}:queueData});
 });
 await page.goto(`${base}/queue.html?desktop=1`);await page.waitForSelector('.scheduler-block.state-scheduled');
 await page.locator('.scheduler-block.state-scheduled').click();await page.waitForTimeout(1200);
 await page.waitForSelector('.queue-history li');
 await page.waitForFunction(()=>{const image=document.querySelector('.queue-request-rail .obs-persistent-card img.cover-image');return image?.classList.contains('is-loaded')&&image.naturalWidth>0;},null,{timeout:8000});
 // The Queue page behind an open request must not scroll, even when it is long.
 await page.evaluate(()=>{const d=document.createElement('div');d.id='scroll-probe';d.style.height='3000px';document.querySelector('main,#root').append(d);document.scrollingElement.scrollTop=0;});
 for(const point of [[40,500],null]){
  let [x,y]=point||[];if(!point){const r=await page.locator('.queue-request-rail .obs-inspector-info').boundingBox();x=r.x+r.width/2;y=r.y+Math.min(r.height/2,200);}
  await page.mouse.move(x,y);for(let k=0;k<10;k++){await page.mouse.wheel(0,600);await page.waitForTimeout(30);}await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0);
 }
 await page.locator('.queue-request-rail .obs-inspector-info').evaluate(e=>{e.scrollTop=0;});
 // Start work asks where to place the block; that choice must sit above the
 // inspector and receive clicks, and Escape must not close the inspector under it.
 await page.getByRole('button',{name:'Start work',exact:true}).click();
 const startChoice=page.locator('.queue-create-modal[aria-labelledby="queue-start-choice-title"]');
 await startChoice.waitFor();
 assert.ok(await startChoice.locator('.scheduler-primary').evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}));
 await page.keyboard.press('Escape');await page.waitForTimeout(100);
 assert.equal(await page.locator('.queue-request-rail').count(),1);
 await startChoice.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await startChoice.count(),0);
 // Caption and manual notes can be copied from the request detail.
 await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 const copyText=page.locator('.queue-request-rail .queue-detail-copy');
 await copyText.getByRole('button',{name:'Copy caption',exact:true}).click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await copyText.locator('> p').first().textContent());
 await copyText.getByRole('button',{name:'Copied',exact:true}).waitFor();
 await copyText.getByRole('button',{name:'Copy notes',exact:true}).click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Manual note left when the post was created from scratch.');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
  const geometry=await page.locator('.obs-inspector-info').evaluate(info=>{const children=[...info.children].filter(e=>e.getBoundingClientRect().height>0);return {overflow:info.scrollWidth-info.clientWidth,overlap:children.slice(1).some((e,i)=>e.getBoundingClientRect().top<children[i].getBoundingClientRect().bottom-1)}});
  assert.equal(geometry.overlap,false);assert.ok(geometry.overflow<=1);
 }
 await page.keyboard.press('Escape');await page.waitForTimeout(1200);assert.equal(await page.locator('.queue-request-rail,.obs-in-transit,.obs-persistent-card').count(),0);
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'');await page.evaluate(()=>document.getElementById('scroll-probe')?.remove());
 console.log('PASS browser Queue: real scheduler/detail, long caption and 15 history entries, desktop/mobile layout, clean return');
 assert.deepEqual(errors,[]);
 console.log('PASS browser Research: live components, menus, nested dialogs, themes, responsive detail, full covers and opaque closing shuffle');
} finally { await browser.close(); await server.close(); }
