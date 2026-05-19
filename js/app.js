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
    catch(e) { this.toast('GeoJSON yüklenemedi: '+e.message,'error'); geoData={geojson:{type:'FeatureCollection',features:[]},index:{}}; }
    this.state.geoIndex = geoData.index;

    try {
      const csvData = await API.loadCSV();
      this.state.csvIndex = csvData.index;
      this.state.liveMode = !!CONFIG.appsScriptUrl;
    } catch(e) { this.toast('CSV yüklenemedi: '+e.message,'error'); }

    this.state.allIds = Object.keys(this.state.geoIndex).sort();
    document.getElementById('loaded-count').textContent =
      this.state.allIds.length + ' yapı · ' + Object.keys(this.state.csvIndex).length + ' Sheets kaydı';

    MapModule.setData(geoData.geojson, geoData.index, (id) => this.selectId(id));

    this.refreshProgress();
    this.buildDropdown('');
    this.initFilterPanel();

    const pill = document.getElementById('mode-pill');
    pill.classList.toggle('live', this.state.liveMode);
    document.getElementById('mode-text').textContent = CONFIG.appsScriptUrl ? 'Sheets bağlı' : 'Demo modu';

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
      return String(row.YapiNO ?? feat.YapiNO ?? id).toLowerCase().includes(ql)
          || ada.includes(q) || par.includes(q)
          || String(row.Adres ?? '').toLowerCase().includes(ql);
    });

    if (!matches.length) {
      dd.innerHTML = '<div class="dd-empty">Eşleşen kayıt yok</div>'; return;
    }

    dd.innerHTML = matches.slice(0,60).map(id => {
      const row  = this.state.csvIndex[id] || {};
      const feat = (this.state.geoIndex[id]||{}).properties || {};
      const ada  = row.AdaNO ?? feat.AdaNO ?? '—';
      const par  = row.ParselNO ?? feat.ParselNO ?? '—';
      const status = this.completenessStatus(id);
      return `<div class="dd-opt" data-id="${id}">
        <span class="pip pip-${status}"></span>
        <span class="dd-id">${id}</span>
        <span class="dd-meta">Ada ${ada} / P ${par}</span>
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
    search.value = id;
    document.getElementById('clear-btn').style.display = '';
    document.getElementById('dropdown').classList.remove('open');

    const attrs = this.state.csvIndex[id] || { [CONFIG.idField]: id };

    // Harita başlığını güncelle
    const recTitle = document.getElementById('rec-title');
    const recId    = document.getElementById('rec-id');
    const mapHint  = document.getElementById('map-hint');
    const mapMeta  = document.getElementById('map-meta');
    if (recTitle) recTitle.textContent = attrs.Adres || id;
    if (recId)    recId.textContent    = id;
    if (mapHint)  mapHint.innerHTML =
      `<span class="meta-badge">Ada <strong>${attrs.AdaNO||'—'}</strong></span>` +
      `<span class="meta-badge">Parsel <strong>${attrs.ParselNO||'—'}</strong></span>`;
    if (mapMeta)  mapMeta.style.visibility = 'visible';

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
    return `
      <section class="card">
        <div class="card-head">
          <h2>Bilgileri düzenle</h2>
          <p class="hint mono">${id}</p>
        </div>
      </section>
      <div id="form-area"></div>`;
  },

  _updateRecordHeader(id) {
    const t = document.getElementById('rec-title'), i = document.getElementById('rec-id');
    if (t) t.textContent = id; if (i) i.textContent = id;
  },

  _bindFormButtons() {
    document.getElementById('btn-save')?.addEventListener('click', () => this.save());
    document.getElementById('btn-cancel')?.addEventListener('click', () => this.clearSelection());
  },

  clearSelection() {
    this.state.selectedId = null;
    document.getElementById('search').value = '';
    document.getElementById('clear-btn').style.display = 'none';
    document.getElementById('record-view').innerHTML = this._emptyHTML();
    // Harita meta'yı gizle, başlığı sıfırla
    const recTitle = document.getElementById('rec-title');
    const mapMeta  = document.getElementById('map-meta');
    const mapHint  = document.getElementById('map-hint');
    if (recTitle) recTitle.textContent = 'Ayvalık Yapı Envanteri';
    if (mapMeta)  mapMeta.style.visibility = 'hidden';
    if (mapHint)  mapHint.textContent  = 'Bir yapıya tıklayarak seçin, bilgiler aşağıda açılır.';
  },

  // ── Kaydet ───────────────────────────────────────────────────
  async save() {
    if (this.state.saving) return;
    const id = this.state.selectedId; if (!id) return;
    const formArea = document.getElementById('form-area');
    const fields = FormModule.collect(formArea);
    const photoFile = FormModule.getPhotoFile();

    this.state.saving = true;
    const btn = document.getElementById('btn-save');
    if (btn) { btn.disabled=true; btn.textContent='Kaydediliyor…'; }

    try {
      const result = await API.save(id, fields, photoFile);
      if (!result.ok) throw new Error(result.error||'Bilinmeyen hata');
      this.state.csvIndex[id] = { ...(this.state.csvIndex[id]||{}), ...fields, [CONFIG.idField]:id };
      if (fields.Photo) this.state.csvIndex[id].Photo = fields.Photo;
      this.refreshProgress(); this.buildDropdown(document.getElementById('search').value);
      this.updateCompleteness(id);
      FormModule.render(document.getElementById('form-area'), this.state.csvIndex[id]);
      this._bindFormButtons();
      this.toast(result.demo ? '✓ Demo: yerel güncellendi' : '✓ Sheets güncellendi','success');
    } catch(err) { this.toast('Hata: '+err.message,'error'); }

    this.state.saving = false;
    if (btn) { btn.disabled=false; btn.textContent='Kaydet'; }
  },

  // ── Filtre ───────────────────────────────────────────────────
  initFilterPanel() {
    const panel = document.getElementById('filter-panel');
    if (!panel) return;

    const csPills = [
      {v:'GOOD',l:'İyi'},{v:'MEDIUM',l:'Orta'},{v:'BAD',l:'Kötü'},
      {v:'RUIN',l:'Harabe'},{v:'NEW BUILDING',l:'Yeni Yapı'},{v:'LOST',l:'Kayıp'},
      {v:'__empty__',l:'Belirsiz'}
    ];
    const utPills = [
      {v:'CONTINUOUS',l:'Süregelen'},{v:'ABANDONED',l:'Terk Edilmiş'},
      {v:'SEASONAL',l:'Mevsimlik'},{v:'UNDER CONSTRUCTION',l:'İnşaat'},
      {v:'__empty__',l:'Belirsiz'}
    ];
    const cvPills = [
      {v:'listed',l:'Tescilli'},{v:'proposed',l:'Tescil Önerisi'},
      {v:'not_listed',l:'Tescilsiz'},{v:'new_suitable',l:'Yeni Uygun'},
      {v:'unsuitable',l:'Yeni Uygun Değil'},{v:'lost_new',l:'Tarihi Kayıp'},
      {v:'empty',l:'Belirsiz'},{v:'other',l:'Diğer'}
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
    document.getElementById('filter-count').textContent = this.state.allIds.length + ' yapı';
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
    document.getElementById('filter-count').textContent = count + ' yapı';
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
  completenessStatus(id) {
    const row = this.state.csvIndex[id]; if (!row) return 'empty';
    const editable = CONFIG.fields.filter(f => f.editable && f.type!=='file' && f.type!=='boolean');
    if (!editable.length) return 'complete';
    const filled = editable.filter(f => this._isFilled(row[f.key])).length;
    if (filled === 0) return 'empty';
    if (filled === editable.length) return 'complete';
    return 'partial';
  },

  updateCompleteness(id) {
    const row = this.state.csvIndex[id] || {};
    const editable = CONFIG.fields.filter(f => f.editable && f.type!=='file' && f.type!=='boolean');
    const filled = editable.filter(f => this._isFilled(row[f.key])).length;
    const pct = editable.length ? Math.round(filled/editable.length*100) : 0;
    const status = this.completenessStatus(id);
    const color = status==='complete'?'var(--accent-2)':status==='partial'?'var(--amber)':'var(--rust)';
    const bar = document.getElementById('comp-bar'), pctEl = document.getElementById('comp-pct');
    if (bar) { bar.style.width=pct+'%'; bar.style.background=color; }
    if (pctEl) pctEl.textContent = pct+'%';
  },

  refreshProgress() {
    const total = this.state.allIds.length || 1;
    const editable = CONFIG.fields.filter(f => f.editable && f.type!=='file' && f.type!=='boolean');
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
      <h3>Henüz yapı seçilmedi</h3>
      <p>Yukarıdan bir Yapı No seçin veya haritada bir yapıya tıklayın.</p>
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