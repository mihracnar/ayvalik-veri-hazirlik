// ═══════════════════════════════════════════════════════════════
//  app.js — Ana uygulama koordinatörü
// ═══════════════════════════════════════════════════════════════

const App = {
  state: {
    csvIndex: {},
    geoIndex: {},
    allIds:   [],
    selectedId: null,
    saving: false,
    liveMode: false,
  },

  async boot() {
    // 1) GeoJSON
    let geoData;
    try {
      geoData = await API.loadGeoJSON();
    } catch (e) {
      this.toast('GeoJSON yüklenemedi: ' + e.message, 'error');
      geoData = { geojson: { type:'FeatureCollection', features:[] }, index: {} };
    }
    this.state.geoIndex = geoData.index;

    // 2) CSV
    try {
      const csvData = await API.loadCSV();
      this.state.csvIndex = csvData.index;
      this.state.liveMode = !!CONFIG.appsScriptUrl;
    } catch (e) {
      this.toast('CSV yüklenemedi: ' + e.message, 'error');
    }

    // 3) ID listesi
    this.state.allIds = Object.keys(this.state.geoIndex).sort();

    document.getElementById('loaded-count').textContent =
      this.state.allIds.length + ' yapı · ' +
      Object.keys(this.state.csvIndex).length + ' Sheets kaydı';

    // 4) Harita verisini sakla (DOM'a bağlama henüz yapma)
    MapModule.setData(geoData.geojson, geoData.index, (id) => this.selectId(id));

    // 5) UI
    this.refreshProgress();
    this.buildDropdown('');

    const pill = document.getElementById('mode-pill');
    pill.classList.toggle('live', this.state.liveMode);
    document.getElementById('mode-text').textContent =
      CONFIG.appsScriptUrl ? 'Sheets bağlı' : 'Demo modu';
  },

  // ── Dropdown ─────────────────────────────────────────────────
  buildDropdown(query) {
    const dd = document.getElementById('dropdown');
    const q  = query.trim();
    const ql = q.toLowerCase();

    // "14/05", "14-05", "14 05" → Ada=14 Parsel=05
    const adaParsel = q.match(/^(\d+)\s*[\/\-\s]\s*(\d+)$/) ||
                      q.match(/^ada\s*(\d+)\s*[\/\-\s]?\s*p(?:arsel)?\s*(\d+)$/i);
    const norm = s => String(s || '').replace(/^0+/, '').trim();

    const matches = this.state.allIds.filter(id => {
      if (!q) return true;
      const row  = this.state.csvIndex[id] || {};
      const feat = (this.state.geoIndex[id] || {}).properties || {};

      // Ortak alanlar (CSV öncelikli, yoksa GeoJSON'dan)
      const ada    = String(row.AdaNO    ?? feat.AdaNO    ?? '');
      const parsel = String(row.ParselNO ?? feat.ParselNO ?? '');
      const yapiNo = String(row.YapiNO   ?? feat.YapiNO   ?? id);
      const adres  = String(row.Adres    ?? '').toLowerCase();

      // 1) Ada/Parsel kombinasyonu: "14/05" veya "14-05"
      if (adaParsel) {
        return norm(ada) === norm(adaParsel[1]) && norm(parsel) === norm(adaParsel[2]);
      }

      // 2) Sadece Ada no: "14" → tüm Ada 14 yapıları
      if (/^\d+$/.test(q) && norm(ada) === norm(q)) return true;

      // 3) Genel metin eşleşmesi
      return yapiNo.toLowerCase().includes(ql)
          || ada.includes(q)
          || parsel.includes(q)
          || adres.includes(ql);
    });

    if (!matches.length) {
      dd.innerHTML = '<div class="dd-empty">Eşleşen kayıt yok — Ada no, "14/05" veya Yapı No deneyin</div>';
      return;
    }
    dd.innerHTML = matches.slice(0, 60).map(id => {
      const row  = this.state.csvIndex[id] || {};
      const feat = (this.state.geoIndex[id] || {}).properties || {};
      const ada    = row.AdaNO    ?? feat.AdaNO    ?? '—';
      const parsel = row.ParselNO ?? feat.ParselNO ?? '—';
      const status = this.completenessStatus(id);
      return `<div class="dd-opt" data-id="${id}">
        <span class="pip pip-${status}"></span>
        <span class="dd-id">${id}</span>
        <span class="dd-meta">Ada ${ada} / P ${parsel}</span>
      </div>`;
    }).join('');
    dd.querySelectorAll('.dd-opt').forEach(el =>
      el.addEventListener('click', () => this.selectId(el.dataset.id))
    );
  },

    // ── Seçim ────────────────────────────────────────────────────
  selectId(id) {
    this.state.selectedId = id;
    const search = document.getElementById('search');
    search.value = id;
    document.getElementById('clear-btn').style.display = '';
    document.getElementById('dropdown').classList.remove('open');

    const attrs      = this.state.csvIndex[id] || { [CONFIG.idField]: id };
    const recordArea = document.getElementById('record-view');
    const mapExists  = !!document.getElementById('map');

    if (!mapExists) {
      // İlk seçim: HTML'yi kur, haritayı mount et
      recordArea.innerHTML = this._recordShellHTML(id);
      requestAnimationFrame(() => MapModule.mount());
    } else {
      // Sonraki seçimler: sadece başlık + harita güncelle, form yeniden çiz
      this._updateRecordHeader(id);
      MapModule.flyTo(id);
    }

    // Form alanını çiz
    const formArea = document.getElementById('form-area');
    if (formArea) {
      FormModule.render(formArea, attrs);
      this._bindFormButtons();
    }

    this.updateCompleteness(id);
    document.querySelector('#record-view .card')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _recordShellHTML(id) {
    return `
      <section class="card">
        <div class="card-head">
          <div class="eyebrow">Adım 2 · Konum</div>
          <h2 id="rec-title">${id}</h2>
          <p class="hint">Haritadaki komşu yapılara tıklayarak hızla geçiş yapabilirsiniz.</p>
        </div>
        <div id="map" class="mini-map"></div>
        <div class="map-meta">
          <span class="mono" id="rec-id">${id}</span>
          <span class="completion-row">
            <span class="bar-wrap"><span id="comp-bar"></span></span>
            <span class="comp-pct" id="comp-pct">—</span>
          </span>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="eyebrow">Adım 3 · Öznitelikler</div>
          <h2>Bilgileri düzenle</h2>
          
        </div>
      </section>

      <div id="form-area"></div>
    `;
  },

  _updateRecordHeader(id) {
    const t = document.getElementById('rec-title');
    const i = document.getElementById('rec-id');
    if (t) t.textContent = id;
    if (i) i.textContent = id;
  },

  _bindFormButtons() {
    document.getElementById('btn-save')
      ?.addEventListener('click', () => this.save());
    document.getElementById('btn-cancel')
      ?.addEventListener('click', () => this.clearSelection());
  },

  clearSelection() {
    this.state.selectedId = null;
    document.getElementById('search').value = '';
    document.getElementById('clear-btn').style.display = 'none';
    document.getElementById('record-view').innerHTML = this._emptyHTML();
  },

  // ── Kaydet ───────────────────────────────────────────────────
  async save() {
    if (this.state.saving) return;
    const id = this.state.selectedId;
    if (!id) return;

    const formArea  = document.getElementById('form-area');
    const fields    = FormModule.collect(formArea);
    const photoFile = FormModule.getPhotoFile();

    this.state.saving = true;
    const btn = document.getElementById('btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor…'; }

    try {
      const result = await API.save(id, fields, photoFile);
      if (!result.ok) throw new Error(result.error || 'Bilinmeyen hata');

      this.state.csvIndex[id] = {
        ...(this.state.csvIndex[id] || {}),
        ...fields,
        [CONFIG.idField]: id
      };
      if (fields.Photo) this.state.csvIndex[id].Photo = fields.Photo;

      this.refreshProgress();
      this.buildDropdown(document.getElementById('search').value);
      this.updateCompleteness(id);

      // Formu yenile (eksik etiketleri güncelle)
      FormModule.render(document.getElementById('form-area'), this.state.csvIndex[id]);
      this._bindFormButtons();

      this.toast(result.demo ? '✓ Demo: yerel güncellendi' : '✓ Sheets güncellendi', 'success');
    } catch (err) {
      console.error(err);
      this.toast('Hata: ' + err.message, 'error');
    }

    this.state.saving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
  },

  // ── İstatistik ───────────────────────────────────────────────
  completenessStatus(id) {
    const row = this.state.csvIndex[id];
    if (!row) return 'empty';
    const editable = CONFIG.fields.filter(f => f.editable && f.type !== 'file' && f.type !== 'boolean');
    if (!editable.length) return 'complete';
    const filled = editable.filter(f => this._isFilled(row[f.key])).length;
    if (filled === 0) return 'empty';
    if (filled === editable.length) return 'complete';
    return 'partial';
  },

  updateCompleteness(id) {
    const row      = this.state.csvIndex[id] || {};
    const editable = CONFIG.fields.filter(f => f.editable && f.type !== 'file' && f.type !== 'boolean');
    const filled   = editable.filter(f => this._isFilled(row[f.key])).length;
    const pct      = editable.length ? Math.round(filled / editable.length * 100) : 0;
    const status = this.completenessStatus(id);
    const color  = status === 'complete' ? 'var(--accent-2)' : status === 'partial' ? 'var(--amber)' : 'var(--rust)';
    const bar    = document.getElementById('comp-bar');
    const pctEl  = document.getElementById('comp-pct');
    if (bar)   { bar.style.width = pct + '%'; bar.style.background = color; }
    if (pctEl) pctEl.textContent = pct + '%';
  },

  refreshProgress() {
    const total    = this.state.allIds.length || 1;
    const editable = CONFIG.fields.filter(f => f.editable && f.type !== 'file' && f.type !== 'boolean');
    const maxScore = total * (editable.length || 1);
    const counts   = { complete: 0, partial: 0, empty: 0 };
    let totalFilled = 0;

    for (const id of this.state.allIds) {
      const status = this.completenessStatus(id);
      counts[status]++;
      const row = this.state.csvIndex[id] || {};
      totalFilled += editable.filter(f => this._isFilled(row[f.key])).length;
    }

    // Ortalama alan doluluk yüzdesi (tüm yapı × tüm alan üzerinden)
    const pct = Math.round(totalFilled / maxScore * 100);
    document.getElementById('global-pct').textContent = pct + '%';
    ['complete','partial','empty'].forEach(k => {
      const el = document.getElementById('bar-' + k);
      if (el) el.style.width = (counts[k] / total * 100) + '%';
    });
  },

  _isFilled(v) { return v !== undefined && v !== null && String(v).trim() !== ''; },

  _emptyHTML() {
    return `<section class="card"><div class="empty-state">
      <div class="glyph">¶</div>
      <h3>Henüz yapı seçilmedi</h3>
      <p>Yukarıdan bir Yapı No seçin. Harita o parsele odaklanacak, Sheets'teki öznitelikler formda açılacak.</p>
    </div></section>`;
  },

  toast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  },
};

// ── Dropdown event binding ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const search   = document.getElementById('search');
  const dd       = document.getElementById('dropdown');
  const clearBtn = document.getElementById('clear-btn');

  search.addEventListener('focus', () => {
    App.buildDropdown(search.value);
    dd.classList.add('open');
  });
  search.addEventListener('input', () => {
    App.buildDropdown(search.value);
    dd.classList.add('open');
    clearBtn.style.display = search.value ? '' : 'none';
  });
  clearBtn.addEventListener('click', () => {
    search.value = '';
    clearBtn.style.display = 'none';
    App.buildDropdown('');
    search.focus();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.picker-wrap')) dd.classList.remove('open');
  });

  App.boot();
});