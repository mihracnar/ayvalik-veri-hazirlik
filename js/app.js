// app.js

const App = {
  state: {
    csvIndex: {}, geoIndex: {}, allIds: [],
    selectedId: null, saving: false, liveMode: false,
    // Filter
    filterState: { ConstructionStatus:[], UsageType:[], cvCat:[] },
    activeFilterIds: null,
  },

  async boot() {
    let geoData;
    try { geoData = await API.loadGeoJSON(); }
    catch(e) { this.toast('Failed to load GeoJSON: '+e.message,'error'); geoData={geojson:{type:'FeatureCollection',features:[]},index:{}}; }
    this.state.geoIndex = geoData.index;

    try {
      const csvData = await API.loadCSV();
      this.state.csvIndex = csvData.index;
      this.state.liveMode = true;
    } catch(e) { this.toast('Failed to load CSV: '+e.message,'error'); }

    this.state.allIds = Object.keys(this.state.geoIndex).sort();
    document.getElementById('loaded-count').textContent =
      this.state.allIds.length + ' buildings · ' + Object.keys(this.state.csvIndex).length + ' records';

    MapModule.setData(geoData.geojson, geoData.index, (id) => this.selectId(id));

    this.refreshProgress();
    this.buildDropdown('');
    this.initFilterPanel();

    const pill = document.getElementById('mode-pill');
    pill.classList.toggle('live', this.state.liveMode);
    document.getElementById('mode-text').textContent = 'Online · Google Sheets';

    // Haritayı hemen başlat — yapı seçimi bekleme
    requestAnimationFrame(() => MapModule.mount());
  },

  // ── Dropdown ─────────────────────────────────────────────────
  buildDropdown(query) {
    const dd = document.getElementById('dropdown');
    const q = query.trim(), ql = q.toLowerCase();
    const adaParsel = q.match(/^(\d+)\s*[\/\-\s]\s*(\d+)$/);
    const norm = s => String(s||'').replace(/^0+/,'').trim();

    const source = this.state.activeFilterIds
      ? this.state.allIds.filter(id => this.state.activeFilterIds.has(id))
      : this.state.allIds;

    const matches = source.filter(id => {
      if (!q) return true;
      const row  = this.state.csvIndex[id] || {};
      const feat = (this.state.geoIndex[id]||{}).properties || {};
      const ada = String(row.AdaNO ?? feat.AdaNO ?? '');
      const par = String(row.ParselNO ?? feat.ParselNO ?? '');
      if (adaParsel) return norm(ada)===norm(adaParsel[1]) && norm(par)===norm(adaParsel[2]);
      if (/^\d+$/.test(q) && norm(ada)===norm(q)) return true;
      return String(row.YapiNO ?? feat.YapiNO ?? '').toLowerCase().includes(ql)
          || String(id).includes(ql)
          || ada.includes(q) || par.includes(q)
          || String(row.Adres ?? '').toLowerCase().includes(ql);
    });

    if (!matches.length) {
      dd.innerHTML = '<div class="dd-empty">No matching records</div>'; return;
    }

    dd.innerHTML = matches.slice(0,60).map(id => {
      const row  = this.state.csvIndex[id] || {};
      const feat = (this.state.geoIndex[id]||{}).properties || {};
      const ada  = row.AdaNO ?? feat.AdaNO ?? '—';
      const par  = row.ParselNO ?? feat.ParselNO ?? '—';
      const status = this.completenessStatus(id);
      return `<div class="dd-opt" data-id="${id}">
        <span class="pip pip-${status}"></span>
        <span class="dd-id">${CONFIG.buildingLabel(Object.assign({}, feat, row))}</span>
        <span class="dd-meta">fid:${id} · Block ${ada} / P ${par}</span>
      </div>`;
    }).join('');

    dd.querySelectorAll('.dd-opt').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.dataset.id;
        this.selectId(id);
      });
    });
  },

  // ── Seçim ────────────────────────────────────────────────────
  selectId(id) {
    this.state.selectedId = id;
    const search = document.getElementById('search');
    const _attrs0 = this.state.csvIndex[id] || {};
    const _feat0  = (this.state.geoIndex[id]||{}).properties || {};
    search.value = CONFIG.buildingLabel(Object.assign({}, _feat0, _attrs0));
    document.getElementById('clear-btn').style.display = '';
    document.getElementById('dropdown').classList.remove('open');

    const attrs = this.state.csvIndex[id] || { [CONFIG.idField]: id };

    const recTitle  = document.getElementById('rec-title');
    const recId     = document.getElementById('rec-id');
    const mapHint   = document.getElementById('map-hint');
    const mapMeta   = document.getElementById('map-meta');
    const mapBadges = document.getElementById('map-badges');
    const _featAttrs = (this.state.geoIndex[id]||{}).properties || {};
    if (recTitle)  recTitle.textContent = CONFIG.buildingLabel(Object.assign({}, _featAttrs, attrs));
    if (recId)     recId.textContent    = id;
    if (mapHint)   mapHint.textContent  = 'Click a building to select it — details will appear below.';
    if (mapBadges) mapBadges.innerHTML  =
      `<span class="meta-badge">Block <strong>${attrs.AdaNO||'—'}</strong></span>` +
      `<span class="meta-badge">Parcel <strong>${attrs.ParselNO||'—'}</strong></span>`;
    if (mapMeta)   mapMeta.style.display = '';

    // Haritayı uçur
    MapModule.flyTo(id);

    // Formu çiz
    const recordArea = document.getElementById('record-view');
    recordArea.innerHTML = this._formShellHTML(id);
    const formArea = document.getElementById('form-area');
    if (formArea) { FormModule.render(formArea, attrs); this._bindFormButtons(); }
    this.updateCompleteness(id);


  },

  _formShellHTML(id) {
    return `<div id="form-area"></div>`;
  },

  _updateRecordHeader(id) {
    const t = document.getElementById('rec-title'), i = document.getElementById('rec-id');
    if (t) t.textContent = id; if (i) i.textContent = id;
  },

  _bindFormButtons() {
    this._setSaveEnabled(false);
    document.getElementById('btn-save')?.addEventListener('click', () => this.save());
    document.getElementById('btn-cancel')?.addEventListener('click', () => this.clearSelection());

    // Enable Save as soon as any field value changes
    const formArea = document.getElementById('form-area');
    if (formArea) {
      formArea.addEventListener('change', () => this._setSaveEnabled(true));
      formArea.addEventListener('input',  () => this._setSaveEnabled(true));
    }
  },

  _setSaveEnabled(enabled) {
    const btn = document.getElementById('btn-save');
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '' : '0.45';
  },

  clearSelection() {
    this.state.selectedId = null;
    document.getElementById('search').value = '';
    document.getElementById('clear-btn').style.display = 'none';
    document.getElementById('record-view').innerHTML = this._emptyHTML();
    const recTitle  = document.getElementById('rec-title');
    const mapMeta   = document.getElementById('map-meta');
    const mapHint   = document.getElementById('map-hint');
    const mapBadges = document.getElementById('map-badges');
    if (recTitle)  recTitle.textContent = 'Ayvalık Building Inventory';
    if (mapMeta)   mapMeta.style.display = 'none';
    if (mapHint)   mapHint.textContent  = 'Click a building to select it — details will appear below.';
    if (mapBadges) mapBadges.innerHTML  = '';
  },

  // ── Kaydet ───────────────────────────────────────────────────
  async save() {
    if (this.state.saving) return;
    const id = this.state.selectedId; if (!id) return;
    const formArea = document.getElementById('form-area');
    const fields = FormModule.collect(formArea);
    const photoFiles = FormModule.getPhotoFiles();
    // Hidden input zaten "mevcut dosyalar − silinenler" halini taşıyor
    const photoHidden = document.getElementById('photo-hidden');
    const existingPhotoCsv = photoHidden ? photoHidden.value : '';

    // Değişiklik yoksa kaydetme
    if (!Object.keys(fields).length && !photoFiles.length) {
      this.toast('No changes — save cancelled.', 'error');
      return;
    }

    this.state.saving = true;
    const btn = document.getElementById('btn-save');
    if (btn) { btn.disabled=true; btn.textContent='Saving…'; }

    try {
      const result = await API.save(id, fields, photoFiles, existingPhotoCsv);
      if (!result.ok) throw new Error(result.error||'Unknown error');
      this.state.csvIndex[id] = { ...(this.state.csvIndex[id]||{}), ...fields, [CONFIG.idField]:id };
      if (fields.Photo !== undefined) this.state.csvIndex[id].Photo = fields.Photo;
      // Update original attrs so collect() tracks from the new baseline — no re-render, no scroll reset
      FormModule._originalAttrs = { ...this.state.csvIndex[id] };
      this.refreshProgress(); this.buildDropdown(document.getElementById('search').value);
      this.updateCompleteness(id);
      this._setSaveEnabled(false);
      // Foto grid'i güncel (yüklenmiş) listeyle yeniden çiz
      if (fields.Photo !== undefined) {
        const grid = document.getElementById('photo-grid');
        if (grid) {
          const names = fields.Photo ? fields.Photo.split(',').map(v => v.trim()).filter(Boolean) : [];
          grid.dataset.original = fields.Photo || '';
          grid.innerHTML = names.map(n => FormModule._photoThumbHTML(n)).join('');
          grid.querySelectorAll('.photo-thumb[data-kind="existing"]').forEach(thumb => {
            FormModule._loadThumbImage(thumb, thumb.dataset.name);
          });
        }
        if (photoHidden) photoHidden.value = fields.Photo || '';
        FormModule._photoFiles = [];
        FormModule._removedPhotos = [];
      }
      this.toast('✓ Saved','success');
    } catch(err) { this.toast('Error: '+err.message,'error'); }

    this.state.saving = false;
    if (btn) { btn.textContent = 'Save'; }
  },

  // ── Filtre ───────────────────────────────────────────────────
  initFilterPanel() {
    const panel = document.getElementById('filter-panel');
    if (!panel) return;

    const csPills = [
      {v:'GOOD',l:'Good'},{v:'MEDIUM',l:'Fair'},{v:'BAD',l:'Poor'},
      {v:'RUIN',l:'Ruin'},{v:'NEW BUILDING',l:'New Building'},{v:'LOST',l:'Lost'},
      {v:'__empty__',l:'Unknown'}
    ];
    const utPills = [
      {v:'CONTINUOUS',l:'Continuous'},{v:'ABANDONED',l:'Abandoned'},
      {v:'SEASONAL',l:'Seasonal'},{v:'UNDER CONSTRUCTION',l:'Under Construction'},
      {v:'__empty__',l:'Unknown'}
    ];
    const cvPills = [
      {v:'listed',l:'Listed'},{v:'proposed',l:'Proposed'},
      {v:'not_listed',l:'Not Listed'},{v:'new_suitable',l:'New Suitable'},
      {v:'unsuitable',l:'Unsuitable'},{v:'lost_new',l:'Historic Lost'},
      {v:'empty',l:'Unknown'},{v:'other',l:'Other'}
    ];

    panel.querySelector('[data-group="cs"]').innerHTML =
      csPills.map(p=>`<button class="fpill" data-group="cs" data-val="${p.v}">${p.l}</button>`).join('');
    panel.querySelector('[data-group="ut"]').innerHTML =
      utPills.map(p=>`<button class="fpill" data-group="ut" data-val="${p.v}">${p.l}</button>`).join('');
    panel.querySelector('[data-group="cv"]').innerHTML =
      cvPills.map(p=>`<button class="fpill" data-group="cv" data-val="${p.v}">${p.l}</button>`).join('');

    panel.addEventListener('click', e => {
      const pill = e.target.closest('.fpill');
      if (!pill) return;
      pill.classList.toggle('active');
      const g = pill.dataset.group, v = pill.dataset.val;
      const key = g === 'cs' ? 'ConstructionStatus' : g === 'ut' ? 'UsageType' : 'cvCat';
      const arr = this.state.filterState[key];
      const idx = arr.indexOf(v);
      if (idx >= 0) arr.splice(idx,1); else arr.push(v);
      this.applyFilters();
    });

    document.getElementById('filter-clear')?.addEventListener('click', () => this.clearFilters());
    document.getElementById('filter-count').textContent = this.state.allIds.length + ' buildings';

    // Collapse toggle — moved out of inline onclick
    document.getElementById('filter-collapse')?.addEventListener('click', () => {
      const body = document.getElementById('filter-body');
      const btn  = document.getElementById('filter-collapse');
      if (!body || !btn) return;
      body.classList.toggle('collapsed');
      btn.textContent = body.classList.contains('collapsed') ? '▸' : '▾';
    });
  },

  applyFilters() {
    const fs = this.state.filterState;
    const hasFilter = fs.ConstructionStatus.length || fs.UsageType.length || fs.cvCat.length;

    this.state.activeFilterIds = hasFilter
      ? new Set(this.state.allIds.filter(id => this._passesFilter(id)))
      : null;

    MapModule.refreshDisplay(this.state.activeFilterIds);
    this.buildDropdown(document.getElementById('search').value);

    const count = this.state.activeFilterIds ? this.state.activeFilterIds.size : this.state.allIds.length;
    document.getElementById('filter-count').textContent = count + ' buildings';
    const clearBtn = document.getElementById('filter-clear');
    if (clearBtn) clearBtn.style.display = hasFilter ? '' : 'none';
  },

  clearFilters() {
    this.state.filterState = { ConstructionStatus:[], UsageType:[], cvCat:[] };
    document.querySelectorAll('.fpill.active').forEach(p => p.classList.remove('active'));
    this.applyFilters();
  },

  _passesFilter(id) {
    const fs  = this.state.filterState;
    const row  = this.state.csvIndex[id] || {};
    const feat = (this.state.geoIndex[id]||{}).properties || {};

    if (fs.ConstructionStatus.length) {
      const cs = String(row.ConstructionStatus || feat.ConstructionStatus || '');
      const knownCS = ['GOOD','MEDIUM','BAD','RUIN','NEW BUILDING','LOST'];
      const isEmptyCS = !cs || !knownCS.includes(cs);
      const matchCS = fs.ConstructionStatus.includes(cs) ||
                      (fs.ConstructionStatus.includes('__empty__') && isEmptyCS);
      if (!matchCS) return false;
    }
    if (fs.UsageType.length) {
      const ut = String(row.UsageType || feat.UsageType || '');
      const n  = ut.toUpperCase().startsWith('CONTINU') ? 'CONTINUOUS'
               : ut.toUpperCase().startsWith('ABANDON') ? 'ABANDONED'
               : ut.toUpperCase().startsWith('SEASON')  ? 'SEASONAL'
               : ut.toUpperCase().startsWith('UNDER')   ? 'UNDER CONSTRUCTION' : ut;
      const knownUT = ['CONTINUOUS','ABANDONED','SEASONAL','UNDER CONSTRUCTION'];
      const isEmptyUT = !ut || !knownUT.includes(n);
      const matchUT = fs.UsageType.includes(n) ||
                      (fs.UsageType.includes('__empty__') && isEmptyUT);
      if (!matchUT) return false;
    }
    if (fs.cvCat.length) {
      const cat = MapModule._cvCat(String(row.CulturalValue || ''));
      if (!fs.cvCat.includes(cat)) return false;
    }
    return true;
  },


  // ── İstatistik ───────────────────────────────────────────────
  // Shared editable field list — computed once, used by both methods below
  _editableFields() {
    return CONFIG.fields.filter(f => f.editable && f.type !== 'file' && f.type !== 'boolean');
  },

  completenessStatus(id) {
    const row = this.state.csvIndex[id]; if (!row) return 'empty';
    const editable = this._editableFields();
    if (!editable.length) return 'complete';
    const filled = editable.filter(f => this._isFilled(row[f.key])).length;
    if (filled === 0) return 'empty';
    if (filled === editable.length) return 'complete';
    return 'partial';
  },

  updateCompleteness(id) {
    const editable = this._editableFields();
    const row    = this.state.csvIndex[id] || {};
    const filled = editable.filter(f => this._isFilled(row[f.key])).length;
    const pct    = editable.length ? Math.round(filled / editable.length * 100) : 0;
    const status = this.completenessStatus(id);
    const color  = status === 'complete' ? 'var(--accent-2)'
                 : status === 'partial'  ? 'var(--amber)' : 'var(--rust)';
    const bar   = document.getElementById('comp-bar');
    const pctEl = document.getElementById('comp-pct');
    if (bar)   { bar.style.width = pct + '%'; bar.style.background = color; }
    if (pctEl)   pctEl.textContent = pct + '%';
  },

  refreshProgress() {
    const total    = this.state.allIds.length || 1;
    const editable = this._editableFields();
    const maxScore = total * (editable.length || 1);
    const counts = { complete:0, partial:0, empty:0 };
    let totalFilled = 0;
    for (const id of this.state.allIds) {
      counts[this.completenessStatus(id)]++;
      const row = this.state.csvIndex[id] || {};
      totalFilled += editable.filter(f => this._isFilled(row[f.key])).length;
    }
    const pct = Math.round(totalFilled/maxScore*100);
    document.getElementById('global-pct').textContent = pct+'%';
    ['complete','partial','empty'].forEach(k => {
      const el = document.getElementById('bar-'+k);
      if (el) el.style.width = (counts[k]/total*100)+'%';
    });
  },

  _isFilled(v) { return v!==undefined && v!==null && String(v).trim()!==''; },

  _emptyHTML() {
    return `<section class="card"><div class="empty-state">
      <div class="glyph">¶</div>
      <h3>No building selected</h3>
      <p>Select a building number above or click a building on the map.</p>
    </div></section>`;
  },

  toast(msg, type) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg;
    t.className = 'toast show'+(type?' '+type:'');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
  },
};

// ── Dropdown events ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('search');
  const dd     = document.getElementById('dropdown');
  const clrBtn = document.getElementById('clear-btn');

  search.addEventListener('focus', () => { App.buildDropdown(search.value); dd.classList.add('open'); });
  search.addEventListener('input', () => {
    App.buildDropdown(search.value); dd.classList.add('open');
    clrBtn.style.display = search.value ? '' : 'none';
  });
  clrBtn.addEventListener('click', () => { search.value=''; clrBtn.style.display='none'; App.buildDropdown(''); search.focus(); });
  document.addEventListener('click', e => { if(!e.target.closest('.picker-wrap')) dd.classList.remove('open'); });

  App.boot();
});