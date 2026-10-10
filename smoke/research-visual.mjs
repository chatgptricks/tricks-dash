// Real Research entry and browser interactions; all non-local requests are
// fixtures. This gate never reads or writes the production API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const phase=process.argv.includes('--before')?'before':'after';
const output=path.resolve(`work/research-visual/${phase}`);
fs.mkdirSync(output,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'localhost',port:4198}});
await server.listen();
const base=(server.resolvedUrls?.local?.[0]||'http://localhost:4198/').replace(/\/$/,'');
const api='https://cortex-api-db2e.onrender.com';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(fs.existsSync(chrome)?chrome:undefined)});
const errors=[],violations=[],measurements=[];
const titles=['AI tools for better ideas','Create a useful first draft','Small habits, better work','Design a clearer story','A new way to build','The creative workflow','Make your next idea real','A lighthouse for your ideas','Teach something useful','A fresh perspective'];
const colors=['#1d4039','#342b57','#243647','#514125','#393254','#153e43','#4d2839','#344538','#313852','#4b3232'];
const cover=index=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${colors[index]}"/><circle cx="420" cy="245" r="155" fill="#fff" opacity=".07"/><text x="45" y="80" fill="#cee6da" font-size="18" font-family="sans-serif" letter-spacing="3">CREATIVE RESEARCH</text><text x="45" y="475" fill="#fff" font-size="42" font-family="sans-serif" font-weight="600">${titles[index].split(' ').slice(0,3).join(' ')}</text><text x="45" y="530" fill="#fff" font-size="42" font-family="sans-serif" font-weight="600">${titles[index].split(' ').slice(3).join(' ')}</text><text x="45" y="745" fill="#cfddd9" font-size="18" font-family="sans-serif">A fixture for visual review · 0${index+1}</text></svg>`);
const posts=titles.map((title,index)=>({id:index+1,postKey:`${index%3?'chatgptricks':'creativebrief'}:RESEARCH${index}`,shortcode:`RESEARCH${index}`,account:index%3?'chatgptricks':'creativebrief',caption:`${title}. ${index===7?'lighthouse ':''}A concrete example of a thoughtful creative workflow. Save this idea for your next project.`,postType:index===4?'Video':'Carousel',type:index===4?'Video':'Carousel',likes:16000-index*1170,comments:260-index*19,postDate:new Date(Date.now()-index*3600000).toISOString(),coverUrl:`https://research-covers.test/${index}.svg`,permalink:`https://instagram.com/p/RESEARCH${index}/`,...(index<3?{stackId:'research-fixture-stack',stackSize:3}:{}),isHot:index<4,hotMultiplier:index<4?3:1}));
const accounts=[{handle:'chatgptricks',label:'ChatGPTricks',group:'sentient',active:1,is_active:true,category:'ai_automation'},{handle:'creativebrief',label:'Creative Brief',group:'competitors',active:1,is_active:true,category:'technology_science'}];

