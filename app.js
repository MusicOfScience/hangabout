'use strict';

const MELBOURNE = [-37.8136, 144.9631];
const MELBOURNE_TZ = 'Australia/Melbourne';
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DAY_MS = 86400000;
const FIRESTATION_FALLBACK = 'https://www.stonnington.vic.gov.au/Community/Find-a-community-group/Firestation-Print-Studio';
const ART_ALMANAC_MELBOURNE = 'https://www.art-almanac.com.au/whats-on/melbourne/';
const KIND_LABELS = {
  'artist-run': 'artist-run initiative',
  commercial: 'commercial gallery',
  'contemporary-org': 'contemporary art organisation',
  'first-nations-led': 'First Nations-led',
  independent: 'independent / non-profit',
  municipal: 'public / municipal gallery',
  specialist: 'specialist space',
  university: 'university / art-school gallery',
};
const KIND_ORDER = ['first-nations-led','artist-run','independent','specialist','contemporary-org','university','municipal','commercial'];
const RESOURCE_LABELS = { studio:'studio space', workspace:'shared workspace', finder:'live finder' };
const WEEKDAY_NUMBER = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm = (v='') => String(v).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');

function readSet(key){
  try {
    const raw = window.localStorage ? window.localStorage.getItem(key) : null;
    const value = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(value) ? value.filter(x => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function writeSet(key,set){ try { if (window.localStorage) window.localStorage.setItem(key, JSON.stringify([...set])); } catch {} }
function safeUrl(value){ try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.href : '#'; } catch { return '#'; } }
function stableVenueUrl(v){ return v?.id==='firestation-print-studio' ? FIRESTATION_FALLBACK : safeUrl(v?.website); }
function stablePathwayUrl(v,pathway){ return v?.id==='firestation-print-studio' ? FIRESTATION_FALLBACK : safeUrl(pathway?.url); }

function isoUtc(s){ return new Date(`${s}T00:00:00Z`); }
function dateAdd(s,days){ return new Date(isoUtc(s).getTime()+days*DAY_MS).toISOString().slice(0,10); }
function dateDiff(a,b){ return Math.round((isoUtc(b)-isoUtc(a))/DAY_MS); }
function clockMinutes(s){ const [h,m] = s.split(':').map(Number); return h*60+m; }
function weekendDates(today,weekday){ const toSat = weekday===0 ? -1 : (6-weekday+7)%7; const sat=dateAdd(today,toSat); return [sat,dateAdd(sat,1)]; }
function openingWithinDays(opening,clock,horizon=7){
  if(!opening) return false;
  const d=dateDiff(clock.date,opening.date);
  if(d<0||d>horizon) return false;
  return !(d===0 && clockMinutes(opening.end)<=clock.minutes);
}
function melbourneClock(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-AU',{timeZone:MELBOURNE_TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,weekday:WEEKDAY_NUMBER[parts.weekday],minutes:Number(parts.hour)*60+Number(parts.minute)};
}
function formatDate(s,opts={day:'numeric',month:'short'}){ return new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',...opts}).format(isoUtc(s)); }
function formatMinutes(m){ const h=Math.floor(m/60), min=m%60, suffix=h>=12?'pm':'am'; return `${h%12||12}${min?`:${String(min).padStart(2,'0')}`:''}${suffix}`; }

const state={venues:[],events:[],resources:[],mode:'see',quick:'all',venueType:'all',sort:'closing',query:'',userLocation:null,savedOnly:false,saved:readSet('hangabout:saved'),crawl:readSet('hangabout:crawl'),map:null,mapAvailable:false,markers:new Map(),markerLayer:null,locationLayer:null,makeQuery:'',makeKind:'all'};
const venueById=id=>state.venues.find(v=>v.id===id);
const verifiedHours=(v,weekday)=>v?.hoursVerified ? (v.hours?.[String(weekday)]||null) : null;
const eventCurrent=(e,today)=>e.startDate<=today&&e.endDate>=today;
const venueOpenNow=(v,c)=>{const h=verifiedHours(v,c.weekday); return !!(h&&c.minutes>=h[0]&&c.minutes<h[1]);};
const venueOpenToday=(v,c)=>!!verifiedHours(v,c.weekday);

function statusFor(e,v){
  const c=melbourneClock();
  if(e.opening?.date===c.date && clockMinutes(e.opening.end)>c.minutes) return {label:`opening today · ${e.opening.start}–${e.opening.end}`,cls:'status-open'};
  if(e.startDate>c.date) return {label:`opens ${formatDate(e.startDate)}`,cls:'status-unknown'};
  if(!v.hoursVerified) return {label:'hours unverified',cls:'status-unknown'};
  const h=verifiedHours(v,c.weekday);
  if(!h) return {label:'closed today',cls:'status-closed'};
  if(c.minutes<h[0]) return {label:`opens today · ${formatMinutes(h[0])}`,cls:'status-unknown'};
  if(c.minutes>=h[1]) return {label:`closed now · ${formatMinutes(h[0])}–${formatMinutes(h[1])}`,cls:'status-closed'};
  return {label:`open now · until ${formatMinutes(h[1])}`,cls:'status-open'};
}
function weekendAvailable(e){
  const c=melbourneClock(), [sat,sun]=weekendDates(c.date,c.weekday), v=venueById(e.venueId);
  if(!v) return false;
  if(e.opening?.date===sat||e.opening?.date===sun) return true;
  if(!(e.startDate<=sun&&e.endDate>=sat)) return false;
  return !!(verifiedHours(v,6)||verifiedHours(v,0));
}
function haversine(a,b){ const R=6371,rad=x=>x*Math.PI/180,dLat=rad(b[0]-a[0]),dLng=rad(b[1]-a[1]),l1=rad(a[0]),l2=rad(b[0]); const h=Math.sin(dLat/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function searchText(e,v){ return norm([e.title,e.artists?.join(' '),e.eventType,e.tags?.join(' '),v.name,KIND_LABELS[v.kind],v.suburb,v.focus?.join(' ')].join(' ')); }

function filteredEvents(){
  const c=melbourneClock(), q=norm(state.query.trim());
  const rows=state.events.filter(e=>{
    const v=venueById(e.venueId); if(!v||e.endDate<c.date) return false;
    if(state.savedOnly&&!state.saved.has(e.id)) return false;
    if(state.venueType!=='all'&&v.kind!==state.venueType) return false;
    if(q&&!searchText(e,v).includes(q)) return false;
    if(state.quick==='open') return eventCurrent(e,c.date)&&venueOpenNow(v,c);
    if(state.quick==='today') return e.opening?.date===c.date||(eventCurrent(e,c.date)&&venueOpenToday(v,c));
    if(state.quick==='weekend') return weekendAvailable(e);
    if(state.quick==='openings') return openingWithinDays(e.opening,c,7);
    if(state.quick==='closing'){const d=dateDiff(c.date,e.endDate); return d>=0&&d<=7;}
    if(state.quick==='free') return e.admission==='free';
    if(state.quick==='nearby') return !!(state.userLocation&&v.lat!=null&&v.lng!=null&&haversine(state.userLocation,[v.lat,v.lng])<=5);
    return true;
  });
  rows.sort((a,b)=>{
    const va=venueById(a.venueId), vb=venueById(b.venueId);
    if(state.sort==='newest') return b.startDate.localeCompare(a.startDate);
    if(state.sort==='az') return a.title.localeCompare(b.title);
    if(state.sort==='distance'&&state.userLocation){
      const da=va.lat==null?Infinity:haversine(state.userLocation,[va.lat,va.lng]), db=vb.lat==null?Infinity:haversine(state.userLocation,[vb.lat,vb.lng]); return da-db;
    }
    return a.endDate.localeCompare(b.endDate)||a.title.localeCompare(b.title);
  });
  return rows;
}

function initMap(){
  const fallback=()=>{state.mapAvailable=false; $('#map').hidden=true; $('#mapFallback').hidden=false; $('.map-panel').classList.add('is-unavailable');};
  if(!window.L){fallback();return;}
  try{
    state.mapAvailable=true; state.map=L.map('map',{zoomControl:true,scrollWheelZoom:false}).setView(MELBOURNE,12);
    L.tileLayer(OSM_TILE_URL,{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
    state.markerLayer=L.layerGroup().addTo(state.map);
  }catch{fallback();}
}
function markerIcon(active=false){ return L.divIcon({className:'hangabout-marker-wrap',html:`<span class="hangabout-marker${active?' is-active':''}"></span>`,iconSize:[active?20:14,active?20:14],iconAnchor:[active?10:7,active?10:7]}); }
function renderMarkers(events){
  if(!state.mapAvailable)return; state.markerLayer.clearLayers(); state.markers.clear();
  const grouped=new Map(); for(const e of events){const v=venueById(e.venueId); if(v?.lat==null||v?.lng==null)continue; if(!grouped.has(v.id))grouped.set(v.id,[]); grouped.get(v.id).push(e);}
  for(const [id,items] of grouped){const v=venueById(id),m=L.marker([v.lat,v.lng],{icon:markerIcon(),title:v.name}).addTo(state.markerLayer); m.bindPopup(`<strong>${esc(v.name)}</strong><br>${items.slice(0,3).map(x=>esc(x.title)).join('<br>')}`); state.markers.set(id,m);}
}
function fitMap(){ if(state.mapAvailable&&state.markers.size){state.map.fitBounds(L.featureGroup([...state.markers.values()]).getBounds().pad(.12),{maxZoom:14});} }

function navLinks(v){return {google:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(v.address)}`,apple:`https://maps.apple.com/?daddr=${encodeURIComponent(v.address)}`,waze:`https://www.waze.com/ul?q=${encodeURIComponent(v.address)}&navigate=yes`};}
function renderResults(){
  const rows=filteredEvents(), mapped=new Set(rows.map(e=>venueById(e.venueId)).filter(v=>v?.lat!=null&&v?.lng!=null).map(v=>v.id));
  $('#resultCount').textContent=rows.length; $('#resultNoun').textContent=rows.length===1?'show':'shows'; $('#mappedSummary').textContent=rows.length?`· ${mapped.size} mapped venues`:''; renderMarkers(rows);
  if(!rows.length){$('#resultsList').innerHTML='<div class="empty-state"><h3>nothing there.</h3><p>Try widening the filters.</p></div>'; return;}
  $('#resultsList').innerHTML=rows.map(e=>{const v=venueById(e.venueId),s=statusFor(e,v),n=navLinks(v),saved=state.saved.has(e.id),crawl=state.crawl.has(e.id),dist=state.userLocation&&v.lat!=null?haversine(state.userLocation,[v.lat,v.lng]):null; return `<article class="result-card" data-id="${esc(e.id)}"><div class="card-topline"><span class="${s.cls}"><span class="status-dot"></span> ${esc(s.label)}</span><span>·</span><span>${formatDate(e.startDate)}–${formatDate(e.endDate)}</span><span>· ${esc(e.sourceType==='official'?'official source':'directory source')}</span></div><h2 class="card-title">${esc(e.title)}</h2><p class="card-artists">${esc(e.artists?.join(' · ')||'')}</p><div class="card-venue"><div><strong>${esc(v.name)}</strong><br><span>${esc(v.suburb)} · ${esc(KIND_LABELS[v.kind]||v.kind)}</span></div>${dist!=null?`<span>${dist.toFixed(dist<10?1:0)} km</span>`:''}</div><div class="card-actions"><button class="card-action js-detail" data-id="${esc(e.id)}">details</button><button class="card-action js-save ${saved?'is-saved':''}" data-id="${esc(e.id)}">${saved?'saved':'save'}</button><button class="card-action js-crawl is-crawl ${crawl?'is-added':''}" data-id="${esc(e.id)}">${crawl?'in crawl':'add to crawl'}</button><a class="card-action" href="${n.google}" target="_blank" rel="noopener">navigate</a></div></article>`;}).join('');
  $$('.js-detail').forEach(b=>b.onclick=()=>showDetail(b.dataset.id)); $$('.js-save').forEach(b=>b.onclick=()=>toggleSaved(b.dataset.id)); $$('.js-crawl').forEach(b=>b.onclick=()=>toggleCrawl(b.dataset.id));
}
function showDetail(id){
  const e=state.events.find(x=>x.id===id),v=e&&venueById(e.venueId); if(!e||!v)return;
  const n=navLinks(v), firestation=e.id==='ruth-stanton-undercurrents', source=firestation?ART_ALMANAC_MELBOURNE:safeUrl(e.sourceUrl), web=stableVenueUrl(v), sourceLabel=firestation?'Art Almanac fallback · Firestation source currently unavailable':`${e.sourceName||e.sourceType} · checked ${e.lastVerified}`;
  $('#detailContent').innerHTML=`<div class="detail-body"><span class="eyebrow">${esc(e.eventType)} · ${esc(KIND_LABELS[v.kind]||v.kind)}</span><h2 id="detailTitle">${esc(e.title)}</h2><p>${esc(e.artists?.join(' · ')||'')}</p><div class="detail-meta"><div><strong>when</strong><br>${formatDate(e.startDate,{day:'numeric',month:'long'})} – ${formatDate(e.endDate,{day:'numeric',month:'long',year:'numeric'})}${e.opening?`<br>opening ${formatDate(e.opening.date)}, ${esc(e.opening.start)}–${esc(e.opening.end)}`:''}</div><div><strong>where</strong><br>${esc(v.name)}<br>${esc(v.address)}</div><div><strong>source</strong><br>${esc(sourceLabel)}</div></div><div class="detail-links"><a href="${source}" target="_blank" rel="noopener">listing source</a><a href="${web}" target="_blank" rel="noopener">venue information</a><a href="${n.google}" target="_blank" rel="noopener">google maps</a><a href="${n.apple}" target="_blank" rel="noopener">apple maps</a><a href="${n.waze}" target="_blank" rel="noopener">waze</a></div></div>`;
  $('#detailDialog').showModal();
}
function toggleSaved(id){state.saved.has(id)?state.saved.delete(id):state.saved.add(id);writeSet('hangabout:saved',state.saved);$('#savedCount').textContent=state.saved.size;renderResults();}
function toggleCrawl(id){const e=state.events.find(x=>x.id===id),v=e&&venueById(e.venueId); if(!v)return; for(const existing of [...state.crawl]){const ee=state.events.find(x=>x.id===existing); if(ee?.venueId===v.id)state.crawl.delete(existing);} if(!state.crawl.has(id))state.crawl.add(id);writeSet('hangabout:crawl',state.crawl);renderCrawl();renderResults();}
function crawlEvents(){return [...state.crawl].map(id=>state.events.find(e=>e.id===id)).filter(Boolean);}
function renderCrawl(){
  const events=crawlEvents(),tray=$('#crawlTray'); tray.hidden=!events.length; $('#crawlCount').textContent=`${events.length} ${events.length===1?'stop':'stops'}`; if(!events.length)return;
  const venues=events.map(e=>venueById(e.venueId)).filter(Boolean), destination=venues.at(-1), waypoints=venues.slice(0,-1).map(v=>v.address).join('|'), mode=$('#routeModeSelect')?.value||'walking';
  const p=new URLSearchParams({api:'1',destination:destination.address,travelmode:mode}); if(state.userLocation)p.set('origin',state.userLocation.join(',')); if(waypoints)p.set('waypoints',waypoints); $('#googleRouteLink').href=`https://www.google.com/maps/dir/?${p}`;
}
function venueMakeCard(v){
  const pathways=v.artistPathways||[];
  return `<article class="venue-card"><div class="venue-kind">${esc(KIND_LABELS[v.kind]||v.kind)}</div><h3>${esc(v.name)}</h3><p>${esc(v.suburb)} · ${esc(v.address)}</p><div class="venue-focus">${(v.focus||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div><div class="venue-pathways"><strong>${pathways.length?'verified artist pathways':'artist pathway not yet verified'}</strong>${pathways.map(x=>`<a href="${stablePathwayUrl(v,x)}" target="_blank" rel="noopener">${esc(x.label)} ↗</a>`).join('')}<a href="${stableVenueUrl(v)}" target="_blank" rel="noopener">visit / source ↗</a></div></article>`;
}
function resourceMakeCard(r){
  return `<article class="venue-card resource-card"><div class="venue-kind">${esc(RESOURCE_LABELS[r.resourceType]||r.resourceType)} · ${esc(r.sourceType)} source</div><h3>${esc(r.name)}</h3><p>${esc(r.suburb)} · ${esc(r.address)}</p><p>${esc(r.summary)}</p>${r.price||r.size?`<p><strong>${esc(r.price||'')}</strong>${r.price&&r.size?' · ':''}${esc(r.size||'')}</p>`:''}<div class="venue-focus"><span>${esc(r.availability)}</span>${(r.tags||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div><div class="venue-pathways"><strong>checked ${esc(r.lastVerified)}</strong><a href="${safeUrl(r.website)}" target="_blank" rel="noopener">open ${esc(r.sourceName)} ↗</a></div></article>`;
}
function renderMake(){
  const q=norm(state.makeQuery.trim()), mode=state.makeKind;
  let venues=state.venues.filter(v=>!q||norm([v.name,v.suburb,v.focus?.join(' '),v.artistPathways?.map(x=>x.label).join(' ')].join(' ')).includes(q));
  let resources=state.resources.filter(r=>!q||norm([r.name,r.suburb,r.summary,r.tags?.join(' '),r.availability,r.price,r.size].join(' ')).includes(q));
  if(mode==='resource:studio'){ resources=resources.filter(r=>r.resourceType==='studio'); venues=[]; }
  else if(mode==='resource:workspace'){ resources=resources.filter(r=>r.resourceType==='workspace'); venues=[]; }
  else if(mode==='pathways'){ resources=[]; venues=venues.filter(v=>v.artistPathways?.length); }
  else if(mode==='places'){ resources=[]; }
  venues.sort((a,b)=>(KIND_ORDER.indexOf(a.kind)-KIND_ORDER.indexOf(b.kind))||a.name.localeCompare(b.name));
  resources.sort((a,b)=>a.resourceType.localeCompare(b.resourceType)||a.name.localeCompare(b.name));
  const total=venues.length+resources.length;
  $('#makeCount').textContent=`${total} ${total===1?'resource':'resources'}`;
  $('#venueDirectory').innerHTML=[...resources.map(resourceMakeCard),...venues.map(venueMakeCard)].join('') || '<div class="empty-state"><h3>nothing there.</h3><p>Try a wider search or another make-art filter.</p></div>';
}
function renderMode(){
  const see=state.mode==='see';
  $('.controls').hidden=!see; $('.explorer').hidden=!see; $('#makePanel').hidden=see;
  $$('.mode-button').forEach(b=>{const on=b.dataset.mode===state.mode;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});
  if(!see) renderMake();
  setTimeout(()=>state.map?.invalidateSize(),0);
}
function populateKinds(select){for(const k of [...new Set(state.events.map(e=>venueById(e.venueId)?.kind).filter(Boolean))].sort((a,b)=>KIND_ORDER.indexOf(a)-KIND_ORDER.indexOf(b))){const o=document.createElement('option');o.value=k;o.textContent=KIND_LABELS[k]||k;select.append(o);}}
function setQuick(value){state.quick=value;$$('#quickFilters .chip').forEach(b=>{const on=b.dataset.quick===value;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});renderResults();}
function locate({nearby=false,sort=false}={}){ if(!navigator.geolocation){$('#explorerStatus').textContent='Location is not available in this browser.';return;} $('#explorerStatus').textContent='Finding your location…'; navigator.geolocation.getCurrentPosition(pos=>{state.userLocation=[pos.coords.latitude,pos.coords.longitude];$('#explorerStatus').textContent='Location found.'; if(state.mapAvailable){if(state.locationLayer)state.locationLayer.remove();state.locationLayer=L.circleMarker(state.userLocation,{radius:7,weight:2}).addTo(state.map).bindTooltip('you are here');state.map.setView(state.userLocation,13);} if(sort){state.sort='distance';$('#sortSelect').value='distance';} if(nearby)setQuick('nearby'); else renderResults();renderCrawl();},()=>{$('#explorerStatus').textContent='Location permission was not available.';}); }
function wire(){
  $$('.mode-button').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;renderMode();});
  $('#searchInput').oninput=e=>{state.query=e.target.value;renderResults();};
  $$('#quickFilters .chip').forEach(b=>b.onclick=()=>b.dataset.quick==='nearby'&&!state.userLocation?locate({nearby:true}):setQuick(b.dataset.quick));
  $('#venueTypeSelect').onchange=e=>{state.venueType=e.target.value;renderResults();};
  $('#sortSelect').onchange=e=>{if(e.target.value==='distance'&&!state.userLocation){locate({sort:true});return;}state.sort=e.target.value;renderResults();};
  $('#savedOnlyButton').onclick=()=>{state.savedOnly=!state.savedOnly;$('#savedOnlyButton').setAttribute('aria-pressed',String(state.savedOnly));renderResults();};
  $('#fitMapButton').onclick=fitMap; $('#locateButton').onclick=()=>locate();
  $('#toggleMapButton').onclick=()=>{const hidden=$('.explorer').classList.toggle('map-hidden');$('#toggleMapButton').textContent=hidden?'show map':'hide map';$('#toggleMapButton').setAttribute('aria-expanded',String(!hidden));if(!hidden)state.map?.invalidateSize();};
  $('#clearCrawlButton').onclick=()=>{state.crawl.clear();writeSet('hangabout:crawl',state.crawl);renderCrawl();renderResults();};
  $('#routeModeSelect').onchange=renderCrawl; $('#closeDialogButton').onclick=()=>$('#detailDialog').close();
  $('#makeSearchInput').oninput=e=>{state.makeQuery=e.target.value;renderMake();};
  $('#makeKindSelect').onchange=e=>{state.makeKind=e.target.value;renderMake();};
}
function fatal(err){console.error(err); const msg='hangabout could not start. Please reload; if this persists, send us this screen.'; if($('#explorerStatus'))$('#explorerStatus').textContent=msg; if($('#resultsList'))$('#resultsList').innerHTML=`<div class="empty-state"><h3>the listings didn’t load.</h3><p>${esc(err?.message||msg)}</p></div>`; if($('#mapFallback')){$('#map').hidden=true;$('#mapFallback').hidden=false;} }
async function boot(){
  $('#dateLabel').textContent=new Intl.DateTimeFormat('en-AU',{timeZone:MELBOURNE_TZ,weekday:'short',day:'numeric',month:'short'}).format(new Date()).toLowerCase();
  const [vr,er,rr]=await Promise.all([
    fetch('./data/venues.json?v=4',{cache:'no-store'}),
    fetch('./data/events.json?v=4',{cache:'no-store'}),
    fetch('./data/make-resources.json?v=4',{cache:'no-store'})
  ]);
  if(!vr.ok||!er.ok||!rr.ok) throw new Error(`data request failed (${vr.status}/${er.status}/${rr.status})`);
  [state.venues,state.events,state.resources]=await Promise.all([vr.json(),er.json(),rr.json()]);
  populateKinds($('#venueTypeSelect')); wire(); initMap(); $('#savedCount').textContent=state.saved.size;
  const latest=[...state.venues,...state.events,...state.resources].map(x=>x.lastVerified).filter(Boolean).sort().at(-1);
  $('#dataStamp').textContent=`${state.events.length} listings · ${state.venues.length} art spaces · ${state.resources.length} make-art resources · last checked ${latest}`;
  renderMode(); renderResults(); renderCrawl(); requestAnimationFrame(fitMap); document.documentElement.dataset.hangaboutReady='true';
}

boot().catch(fatal);