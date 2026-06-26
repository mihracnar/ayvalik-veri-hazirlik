// ═══════════════════════════════════════════════════════════════
//  form.js — form render, original value tracking, changed field collection
// ═══════════════════════════════════════════════════════════════

const FormModule = {
  _photoFiles:    [],   // bu render'da seçilen yeni File nesneleri (henüz yüklenmedi)
  _removedPhotos: [],   // mevcut (zaten kaydedilmiş) dosya adlarından çıkarılanlar
  _originalAttrs: {},
  _msListenerBound: false,

  // ── Render ───────────────────────────────────────────────────
  render(container, attrs) {
    this._photoFiles    = [];
    this._removedPhotos = [];
    this._originalAttrs = { ...attrs };

    const groups = {};
    for (const f of CONFIG.fields) {
      const g = f.group || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    }

    container.innerHTML = Object.keys(groups).map(gName => `
      <section class="card">
        <div class="card-head"><h2>${gName}</h2></div>
        <div class="card-body">
          ${groups[gName].map(f => this._renderField(f, attrs[f.key], attrs)).join('')}
        </div>
      </section>
    `).join('') + `
      <div class="savebar" id="savebar">
        <span class="status">
        <span class="status">Will write to <b>Google Sheets</b></span>
        </span>
        <button type="button" class="btn-secondary" id="btn-cancel">Cancel</button>
        <button type="button" class="btn-primary"   id="btn-save">Save</button>
      </div>
    `;

    this._bindPhotoListeners();
    this._bindFloorNumberListeners();
    this._bindChangesGroupListeners();
    // Multiselect click listener'ı SADECE bir kere bağla — her render'da
    // tekrar bağlanırsa tıklamalar birikip pill seçimini rastgele bozuyordu.
    if (!this._msListenerBound) {
      this._bindMultiselectListeners();
      this._msListenerBound = true;
    }
  },

  // ── Field renderer ───────────────────────────────────────────
  _renderField(field, rawValue, allAttrs) {
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    const e = this._esc;

    if (!field.editable) {
      return `<div class="field field-readonly">
        <span class="field-label">${field.label}</span>
        <span class="field-value readonly-val ${!value ? 'empty-val' : ''}">${value || '—'}</span>
      </div>`;
    }

    if (field.type === 'changesGroup') {
      const otherKey = field.otherKey;
      const otherVal = String((allAttrs && allAttrs[otherKey]) ?? '');
      const rawParts = otherVal ? otherVal.split(',').map(v => v.trim()).filter(Boolean) : [];
      const otherTokens = new Set(rawParts.map(v => v.toUpperCase()));
      const knownTokens = new Set((field.items || []).filter(it => it.token).map(it => it.token));
      // Implementation_2 içindeki, listede tanınmayan ilk değeri "Other" serbest metni say
      // (orijinal harf büyüklüğü korunur)
      const freeOther = rawParts.find(v => !knownTokens.has(v.toUpperCase())) || '';

      const rows = (field.items || []).map(it => {
        let checked = false;
        if (it.boolKey) {
          checked = this._isTruthy(String((allAttrs && allAttrs[it.boolKey]) ?? ''));
        } else if (it.token === 'OTHER') {
          checked = otherTokens.has('OTHER') || !!freeOther;
        } else if (it.token) {
          checked = otherTokens.has(it.token);
        }
        return `<label class="toggle-row changes-row">
          <span class="field-label">${e(it.label)}</span>
          <span class="toggle">
            <input type="checkbox" class="changes-check"
                   ${it.boolKey ? `data-bool-key="${e(it.boolKey)}"` : `data-token="${e(it.token)}"`}
                   ${it.hasOther ? 'data-has-other="1"' : ''}
                   ${checked ? 'checked' : ''}>
            <span class="track"></span>
          </span>
        </label>${it.hasOther ? `
        <input type="text" class="changes-other-input" placeholder="Specify other…"
               value="${e(freeOther)}"
               style="display:${(otherTokens.has('OTHER') || freeOther) ? 'block' : 'none'}">` : ''}`;
      }).join('');

      return `<div class="field field-changesgroup" data-other-key="${e(otherKey)}">
        ${rows}
        ${(field.items || []).filter(it => it.boolKey).map(it =>
          `<input type="hidden" name="${e(it.boolKey)}" value="${this._isTruthy(String((allAttrs && allAttrs[it.boolKey]) ?? '')) ? 'TRUE' : ''}">`
        ).join('')}
        <input type="hidden" name="${e(otherKey)}" value="${e(otherVal)}">
      </div>`;
    }

    if (field.type === 'floorNumber') {
      // Mevcut değeri parçala: baştaki sayıyı ve bilinen token'ları ayıkla
      const tokens = value ? value.split('+').map(v => v.trim()).filter(Boolean) : [];
      const knownTokens = new Set((field.floorOptions || []).map(o => o.token));
      const numPart = tokens.find(t => /^\d+$/.test(t)) || '';
      const activeTokens = new Set(tokens.filter(t => knownTokens.has(t.toUpperCase())).map(t => t.toUpperCase()));

      return `<div class="field field-floornumber" data-key="${e(field.key)}">
        <span class="field-label">${field.label}</span>
        <div class="floor-builder">
          <input type="number" min="0" class="floor-num-input" placeholder="#"
                 value="${e(numPart)}" style="width:70px">
          <div class="floor-checks">
            ${(field.floorOptions || []).map(o => `
              <label class="floor-check-opt">
                <input type="checkbox" class="floor-check" data-token="${e(o.token)}"
                       ${activeTokens.has(o.token) ? 'checked' : ''}>
                ${e(o.label)}
              </label>`).join('')}
          </div>
        </div>
        <input type="text" class="floor-text-input" name="${e(field.key)}"
               value="${e(value)}"
               ${field.placeholder ? `placeholder="${e(field.placeholder)}"` : ''}>
      </div>`;
    }

    if (field.type === 'file') {
      // value: "142356.jpg, 142357.jpg" gibi virgüllü dosya adı listesi
      // (eski kayıtlarda salt sayısal Drive-ID de olabilir, o da bir "isim" gibi ele alınır)
      const names = value ? value.split(',').map(v => v.trim()).filter(Boolean) : [];
      return `<div class="field field-file">
        <span class="field-label">${field.label}</span>
        <div class="photo-area">
          <div class="photo-grid" id="photo-grid" data-original="${e(value)}">
            ${names.map(n => this._photoThumbHTML(n)).join('')}
          </div>
          <div class="photo-actions">
            <label class="btn-file-pick">
              Add photo
              <input type="file" id="photo-input" accept="image/*,application/pdf" multiple style="display:none">
            </label>
          </div>
          <input type="hidden" name="${e(field.key)}" id="photo-hidden" value="${e(value)}">
        </div>
      </div>`;
    }

    if (field.type === 'boolean') {
      const checked = this._isTruthy(value);
      return `<div class="field field-bool">
        <label class="toggle-row">
          <span class="field-label">${field.label}</span>
          <span class="toggle">
            <input type="checkbox" name="${e(field.key)}" ${checked ? 'checked' : ''}>
            <span class="track"></span>
          </span>
        </label>
      </div>`;
    }

    if (field.type === 'multiselect') {
      const selected = new Set(
        value ? value.split(',').map(v => v.trim()).filter(Boolean) : []
      );
      const e = this._esc;
      const opts = (field.options || []).filter(o => o !== '');
      return `<div class="field field-multiselect">
        <span class="field-label">${field.label}</span>
        <div class="ms-selected" id="ms-sel-${e(field.key)}">
          ${[...selected].map(v =>
            `<span class="ms-tag" data-val="${e(v)}">${e(v)} <button type="button" class="ms-remove" data-key="${e(field.key)}" data-val="${e(v)}">×</button></span>`
          ).join('')}
        </div>
        <div class="ms-options">
          ${opts.map(o => `<button type="button"
            class="ms-opt${selected.has(o) ? ' ms-opt-on' : ''}"
            data-key="${e(field.key)}"
            data-val="${e(o)}">${e(o)}</button>`).join('')}
        </div>
        <input type="hidden" name="${e(field.key)}" value="${e([...selected].join(', '))}">
        ${opts.includes('OTHER') ? `<input type="text"
          class="other-input ms-other-input"
          name="${e(field.key)}__other"
          placeholder="Specify other…"
          value="${e([...selected].find(v => !opts.includes(v)) || '')}"
          style="display:${[...selected].some(v => v === 'OTHER') ? 'block' : 'none'}">` : ''}
      </div>`;
    }

    if (field.type === 'select') {
      const hasOther   = (field.options || []).includes('OTHER');
      const isOther    = hasOther && value && !field.options.includes(value);
      const selectVal  = isOther ? 'OTHER' : value;
      const otherVal   = isOther ? value : '';
      return `<div class="field field-select-wrap">
        <label class="field-label">${field.label}</label>
        <select name="${e(field.key)}"
                data-has-other="${hasOther}"
                onchange="FormModule._onSelectChange(this)">
          ${(field.options || []).map(o =>
            `<option value="${e(o)}" ${o === selectVal ? 'selected' : ''}>${o || '—'}</option>`
          ).join('')}
        </select>
        ${hasOther ? `<input type="text"
                             class="other-input"
                             name="${e(field.key)}__other"
                             placeholder="Specify…"
                             value="${e(otherVal)}"
                             style="display:${isOther ? 'block' : 'none'}">` : ''}
      </div>`;
    }

    if (field.type === 'textarea') {
      return `<div class="field">
        <label class="field-label">${field.label}</label>
        <textarea name="${e(field.key)}">${e(value)}</textarea>
      </div>`;
    }

    // text / number / date
    return `<div class="field">
      <label class="field-label">${field.label}</label>
      <input type="${field.type === 'number' ? 'number' : 'text'}"
             name="${e(field.key)}"
             value="${e(value)}"
             ${field.placeholder ? `placeholder="${e(field.placeholder)}"` : ''}>
    </div>`;
  },

  // ── Collect changed fields only ──────────────────────────────
  collect(formEl) {
    const data = {};

    for (const f of CONFIG.fields) {
      if (!f.editable) continue;
      const original = String(this._originalAttrs[f.key] ?? '');

      if (f.type === 'changesGroup') {
        // boolean alt-sütunlar
        (f.items || []).filter(it => it.boolKey).forEach(it => {
          const h = formEl.querySelector(`input[type="hidden"][name="${it.boolKey}"]`);
          if (!h) return;
          const orig = String(this._originalAttrs[it.boolKey] ?? '');
          const origBool = this._isTruthy(orig);
          const curBool  = this._isTruthy(h.value);
          if (curBool === origBool) return;
          if (!orig && !curBool) return;
          data[it.boolKey] = curBool ? 'TRUE' : '';
        });
        // Implementation_2 (otherKey)
        const otherKey = f.otherKey;
        const oh = formEl.querySelector(`input[type="hidden"][name="${otherKey}"]`);
        if (oh) {
          const origOther = String(this._originalAttrs[otherKey] ?? '');
          if (oh.value !== origOther) data[otherKey] = oh.value;
        }
        continue;
      }

      if (f.type === 'file') {
        const h = formEl.querySelector('#photo-hidden');
        const current = h ? h.value : '';
        if (current !== original) data[f.key] = current;
        continue;
      }

      if (f.type === 'boolean') {
        const el = formEl.querySelector(`[name="${f.key}"]`);
        if (!el) continue;
        const origBool = this._isTruthy(original);
        const curBool  = el.checked;
        if (curBool === origBool) continue;
        if (!original && !curBool) continue;  // was empty, still unchecked → skip
        data[f.key] = curBool ? 'TRUE' : '';
        continue;
      }

      const el = formEl.querySelector(`[name="${f.key}"]`);
      if (!el) continue;
      let current = el.value;
      if (f.type === 'multiselect') {
        // Replace 'OTHER' token with the free-text value if provided
        const otherEl = formEl.querySelector(`[name="${f.key}__other"]`);
        const otherVal = otherEl && otherEl.value.trim();
        if (otherVal) {
          const parts = current.split(',').map(v => v.trim()).filter(Boolean);
          const idx = parts.indexOf('OTHER');
          if (idx !== -1) parts[idx] = otherVal;
          current = parts.join(', ');
        }
      } else if (current === 'OTHER' && el.dataset.hasOther) {
        const otherEl = formEl.querySelector(`[name="${f.key}__other"]`);
        if (otherEl && otherEl.value.trim()) current = otherEl.value.trim();
      }
      if (current !== original) data[f.key] = current;
    }

    return data;
  },

  getPhotoFiles() { return this._photoFiles.filter(Boolean); },
  getRemovedPhotos() { return [...this._removedPhotos]; },

  // ── Multiselect event delegation ────────────────────────────
  // NOT: document'a SADECE BİR KERE bağlanır (bkz. render() içindeki guard).
  _bindMultiselectListeners() {
    document.addEventListener('click', (e) => {
      const opt = e.target.closest('.ms-opt');
      if (opt) {
        const key = opt.dataset.key;
        const val = opt.dataset.val;
        const hidden = document.querySelector(`[name="${key}"]`);
        if (!hidden) return;
        const current = new Set(
          hidden.value ? hidden.value.split(',').map(v => v.trim()).filter(Boolean) : []
        );
        if (current.has(val)) {
          current.delete(val);
          opt.classList.remove('ms-opt-on');
        } else {
          current.add(val);
          opt.classList.add('ms-opt-on');
        }
        hidden.value = [...current].join(', ');
        const fieldEl = opt.closest('.field-multiselect');
        this._refreshMsTags(key, current, fieldEl);
        // Show/hide OTHER text input
        const otherIn = fieldEl && fieldEl.querySelector('.ms-other-input');
        if (otherIn) {
          const show = current.has('OTHER');
          otherIn.style.display = show ? 'block' : 'none';
          if (!show) otherIn.value = '';
        }
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const rm = e.target.closest('.ms-remove');
      if (rm) {
        const key = rm.dataset.key;
        const val = rm.dataset.val;
        const hidden = document.querySelector(`[name="${key}"]`);
        if (!hidden) return;
        const current = new Set(
          hidden.value ? hidden.value.split(',').map(v => v.trim()).filter(Boolean) : []
        );
        current.delete(val);
        hidden.value = [...current].join(', ');
        const fieldEl = rm.closest('.field-multiselect');
        const optBtn = fieldEl && fieldEl.querySelector(`.ms-opt[data-val="${val}"]`);
        if (optBtn) optBtn.classList.remove('ms-opt-on');
        this._refreshMsTags(key, current, fieldEl);
        // Hide OTHER input if OTHER was removed
        if (val === 'OTHER') {
          const otherIn = fieldEl && fieldEl.querySelector('.ms-other-input');
          if (otherIn) { otherIn.style.display = 'none'; otherIn.value = ''; }
        }
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  },

  _refreshMsTags(key, selectedSet, fieldEl) {
    const selDiv = fieldEl && fieldEl.querySelector(`#ms-sel-${key}`);
    if (!selDiv) return;
    const e = this._esc;
    selDiv.innerHTML = [...selectedSet].map(v =>
      `<span class="ms-tag" data-val="${e(v)}">${e(v)} <button type="button" class="ms-remove" data-key="${e(key)}" data-val="${e(v)}">×</button></span>`
    ).join('');
  },

  // ── Changes group (fiş 21. madde) — toggle'lar boolean sütunlara
  //    ve Implementation_2'ye (virgüllü) yazar ──────────────────────
  _bindChangesGroupListeners() {
    document.querySelectorAll('.field-changesgroup').forEach(wrap => {
      const otherKey   = wrap.dataset.otherKey;
      const otherHidden = wrap.querySelector(`input[type="hidden"][name="${otherKey}"]`);
      const otherTextIn = wrap.querySelector('.changes-other-input');

      const rebuildOther = () => {
        const tokens = [];
        wrap.querySelectorAll('.changes-check').forEach(c => {
          if (c.dataset.boolKey) return; // boolean sütunlar Implementation_2'ye yazılmaz
          if (!c.checked) return;
          if (c.dataset.hasOther === '1') {
            const free = otherTextIn && otherTextIn.value.trim();
            tokens.push(free || 'OTHER');
          } else {
            tokens.push(c.dataset.token);
          }
        });
        if (otherHidden) {
          otherHidden.value = tokens.join(', ');
          otherHidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      wrap.querySelectorAll('.changes-check').forEach(c => {
        c.addEventListener('change', () => {
          if (c.dataset.boolKey) {
            const h = wrap.querySelector(`input[type="hidden"][name="${c.dataset.boolKey}"]`);
            if (h) {
              h.value = c.checked ? 'TRUE' : '';
              h.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
          }
          if (c.dataset.hasOther === '1' && otherTextIn) {
            otherTextIn.style.display = c.checked ? 'block' : 'none';
            if (!c.checked) otherTextIn.value = '';
          }
          rebuildOther();
        });
      });

      if (otherTextIn) {
        otherTextIn.addEventListener('input', rebuildOther);
      }
    });
  },

  // ── Floor number builder (number + checkboxes → text) ─────────
  // Çift yönlü senkron: sayı/checkbox değişince text kutusu güncellenir,
  // text kutusu elle değiştirilince sayı/checkbox'lar (mümkünse) güncellenir.
  _bindFloorNumberListeners() {
    document.querySelectorAll('.field-floornumber').forEach(wrap => {
      const numInput   = wrap.querySelector('.floor-num-input');
      const textInput  = wrap.querySelector('.floor-text-input');
      const checks     = [...wrap.querySelectorAll('.floor-check')];

      const rebuildFromBuilder = () => {
        const parts = [];
        const num = numInput.value.trim();
        if (num) parts.push(num);
        checks.forEach(c => { if (c.checked) parts.push(c.dataset.token); });
        textInput.value = parts.join('+');
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
      };

      numInput.addEventListener('input', rebuildFromBuilder);
      checks.forEach(c => c.addEventListener('change', rebuildFromBuilder));

      // Text kutusu elle düzenlenirse, tanınabilen sayı/token'ları builder'a yansıt.
      textInput.addEventListener('input', () => {
        const tokens = textInput.value.split('+').map(v => v.trim()).filter(Boolean);
        const num = tokens.find(t => /^\d+$/.test(t));
        numInput.value = num || '';
        checks.forEach(c => {
          c.checked = tokens.some(t => t.toUpperCase() === c.dataset.token);
        });
      });
    });
  },

  // ── Tek bir foto thumbnail kutusu (mevcut, sunucudan gelen dosya) ──
  _photoThumbHTML(name) {
    const e = this._esc;
    return `<div class="photo-thumb" data-name="${e(name)}" data-kind="existing">
      <div class="photo-thumb-img" data-loading="1">
        <span class="photo-thumb-spinner">…</span>
      </div>
      <button type="button" class="photo-thumb-remove" title="Remove photo">×</button>
      <span class="photo-thumb-name">${e(name)}</span>
    </div>`;
  },

  // ── Yeni seçilmiş (henüz sunucuya yüklenmemiş) bir foto thumbnail'i ──
  _photoThumbPendingHTML(file, idx) {
    const e = this._esc;
    return `<div class="photo-thumb photo-thumb-pending" data-idx="${idx}" data-kind="pending">
      <div class="photo-thumb-img" data-loading="1">
        <span class="photo-thumb-spinner">…</span>
      </div>
      <button type="button" class="photo-thumb-remove" title="Remove photo">×</button>
      <span class="photo-thumb-name">${e(file.name)}</span>
    </div>`;
  },

  // ── Mevcut hidden input değerini (Photo sütunu) yeniden inşa eder ──
  // Mevcut (sunucudaki) dosya adları − silinenler. Yeni seçilen dosyalar
  // henüz sunucuya yüklenmediği için Photo sütununa save anına kadar eklenmez.
  _rebuildPhotoHidden() {
    const grid = document.getElementById('photo-grid');
    const hidden = document.getElementById('photo-hidden');
    if (!grid || !hidden) return;
    const original = (grid.dataset.original || '')
      .split(',').map(v => v.trim()).filter(Boolean);
    const remaining = original.filter(n => !this._removedPhotos.includes(n));
    hidden.value = remaining.join(', ');
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  },

  // ── Bir thumbnail için görseli async yükler ─────────────────────
  _loadThumbImage(thumbEl, name) {
    const imgWrap = thumbEl.querySelector('.photo-thumb-img');
    if (!imgWrap) return;
    API.resolvePhotoUrl(name).then(url => {
      if (!url) {
        imgWrap.innerHTML = `<span class="photo-thumb-fallback">📷</span>`;
        return;
      }
      const img = document.createElement('img');
      img.src = url;
      img.onerror = () => { imgWrap.innerHTML = `<span class="photo-thumb-fallback">📎</span>`; };
      imgWrap.innerHTML = '';
      imgWrap.appendChild(img);
    });
  },

  // ── Photo listeners ──────────────────────────────────────────────
  _bindPhotoListeners() {
    const grid = document.getElementById('photo-grid');

    // Mevcut (sunucudan gelen) thumbnail'ler için görselleri yükle
    if (grid) {
      grid.querySelectorAll('.photo-thumb[data-kind="existing"]').forEach(thumb => {
        this._loadThumbImage(thumb, thumb.dataset.name);
      });
    }

    // Yeni dosya seçimi
    const photoInput = document.getElementById('photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        files.forEach(file => {
          this._photoFiles.push(file);
          const idx = this._photoFiles.length - 1;

          if (grid) {
            const div = document.createElement('div');
            div.innerHTML = this._photoThumbPendingHTML(file, idx);
            const thumbEl = div.firstElementChild;
            grid.appendChild(thumbEl);

            // FileReader önizleme
            if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (evt) => {
                const imgWrap = thumbEl.querySelector('.photo-thumb-img');
                if (imgWrap) {
                  const img = document.createElement('img');
                  img.src = evt.target.result;
                  imgWrap.innerHTML = '';
                  imgWrap.appendChild(img);
                }
              };
              reader.readAsDataURL(file);
            } else {
              const imgWrap = thumbEl.querySelector('.photo-thumb-img');
              if (imgWrap) imgWrap.innerHTML = `<span class="photo-thumb-fallback">📎</span>`;
            }
          }
        });

        // input'u sıfırla ki aynı dosya tekrar seçilebilsin
        photoInput.value = '';
        // Save butonunu aktifleştirmek için sentetik bir change event'i tetikle
        const hidden = document.getElementById('photo-hidden');
        if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    // Silme butonları (event delegation — grid her render'da yeniden oluştuğu için güvenli)
    if (grid) {
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.photo-thumb-remove');
        if (!btn) return;
        const thumb = btn.closest('.photo-thumb');
        if (!thumb) return;

        if (thumb.dataset.kind === 'existing') {
          const name = thumb.dataset.name;
          this._removedPhotos.push(name);
          this._rebuildPhotoHidden();
        } else {
          const idx = Number(thumb.dataset.idx);
          this._photoFiles[idx] = null; // dizideki yeri boş bırak, index'ler kaymasın
          const hidden = document.getElementById('photo-hidden');
          if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
        thumb.remove();
      });
    }
  },

  // ── OTHER select handler ────────────────────────────────────
  _onSelectChange(selectEl) {
    if (!selectEl.dataset.hasOther) return;
    const otherInput = selectEl.parentElement.querySelector('.other-input');
    if (!otherInput) return;
    const show = selectEl.value === 'OTHER';
    otherInput.style.display = show ? 'block' : 'none';
    if (!show) otherInput.value = '';
  },

  // ── Utilities ────────────────────────────────────────────────
  _isFilled(v)  { return v !== undefined && v !== null && String(v).trim() !== ''; },
  _isTruthy(v)  { return ['true', '1', 'yes', 'TRUE'].includes(String(v).trim()); },
  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};