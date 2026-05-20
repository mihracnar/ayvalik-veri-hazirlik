// ═══════════════════════════════════════════════════════════════
//  api.js — Veri okuma (CSV) ve yazma (Apps Script)
// ═══════════════════════════════════════════════════════════════

const API = {

  // CSV'yi okur, { YapiNO: { ...row } } şeklinde indeksler
  async loadCSV() {
    const resp = await fetch(CONFIG.csvUrl + '&t=' + Date.now());
    if (!resp.ok) throw new Error('CSV yüklenemedi: HTTP ' + resp.status);
    const text = await resp.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    if (parsed.errors.length) {
      console.warn('CSV parse uyarıları:', parsed.errors);
    }
    const index = {};
    for (const row of parsed.data) {
      const id = String(row[CONFIG.idField] || '').trim();
      if (id) index[id] = row;
    }
    return { index, rows: parsed.data, columns: parsed.meta.fields || [] };
  },

  // GeoJSON'ı yükler, { YapiNO: feature } şeklinde indeksler
  async loadGeoJSON() {
    const resp = await fetch(CONFIG.geoJsonUrl);
    if (!resp.ok) throw new Error('GeoJSON yüklenemedi: HTTP ' + resp.status);
    const gj = await resp.json();
    const index = {};
    for (const feat of gj.features) {
      const id = String(feat.properties[CONFIG.idField] || '').trim();
      if (id) index[id] = feat;
    }
    return { geojson: gj, index };
  },

  // Bir kaydı Apps Script'e yazar
  // photoFile: File nesnesi veya null
  async save(idValue, fields, photoFile) {
    const payload = {
      action: 'save',
      [CONFIG.idField]: idValue,
      fields: { ...fields }
    };

    // Fotoğraf varsa işle
    if (photoFile) {
      if (CONFIG.appsScriptUrl) {
        // Apps Script üzerinden Drive'a yüklemeyi dene
        try {
          const b64 = await this._toBase64(photoFile);
          const upResp = await fetch(CONFIG.appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'upload',
              filename: photoFile.name,
              filedata: b64,
              mimeType: photoFile.type || 'image/jpeg'
            })
          });
          const upData = await upResp.json();
          if (upData.ok && upData.url) {
            payload.fields.Photo = upData.url;
          } else {
            payload.fields.Photo = CONFIG.photoFolder + photoFile.name;
          }
        } catch (_) {
          payload.fields.Photo = CONFIG.photoFolder + photoFile.name;
        }
      } else {
        // Demo: sadece dosya adını kaydet
        payload.fields.Photo = CONFIG.photoFolder + photoFile.name;
      }
      payload.fields.Photo_Ekli = 'TRUE';
    }

    if (!CONFIG.appsScriptUrl) {
      // Demo modu — sadece başarılı dön
      return { ok: true, demo: true };
    }

    const resp = await fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return resp.json();
  },

  _toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Drive'dan dosya adıyla thumbnail URL çöz
  async resolvePhotoUrl(filename) {
    if (!CONFIG.appsScriptUrl || !filename) return null;
    if (/^https?:\/\//.test(filename)) return filename; // zaten URL
    try {
      const resp = await fetch(CONFIG.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getPhotoUrl', filename })
      });
      const data = await resp.json();
      return data.ok ? data.url : null;
    } catch(e) { return null; }
  },
};