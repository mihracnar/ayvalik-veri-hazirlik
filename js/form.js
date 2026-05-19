// ═══════════════════════════════════════════════════════════════
//  form.js — form render, orijinal değer takibi, değişen alanları topla
// ═══════════════════════════════════════════════════════════════

const FormModule = {
  _photoFile:     null,
  _originalAttrs: {},  // render anındaki değerler — collect'te karşılaştırılır

  render(container, attrs) {
    this._photoFile     = null;
    this._originalAttrs = { ...attrs };

    const groups = {};
    for (const f of CONFIG.fields) {
      const g = f.group || 'Diğer';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    }

    container.innerHTML = Object.keys(groups).map(gName => `
      <section class="card">
        <div class="card-head"><h2>${gName}</h2></div>
        <div class="card-body">
          ${groups[gName].map(f => this._renderField(f, attrs[f.key])).join('')}
        </div>
      </section>
    `).join('') + `
      <div class="savebar" id="savebar">
        <span class="status">
          ${CONFIG.appsScriptUrl ? '<b>Sheets</b>\'e yazılacak' : '<b>Demo modu</b> — sadece bellek'}
        </span>
        <button type="button" class="btn-secondary" id="btn-cancel">Vazgeç</button>
        <button type="button" class="btn-primary"   id="btn-save">Kaydet</button>
      </div>
    `;

    const photoInput = document.getElementById('photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        this._photoFile = file;
        this._updatePhotoPreview(file);
        // Silme butonunu göster
        const clearBtn = document.getElementById('btn-photo-clear');
        if (!clearBtn) {
          const actions = document.querySelector('.photo-actions');
          if (actions) {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'btn-photo-clear';
            btn.id = 'btn-photo-clear'; btn.title = 'Görseli sil'; btn.textContent = '×';
            actions.appendChild(btn);
            btn.addEventListener('click', () => this._clearPhoto());
          }
        }
      });
    }
    const clearBtn = document.getElementById('btn-photo-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => this._clearPhoto());
  },

  _renderField(field, rawValue) {
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);

    // Salt-okunur
    if (!field.editable) {
      return `<div class="field field-readonly">
        <span class="field-label">${field.label}</span>
        <span class="field-value readonly-val ${!value ? 'empty-val' : ''}">${value || '—'}</span>
      </div>`;
    }

    // Fotoğraf
    if (field.type === 'file') {
      // https:// URL'lerde img göster (Drive vb.) — lokal yolları sadece metin olarak göster
      const isUrl = value && /^https?:\/\//.test(value);
      const previewHTML = !value
        ? `<span class="preview-placeholder">Fotoğraf seçilmedi</span>`
        : isUrl
          ? `<img src="${this._esc(value)}" alt="fotoğraf"
                 style="max-width:100%;max-height:260px;object-fit:contain;display:block"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
             <span class="preview-placeholder" style="display:none">📎 Yüklenemedi: ${this._esc(value)}</span>`
          : `<span class="preview-placeholder">📎 ${this._esc(value)}</span>`;
      return `<div class="field field-file">
        <span class="field-label">${field.label}</span>
        <div class="photo-area">
          <div class="photo-preview" id="photo-preview">
            ${previewHTML}
          </div>
          <div class="photo-actions">
            <label class="btn-file-pick">
              Dosya seç
              <input type="file" id="photo-input" accept="image/*,application/pdf" style="display:none">
            </label>
            <span class="photo-filename" id="photo-filename">${value || ''}</span>
            ${value ? `<button type="button" class="btn-photo-clear" id="btn-photo-clear" title="Görseli sil">×</button>` : ''}
          </div>
          <input type="hidden" name="${this._esc(field.key)}" id="photo-hidden" value="${this._esc(value)}">
        </div>
      </div>`;
    }

    // Boolean toggle
    if (field.type === 'boolean') {
      const checked = this._isTruthy(value);
      return `<div class="field field-bool">
        <label class="toggle-row">
          <span class="field-label">${field.label}</span>
          <span class="toggle">
            <input type="checkbox" name="${this._esc(field.key)}" ${checked ? 'checked' : ''}>
            <span class="track"></span>
          </span>
        </label>
      </div>`;
    }

    // Select
    if (field.type === 'select') {
      return `<div class="field">
        <label class="field-label">${field.label}</label>
        <select name="${this._esc(field.key)}">
          ${(field.options || []).map(o =>
            `<option value="${this._esc(o)}" ${o === value ? 'selected' : ''}>${o || '—'}</option>`
          ).join('')}
        </select>
      </div>`;
    }

    // Textarea
    if (field.type === 'textarea') {
      return `<div class="field">
        <label class="field-label">${field.label}</label>
        <textarea name="${this._esc(field.key)}">${this._esc(value)}</textarea>
      </div>`;
    }

    // Text / number / date
    return `<div class="field">
      <label class="field-label">${field.label}</label>
      <input type="${field.type === 'number' ? 'number' : 'text'}"
             name="${this._esc(field.key)}"
             value="${this._esc(value)}">
    </div>`;
  },

  _updatePhotoPreview(file) {
    const preview = document.getElementById('photo-preview');
    const hidden  = document.getElementById('photo-hidden');
    const fname   = document.getElementById('photo-filename');
    if (!preview) return;
    const path = CONFIG.photoFolder + file.name;
    if (hidden) hidden.value = path;
    if (fname)  fname.textContent = file.name;
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="${this._esc(file.name)}">`;
    } else {
      preview.innerHTML = `<span class="preview-placeholder">📎 ${this._esc(file.name)}</span>`;
    }
  },

  // Sadece değişen alanları döndür
  collect(formEl) {
    const data = {};

    for (const f of CONFIG.fields) {
      if (!f.editable) continue;

      const original = String(this._originalAttrs[f.key] ?? '');

      // Fotoğraf
      if (f.type === 'file') {
        const h = formEl.querySelector('#photo-hidden');
        const current = h ? h.value : '';
        if (current !== original) data[f.key] = current;
        continue;
      }

      // Boolean — sadece değiştiyse yaz; boştan false'a gitmişse yazma
      if (f.type === 'boolean') {
        const el = formEl.querySelector(`[name="${f.key}"]`);
        if (!el) continue;
        const origBool = this._isTruthy(original);
        const curBool  = el.checked;
        if (curBool === origBool) continue;          // değişmedi
        if (!original && !curBool) continue;         // boştu, işaretlenmedi → yine boş
        data[f.key] = curBool ? 'TRUE' : '';         // işaretlendi=TRUE, kaldırıldı=boş
        continue;
      }

      // Text / select / textarea
      const el = formEl.querySelector(`[name="${f.key}"]`);
      if (!el) continue;
      const current = el.value;
      if (current !== original) data[f.key] = current;
    }

    return data;
  },

  getPhotoFile() { return this._photoFile; },

  _clearPhoto() {
    this._photoFile = null;
    // Preview temizle
    const preview = document.getElementById('photo-preview');
    if (preview) preview.innerHTML = '<span class="preview-placeholder">Fotoğraf seçilmedi</span>';
    // Hidden input temizle
    const hidden = document.getElementById('photo-hidden');
    if (hidden) hidden.value = '';
    // Filename temizle
    const fname = document.getElementById('photo-filename');
    if (fname) fname.textContent = '';
    // File input sıfırla
    const input = document.getElementById('photo-input');
    if (input) input.value = '';
    // Silme butonunu gizle
    const btn = document.getElementById('btn-photo-clear');
    if (btn) btn.remove();
  },

  _isFilled(v) { return v !== undefined && v !== null && String(v).trim() !== ''; },
  _isTruthy(v) { return ['true', '1', 'yes', 'evet', 'TRUE'].includes(String(v).trim()); },
  _esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};