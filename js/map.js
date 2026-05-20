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

  _onLoad() {
    const m = this.map;

    // 1. ALTTA — Halihazır harita (polyline)
    m.addSource('halihazir', { type:'geojson', data:'./data/halihazir.geojson' });
    m.addLayer({ id:'halihazir-line', type:'line', source:'halihazir',
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
      'good','#2d6a4f','medium','#e9c46a','bad','#e76f51','ruin','#6d0026','new','#4895ef','#adb5bd'];
    return ['match',['get','_cat'],
      'listed','#1a7a4a','proposed','#f4a261','not_listed','#8b7355',
      'new_suitable','#4895ef','lost_new','#c1121f','unsuitable','#e63946','#adb5bd'];
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
      { color:'#2d6a4f', label:'İyi' }, { color:'#e9c46a', label:'Orta' },
      { color:'#e76f51', label:'Kötü' },{ color:'#6d0026', label:'Harabe' },
      { color:'#4895ef', label:'Yeni Yapı' },{ color:'#adb5bd', label:'Belirsiz' }
    ] : [
      { color:'#1a7a4a', label:'Tescilli' },{ color:'#f4a261', label:'Tescil Önerisi' },
      { color:'#8b7355', label:'Tescilsiz' },{ color:'#4895ef', label:'Yeni Uygun' },
      { color:'#e63946', label:'Yeni Uygun Değil' },{ color:'#c1121f', label:'Tarihi Kayıp' },
      { color:'#adb5bd', label:'Belirsiz' }
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

    // Basemap
    const ob = c.querySelector('.basemap-toggle'); if(ob) ob.remove();
    const bm = document.createElement('div'); bm.className = 'basemap-toggle';
    bm.innerHTML = `<button data-bm="carto" class="bm-btn active">Harita</button>
                    <button data-bm="satellite" class="bm-btn">Uydu</button>`;
    c.appendChild(bm);
    bm.addEventListener('click', e => {
      const btn = e.target.closest('.bm-btn'); if(!btn) return;
      bm.querySelectorAll('.bm-btn').forEach(b => b.classList.toggle('active', b===btn));
      this.map.setLayoutProperty('carto-layer',    'visibility', btn.dataset.bm==='carto'?'visible':'none');
      this.map.setLayoutProperty('satellite-layer','visibility', btn.dataset.bm==='satellite'?'visible':'none');
    });

    // Color mode
    const oc = c.querySelector('.color-toggle'); if(oc) oc.remove();
    const ct = document.createElement('div'); ct.className = 'color-toggle';
    ct.innerHTML = `<button data-cm="cv" class="cm-btn active">Koruma</button>
                    <button data-cm="cs" class="cm-btn">Durum</button>`;
    c.appendChild(ct);
    ct.addEventListener('click', e => {
      const btn = e.target.closest('.cm-btn'); if(!btn) return;
      this._colorMode = btn.dataset.cm;
      ct.querySelectorAll('.cm-btn').forEach(b => b.classList.toggle('active', b===btn));
      this.refreshDisplay(App.state.activeFilterIds || null);
      this.renderLegend(this._colorMode);
    });

    this.renderLegend('cv');

    // Tek katman toggle butonu — harita/uydu'nun solunda
    const ol = c.querySelector('.layer-toggle-single'); if(ol) ol.remove();
    const lb = document.createElement('button');
    lb.className = 'layer-toggle-single active';
    lb.title = 'Halihazır & Yapı No katmanlarını aç/kapat';
    lb.textContent = 'Katmanlar';
    c.appendChild(lb);
    lb.addEventListener('click', () => {
      const isActive = lb.classList.toggle('active');
      const vis = isActive ? 'visible' : 'none';
      ['halihazir-line','yapino-point','yapino-label'].forEach(id => {
        try { this.map.setLayoutProperty(id, 'visibility', vis); } catch(_) {}
      });
    });

    // Reset / tüm haritayı gör butonu
    const or = c.querySelector('.map-reset-btn'); if(or) or.remove();
    const rb = document.createElement('button');
    rb.className = 'map-reset-btn';
    rb.title = 'Tüm haritayı göster · Seçimi sıfırla';
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
    gb.title = 'Konumumu göster';
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
        if (typeof App !== 'undefined') App.toast('Tarayıcı konum desteklemiyor', 'error');
        return;
      }
      // HTTPS kontrolü — mobilde http'de çalışmaz
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        if (typeof App !== 'undefined') App.toast('Konum için HTTPS gerekli — GitHub Pages üzerinden açın', 'error');
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
        const msg = err.code === 1 ? 'Konum izni reddedildi'
                  : err.code === 2 ? 'Konum alınamadı'
                  : 'Konum zaman aşımı';
        if (typeof App !== 'undefined') App.toast(msg, 'error');
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });

    // Tüm alana dön (extent) butonu
    const oe = c.querySelector('.map-extent-btn'); if(oe) oe.remove();
    const eb = document.createElement('button');
    eb.className = 'map-extent-btn';
    eb.title = 'Tüm alana dön';
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