async function fixturePage(theme,width,{height=width===390?844:1000,longRoster=false}={}){
  const roster=longRoster?[...accounts,...Array.from({length:48},(_,i)=>({handle:`fixture${i}`,label:`Creative fixture ${i}`,group:'competitors',active:1,is_active:true}))]:accounts;
  const page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(theme=>{localStorage.setItem('sentient.lang','en');localStorage.setItem('sentient.theme',theme);localStorage.setItem('sentient.accent','lime');localStorage.setItem('sentient.effects','immersive');},theme);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===base){
      if(url.pathname.includes('/.vite/deps/firebase_auth.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('smoke/stub-firebase-auth.js','utf8')});
      if(url.pathname.includes('/.vite/deps/firebase_app.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('smoke/stub-firebase-app.js','utf8')});
      return route.continue();
    }
    if(url.origin===api){
      const method=route.request().method();
      assert.ok(method==='GET'||url.pathname.endsWith('/me/preferences'),'Research visual fixture forbids content mutation');
      let data={};
      if(url.pathname.endsWith('/posts/manifest'))data={revision:'research-visual',sources:[{source:'canonical',upperBound:posts.length},{source:'dashboard',upperBound:0}]};
      else if(url.pathname.endsWith('/posts/page'))data={source:'canonical',afterId:0,nextCursor:posts.length,done:true,upperBound:posts.length,revision:'research-visual',posts};
      else if(url.pathname.endsWith('/posts/media'))data={items:[]};
      else if(url.pathname.endsWith('/posts'))data={posts,summary:{},ranges:{}};
      else if(url.pathname.endsWith('/accounts'))data={accounts:roster};
      else if(url.pathname.endsWith('/lists'))data={lists:[]};
      else if(url.pathname.endsWith('/me/preferences'))data={preferences:{theme,language:'en',accent:'lime',effects:'immersive'}};
      else if(url.pathname.endsWith('/golden-nuggets'))data={items:[{account:'creativebrief',shortcode:'RESEARCH9',label:'golden_nugget',targetAccount:'chatgptricks',score:.8}]};
      else if(url.pathname.endsWith('/admin/me')||url.pathname.endsWith('/dashboard/me'))data={role:'admin',is_admin:true,is_dev:true,operating_roles:['admin','vc'],email:'developer@example.test'};
      return route.fulfill({json:data});
    }
    if(url.hostname==='research-covers.test')return route.fulfill({contentType:'image/svg+xml',body:decodeURIComponent(cover(Number(url.pathname.match(/\d+/)?.[0])||0).split(',').slice(1).join(','))});
    if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#314c41"/><text x="25" y="53" fill="white" font-family="sans-serif" font-size="32">E</text></svg>'});
    return route.fulfill({status:404,body:''});
  });
  await page.goto(`${base}/index.html?desktop=1`);
  await page.locator('.gallery-grid .post-card').first().waitFor({timeout:20000});
  await page.waitForFunction(()=>!document.querySelector('.database-loading-overlay')&&document.querySelectorAll('.gallery-grid .post-card').length>=5);
  await page.waitForTimeout(650);
  return page;
}

function check(condition,message){if(!condition){violations.push(message);if(phase!=='before')assert.ok(condition,message);}}
async function screenshot(page,name){await page.screenshot({path:path.join(output,`${name}.png`)});}
async function geometry(page,label){
  const result=await page.evaluate(()=>{
    const box=selector=>{const e=document.querySelector(selector);return e?{...e.getBoundingClientRect().toJSON(),overflow:e.scrollWidth-e.clientWidth}:null;};
    const cards=[...document.querySelectorAll('.gallery-grid > .stack-card-shell')].map(e=>e.getBoundingClientRect().toJSON());
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,header:box('.product-header'),search:box('.topbar-search'),tabs:box('.tabs-bar'),gallery:box('.gallery-grid'),inspector:box('.obs-inspector.is-open'),popover:box('.filter-popover-panel'),cards};
  });
  measurements.push({label,...result});
  check(result.scrollWidth<=result.width+1,`${label}: document overflow ${result.scrollWidth-result.width}px`);
  if(result.inspector)check(result.inspector.overflow<=1,`${label}: inspector horizontal overflow ${result.inspector.overflow}px`);
  if(result.popover){
    check(result.popover.left>=7&&result.popover.right<=result.width-7,`${label}: filter popover must fit horizontal viewport gutters`);
    check(result.popover.top>=7&&result.popover.bottom<=result.height-7,`${label}: filter popover must fit vertical viewport gutters`);
  }
  return result;
}

