// map.js

const MapModule = {
  map: null,
  _geojson: null,
  _index: {},
  _onSelect: null,
  _colorMode: 'cv',   // 'cv' = CulturalValue, 'cs' = ConstructionStatus

  setData(geojson, index, onSelect) {
    this._geojson  = geojson;
    this._index    = index;
    this._onSelect = onSelect;
  },

  mount() {
    const container = document.getElementById('map');
    if (!container) return;
    if (this.map) { try { this.map.remove(); } catch (_) {} this.map = null; }

  this.map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        glyphs: 'https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf',
        sources: {
          carto: {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
            tileSize: 256, maxzoom: 19, attribution: '© CARTO © OpenStreetMap'
          },
          satellite: {
            type: 'raster',
            tiles: ['https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                    'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
            tileSize: 256, maxzoom: 19, attribution: '© Google'
          }
        },
        layers: [
          { id: 'carto-layer',     type: 'raster', source: 'carto' },
          { id: 'satellite-layer', type: 'raster', source: 'satellite',
            layout: { visibility: 'none' } }
        ]
      },
      center: this._center(),
      zoom: 15, maxZoom: 19,
      attributionControl: false,
    });
    this.map.on('load', () => this._onLoad());
    this.map.on('error', (e) => console.warn('[map]', e.error && e.error.message));
  },

  async _onLoad() {
    const m = this.map;

    // 0. ALTTA — Ortofoto (PMTiles raster)
    // Ortofoto — XYZ tile klasörü (gdal2tiles TMS Y-flip)
    m.addSource('ortofoto', {
      type: 'raster',
      tiles: [location.origin + location.pathname.replace(/\/[^/]*$/, '') + '/data/ortofoto/tiles/{z}/{x}/{y}.png'],
      tileSize: 256,
      scheme: 'tms',
      minzoom: 17, maxzoom: 19,
      attribution: '© Ayvalık Ortofoto 1971'
    });
    m.addLayer({
      id: 'ortofoto-layer',
      type: 'raster',
      source: 'ortofoto',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.9 }
    });

    // 1. ALTTA — Halihazır harita (polyline)
    // Halihazır + ek birleştir
    const [hh1, hh2] = await Promise.all([
      fetch('./data/halihazir.geojson').then(r => r.json()).catch(() => ({ type:'FeatureCollection', features:[] })),
      fetch('./data/halihazir_ek.geojson').then(r => r.json()).catch(() => ({ type:'FeatureCollection', features:[] }))
    ]);
    const hhMerged = { type:'FeatureCollection', features:[...hh1.features, ...hh2.features] };
    m.addSource('halihazir', { type:'geojson', data: hhMerged });

    // Yapı adası polygons + label
    m.addSource('yapiadasi', { type:'geojson', data:'./data/yapiadasi.geojson' });
    m.addLayer({ id:'yapiadasi-fill', type:'fill', source:'yapiadasi',
      layout:{ visibility:'visible' },
      paint:{ 'fill-color':'#e63946', 'fill-opacity':0.05 }
    });
    m.addLayer({ id:'yapiadasi-line', type:'line', source:'yapiadasi',
      layout:{ visibility:'visible' },
      paint:{ 'line-color':'#e63946', 'line-width':1.5, 'line-opacity':0.9 }
    });
    m.addLayer({ id:'halihazir-line', type:'line', source:'halihazir',
      layout:{ 'visibility':'none' },
      paint:{ 'line-color':'#c0392b', 'line-width':0.8, 'line-opacity':0.7 }
    });

    // 2. ORTADA — Yapı poligonları
    m.addSource('all-yapi', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    m.addLayer({ id:'all-fill', type:'fill', source:'all-yapi', paint:{
      'fill-color': this._colorExpr('cv'),
      'fill-opacity': ['case', ['==',['get','_h'],1], 0.04, 0.45]
    }});
    m.addLayer({ id:'all-line', type:'line', source:'all-yapi', paint:{
      'line-color':'#3a3028',
      'line-width': ['case',['==',['get','_h'],1], 0.2, 0.8],
      'line-opacity':['case',['==',['get','_h'],1], 0.15, 1]
    }});
    m.addLayer({ id:'all-label', type:'symbol', source:'all-yapi',
      minzoom: 16,
      layout:{
        'visibility': 'visible',
        'text-field': ['concat', ['get','AdaNO'], '/', ['get','ParselNO']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 9,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint:{
        'text-color': '#1a1612',
        'text-halo-color': 'rgba(255,255,255,0.8)',
        'text-halo-width': 1,
      }
    });

    m.addSource('sel-yapi', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    m.addLayer({ id:'sel-fill', type:'fill', source:'sel-yapi',
      paint:{ 'fill-color':'#8b2e26', 'fill-opacity':0.65 }});
    m.addLayer({ id:'sel-line', type:'line', source:'sel-yapi',
      paint:{ 'line-color':'#1a1612', 'line-width':2.5 }});

    m.addSource('hov-yapi', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    m.addLayer({ id:'hov-fill', type:'fill', source:'hov-yapi',
      paint:{ 'fill-color':'#c08a2e', 'fill-opacity':0.45 }});

    requestAnimationFrame(() => this._loadAllFeatures());

    // 3. ÜSTTE — Yapı No noktaları + label
    m.addSource('yapino', { type:'geojson', data:'./data/yapino.geojson' });
    m.addLayer({ id:'yapino-point', type:'circle', source:'yapino',
      layout:{ 'visibility':'none' },
      paint:{
        'circle-radius': 3,
        'circle-color': '#c0392b',
        'circle-opacity': 0.8,
        'circle-stroke-width': 0,
      }
    });
    m.addLayer({ id:'yapino-label', type:'symbol', source:'yapino',
      minzoom: 17,
      layout:{
        'visibility': 'none',
        'text-field': ['get', 'Yapı No_Text'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint:{
        'text-color': '#c0392b',
        'text-opacity': 0.75,
        'text-halo-color': 'rgba(255,255,255,0.85)',
        'text-halo-width': 1.5,
      }
    });

    // Yapı adası label — en üstte
    m.addLayer({ id:'yapiadasi-label', type:'symbol', source:'yapiadasi',
      minzoom: 0,
      layout:{
        visibility:'visible',
        'text-field': ['get','label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'],
          10, 8,
          13, 10,
          15, 12,
          17, 14
        ],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint:{
        'text-color': '#c1121f',
        'text-halo-color': 'rgba(255,255,255,1)',
        'text-halo-width': 3,
      }
    });
    if (App.state.selectedId) { this._applySelection(App.state.selectedId); this._flyTo(App.state.selectedId); }

    m.on('click', 'all-fill', (e) => {
      if (!e.features.length) return;
      const id = String(e.features[0].properties[CONFIG.idField]);
      if (this._onSelect) this._onSelect(id);
    });
    m.on('mousemove', 'all-fill', (e) => {
      m.getCanvas().style.cursor = 'pointer';
      if (!e.features.length) return;
      const id = String(e.features[0].properties[CONFIG.idField]);
      if (id === App.state.selectedId) return;
      const f = this._index[id];
      if (f) { const s = m.getSource('hov-yapi'); if(s) s.setData(this._feat2D(f)); }
    });
    m.on('mouseleave', 'all-fill', () => {
      m.getCanvas().style.cursor = '';
      const s = m.getSource('hov-yapi'); if(s) s.setData({type:'FeatureCollection',features:[]});
    });

    this._addControls();
  },

  _loadAllFeatures() {
    this.refreshDisplay(App.state.activeFilterIds || null);
  },

  refreshDisplay(activeIds) {
    const src = this.map && this.map.getSource('all-yapi');
    if (!src) return;
    const fc = this._buildAllFC(activeIds);
    try { this.map.setPaintProperty('all-fill','fill-color', this._colorExpr(this._colorMode)); } catch(_) {}
    const url = URL.createObjectURL(new Blob([JSON.stringify(fc)],{type:'application/json'}));
    src.setData(url);
  },

  flyTo(yapiNo) {
    if (!this.map) return;
    const run = () => { this._applySelection(yapiNo); this._flyTo(yapiNo); };
    if (this.map.loaded()) run(); else this.map.once('load', run);
  },

  _applySelection(yapiNo) {
    const src = this.map && this.map.getSource('sel-yapi');
    if (!src) return;
    const feat = this._index[yapiNo];
    src.setData(feat ? this._feat2D(feat) : {type:'FeatureCollection',features:[]});
  },

  _flyTo(yapiNo) {
    const feat = this._index[yapiNo];
    if (!feat) return;
    const b = this._bounds(feat);
    if (b) this.map.fitBounds(b, { padding:80, maxZoom:19, duration:700 });
  },

  // Tüm yapıları gösterecek şekilde sıfırla
  resetView() {
    if (!this.map) return;
    const all = Object.values(this._index);
    if (!all.length) return;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for (const f of all) {
      for (const [x,y] of this._flatPts(f.geometry)) {
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      }
    }
    if (isFinite(x0)) this.map.fitBounds([[x0,y0],[x1,y1]], { padding:40, duration:700 });
  },

  _buildAllFC(activeIds) {
    const features = [];
    for (const [id, feat] of Object.entries(this._index)) {
      const clean = this._cleanFeature(feat);
      if (!clean) continue;
      const row = App.state.csvIndex[id] || {};
      clean.properties._cat = this._cvCat(row.CulturalValue || '');
      clean.properties._cs  = this._csCat(row.ConstructionStatus || '');
      clean.properties._h   = (activeIds !== null && !activeIds.has(id)) ? 1 : 0;
      features.push(clean);
    }
    return { type:'FeatureCollection', features };
  },

  _colorExpr(mode) {
    if (mode === 'cs') return ['match',['get','_cs'],
      'good','#2d6a4f','medium','#e9c46a','bad','#e76f51','ruin','#6d0026','new','#4895ef','#fdf6e3'];
    return ['match',['get','_cat'],
      'listed','#1a7a4a','proposed','#f4a261','not_listed','#8b7355',
      'new_suitable','#4895ef','lost_new','#c1121f','unsuitable','#e63946','#fdf6e3'];
  },

  _cvCat(cv) {
    const s = cv.trim();
    if (!s) return 'empty';
    if (s === 'NOT LISTED') return 'not_listed';
    if (s.includes('LISTED BUILDING') && !s.includes('LOST')) return 'listed';
    if (s.includes('PROPOSED')) return 'proposed';
    if (s.includes('UNSUITABLE')) return 'unsuitable';
    if (s.includes('LOST HISTORIC')) return 'lost_new';
    if (s.includes('SUITABLE')) return 'new_suitable';
    return 'other';
  },

  _csCat(cs) {
    const s = cs.trim().toUpperCase();
    if (s.includes('GOOD')) return 'good';
    if (s.includes('MEDIUM') || s === 'MEDUIM') return 'medium';
    if (s.includes('BAD')) return 'bad';
    if (s.includes('RUIN')) return 'ruin';
    if (s.includes('NEW') || s.includes('LOST')) return 'new';
    return 'empty';
  },

  renderLegend(mode) {
    const c = this.map && this.map.getContainer();
    if (!c) return;
    const old = c.querySelector('.map-legend'); if (old) old.remove();
    const items = mode === 'cs' ? [
      { color:'#2d6a4f', label:'Good' }, { color:'#e9c46a', label:'Fair' },
      { color:'#e76f51', label:'Poor' },{ color:'#6d0026', label:'Ruin' },
      { color:'#4895ef', label:'New Building' },{ color:'#fdf6e3', label:'Unknown' }
    ] : [
      { color:'#1a7a4a', label:'Listed' },{ color:'#f4a261', label:'Proposed' },
      { color:'#8b7355', label:'Not Listed' },{ color:'#4895ef', label:'New Suitable' },
      { color:'#e63946', label:'Unsuitable' },{ color:'#c1121f', label:'Historic Lost' },
      { color:'#fdf6e3', label:'Unknown' }
    ];
    const div = document.createElement('div');
    div.className = 'map-legend';
    div.innerHTML = items.map(i =>
      `<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</div>`
    ).join('');
    c.appendChild(div);
  },

  _addControls() {
    const c = this.map.getContainer();
    ['basemap-toggle','color-toggle','map-reset-btn','map-geo-btn',
     'map-extent-btn','layer-toggle-single','map-ctrl-tr','map-ctrl-br','map-ctrl-bl']
      .forEach(cls => { const el = c.querySelector('.'+cls); if(el) el.remove(); });

    // ── Sağ üst grubu (Katmanlar + Harita/Uydu) ──────────────
    const tr = document.createElement('div');
    tr.className = 'map-ctrl-tr';
    c.appendChild(tr);

    // Katmanlar toggle
    const lb = document.createElement('button');
    lb.className = 'mcb layer-toggle-single active';
    lb.title = 'Toggle survey & building number layers';
    lb.textContent = 'Layers';
    tr.appendChild(lb);
    lb.addEventListener('click', () => {
      const isActive = lb.classList.toggle('active');
      const vis = isActive ? 'visible' : 'none';
      ['halihazir-line','yapino-point','yapino-label'].forEach(id => {
        try { this.map.setLayoutProperty(id, 'visibility', vis); } catch(_) {}
      });
    });

    // Harita/Uydu toggle
    const bm = document.createElement('div');
    bm.className = 'mcg';
    bm.innerHTML = `<button data-bm="carto"     class="mcb active">Map</button>
                    <button data-bm="satellite" class="mcb">Satellite</button>`;
    tr.appendChild(bm);
    bm.addEventListener('click', e => {
      const btn = e.target.closest('.mcb[data-bm]'); if (!btn) return;
      bm.querySelectorAll('.mcb').forEach(b => b.classList.toggle('active', b===btn));
      this.map.setLayoutProperty('carto-layer',     'visibility', btn.dataset.bm==='carto'?'visible':'none');
      this.map.setLayoutProperty('satellite-layer', 'visibility', btn.dataset.bm==='satellite'?'visible':'none');
    });

    // ── Sağ alt (Koruma/Durum) ────────────────────────────────
    const br = document.createElement('div');
    br.className = 'map-ctrl-br mcg';
    br.innerHTML = `<button data-cm="cv" class="mcb active">Heritage</button>
                    <button data-cm="cs" class="mcb">Condition</button>`;
    c.appendChild(br);
    br.addEventListener('click', e => {
      const btn = e.target.closest('.mcb[data-cm]'); if (!btn) return;
      this._colorMode = btn.dataset.cm;
      br.querySelectorAll('.mcb').forEach(b => b.classList.toggle('active', b===btn));
      this.refreshDisplay(App.state.activeFilterIds || null);
      this.renderLegend(this._colorMode);
    });

    // ── Sol alt grubu (Reset + Konum + Extent) ────────────────
    const bl = document.createElement('div');
    bl.className = 'map-ctrl-bl';
    c.appendChild(bl);

    // Reset
    const rb = document.createElement('button');
    rb.className = 'mci reset';
    rb.title = 'Clear selection';
    rb.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5"/>
      <rect x="4" y="4" width="5" height="5" rx="0.5"/>
    </svg>`;
    bl.appendChild(rb);
    rb.addEventListener('click', () => {
      const src = this.map && this.map.getSource('sel-yapi');
      if (src) src.setData({ type:'FeatureCollection', features:[] });
      if (typeof App !== 'undefined') App.clearSelection();
    });

    // Konum
    const gb = document.createElement('button');
    gb.className = 'mci';
    gb.title = 'Show my location';
    gb.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <circle cx="6.5" cy="6.5" r="2.2" fill="currentColor" stroke="none"/>
      <circle cx="6.5" cy="6.5" r="4.8"/>
      <line x1="6.5" y1="1" x2="6.5" y2="2.3"/>
      <line x1="6.5" y1="10.7" x2="6.5" y2="12"/>
      <line x1="1" y1="6.5" x2="2.3" y2="6.5"/>
      <line x1="10.7" y1="6.5" x2="12" y2="6.5"/>
    </svg>`;
    bl.appendChild(gb);
    gb.addEventListener('click', () => {
      if (!navigator.geolocation) { if(typeof App!=='undefined') App.toast('Geolocation not supported','error'); return; }
      if (location.protocol!=='https:' && location.hostname!=='localhost' && location.hostname!=='127.0.0.1') {
        if(typeof App!=='undefined') App.toast('HTTPS required for geolocation','error'); return;
      }
      gb.style.opacity = '0.4';
      navigator.geolocation.getCurrentPosition(pos => {
        gb.style.opacity = ''; gb.classList.add('active');
        const { latitude:lat, longitude:lng } = pos.coords;
        const fc = { type:'Feature', geometry:{ type:'Point', coordinates:[lng,lat] }, properties:{} };
        if (this.map.getSource('user-loc')) { this.map.getSource('user-loc').setData(fc); }
        else {
          this.map.addSource('user-loc', { type:'geojson', data:fc });
          this.map.addLayer({ id:'user-loc-halo', type:'circle', source:'user-loc',
            paint:{ 'circle-radius':14, 'circle-color':'#2196F3', 'circle-opacity':0.2 }});
          this.map.addLayer({ id:'user-loc-dot', type:'circle', source:'user-loc',
            paint:{ 'circle-radius':7, 'circle-color':'#2196F3',
                    'circle-stroke-width':2.5, 'circle-stroke-color':'white' }});
        }
        this.map.flyTo({ center:[lng,lat], zoom:17, duration:900 });
      }, err => {
        gb.style.opacity='';
        const msg = err.code===1?'Location permission denied':err.code===2?'Location unavailable':'Location request timed out';
        if(typeof App!=='undefined') App.toast(msg,'error');
      }, { enableHighAccuracy:true, timeout:10000, maximumAge:0 });
    });

    // Extent
    const eb = document.createElement('button');
    eb.className = 'mci';
    eb.title = 'Zoom to full extent';
    eb.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5"/>
    </svg>`;
    bl.appendChild(eb);
    eb.addEventListener('click', () => this.resetView());
  },

  renderLegend(mode) {
    const c = this.map && this.map.getContainer();
    if (!c) return;
    const old = c.querySelector('.map-legend'); if (old) old.remove();
    const items = mode === 'cs' ? [
      { color:'#2d6a4f', label:'Good' }, { color:'#e9c46a', label:'Fair' },
      { color:'#e76f51', label:'Poor' },{ color:'#6d0026', label:'Ruin' },
      { color:'#4895ef', label:'New Building' },{ color:'#fdf6e3', label:'Unknown' }
    ] : [
      { color:'#1a7a4a', label:'Listed' },{ color:'#f4a261', label:'Proposed' },
      { color:'#8b7355', label:'Not Listed' },{ color:'#4895ef', label:'New Suitable' },
      { color:'#e63946', label:'Unsuitable' },{ color:'#c1121f', label:'Historic Lost' },
      { color:'#fdf6e3', label:'Unknown' }
    ];
    const div = document.createElement('div');
    div.className = 'map-legend';
    div.innerHTML = items.map(i =>
      `<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</div>`
    ).join('');
    c.appendChild(div);
  },

  _addControls() {
    const c = this.map.getContainer();

    // Üst sağ kontrol grubu — tek container
    const otr = c.querySelector('.map-ctrl-tr'); if(otr) otr.remove();
    const tr = document.createElement('div'); tr.className = 'map-ctrl-tr';
    c.appendChild(tr);

    // Buildings toggle
    const yapiBtn = document.createElement('button');
    yapiBtn.className = 'ctrl-btn active';
    yapiBtn.textContent = 'Buildings';
    yapiBtn.addEventListener('click', () => {
      const isActive = yapiBtn.classList.toggle('active');
      const vis = isActive ? 'visible' : 'none';
      ['all-fill','all-line','all-label','sel-fill','sel-line','hov-fill'].forEach(id => {
        try { this.map.setLayoutProperty(id, 'visibility', vis); } catch(_) {}
      });
    });
    tr.appendChild(yapiBtn);

    // Separator
    tr.appendChild(Object.assign(document.createElement('span'), { className: 'ctrl-sep' }));

    // Layers toggle
    const lb = document.createElement('button');
    lb.className = 'ctrl-btn';
    lb.textContent = 'Layers';
    lb.addEventListener('click', () => {
      const isActive = lb.classList.toggle('active');
      const vis = isActive ? 'visible' : 'none';
      ['halihazir-line','yapino-point','yapino-label'].forEach(id => {
        try { this.map.setLayoutProperty(id, 'visibility', vis); } catch(_) {}
      });
    });
    tr.appendChild(lb);

    // Separator
    tr.appendChild(Object.assign(document.createElement('span'), { className: 'ctrl-sep' }));

    // Blocks (Yapı Adası) toggle
    const blocksBtn = document.createElement('button');
    blocksBtn.className = 'ctrl-btn active';
    blocksBtn.textContent = 'Blocks';
    blocksBtn.addEventListener('click', () => {
      const isActive = blocksBtn.classList.toggle('active');
      const vis = isActive ? 'visible' : 'none';
      ['yapiadasi-fill','yapiadasi-line','yapiadasi-label'].forEach(id => {
        try { this.map.setLayoutProperty(id, 'visibility', vis); } catch(_) {}
      });
    });
    tr.appendChild(blocksBtn);

    // Separator
    tr.appendChild(Object.assign(document.createElement('span'), { className: 'ctrl-sep' }));

    // Ortofoto toggle
    const ortoBtn = document.createElement('button');
    ortoBtn.className = 'ctrl-btn';
    ortoBtn.textContent = 'Ortofoto';
    ortoBtn.addEventListener('click', () => {
      const isActive = ortoBtn.classList.toggle('active');
      try { this.map.setLayoutProperty('ortofoto-layer', 'visibility', isActive ? 'visible' : 'none'); } catch(_) {}
    });
    tr.appendChild(ortoBtn);

    // Separator
    tr.appendChild(Object.assign(document.createElement('span'), { className: 'ctrl-sep' }));

    // Basemap toggle
    const cartoBtn  = document.createElement('button');
    const satBtn    = document.createElement('button');
    cartoBtn.className = 'ctrl-btn active'; cartoBtn.textContent = 'Map';
    satBtn.className   = 'ctrl-btn';        satBtn.textContent   = 'Satellite';
    [cartoBtn, satBtn].forEach(btn => {
      btn.addEventListener('click', () => {
        cartoBtn.classList.toggle('active', btn === cartoBtn);
        satBtn.classList.toggle('active',   btn === satBtn);
        this.map.setLayoutProperty('carto-layer',     'visibility', btn === cartoBtn  ? 'visible' : 'none');
        this.map.setLayoutProperty('satellite-layer', 'visibility', btn === satBtn    ? 'visible' : 'none');
        // Satellite'te yapıadası çizgisi beyaz, Map'te kırmızı
        const adaColor = btn === satBtn ? '#ffffff' : '#e63946';
        try { this.map.setPaintProperty('yapiadasi-line', 'line-color', adaColor); } catch(_) {}
        try { this.map.setPaintProperty('yapiadasi-label', 'text-color', btn === satBtn ? '#ffffff' : '#c1121f'); } catch(_) {}
        try { this.map.setPaintProperty('yapiadasi-label', 'text-halo-color', btn === satBtn ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,1)'); } catch(_) {}
      });
      tr.appendChild(btn);
    });

    // Color mode — alt sağ (değişmedi)
    const oc = c.querySelector('.color-toggle'); if(oc) oc.remove();
    const ct = document.createElement('div'); ct.className = 'color-toggle';
    ct.innerHTML = `<button data-cm="cv" class="cm-btn active">Heritage</button>
                    <button data-cm="cs" class="cm-btn">Condition</button>`;
    c.appendChild(ct);
    ct.addEventListener('click', e => {
      const btn = e.target.closest('.cm-btn'); if(!btn) return;
      this._colorMode = btn.dataset.cm;
      ct.querySelectorAll('.cm-btn').forEach(b => b.classList.toggle('active', b===btn));
      this.refreshDisplay(App.state.activeFilterIds || null);
      this.renderLegend(this._colorMode);
    });

    this.renderLegend('cv');

    // Reset / tüm haritayı gör butonu
    const or = c.querySelector('.map-reset-btn'); if(or) or.remove();
    const rb = document.createElement('button');
    rb.className = 'map-reset-btn';
    rb.title = 'Show all buildings · Clear selection';
    rb.innerHTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 2l4 4M13 2l-4 4M2 13l4-4M13 13l-4-4"/>
      <rect x="5" y="5" width="5" height="5" rx="1"/>
    </svg>`;
    c.appendChild(rb);
    rb.addEventListener('click', () => {
      // Harita seçimini temizle
      const src = this.map && this.map.getSource('sel-yapi');
      if (src) src.setData({ type:'FeatureCollection', features:[] });
      // Attribute formu da kapat
      if (typeof App !== 'undefined') App.clearSelection();
    });

    // Konum butonu
    const og = c.querySelector('.map-geo-btn'); if(og) og.remove();
    const gb = document.createElement('button');
    gb.className = 'map-geo-btn';
    gb.title = 'Show my location';
    gb.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <circle cx="7" cy="7" r="2.4" fill="currentColor" stroke="none"/>
      <circle cx="7" cy="7" r="5.2"/>
      <line x1="7" y1="1" x2="7" y2="2.4"/>
      <line x1="7" y1="11.6" x2="7" y2="13"/>
      <line x1="1" y1="7" x2="2.4" y2="7"/>
      <line x1="11.6" y1="7" x2="13" y2="7"/>
    </svg>`;
    c.appendChild(gb);
    gb.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (typeof App !== 'undefined') App.toast('Geolocation not supported by this browser', 'error');
        return;
      }
      // HTTPS kontrolü — mobilde http'de çalışmaz
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        if (typeof App !== 'undefined') App.toast('HTTPS required for geolocation — open via GitHub Pages', 'error');
        return;
      }
      gb.style.opacity = '0.4';
      navigator.geolocation.getCurrentPosition(pos => {
        gb.style.opacity = '';
        gb.classList.add('active');
        const { latitude: lat, longitude: lng } = pos.coords;
        const fc = { type:'Feature', geometry:{ type:'Point', coordinates:[lng,lat] }, properties:{} };
        if (this.map.getSource('user-loc')) {
          this.map.getSource('user-loc').setData(fc);
        } else {
          this.map.addSource('user-loc', { type:'geojson', data: fc });
          this.map.addLayer({ id:'user-loc-halo', type:'circle', source:'user-loc',
            paint:{ 'circle-radius':14, 'circle-color':'#2196F3', 'circle-opacity':0.2 }});
          this.map.addLayer({ id:'user-loc-dot', type:'circle', source:'user-loc',
            paint:{ 'circle-radius':7, 'circle-color':'#2196F3',
                    'circle-stroke-width':2.5, 'circle-stroke-color':'white' }});
        }
        this.map.flyTo({ center:[lng,lat], zoom:17, duration:900 });
      }, (err) => {
        gb.style.opacity = '';
        const msg = err.code === 1 ? 'Location permission denied'
                  : err.code === 2 ? 'Location unavailable'
                  : 'Location request timed out';
        if (typeof App !== 'undefined') App.toast(msg, 'error');
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });

    // Tüm alana dön (extent) butonu
    const oe = c.querySelector('.map-extent-btn'); if(oe) oe.remove();
    const eb = document.createElement('button');
    eb.className = 'map-extent-btn';
    eb.title = 'Zoom to full extent';
    eb.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 5V2h3M10 2h3v3M13 9v3h-3M4 12H1V9"/>
    </svg>`;
    c.appendChild(eb);
    eb.addEventListener('click', () => this.resetView());
  },

  // ── Geometry utilities ───────────────────────────────────────
  _cleanFeature(feat) {
    if (!feat || !feat.geometry) return null;
    const geom = feat.geometry;
    try {
      if (geom.type === 'Polygon') {
        const c = this._cleanRings(geom.coordinates);
        if (!c) return null;
        return { type:'Feature', properties:feat.properties||{}, geometry:{type:'Polygon',coordinates:c} };
      }
      if (geom.type === 'MultiPolygon') {
        const polys = (geom.coordinates||[]).map(p=>this._cleanRings(p)).filter(Boolean);
        if (!polys.length) return null;
        return { type:'Feature', properties:feat.properties||{}, geometry:{type:'MultiPolygon',coordinates:polys} };
      }
    } catch(_) {}
    return null;
  },

  _cleanRings(rings) {
    if (!Array.isArray(rings)) return null;
    const out = rings
      .filter(r => Array.isArray(r) && r.length >= 3)
      .map(r => r.filter(c => Array.isArray(c)&&c.length>=2&&isFinite(c[0])&&isFinite(c[1])).map(c=>[c[0],c[1]]))
      .filter(r => r.length >= 3);
    return out.length ? out : null;
  },

  _feat2D(feat) {
    const s2=cs=>cs.map(c=>[c[0],c[1]]), s3=cs=>cs.map(s2), s4=cs=>cs.map(s3);
    const g=feat.geometry;
    if(!g) return {type:'FeatureCollection',features:[]};
    const coords = g.type==='Polygon' ? s3(g.coordinates) : g.type==='MultiPolygon' ? s4(g.coordinates) : null;
    if(!coords) return {type:'FeatureCollection',features:[]};
    return {type:'Feature', properties:feat.properties||{}, geometry:{type:g.type,coordinates:coords}};
  },

  _bounds(feat) {
    const pts=this._flatPts(feat.geometry); if(!pts.length) return null;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const[x,y]of pts){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    return[[x0,y0],[x1,y1]];
  },
  _flatPts(geom) {
    if(!geom) return [];
    if(geom.type==='Polygon') return (geom.coordinates||[]).flat();
    if(geom.type==='MultiPolygon') return (geom.coordinates||[]).flat(2);
    return [];
  },
  _center() {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const f of Object.values(this._index))
      for(const[x,y]of this._flatPts(f.geometry)){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    return isFinite(x0)?[(x0+x1)/2,(y0+y1)/2]:[26.694,39.314];
  },
};