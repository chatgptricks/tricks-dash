// Real News, Vault and Hooks entrypoints. Fixture all API/auth/external traffic;
// verify shared EN/ES preference persistence, actions and source preservation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-tool-language-'));
const output = path.resolve('work/tool-language');
fs.mkdirSync(output, { recursive: true });
const authStub = path.join(temporary, 'firebase-auth.js');
fs.writeFileSync(authStub, `
const observers = new Set();
const user = { email:'user03@example.com', displayName:'User 03', getIdToken:async()=> 'tok' };
const auth = { currentUser: localStorage.getItem('__toolSignedOut') ? null : user };
window.__toolSetUser = value => { auth.currentUser = value ? user : null; if(value) localStorage.removeItem('__toolSignedOut'); else localStorage.setItem('__toolSignedOut','1'); for(const callback of observers) callback(auth.currentUser); };
export const getAuth = () => auth;
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserPopupRedirectResolver = {}, browserLocalPersistence = {};
export const setPersistence = async () => {};
export const getRedirectResult = async () => null;
export function onAuthStateChanged(auth, callback) { observers.add(callback); callback(auth.currentUser); return () => observers.delete(callback); }
export const signInWithPopup = async () => { if(window.__toolSignInError) throw window.__toolSignInError; window.__toolSetUser(true); };
export const signInWithRedirect = async () => {};
export const signInWithCustomToken = async () => ({user});
export const signOut = async () => window.__toolSetUser(false);
`);
const server = await createServer({ logLevel:'error', cacheDir:path.join(temporary,'vite-cache'), resolve:{alias:{
  'firebase/auth':authStub, 'firebase/app':path.resolve('smoke/stub-firebase-app.js'),
}}, server:{host:'localhost',port:0} });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/,'');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
try {
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined)});
  for (const [language,width] of [['en',1280],['es',1280],['en',390],['es',390]]) {
    const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const es = language === 'es', label = (en,spanish) => es ? spanish : en;
    let serverLanguage = language, failDraft = true;
    const errors = [], preferences = [], mutations = [];
    const date = '2026-09-01T10:00:00Z';
    const story = {id:'story-1',title:'Original English AI research story',description:'Original English reporting stays intact.',publisher:'Source Publisher',source:'Source Publisher',sourceType:'news',feedLabel:'Artificial intelligence',feedGroup:'Ticker',published:date,link:'https://publisher.test/original',image:'',coverageCount:1};
    const saved = {};
    const link = {id:'link-1',title:'Original English saved idea',url:'https://publisher.test/idea',priority:1,shared_at:date,source:'Source workspace',discarded:false,done:false,tweet_text:'Original English source content.'};
    const hook = {id:'posts:1:ocr',source_table:'posts',source_id:1,source_kind:'ocr',account:'sourceaccount',shortcode:'abc',permalink:'https://instagram.com/p/abc',published_at:date,likes:12345,hook_text:'Original English hook stays intact.',primary_topic:'ai_tools',categories:['benefit'],categorized_at:date,matchType:'exact',saved:false};
    const drafts = [];
    await context.addInitScript(initial => {
      if (!localStorage.getItem('sentient.lang') && !localStorage.getItem('sentient.language')) localStorage.setItem('sentient.language',initial);
      localStorage.setItem('sentient.effects','off');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=> {window.__copiedText=value;}}});
    },language);
    await context.route('**/*',async route => {
      const request=route.request(),url=new URL(request.url()),method=request.method();
      if(url.pathname.startsWith('/api/')) {
        assert.equal(request.headers().authorization,'Bearer tok');
        let data={};
        if(url.pathname.endsWith('/me/preferences')) {
          if(method==='POST') { const payload=request.postDataJSON(); preferences.push(payload); if(payload.preferences?.language) serverLanguage=payload.preferences.language; }
          data={preferences:{language:serverLanguage}};
        } else if(url.pathname==='/api/dashboard/me') data={email:'user03@example.com',is_dev:true,is_admin:true};
        else if(url.pathname==='/api/dashboard/news') data={items:[story],reviews:{},saved};
        else if(url.pathname==='/api/dashboard/news/save') { const payload=request.postDataJSON();mutations.push({path:url.pathname,payload});if(payload.saved) saved[payload.id]={item:story,brief:payload.brief};else delete saved[payload.id]; }
        else if(url.pathname==='/api/dashboard/vault' && method==='GET') data={items:[link]};
        else if(url.pathname==='/api/dashboard/vault/link-1') { const payload=request.postDataJSON();mutations.push({path:url.pathname,payload});Object.assign(link,payload);data=link; }
        else if(url.pathname==='/api/dashboard/hooks') data={results:url.searchParams.get('q')==='empty' ? [] : [hook],status:{total:1,ocr:1,categorized:1,pending:0},warning:''};
        else if(url.pathname==='/api/dashboard/hooks/drafts') {
          if(method==='POST') {
            const payload=request.postDataJSON();mutations.push({path:url.pathname,payload});
            if(failDraft) {failDraft=false;return route.fulfill({status:403,json:{detail:'Fixture draft unavailable'}});}
            data={...payload,id:'draft-1',updated_at:date};drafts.push(data);
          } else data={drafts};
        } else if(method!=='GET') throw new Error(`Unexpected fixture mutation: ${method} ${url.pathname}`);
        return route.fulfill({json:data});
      }
      if(url.origin===base) return route.continue();
      return route.fulfill({status:204,body:''});
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    const expectLocale = async (name) => { await page.waitForFunction(lang=>document.documentElement.lang===lang,language);assert.equal(await page.title(),`${name} · Sentient Dash`); };
    const dateLabel = await page.evaluate(({value,language})=>new Intl.DateTimeFormat(language==='es'?'es-CR':'en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(value)),{value:date,language});
    const screenshot = async name => { assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${language} ${width}: no horizontal overflow`);await page.screenshot({path:path.join(output,`${name}-${language}-${width}.png`)}); };

    await page.goto(`${base}/news.html?desktop=1`);
    await page.locator('.news-story').waitFor();
    await expectLocale(label('News','Noticias'));
    await page.getByRole('button',{name:label('Refresh feeds','Actualizar feeds'),exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:story.title}).count(),1);
    await page.locator('.settings-menu-trigger').click();
    await page.getByRole('group',{name:label('Language','Idioma'),exact:true}).getByRole('button').nth(es ? 0 : 1).click();
    await page.waitForFunction(lang=>document.documentElement.lang!==lang,language);
    await page.waitForFunction(lang=>localStorage.getItem('sentient.lang')===lang&&localStorage.getItem('sentient.language')===lang,es?'en':'es');
    await page.waitForFunction(()=>Boolean(document.querySelector('.settings-menu-panel')));
    await page.getByRole('group',{name:es?'Language':'Idioma',exact:true}).getByRole('button').nth(es ? 1 : 0).click();
    await expectLocale(label('News','Noticias'));
    await page.locator('.settings-menu-trigger').click();
    await page.waitForTimeout(450);
    assert.ok(preferences.some(row=>row.preferences?.language===language),'language persisted to authenticated preferences');
    await page.reload();
    await page.locator('.news-story').waitFor();
    await expectLocale(label('News','Noticias'));
    await page.getByRole('textbox',{name:label('Search stories','Buscar noticias'),exact:true}).fill('no matching story');
    await page.getByText(label('No stories in this view.','No hay noticias en esta vista.'),{exact:true}).waitFor();
    await page.getByRole('textbox',{name:label('Search stories','Buscar noticias'),exact:true}).fill('');
    await page.locator('.news-story').getByRole('button',{name:label('Save','Guardar'),exact:true}).click();
    await page.locator('.news-story').getByRole('button',{name:label('Saved','Guardado'),exact:true}).waitFor();
    assert.deepEqual(mutations.at(-1).payload,{id:'story-1',saved:true});
    await page.locator('.news-story').getByRole('button',{name:label('Draft','Borrador'),exact:true}).click();
    const brief=page.getByRole('textbox',{name:label('Post brief','Brief de publicación'),exact:true});
    assert.match(await brief.inputValue(),new RegExp(es?'BRIEF DE PUBLICACIÓN':'WORKING POST BRIEF'));
    assert.ok((await brief.inputValue()).includes(story.title));
    await page.getByRole('button',{name:label('Copy brief','Copiar brief'),exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__copiedText),await brief.inputValue());
    await screenshot('news');

    await page.goto(`${base}/vault.html?desktop=1`);
    await page.locator('.vault-card').waitFor();
    await expectLocale('Vault');
    assert.ok((await page.locator('.vault-card').innerText()).includes(link.title));
    assert.ok((await page.locator('.vault-card').innerText()).includes(dateLabel));
    await page.getByRole('button',{name:label('+ Add link','+ Agregar enlace'),exact:true}).click();
    await page.getByRole('textbox',{name:label('Title','Título'),exact:true}).waitFor();
    await page.getByRole('button',{name:label('Cancel','Cancelar'),exact:true}).click();
    await page.getByRole('button',{name:label('Discard','Descartar'),exact:true}).click();
    assert.deepEqual(mutations.at(-1).payload,{discarded:true});
    await page.locator('.vault-tabs').getByRole('button',{name:es?/^Descartados/:/^Discarded/}).click();
    await page.getByRole('button',{name:label('Restore','Restaurar'),exact:true}).click();
    assert.deepEqual(mutations.at(-1).payload,{discarded:false});
    await page.locator('.vault-tabs').getByRole('button',{name:es?/^Colección/:/^Collection/}).click();
    await page.locator('.vault-card').waitFor();
    await page.getByRole('textbox',{name:label('Search links','Buscar enlaces'),exact:true}).fill('no matching links');
    await page.getByText(label('No matching links. Try another search or source.','No hay enlaces coincidentes. Prueba otra búsqueda o fuente.'),{exact:true}).waitFor();
    await page.getByRole('textbox',{name:label('Search links','Buscar enlaces'),exact:true}).fill('');
    await screenshot('vault');

    await page.goto(`${base}/hooks.html?desktop=1`);
    await page.locator('.hook-card').waitFor();
    await expectLocale('Hooks');
    assert.ok((await page.locator('.hook-card').innerText()).includes(hook.hook_text));
    assert.ok((await page.locator('.hook-card').innerText()).includes(dateLabel));
    await page.getByRole('button',{name:label('Use this hook','Usar este hook'),exact:true}).click();
    const editor=page.getByRole('textbox',{name:label('Editable hook','Hook editable'),exact:true});
    assert.equal(await editor.inputValue(),hook.hook_text);
    await page.getByRole('button',{name:label('Copy','Copiar'),exact:true}).click();
    await page.getByRole('button',{name:label('Copied','Copiado'),exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__copiedText),hook.hook_text);
    await page.getByRole('button',{name:label('Save draft','Guardar borrador'),exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes(label('Fixture draft unavailable','No se pudo completar esta solicitud. Intenta de nuevo.')));
    assert.equal(await editor.inputValue(),hook.hook_text,'failed saving preserves source text');
    await page.getByRole('button',{name:label('Save draft','Guardar borrador'),exact:true}).click();
    await page.getByRole('button',{name:label('Update draft','Actualizar borrador'),exact:true}).waitFor();
    assert.equal(drafts[0].text,hook.hook_text);
    await page.getByRole('textbox',{name:label('Search hooks','Buscar hooks'),exact:true}).fill('empty');
    await page.getByRole('button',{name:label('Search hooks','Buscar hooks'),exact:true}).click();
    await page.getByText(label('No hooks matched this search.','No hay hooks que coincidan con esta búsqueda.'),{exact:true}).waitFor();
    await screenshot('hooks');

    await page.evaluate(()=>window.__toolSetUser(false));
    for(const tool of ['hooks','news','vault']) {
      await page.goto(`${base}/${tool}.html?desktop=1`);
      await page.getByRole('button',{name:label('Sign in with Google','Iniciar sesión con Google'),exact:true}).waitFor();
      assert.equal(await page.getByRole('group',{name:label('Language','Idioma'),exact:true}).getByRole('button',{name:es?'ES':'EN',exact:true}).getAttribute('aria-pressed'),'true');
      await page.evaluate(()=>{window.__toolSignInError={code:'auth/network-request-failed'};});
      const message=label('Network error reaching Google. Check your connection and try again.','No se pudo conectar con Google. Revisa tu conexión e inténtalo de nuevo.');
      if(tool!=='vault') {const dialog=page.waitForEvent('dialog').then(async alert=>{const text=alert.message();await alert.accept();return text;});await page.getByRole('button',{name:label('Sign in with Google','Iniciar sesión con Google'),exact:true}).click();assert.equal(await dialog,message);}
      else {
        await page.getByRole('button',{name:label('Sign in with Google','Iniciar sesión con Google'),exact:true}).click();await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes(message));
        await page.getByRole('group',{name:label('Language','Idioma'),exact:true}).getByRole('button',{name:es?'EN':'ES',exact:true}).click();
        await page.waitForFunction(expected=>document.querySelector('[role=alert]')?.textContent.includes(expected),es?'Network error reaching Google. Check your connection and try again.':'No se pudo conectar con Google. Revisa tu conexión e inténtalo de nuevo.');
      }
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS News/Vault/Hooks ${language} ${width}: language persistence, source preservation, actions, errors, dates, gates and mobile geometry`);
    await context.close();
  }
} finally { await browser?.close();await server.close();fs.rmSync(temporary,{recursive:true,force:true}); }
