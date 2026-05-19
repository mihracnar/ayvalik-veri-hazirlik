// map.js

const MapModule = {
  map: null,
  _geojson: null,
  _index: {},
  _onSelect: null,

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
        sources: {
          carto: {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
            tileSize: 256, maxzoom: 19,
            attribution: '© CARTO © OpenStreetMap'
          },
          satellite: {
            type: 'raster',
            tiles: ['https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                    'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
            tileSize: 256, maxzoom: 19,
            attribution: '© Google'
          }
        },
        layers: [
          { id: 'carto-layer',     type: 'raster', source: 'carto' },
          { id: 'satellite-layer', type: 'raster', source: 'satellite',
            layout: { visibility: 'none' } }
        ]
      },
      center: this._center(),
      zoom: 15,
      maxZoom: 19,
      attributionControl: { compact: true },
    });

    this.map.on('load', () => this._onLoad());
    this.map.on('error', (e) => console.warn('[map error]', e.error && e.error.message));
  },

  _onLoad() {
    const m = this.map;

    // ── Tüm yapılar — boş başlat, setData ile doldur ─────────
    m.addSource('all-yapi', { type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    m.addLayer({ id: 'all-fill', type: 'fill', source: 'all-yapi',
      paint: { 'fill-color': '#8b7355', 'fill-opacity': 0.4 } });
    m.addLayer({ id: 'all-line', type: 'line', source: 'all-yapi',
      paint: { 'line-color': '#5a4530', 'line-width': 1.0 } });

    // ── Seçili yapı ───────────────────────────────────────────
    m.addSource('sel-yapi', { type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    m.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel-yapi',
      paint: { 'fill-color': '#8b2e26', 'fill-opacity': 0.65 } });
    m.addLayer({ id: 'sel-line', type: 'line', source: 'sel-yapi',
      paint: { 'line-color': '#1a1612', 'line-width': 2.5 } });

    // ── Hover ─────────────────────────────────────────────────
    m.addSource('hov-yapi', { type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    m.addLayer({ id: 'hov-fill', type: 'fill', source: 'hov-yapi',
      paint: { 'fill-color': '#c08a2e', 'fill-opacity': 0.45 } });

    // Tüm yapıları bir sonraki tick'te yükle
    requestAnimationFrame(() => this._loadAllFeatures());

    // İlk seçim
    if (App.state.selectedId) {
      this._applySelection(App.state.selectedId);
      this._flyTo(App.state.selectedId);
    }

    // Tıklama
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
      if (f) { const src = m.getSource('hov-yapi'); if (src) src.setData(this._toFC(f)); }
    });
    m.on('mouseleave', 'all-fill', () => {
      m.getCanvas().style.cursor = '';
      const s = m.getSource('hov-yapi'); if (s) s.setData(this._emptyFC());
    });

    this._addBasemapToggle();
  },

  // Tüm yapıları temizleyerek kaynak güncelle
  _loadAllFeatures() {
    const src = this.map && this.map.getSource('all-yapi');
    if (!src) return;
    try {
      const fc = this._buildAllFC();
      console.log('[map] _loadAllFeatures:', fc.features.length, 'features');
      src.setData(fc);
    } catch (e) {
      console.error('[map] _loadAllFeatures error:', e);
    }
  },

  // Tüm feature'ları temizlenmiş FeatureCollection'a çevir
  _buildAllFC() {
    const features = [];
    for (const feat of Object.values(this._index)) {
      const clean = this._cleanFeature(feat);
      if (clean) features.push(clean);
    }
    return { type: 'FeatureCollection', features };
  },

  // Tek feature'ı temizle: sadece Polygon/MultiPolygon, Z strip
  _cleanFeature(feat) {
    if (!feat || !feat.geometry) return null;
    const geom = feat.geometry;
    let coords;
    try {
      if (geom.type === 'Polygon') {
        coords = this._cleanRings(geom.coordinates);
        if (!coords || coords.length === 0) return null;
        return { type: 'Feature', properties: feat.properties || {},
                 geometry: { type: 'Polygon', coordinates: coords } };
      }
      if (geom.type === 'MultiPolygon') {
        const polys = [];
        for (const poly of (geom.coordinates || [])) {
          const rings = this._cleanRings(poly);
          if (rings && rings.length > 0) polys.push(rings);
        }
        if (polys.length === 0) return null;
        return { type: 'Feature', properties: feat.properties || {},
                 geometry: { type: 'MultiPolygon', coordinates: polys } };
      }
    } catch (e) { return null; }
    return null;
  },

  // Ring dizisini temizle: her noktayı 2B'ye indir, kısa halkaları at
  _cleanRings(rings) {
    if (!Array.isArray(rings)) return null;
    const out = [];
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const pts = [];
      for (const c of ring) {
        if (Array.isArray(c) && c.length >= 2 &&
            typeof c[0] === 'number' && typeof c[1] === 'number' &&
            isFinite(c[0]) && isFinite(c[1])) {
          pts.push([c[0], c[1]]);
        }
      }
      if (pts.length >= 3) out.push(pts);
    }
    return out.length > 0 ? out : null;
  },

  // Tek feature (sel/hov) için yardımcı
  _toFC(feat) {
    const clean = this._cleanFeature(feat);
    if (!clean) return this._emptyFC();
    return clean;
  },

  _emptyFC() {
    return { type: 'FeatureCollection', features: [] };
  },

  flyTo(yapiNo) {
    if (!this.map) return;
    const run = () => { this._applySelection(yapiNo); this._flyTo(yapiNo); };
    if (this.map.loaded()) run();
    else this.map.once('load', run);
  },

  _applySelection(yapiNo) {
    const src = this.map && this.map.getSource('sel-yapi');
    if (!src) return;
    const feat = this._index[yapiNo];
    src.setData(feat ? this._toFC(feat) : this._emptyFC());
  },

  _flyTo(yapiNo) {
    const feat = this._index[yapiNo];
    if (!feat) return;
    const bounds = this._bounds(feat);
    if (bounds) this.map.fitBounds(bounds, { padding: 80, maxZoom: 19, duration: 700 });
  },

  _addBasemapToggle() {
    const c = this.map.getContainer();
    const old = c.querySelector('.basemap-toggle'); if (old) old.remove();
    const div = document.createElement('div');
    div.className = 'basemap-toggle';
    div.innerHTML = `<button data-bm="carto" class="bm-btn active">Harita</button>
                     <button data-bm="satellite" class="bm-btn">Uydu</button>`;
    c.appendChild(div);
    div.addEventListener('click', (e) => {
      const btn = e.target.closest('.bm-btn'); if (!btn) return;
      const bm = btn.dataset.bm;
      div.querySelectorAll('.bm-btn').forEach(b => b.classList.toggle('active', b === btn));
      this.map.setLayoutProperty('carto-layer',     'visibility', bm === 'carto'     ? 'visible' : 'none');
      this.map.setLayoutProperty('satellite-layer', 'visibility', bm === 'satellite' ? 'visible' : 'none');
    });
  },

  _bounds(feat) {
    const pts = this._flatPts(feat.geometry);
    if (!pts.length) return null;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for (const [x,y] of pts) {
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
    return [[x0,y0],[x1,y1]];
  },

  _flatPts(geom) {
    if (!geom) return [];
    switch (geom.type) {
      case 'Polygon':      return (geom.coordinates||[]).flat();
      case 'MultiPolygon': return (geom.coordinates||[]).flat(2);
      default:             return [];
    }
  },

  _center() {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for (const f of Object.values(this._index)) {
      for (const [x,y] of this._flatPts(f.geometry)) {
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      }
    }
    return isFinite(x0) ? [(x0+x1)/2,(y0+y1)/2] : [26.694,39.314];
  },
};