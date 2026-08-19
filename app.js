const state = {
  venues: [], events: [], mode: 'see', quick: 'all', venueType: 'all', sort: 'closing', query: '', userLocation: null,
  savedOnly: false,
  saved: new Set(JSON.parse(localStorage.getItem('hangabout:saved') || '[]')),
  crawl: new Set(JSON.parse(localStorage.getItem('hangabout:crawl') || '[]')),
  map: null, markers: new Map(), markerLayer: null
};

const MELBOURNE = [-37.8136, 144.9631];
const DAY_MS = 86400000;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const normalise = (v = '') => String(v).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const parseDate = v => new Date(`${v}T00:00:00`);
const dateOnly = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const venueById = id => state.venues.find(v => v.id === id);
const formatDate = (v, options = { day: 'numeric', month: 'short' }) => parseDate(v).toLocaleDateString('en-AU', options);
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

function eventIsCurrent(event, date = new Date()) {
  const today = dateOnly(date);
  return parseDate(event.startDate) <= today && parseDate(event.endDate) >= today;
}
function eventIsToday(event, date = new Date()) { return eventIsCurrent(event, date) || event.opening?.date === isoToday(); }
function eventIsThisWeekend(event) {
  const now = dateOnly(new Date());
  const daysUntilSat = (6 - now.getDay() + 7) % 7;
  const sat = new Date(now.getTime() + daysUntilSat * DAY_MS);
  const sun = new Date(sat.getTime() + DAY_MS);
  return parseDate(event.startDate) <= sun && parseDate(event.endDate) >= sat;
}
function eventClosingSoon(event) {
  const days = Math.ceil((parseDate(event.endDate) - dateOnly(new Date())) / DAY_MS);
  return days >= 0 && days <= 7;
}
function eventOpeningSoon(event) {
  if (!event.opening) return false;
  const days = Math.ceil((parseDate(event.opening.date) - dateOnly(new Date())) / DAY_MS);
  return days >= 0 && days <= 7;
}
function venueOpenNow(venue, date = new Date()) {
  const hours = venue.hours?.[String(date.getDay())];
  if (!hours) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= hours[0] && minutes < hours[1];
}
function humanHours(venue, date = new Date()) {
  const hours = venue.hours?.[String(date.getDay())];
  if (!hours) return 'hours not listed';
  const render = mins => { const h = Math.floor(mins/60), m = mins%60, suffix = h >= 12 ? 'pm' : 'am', hour = h%12 || 12; return `${hour}${m ? `:${String(m).padStart(2,'0')}` : ''}${suffix}`; };
  return `${render(hours[0])}–${render(hours[1])}`;
}
function haversineKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b[0]-a[0]), dLng = rad(b[1]-a[1]), la1 = rad(a[0]), la2 = rad(b[0]);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function eventSearchText(event, venue) {
  return normalise([event.title, event.artists?.join(' '), event.eventType, event.tags?.join(' '), venue.name, venue.kind, venue.suburb, venue.artistFacing?.join(' ')].join(' '));
}
function filteredEvents() {
  const q = normalise(state.query.trim());
  const now = dateOnly(new Date());
  let rows = state.events.filter(event => {
    const venue = venueById(event.venueId);
    if (!venue) return false;
    if (state.savedOnly && !state.saved.has(event.id)) return false;
    if (state.venueType !== 'all' && venue.kind !== state.venueType) return false;
    if (q && !eventSearchText(event, venue).includes(q)) return false;
    switch (state.quick) {
      case 'open': return eventIsCurrent(event) && venueOpenNow(venue);
      case 'today': return eventIsToday(event);
      case 'weekend': return eventIsThisWeekend(event);
      case 'openings': return eventOpeningSoon(event);
      case 'closing': return eventClosingSoon(event);
      case 'free': return Boolean(event.free);
      case 'nearby': return !state.userLocation || haversineKm(state.userLocation, [venue.lat, venue.lng]) <= 5;
      default: return parseDate(event.endDate) >= now;
    }
  });
  rows.sort((a,b) => {
    const va = venueById(a.venueId), vb = venueById(b.venueId);
    if (state.sort === 'newest') return parseDate(b.startDate)-parseDate(a.startDate);
    if (state.sort === 'az') return a.title.localeCompare(b.title);
    if (state.sort === 'distance') {
      if (!state.userLocation) return va.suburb.localeCompare(vb.suburb);
      return haversineKm(state.userLocation,[va.lat,va.lng]) - haversineKm(state.userLocation,[vb.lat,vb.lng]);
    }
    return parseDate(a.endDate)-parseDate(b.endDate);
  });
  return rows;
}
function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch])); }
function markerIcon(active=false) {
  return L.divIcon({ className:'hangabout-marker-wrap', html:`<span style="display:block;width:${active?20:14}px;height:${active?20:14}px;border:2px solid #11110f;background:${active?'#d7ff3f':'#f4f0e8'};border-radius:50%;box-sizing:border-box"></span>`, iconSize:[active?20:14,active?20:14], iconAnchor:[active?10:7,active?10:7] });
}
function initialiseMap() {
  state.map = L.map('map',{zoomControl:true,scrollWheelZoom:false}).setView(MELBOURNE,12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
}
function renderMarkers(events) {
  state.markerLayer.clearLayers(); state.markers.clear();
  const grouped = new Map();
  events.forEach(event => grouped.set(event.venueId,[...(grouped.get(event.venueId)||[]),event]));
  grouped.forEach((items,venueId) => {
    const venue = venueById(venueId);
    const marker = L.marker([venue.lat,venue.lng],{icon:markerIcon(false),title:venue.name});
    marker.bindPopup(`<div><small>${escapeHtml(venue.suburb)} · ${escapeHtml(venue.kind)}</small><h3 style="margin:.25rem 0">${escapeHtml(venue.name)}</h3>${items.slice(0,3).map(e=>`<div><strong>${escapeHtml(e.title)}</strong></div>`).join('')}</div>`);
    marker.on('click',()=>highlightVenue(venueId)); marker.addTo(state.markerLayer); state.markers.set(venueId,marker);
  });
}
function fitVisibleMarkers() {
  const markers=[...state.markers.values()]; if(!markers.length)return;
  state.map.fitBounds(L.featureGroup(markers).getBounds().pad(.14),{maxZoom:14});
}
function highlightVenue(venueId) {
  $$('.result-card').forEach(card=>card.classList.toggle('is-selected',card.dataset.venueId===venueId));
  state.markers.forEach((marker,id)=>marker.setIcon(markerIcon(id===venueId)));
  const card=$(`.result-card[data-venue-id="${CSS.escape(venueId)}"]`); card?.scrollIntoView({behavior:'smooth',block:'center'});
}
function statusFor(event,venue) {
  const today=dateOnly(new Date());
  if(parseDate(event.startDate)>today)return{label:`opens ${formatDate(event.startDate)}`,cls:''};
  if(venueOpenNow(venue))return{label:`open now · until ${humanHours(venue).split('–')[1]}`,cls:'status-open'};
  return{label:`closed now · ${humanHours(venue)}`,cls:'status-closed'};
}
function googleDirectionsUrl(venue){return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${venue.lat},${venue.lng}`)}`;}
function appleDirectionsUrl(venue){return `https://maps.apple.com/?daddr=${encodeURIComponent(`${venue.lat},${venue.lng}`)}&dirflg=d`;}
function wazeDirectionsUrl(venue){return `https://www.waze.com/ul?ll=${encodeURIComponent(`${venue.lat},${venue.lng}`)}&navigate=yes`;}

function renderResults() {
  const events=filteredEvents();
  $('#resultCount').textContent=events.length; $('#resultNoun').textContent=events.length===1?'show':'shows'; renderMarkers(events);
  if(!events.length){$('#resultsList').innerHTML='<div class="empty-state"><h3>nothing there.</h3><p>Try widening the filters, clearing saved-only mode, or searching another suburb, artist or medium.</p></div>';return;}
  $('#resultsList').innerHTML=events.map(event=>{
    const venue=venueById(event.venueId),status=statusFor(event,venue),distance=state.userLocation?haversineKm(state.userLocation,[venue.lat,venue.lng]):null,saved=state.saved.has(event.id),inCrawl=state.crawl.has(event.id);
    return `<article class="result-card" tabindex="0" data-event-id="${event.id}" data-venue-id="${venue.id}">
      <div class="card-topline"><span class="${status.cls}"><span class="status-dot" aria-hidden="true"></span> ${escapeHtml(status.label)}</span><span>·</span><span>${formatDate(event.startDate)}–${formatDate(event.endDate)}</span>${event.opening?`<span>· opening ${formatDate(event.opening.date)} ${escapeHtml(event.opening.start)}</span>`:''}</div>
      <h2 class="card-title">${escapeHtml(event.title)}</h2><p class="card-artists">${escapeHtml(event.artists?.join(' · ')||'')}</p>
      <div class="card-venue"><div><strong>${escapeHtml(venue.name)}</strong><br><span>${escapeHtml(venue.suburb)} · ${escapeHtml(venue.kind)}</span></div>${distance!==null?`<span>${distance.toFixed(distance<10?1:0)} km</span>`:''}</div>
      <div class="card-actions"><button class="card-action js-detail" data-id="${event.id}">details</button><button class="card-action js-save ${saved?'is-saved':''}" data-id="${event.id}">${saved?'saved':'save'}</button><button class="card-action js-crawl is-crawl ${inCrawl?'is-added':''}" data-id="${event.id}">${inCrawl?'in crawl':'add to crawl'}</button><a class="card-action" href="${googleDirectionsUrl(venue)}" target="_blank" rel="noopener">navigate</a></div>
    </article>`;
  }).join('');
  wireCards();
}
function wireCards(){
  $$('.result-card').forEach(card=>{card.addEventListener('mouseenter',()=>highlightVenue(card.dataset.venueId));card.addEventListener('focus',()=>highlightVenue(card.dataset.venueId));card.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===card)showDetail(card.dataset.eventId);});});
  $$('.js-detail').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();showDetail(btn.dataset.id);}));
  $$('.js-save').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toggleSaved(btn.dataset.id);}));
  $$('.js-crawl').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toggleCrawl(btn.dataset.id);}));
}
function showDetail(eventId){
  const event=state.events.find(e=>e.id===eventId),venue=venueById(event.venueId),tags=event.tags?.map(t=>`<span>${escapeHtml(t)}</span>`).join(' · ')||'';
  $('#detailContent').innerHTML=`<div class="detail-body"><span class="eyebrow">${escapeHtml(event.eventType)} · ${escapeHtml(venue.kind)}</span><h2>${escapeHtml(event.title)}</h2><p>${escapeHtml(event.artists?.join(' · ')||'')}</p><div class="detail-meta"><div><strong>when</strong><br>${formatDate(event.startDate,{day:'numeric',month:'long'})} – ${formatDate(event.endDate,{day:'numeric',month:'long',year:'numeric'})}${event.opening?`<br>opening ${formatDate(event.opening.date,{weekday:'short',day:'numeric',month:'short'})}, ${escapeHtml(event.opening.start)}–${escapeHtml(event.opening.end)}`:''}</div><div><strong>where</strong><br>${escapeHtml(venue.name)}<br>${escapeHtml(venue.address)}</div><div><strong>today</strong><br>${venueOpenNow(venue)?'open now':'not currently open'} · ${escapeHtml(humanHours(venue))}</div><div><strong>tags</strong><br>${tags||'—'}</div></div><div class="detail-links"><a href="${venue.website}" target="_blank" rel="noopener">venue website</a><a href="${googleDirectionsUrl(venue)}" target="_blank" rel="noopener">google maps</a><a href="${appleDirectionsUrl(venue)}" target="_blank" rel="noopener">apple maps</a><a href="${wazeDirectionsUrl(venue)}" target="_blank" rel="noopener">waze</a></div><p class="source-note">Listing verified ${escapeHtml(event.lastVerified)}. Source: Art Almanac / venue data. Confirm with the venue before travelling.</p></div>`;
  $('#detailDialog').showModal();
}
function toggleSaved(id){state.saved.has(id)?state.saved.delete(id):state.saved.add(id);localStorage.setItem('hangabout:saved',JSON.stringify([...state.saved]));$('#savedCount').textContent=state.saved.size;renderResults();}
function toggleCrawl(id){state.crawl.has(id)?state.crawl.delete(id):state.crawl.add(id);localStorage.setItem('hangabout:crawl',JSON.stringify([...state.crawl]));renderCrawl();renderResults();}
function crawlOrderedEvents(){
  const selected=[...state.crawl].map(id=>state.events.find(e=>e.id===id)).filter(Boolean);if(selected.length<2)return selected;
  const remaining=[...selected],result=[];let current=state.userLocation||MELBOURNE;
  while(remaining.length){remaining.sort((a,b)=>{const va=venueById(a.venueId),vb=venueById(b.venueId);return haversineKm(current,[va.lat,va.lng])-haversineKm(current,[vb.lat,vb.lng]);});const next=remaining.shift();result.push(next);const v=venueById(next.venueId);current=[v.lat,v.lng];}
  return result;
}
function renderCrawl(){
  const ordered=crawlOrderedEvents(),tray=$('#crawlTray');tray.hidden=ordered.length===0;$('#crawlCount').textContent=`${ordered.length} ${ordered.length===1?'stop':'stops'}`;if(!ordered.length)return;
  const venues=ordered.map(e=>venueById(e.venueId)),destination=venues.at(-1),waypoints=venues.slice(0,-1).map(v=>`${v.lat},${v.lng}`).join('|');
  const params=new URLSearchParams({api:'1',destination:`${destination.lat},${destination.lng}`,travelmode:'driving'});if(state.userLocation)params.set('origin',`${state.userLocation[0]},${state.userLocation[1]}`);if(waypoints)params.set('waypoints',waypoints);$('#googleRouteLink').href=`https://www.google.com/maps/dir/?${params.toString()}`;
}
function renderVenueDirectory(){
  const order=['artist-run / specialist','independent / non-profit','public / contemporary art organisation','public / municipal gallery','university / art-school gallery','commercial gallery'];
  const venues=[...state.venues].sort((a,b)=>(order.indexOf(a.kind)-order.indexOf(b.kind))||a.name.localeCompare(b.name));
  $('#venueDirectory').innerHTML=venues.map(v=>`<article class="venue-card"><h3>${escapeHtml(v.name)}</h3><p>${escapeHtml(v.suburb)} · ${escapeHtml(v.address)}</p><p>${escapeHtml(v.artistFacing?.join(' · ')||'artist-facing information to research')}</p><div class="venue-kind">${escapeHtml(v.kind)}</div><a href="${v.website}" target="_blank" rel="noopener">visit website ↗</a></article>`).join('');
}
function renderMode(){
  const see=state.mode==='see';$('.controls').hidden=!see;$('.explorer').hidden=!see;$('#makePanel').hidden=see;
  $$('.mode-button').forEach(btn=>{const active=btn.dataset.mode===state.mode;btn.classList.toggle('is-active',active);btn.setAttribute('aria-pressed',String(active));});if(!see)renderVenueDirectory();setTimeout(()=>state.map?.invalidateSize(),0);
}
function renderAll(){renderMode();if(state.mode==='see')renderResults();renderCrawl();$('#savedCount').textContent=state.saved.size;}
function updateQuickFilter(value){state.quick=value;$$('#quickFilters .chip').forEach(chip=>{const active=chip.dataset.quick===value;chip.classList.toggle('is-active',active);chip.setAttribute('aria-pressed',String(active));});renderResults();}
function requestLocation(setNearby=false){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{state.userLocation=[pos.coords.latitude,pos.coords.longitude];state.map.setView(state.userLocation,13);L.circleMarker(state.userLocation,{radius:7,weight:2,color:'#11110f',fillColor:'#d7ff3f',fillOpacity:1}).addTo(state.map).bindTooltip('you are here');state.sort='distance';$('#sortSelect').value='distance';if(setNearby)updateQuickFilter('nearby');else renderResults();},()=>{$('#nearMeButton').textContent='location unavailable';},{enableHighAccuracy:false,timeout:8000,maximumAge:300000});
}
function populateVenueTypes(){const kinds=[...new Set(state.venues.map(v=>v.kind))].sort();$('#venueTypeSelect').insertAdjacentHTML('beforeend',kinds.map(k=>`<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join(''));}
function wireUI(){
  $$('.mode-button').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;renderAll();}));
  $('#searchInput').addEventListener('input',e=>{state.query=e.target.value;renderResults();});
  $$('#quickFilters .chip').forEach(chip=>chip.addEventListener('click',()=>chip.dataset.quick==='nearby'&&!state.userLocation?requestLocation(true):updateQuickFilter(chip.dataset.quick)));
  $('#venueTypeSelect').addEventListener('change',e=>{state.venueType=e.target.value;renderResults();});
  $('#sortSelect').addEventListener('change',e=>{state.sort=e.target.value;if(state.sort==='distance'&&!state.userLocation)requestLocation(false);else renderResults();});
  $('#savedOnlyButton').addEventListener('click',()=>{state.savedOnly=!state.savedOnly;$('#savedOnlyButton').setAttribute('aria-pressed',String(state.savedOnly));renderResults();});
  $('#fitMapButton').addEventListener('click',fitVisibleMarkers);$('#locateButton').addEventListener('click',()=>requestLocation(false));
  $('#toggleMapButton').addEventListener('click',()=>{const explorer=$('.explorer'),hidden=explorer.classList.toggle('map-hidden');$('#toggleMapButton').setAttribute('aria-pressed',String(hidden));$('#toggleMapButton').textContent=hidden?'show map':'hide map';});
  $('#clearCrawlButton').addEventListener('click',()=>{state.crawl.clear();localStorage.removeItem('hangabout:crawl');renderAll();});
  $('#closeDialogButton').addEventListener('click',()=>$('#detailDialog').close());$('#detailDialog').addEventListener('click',e=>{if(e.target===$('#detailDialog'))$('#detailDialog').close();});
}
async function boot(){
  const [venuesRes,eventsRes]=await Promise.all([fetch('./data/venues.json'),fetch('./data/events.json')]);if(!venuesRes.ok||!eventsRes.ok)throw new Error('Could not load hangabout data');[state.venues,state.events]=await Promise.all([venuesRes.json(),eventsRes.json()]);
  const now=new Date();$('#dateLabel').textContent=now.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}).toLowerCase();const verified=state.events.map(e=>e.lastVerified).sort().at(-1);$('#dataStamp').textContent=`prototype listings · last verified ${verified}`;
  initialiseMap();populateVenueTypes();wireUI();renderAll();requestAnimationFrame(fitVisibleMarkers);
}
boot().catch(error=>{console.error(error);$('#resultsList').innerHTML='<div class="empty-state"><h3>the listings didn\'t load.</h3><p>Please refresh the page. If this persists, the data files may be temporarily unavailable.</p></div>';});
