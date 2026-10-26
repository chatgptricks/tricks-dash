/* Music presentation is separate from aggregation so every ranking uses the
   same deduplicated population and measured-value rules. */
(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const url = value => { try { const parsed=new URL(value);return parsed.protocol==='https:'?parsed.href:''; } catch { return ''; } };

  function mount(container, {posts,selectedAccounts,state,onChange,translate,locale}) {
    const categories=[['named','Songs'],['original','Original audio']];
    if(!categories.some(([kind])=>kind===state.kind)) state.kind='named';
    const categoryLabel=()=>categories.find(([kind])=>kind===state.kind)[1];
    const tabId=kind=>kind==='original'?'musicTabOriginal':'musicTabNamed';
    const model=globalThis.InsightsMusic.analyze(posts,{selectedAccounts,rankBy:state.sort});
    const t=value=>escape(translate(value));
    const number=value=>value==null||!Number.isFinite(value)?'—':new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(value);
    const ratio=value=>value==null?'—':number(value)+'×';
    const source=value=>`<span data-i18n-skip>${escape(value)}</span>`;
    const audioLabel=audio=>audio?.kind==='original'?audio.label.replace(/^Original audio/,translate('Original audio')):audio?.kind==='identified'?audio.label.replace(/^Unidentified audio/,translate('Untitled audio')):audio?.label||translate('Unknown audio');
    const title=track=>source(track.kind==='named'?track.title:audioLabel(track));
    const link=(href,label)=>{const safe=url(href);return safe?`<a href="${escape(safe)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:label;};
    const audioLink=track=>track.id?link(`https://www.instagram.com/reels/audio/${encodeURIComponent(track.id)}/`,t('Open audio')):`<span class="music-muted">${t('Audio ID unavailable')}</span>`;
    const date=post=>post.d&&!Number.isNaN(Date.parse(post.d))?new Date(post.d).toLocaleDateString(locale):translate('Date unavailable');
    const options=(entries,value)=>entries.map(([key,label])=>`<option value="${key}"${value===key?' selected':''}>${t(label)}</option>`).join('');
    let limit=50, shownTracks=[], selectedKey=null;
    const c=model.coverage;
    const kpi=(label,value,key,sub)=>`<div class="kpi"><b>${t(label)}</b><strong data-music-count="${key}">${number(value)}</strong><em>${t(sub)}</em></div>`;
    container.innerHTML=`
      <section id="musicCoverage" aria-label="${t('Music coverage')}">
        <h2>${t('Music')}</h2><p class="sub">${t('Discover the sounds behind your best-performing posts.')}</p>
        <div class="kpis music-kpis">
          ${kpi('Unique posts',c.totalPosts,'total','Selected accounts and dates')}
          ${kpi('Audio identified',c.detectedAudio,'detected','Posts with stored audio metadata')}
          ${kpi('Named music',c.namedTracks,'named','Posts with a song title')}
          ${kpi('Original audio',c.originals,'original','Posts using original audio')}
          ${kpi('Unknown audio',c.unknown,'unknown','Missing data does not mean silence')}
        </div>
        <div class="music-coverage-line"><span>${t('Audio coverage')}</span><strong>${c.totalPosts?number(c.detectedAudio/c.totalPosts*100):'0'}%</strong>
          <span class="music-coverage-bar" role="img" aria-label="${t('Audio coverage')}: ${c.totalPosts?number(c.detectedAudio/c.totalPosts*100):'0'}%"><i style="width:${c.totalPosts?c.detectedAudio/c.totalPosts*100:0}%"></i></span>
        </div>
        <p class="sub music-footnote">${t('Coverage includes all selected posts, including those without audio data. Collaborations count once. Stored metrics are not refreshed by opening this view.')}</p>
      </section>
      <section id="musicExplorer">
        <h2 id="musicRankingTitle">${t(categoryLabel())}</h2><p class="sub">${t('Compare exact Instagram sounds. Open a sound to see every matching post.')}</p>
        <div id="musicKinds" class="music-kind-tabs" role="tablist" aria-label="${t('Audio type')}">${categories.map(([kind,label])=>`<button type="button" id="${tabId(kind)}" data-kind="${kind}" role="tab" aria-selected="${state.kind===kind}" aria-controls="musicRankingPanel" tabindex="${state.kind===kind?'0':'-1'}">${t(label)}</button>`).join('')}</div>
        <div id="musicRankingPanel" role="tabpanel" aria-labelledby="${tabId(state.kind)}" tabindex="0">
        <div class="filters music-filters">
          <div class="f"><label for="musicSearch">${t('Search music')}</label><input id="musicSearch" type="search" maxlength="200" value="${escape(state.search)}" placeholder="${t('Song, artist, creator or audio ID')}"></div>
          <div class="f"><label for="musicSort">${t('Rank audio by')}</label><select id="musicSort">${options([['total','Total likes'],['mean','Average likes'],['median','Median likes'],['uses','Number of posts'],['relative','Relative performance'],['topPosts','Appearances in top posts']],state.sort)}</select></div>
          <div class="f"><label for="musicMinUses">${t('Minimum posts per sound')}</label><select id="musicMinUses">${options([['1','1 post'],['3','3 posts'],['5','5 posts'],['10','10 posts']],state.minUses)}</select></div>
        </div>
        <p id="musicResultCount" class="sub" aria-live="polite"></p>
        <div id="musicRankingRegion" class="music-table-scroll" tabindex="0" role="region" aria-label="${t(categoryLabel())}">
          <table id="musicRanking"><thead><tr><th>${t('Song / audio')}</th><th>${t('Posts')}</th><th>${t('Accounts')}</th><th>${t('Measured likes')}</th><th>${t('Total likes')}</th><th>${t('Average likes')}</th><th>${t('Median likes')}</th><th>${t('Relative performance')}</th><th>${t('Top posts')}</th><th>${t('Best post')}</th></tr></thead><tbody></tbody></table>
        </div>
        <button type="button" class="linkbtn music-more" id="musicMore">${t('Show more sounds')}</button>
        <div class="note">${t('Unknown likes are excluded from averages and totals. Measured likes shows the number of posts with a known count. One-post results are exploratory; increase the minimum for a stronger comparison.')}</div>
        </div>
      </section>
      <section id="musicDetail" hidden tabindex="-1"></section>
      <section id="musicPostsSection"><h2>${t('Music in the most-liked posts')}</h2><p class="sub">${t('The top 25 posts with identified audio and known likes, within the current filters.')}</p>
        <div class="music-table-scroll" tabindex="0" role="region" aria-label="${t('Music in the most-liked posts')}"><table id="musicTopPosts"><thead><tr><th>${t('Post')}</th><th>${t('Song / audio')}</th><th>${t('Likes')}</th><th>${t('Relative performance')}</th><th>${t('Date')}</th></tr></thead><tbody></tbody></table></div>
      </section>
      <section class="music-method"><h2>${t('How to read these rankings')}</h2>
        <p>${t('Relative performance compares likes with the median for the same account, format and selected period. 2× means twice that baseline. At least 5 measured posts and a positive median are required.')}</p>
        <p>${t('Top posts are the highest 10% by likes within each account and format, with at least 10 measured posts. Ties at the cutoff are included. Collaboration comparisons use the median across the selected accounts with enough data.')}</p>
        <p>${t('Sounds are grouped by Instagram audio ID. Without an ID, named songs use title and artist; original audio stays separate by post. Different versions may have different IDs.')}</p>
        <p>${t('These are associations, not proof that a song caused more likes. Post age, content and the date metrics were captured can affect the comparison. Unknown audio is excluded from song rankings.')}</p>
      </section>`;

    const postRows=list=>list.map(post=>`<tr><td>${link(post.u,source('@'+post.a+' · '+(post.sc||translate('Post'))))}</td><td class="music-name">${post.audio?source(audioLabel(post.audio)):t('Unknown audio')}</td><td>${number(post.likes)}</td><td>${ratio(post.relativePerformance)}</td><td>${escape(date(post))}</td></tr>`).join('');
    function closeDetail(){ const panel=container.querySelector('#musicDetail');panel.hidden=true;panel.innerHTML='';selectedKey=null; }
    function showDetail(key){
      const track=model.tracks.find(item=>item.key===key);if(!track)return;
      selectedKey=key;
      const panel=container.querySelector('#musicDetail');panel.hidden=false;
      panel.innerHTML=`<div class="music-detail-head"><div><h2>${title(track)}</h2><p class="sub">${track.kind!=='original'&&track.artist?source(track.artist)+' · ':''}${audioLink(track)}</p></div><button class="linkbtn" id="musicClose" type="button">${t('Close')}</button></div>
        <div class="music-table-scroll" tabindex="0" role="region" aria-label="${t('Posts using this sound')}"><table><thead><tr><th>${t('Post')}</th><th>${t('Song / audio')}</th><th>${t('Likes')}</th><th>${t('Relative performance')}</th><th>${t('Date')}</th></tr></thead><tbody></tbody></table></div><button class="linkbtn music-more" id="musicDetailMore" type="button">${t('Show more posts')}</button>`;
      let detailLimit=50;
      const sorted=[...track.posts].sort((a,b)=>(b.likes??-1)-(a.likes??-1));
      const fill=()=>{panel.querySelector('tbody').innerHTML=postRows(sorted.slice(0,detailLimit));panel.querySelector('#musicDetailMore').hidden=detailLimit>=sorted.length;};fill();
      panel.querySelector('#musicDetailMore').onclick=()=>{detailLimit+=50;fill();};
      panel.querySelector('#musicClose').onclick=()=>{closeDetail();[...container.querySelectorAll('.music-track-open')].find(button=>button.dataset.key===key)?.focus();};
      panel.focus({preventScroll:true});panel.scrollIntoView({behavior:'auto',block:'nearest'});
    }
    function results(){
      const search=state.search.trim().toLocaleLowerCase();
      shownTracks=globalThis.InsightsMusic.rankTracks(model.tracks,state.sort).filter(track=>track.kind===state.kind&&track.postCount>=Number(state.minUses)&&(!search||`${track.label} ${track.title} ${track.artist} ${track.id} ${track.accounts.join(' ')}`.toLocaleLowerCase().includes(search)));
      container.querySelector('#musicRankingTitle').textContent=translate(categoryLabel());
      container.querySelector('#musicRankingRegion').setAttribute('aria-label',translate(categoryLabel()));
      container.querySelector('#musicRankingPanel').setAttribute('aria-labelledby',tabId(state.kind));
      container.querySelectorAll('#musicKinds button').forEach(button=>{
        const selected=button.dataset.kind===state.kind;
        button.setAttribute('aria-selected',String(selected));
        button.tabIndex=selected?0:-1;
      });
      container.querySelector('#musicResultCount').innerHTML=`<span>${t(categoryLabel())} · ${t('Matching sounds')}</span>: <b data-i18n-skip>${number(shownTracks.length)}</b>`;
      container.querySelector('#musicRanking tbody').innerHTML=shownTracks.slice(0,limit).map(track=>`<tr>
        <td class="music-name"><button class="music-track-open" type="button" data-key="${escape(track.key)}">${title(track)}</button><small>${track.kind==='original'?'':source(track.artist||'')} ${audioLink(track)}</small></td>
        <td>${number(track.postCount)}</td><td>${number(track.accountCount)}</td><td>${number(track.knownLikesCount)} / ${number(track.postCount)}</td><td>${number(track.totalLikes)}</td><td>${number(track.meanLikes)}</td><td>${number(track.medianLikes)}</td><td>${ratio(track.relativePerformance)}</td><td>${number(track.topPostCount)}</td><td>${track.bestPost?link(track.bestPost.u,number(track.maxLikes)):'—'}</td>
      </tr>`).join('')||`<tr><td colspan="10" class="empty">${t('No sounds match these filters. Try a wider date range or a lower minimum.')}</td></tr>`;
      const keys=new Set(shownTracks.map(track=>track.key));
      container.querySelector('#musicTopPosts tbody').innerHTML=postRows(model.bestPosts.filter(post=>keys.has(post.audio?.key)).slice(0,25))||`<tr><td colspan="5" class="empty">${t('No posts with identified audio and known likes match these filters.')}</td></tr>`;
      container.querySelector('#musicMore').hidden=limit>=shownTracks.length;
      container.querySelectorAll('.music-track-open').forEach(button=>button.onclick=()=>showDetail(button.dataset.key));
      if(selectedKey&&!keys.has(selectedKey))closeDetail();
    }
    container.querySelectorAll('#musicKinds button').forEach(button=>button.addEventListener('click',()=>{
      if(state.kind===button.dataset.kind)return;
      state.kind=button.dataset.kind;limit=50;onChange();results();
    }));
    container.querySelector('#musicKinds').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=[...container.querySelectorAll('#musicKinds [role="tab"]')];
      const index=tabs.indexOf(event.target);if(index<0)return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();tabs[next].click();
    });
    [['musicSearch','search','input'],['musicSort','sort','change'],['musicMinUses','minUses','change']].forEach(([id,key,event])=>{
      container.querySelector('#'+id).addEventListener(event,e=>{state[key]=e.target.value;limit=50;onChange();results();});
    });
    container.querySelector('#musicMore').onclick=()=>{limit+=50;results();};
    results();
    return model;
  }
  globalThis.InsightsMusicView={mount};
})();
