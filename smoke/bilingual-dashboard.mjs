// Real dashboard, Promos and mobile entrypoints; fixture every API/auth/image.
// Check menu semantics and geometry plus shared EN/ES preferences in both themes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'sentient-bilingual-dashboard-'));
const output=path.resolve('work/bilingual-dashboard');fs.mkdirSync(output,{recursive:true});
const server=await createServer({mode:'test',logLevel:'error',cacheDir:path.join(temporary,'vite-cache'),resolve:{alias:{'firebase/auth':path.resolve('smoke/stub-firebase-auth.js'),'firebase/app':path.resolve('smoke/stub-firebase-app.js')}},server:{host:'localhost',port:0}});
await server.listen();const base=server.resolvedUrls.local[0].replace(/\/$/,'');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const email='user03@example.com',date='2026-10-08T12:00:00Z';
const viewer={email,is_dev:true,is_admin:true,isDev:true,isAdmin:true,operating_roles:['admin','vc'],operatingRoles:['admin','vc'],queue_role_preview_active:false};
const accounts=[{handle:'alpha',label:'Alpha Studio',full_name:'Alpha Studio',group:'sentient',followers:1200,active:1,is_active:true}];
const posts=[{id:1,postKey:'alpha:SMOKE1',shortcode:'SMOKE1',account:'alpha',caption:'Original English caption stays intact.',postType:'Carousel',type:'Carousel',likes:2000,comments:20,postDate:date,coverUrl:'https://fixture.test/cover.svg',permalink:'https://instagram.com/p/SMOKE1/'}];
const promo={account:'alpha',shortcode:'PROMO1',client:'Original Brand',product:'Original English product',classification:'disclosed',review_status:'new',published_at:date,first_detected_at:date,caption:'Original sponsored caption.',evidence:[{family:'explicit',text:'Original sponsored evidence.'}],cover_source_url:'https://fixture.test/cover.svg'};
const queue={viewer:{...viewer,displayName:'User 03',accounts:['alpha']},date:date.slice(0,10),requests:[],pickRequests:[],hotPickRequests:[],planningRequests:[],assignedRequests:[],liveDrafts:[],presence:{},timeBlocks:[],designers:[],schedulerUsers:[],accounts,tags:[],priorities:['low','medium','high'],hours:{start:0,end:1440}};
let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(fs.existsSync(chrome)?chrome:undefined)});
 for(const language of ['en','es']) for(const theme of ['dark','light']) for(const width of [1280,390]) {
  const es=language==='es',t=(en,spanish)=>es?spanish:en;
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce',serviceWorkers:'block',...(width===390?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})});
  let savedLanguage=language,savedTheme=theme;const writes=[],errors=[];
  await context.addInitScript(({language,theme})=>{
   if(!localStorage.getItem('sentient.lang')&&!localStorage.getItem('sentient.language')) localStorage.setItem('sentient.language',language);
   if(!localStorage.getItem('sentient.theme')) localStorage.setItem('sentient.theme',theme);
   localStorage.setItem('sentient.accent','lime');localStorage.setItem('sentient.effects','off');localStorage.setItem('sentient.queueGuide.v1','completed');
  },{language,theme});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),filename=url.pathname,method=request.method();
   if(filename.startsWith('/api/')) {
    if(request.resourceType()==='image') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#254c44"/></svg>'});
    if(method !== 'OPTIONS') assert.equal(request.headers().authorization,'Bearer tok',`${method} ${filename}`);
    let data={};
    if(filename.endsWith('/me/preferences')) {if(method==='POST'){const body=request.postDataJSON();writes.push(body);savedLanguage=body.preferences?.language||savedLanguage;savedTheme=body.preferences?.theme||savedTheme;}data={preferences:{language:savedLanguage,theme:savedTheme,accent:'lime',effects:'off',queueGuideCompleted:true}};}
    else if(method!=='GET'){errors.push(`Unexpected mutation: ${method} ${filename}`);return route.fulfill({status:405,json:{detail:'Fixture forbids content mutations'}});}
    else if(filename==='/api/dashboard/me'||filename==='/api/admin/me')data=viewer;
    else if(filename.endsWith('/posts/manifest'))data={revision:'bilingual-menu',sources:[{source:'canonical',upperBound:posts.length},{source:'dashboard',upperBound:0}]};
    else if(filename.endsWith('/posts/page'))data={source:'canonical',nextCursor:posts.length,done:true,upperBound:posts.length,revision:'bilingual-menu',posts};
    else if(filename.endsWith('/posts/media'))data={items:[]};
    else if(filename.endsWith('/posts'))data={posts,summary:{},ranges:{}};
    else if(filename.endsWith('/accounts'))data={accounts};
    else if(filename.endsWith('/lists'))data={lists:[]};
    else if(filename.endsWith('/golden-nuggets'))data={items:[]};
    else if(filename.startsWith('/api/dashboard/queue/v2'))data=queue;
    else if(filename==='/api/admin/promos')data={items:[promo],next_cursor:null};
    else if(filename.startsWith('/api/admin/promos/'))data=promo;
    else if(filename.endsWith('/follower-growth'))data={accounts:[],peaks:[]};
    else if(filename.endsWith('/refresh-allowance'))data={unlimited:true};
    return route.fulfill({json:data});
   }
   if(/chart\.js/.test(url.href))return route.fulfill({contentType:'text/javascript',body:'class Chart {static defaults={font:{}};constructor(){} destroy(){} update(){}}'});
   if(url.origin===base)return route.continue();
   if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#254c44"/></svg>'});
   return route.fulfill({status:204,body:''});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const locale=async()=>page.waitForFunction(({language,theme})=>document.documentElement.lang===language&&document.documentElement.dataset.theme===theme,{language,theme});
  // Preference saves debounce for 300ms, then send an async POST. Wait for a
  // new fixture write rather than a fixed delay before checking or reloading.
  const savedLocale=async(expected,since)=>{
   const deadline=Date.now()+5000;
   const hasWrite=()=>writes.slice(since).some(row=>row.preferences?.language===expected);
   while(!hasWrite()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
   assert.ok(hasWrite(),`changed language saved (${expected}): ${JSON.stringify(writes.slice(since))}`);
   assert.equal(savedLanguage,expected,'fixture server retained the changed language');
  };
  const geometry=async panel=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);const result=await panel.evaluate(node=>{const box=node.getBoundingClientRect();return{x:box.x,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight,overflow:node.scrollWidth-node.clientWidth,document:document.documentElement.scrollWidth};});assert.ok(result.x>=0&&result.right<=result.width+1&&result.top>=0&&result.bottom<=result.height+1,`menu fits ${language}/${theme}/${width}: ${JSON.stringify(result)}`);assert.ok(result.overflow<=1&&result.document<=result.width+1,'controls and page fit horizontally');};
  const checkMenu=async(tool,change=false)=>{
   const trigger=page.locator('.settings-menu-trigger');await trigger.waitFor();await trigger.focus();await page.keyboard.press('Enter');
   const panel=page.getByRole('dialog',{name:t('Settings','Ajustes'),exact:true});await panel.waitFor();
   assert.equal(await trigger.getAttribute('aria-expanded'),'true');
   assert.ok(await panel.evaluate(node=>node.contains(document.activeElement)),'opening menu puts keyboard focus inside');
   const rows=[['settings.html','Settings','Ajustes','Manage your workspace','Administra tu espacio de trabajo'],['agents.html','Agent connections','Conexiones de agentes','Connect your AI tools','Conecta tus herramientas de IA'],['api.html','API connections','Conexiones API','Connect websites and apps','Conecta sitios web y aplicaciones']];
   for(const [href,en,spanish,description,descriptionEs]of rows){const row=panel.locator(`a[href="/${href}"]`);assert.equal(await row.locator('strong').innerText(),t(en,spanish));assert.equal(await row.locator('small').innerText(),t(description,descriptionEs));assert.equal(await row.locator('.settings-menu-link-icon svg').count(),1);assert.equal(await row.locator('.settings-menu-link-arrow').count(),1);const rowBox=await row.boundingBox();const contentWidth=await row.locator('..').evaluate(node=>node.clientWidth-parseFloat(getComputedStyle(node).paddingLeft)-parseFloat(getComputedStyle(node).paddingRight));assert.ok(rowBox.height>=54,`menu row ${href} has at least 54px height: ${rowBox.height}`);assert.ok(Math.abs(rowBox.width-contentWidth)<=2,`menu row ${href} fills section: ${rowBox.width}/${contentWidth}`);assert.ok(await row.locator('.settings-menu-link-copy').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'menu text is not clipped');}
   await rows.reduce(async(previous,[href])=>{await previous;const row=panel.locator(`a[href="/${href}"]`);await row.focus();assert.ok(await row.evaluate(node=>node===document.activeElement));},Promise.resolve());
   await page.keyboard.press('Shift+Tab');assert.ok(await panel.locator('a[href="/agents.html"]').evaluate(node=>node===document.activeElement),'rows are reachable in keyboard order');
   await geometry(panel);await page.screenshot({path:path.join(output,`${tool}-menu-${language}-${theme}-${width}.png`)});
   if(change){const buttons=panel.getByRole('group',{name:t('Language','Idioma'),exact:true}).getByRole('button');let since=writes.length;await buttons.nth(es?0:1).click();await page.waitForFunction(lang=>document.documentElement.lang!==lang,language);await savedLocale(es?'en':'es',since);await page.reload();await page.locator('.settings-menu-trigger').waitFor();await page.waitForFunction(lang=>document.documentElement.lang===lang,es?'en':'es');await page.locator('.settings-menu-trigger').click();since=writes.length;await page.locator('.lang-toggle button').nth(es?1:0).click();await locale();await savedLocale(language,since);await page.keyboard.press('Escape');}
   else {await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.ok(await trigger.evaluate(node=>node===document.activeElement),'Escape restores trigger focus');}
  };
  await page.goto(`${base}/index.html?desktop=1`);await page.locator('.product-header').waitFor();await locale();await checkMenu('dashboard',true);
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('sentient.lang'),localStorage.getItem('sentient.language')]),[language,language]);
  await page.goto(`${base}/promos.html?desktop=1`);await page.locator('.promo-card').waitFor();await locale();
  await page.getByRole('button',{name:t('Review next','Revisar siguiente'),exact:true}).waitFor();
  const badge=await page.locator('.promo-badge.disclosed').textContent();assert.ok(es ? /promoci[oó]n/i.test(badge) : badge==='Disclosed promotion',`classification badge follows ${language}: ${badge}`);assert.ok((await page.locator('.promo-card').innerText()).includes(promo.product));assert.ok((await page.locator('.promo-card').innerText()).includes('Original sponsored evidence.'));
  const search=page.getByRole('searchbox',{name:t('Search loaded posts','Buscar posts cargados'),exact:true});await search.fill('nothing matches');
  await page.getByText(t('No loaded posts match these filters.','Ningún post cargado coincide con estos filtros.'),{exact:true}).waitFor();await search.fill('');await page.locator('.promo-card').waitFor();await checkMenu('promos');
  if(width===390){
   await page.goto(`${base}/mobile/?mobile=1`);await page.locator('.m-profile').waitFor({timeout:5000}).catch(async error=>{console.log('Mobile debug',await page.locator('body').innerText(),errors);await page.screenshot({path:path.join(output,'mobile-failure.png')});throw error;});await locale();await page.locator('.m-profile').click();
   const sheet=page.getByRole('dialog');await sheet.waitFor();assert.equal(await sheet.getByRole('link',{name:t('API connections','Conexiones API'),exact:true}).getAttribute('href'),'/api.html');
   await sheet.getByText(t('Language','Idioma'),{exact:true}).waitFor();await sheet.getByRole('button',{name:t('Sign out','Cerrar sesión'),exact:true}).waitFor();await geometry(sheet);
   let since=writes.length;await sheet.getByRole('button',{name:es?'EN':'ES',exact:true}).click();await page.waitForFunction(lang=>document.documentElement.lang!==lang,language);await savedLocale(es?'en':'es',since);await page.reload();await page.locator('.m-profile').waitFor();await page.waitForFunction(lang=>document.documentElement.lang===lang,es?'en':'es');await page.locator('.m-profile').click();since=writes.length;await page.getByRole('dialog').getByRole('button',{name:es?'ES':'EN',exact:true}).click();await locale();await savedLocale(language,since);await page.waitForFunction(code=>document.querySelector('.m-pref-section .m-segment button.is-on')?.textContent===code,language.toUpperCase());await page.screenshot({path:path.join(output,`mobile-menu-${language}-${theme}-${width}.png`)});
  }
  assert.deepEqual(errors,[]);console.log(`PASS bilingual Dashboard/Promos${width===390?'/mobile':''} ${language}/${theme}/${width}: menu icons/copy/links, keyboard, persistence, source content and no clipping`);await context.close();
 }
}finally{await browser?.close();await server.close();fs.rmSync(temporary,{recursive:true,force:true});}