try{
  for(const theme of ['dark','light'])for(const width of [1440,390]){
    const label=`${theme}-${width===390?'narrow':'desktop'}`;
    const page=await fixturePage(theme,width);
    assert.equal(await page.locator('.product-header').count(),1,'One Research header');
    assert.equal(await page.getByRole('searchbox',{name:'Search posts',exact:true}).isEnabled(),true);
    assert.equal(await page.getByRole('tab',{name:'HOT',exact:true}).isVisible(),true);
    assert.ok(await page.locator('.gallery-grid .post-card-golden-nugget').count(),'Golden nugget card remains distinct');
    assert.ok(await page.locator('.gallery-grid .hot-border').count(),'HOT card treatment remains present');
    assert.ok(await page.locator('.gallery-grid .post-media').evaluateAll(elements=>elements.every(element=>{const bounds=element.getBoundingClientRect();return Math.abs(bounds.width/bounds.height-.75)<.02;})),'Gallery keeps complete 3:4 media slots');
    await geometry(page,`${label}-gallery`);
    await screenshot(page,`${label}-gallery`);
    // Opening every filter guards the control path, including the mobile
    // trigger sheet; changing sort verifies the filter changes real results.
    if(width===390)await page.getByRole('button',{name:'Filters',exact:true}).click();
    for(const name of ['Account','Category','Sort','Type','Date','Engagement']){
      const trigger=page.locator('.filter-trigger').filter({has:page.locator('.filter-trigger-label',{hasText:new RegExp(`^${name}$`)})});
      await trigger.click();
      const panel=page.locator('.filter-popover-panel');await panel.waitFor();
      await page.waitForTimeout(250);
      await geometry(page,`${label}-${name.toLowerCase()}-filter`);
      if(name==='Account')await screenshot(page,`${label}-filters`);
      if(name==='Sort')await panel.getByRole('button',{name:'Most liked',exact:true}).click();
      await page.keyboard.press('Escape');
      await panel.waitFor({state:'detached'});
      assert.equal(await trigger.evaluate(e=>e===document.activeElement),true,`${name} returns focus on Escape`);
    }
    if(width===390)await page.getByRole('button',{name:/^Filters/}).click();
    const search=page.getByRole('searchbox',{name:'Search posts',exact:true});
    await search.fill('lighthouse');
    await page.waitForFunction(()=>document.querySelectorAll('.gallery-grid .post-card').length===1);
    assert.match(await page.locator('.gallery-grid .post-card').getAttribute('data-context-shortcode'),/RESEARCH7/);
    await page.getByRole('button',{name:'Clear search',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.gallery-grid .post-card').length>=5);
    const card=page.locator('.gallery-grid > .stack-card-shell .post-card').last();
    const selected=await card.getAttribute('data-context-shortcode');
    await card.locator('.post-media').click();
    await page.locator('.obs-inspector.is-open').waitFor();
    await page.waitForTimeout(1100);
    await geometry(page,`${label}-inspector`);
    assert.ok(await page.locator('.obs-inspector.is-open .obs-card-slot').textContent());
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
    await page.locator('.obs-inspector.is-open .caption-copy-button').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),posts.find(post=>post.shortcode===selected).caption,'Caption copy remains usable after visual changes');
    const captionLayout=await page.locator('.obs-inspector.is-open .caption-panel').evaluate(panel=>{
      const heading=panel.querySelector('.caption-header').getBoundingClientRect();
      const copy=panel.querySelector('.caption-copy-button').getBoundingClientRect();
      return {overlap:heading.left<copy.right&&heading.right>copy.left&&heading.top<copy.bottom&&heading.bottom>copy.top,overflow:panel.scrollWidth-panel.clientWidth};
    });
    check(!captionLayout.overlap&&captionLayout.overflow<=1,`${label}: caption title and Copy fit without overlapping`);
    await screenshot(page,`${label}-inspector`);
    await page.locator('.obs-inspector.is-open .dev-jev-trigger').click();
    await page.locator('.dev-jev-panel').waitFor();
    const jevLayout=await page.locator('.dev-jev-panel').evaluate(panel=>{
      const bounds=panel.getBoundingClientRect(),info=panel.closest('.obs-inspector-info').getBoundingClientRect();
      return {fits:bounds.left>=info.left&&bounds.right<=info.right+1,overflow:panel.scrollWidth-panel.clientWidth,position:getComputedStyle(panel).position};
    });
    check(jevLayout.fits&&jevLayout.overflow<=1&&!['absolute','fixed'].includes(jevLayout.position),`${label}: expanded Jev tools remain in the inspector flow`);
    if(width===390)await screenshot(page,`${label}-jev`);
    await page.getByRole('button',{name:'Close Jev tools',exact:true}).click();
    const menu=page.locator('.obs-inspector.is-open .obs-slot-menu [aria-label="Post menu"]');
    await menu.click();
    await page.locator('.obs-slot-menu .post-menu-panel').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.obs-inspector.is-open').count(),1,'Menu Escape preserves inspector');
    await page.locator('.obs-inspector.is-open .rail-close-button').click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.obs-in-transit,.obs-persistent-card').count(),0,'Inspector return clears moving clones');
    assert.equal(await page.locator('.obs-inspector.is-open').count(),0);
    assert.ok(await page.locator(`.gallery-grid .post-card[data-context-shortcode="${selected}"]`).isVisible(),'Original card remains available after close');
    await page.close();
  }
  const short=await fixturePage('dark',900,{height:430,longRoster:true});
  await short.getByRole('button',{name:'Filters',exact:true}).click();
  const account=short.locator('.filter-trigger').filter({has:short.locator('.filter-trigger-label',{hasText:/^Account$/})});
  await account.click();
  await short.locator('#filter-popover-account').waitFor();
  await short.waitForTimeout(300);
  await geometry(short,'short-desktop-account-filter');
  await screenshot(short,'short-desktop-account-filter');
  const scrolled=await short.locator('#filter-popover-account').evaluate(panel=>{
    panel.scrollTop=panel.scrollHeight;
    const candidates=[panel,...panel.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+2&&['auto','scroll'].includes(getComputedStyle(e).overflowY));
    for(const element of candidates)element.scrollTop=element.scrollHeight;
    return candidates.some(element=>element.scrollTop>0);
  });
  assert.equal(scrolled,true,'Long account lists remain scrollable in a short viewport');
  // Model a trigger near the viewport bottom without changing the component
  // or its placement algorithm. The real popup must choose the larger space.
  await short.keyboard.press('Escape');
  await account.evaluate(trigger=>{trigger.style.position='fixed';trigger.style.bottom='12px';trigger.style.left='40px';trigger.style.zIndex='9000';});
  await account.click();
  await short.locator('#filter-popover-account').waitFor();
  await short.waitForTimeout(300);
  const flipped=await geometry(short,'short-desktop-upward-filter');
  const trigger=await account.boundingBox();
  check(flipped.popover.bottom<=trigger.y-5,'Account popup flips upward when its trigger is near the bottom');
  await screenshot(short,'short-desktop-upward-filter');
  await short.keyboard.press('Escape');
  await short.close();
  assert.deepEqual(errors,[],'No render or interaction errors');
  fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify({phase,violations,measurements},null,2));
  console.log(`${phase==='before'?'CAPTURE':'PASS'} Research visual: desktop/narrow dark/light, six filter controls, sort, exact search, selected-card menu and clean inspector return`);
  console.log(`Visual fixtures: ${output}`);
  if(violations.length)console.log(`Baseline findings: ${JSON.stringify(violations)}`);
}finally{await browser.close();await server.close();}
