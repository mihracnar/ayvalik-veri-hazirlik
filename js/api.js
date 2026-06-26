// ═══════════════════════════════════════════════════════════════
//  api.js — Online mod · GitHub Pages + Google Apps Script
// ═══════════════════════════════════════════════════════════════

const API = {

  // ── CSV'yi yükle ─────────────────────────────────────────────
  async loadCSV() {
    const resp = await fetch(CONFIG.csvUrl + '&t=' + Date.now());
    if (!resp.ok) throw new Error('CSV yüklenemedi: HTTP ' + resp.status);
    const text = await resp.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    if (parsed.errors.length) console.warn('CSV parse uyarıları:', parsed.errors);

    const index = {};
    for (const row of parsed.data) {
      const id = String(row[CONFIG.idField] || '').trim();
      if (id) index[id] = row;
    }
    return { index, rows: parsed.data, columns: parsed.meta.fields || [] };
  },

  // ── GeoJSON'ı yükle ──────────────────────────────────────────
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

  // ── Kaydet ───────────────────────────────────────────────────
  // photoFiles: yeni eklenen File nesnelerinin dizisi (boş olabilir)
  // existingPhotoCsv: kaydetme anındaki mevcut "a.jpg, b.jpg" string'i
  async save(idValue, fields, photoFiles, existingPhotoCsv) {
    const payload = {
      action: 'save',
      [CONFIG.idField]: idValue,
      fields: { ...fields }
    };

    if (!CONFIG.appsScriptUrl) {
      // Demo modu — sadece başarılı dön
      return { ok: true, demo: true };
    }

    if (photoFiles && photoFiles.length) {
      const existingNames = (existingPhotoCsv || '')
        .split(',').map(s => s.trim()).filter(Boolean);
      const uploadedNames = [];

      for (const file of photoFiles) {
        try {
          const b64 = await this._toBase64(file);
          const upResp = await fetch(CONFIG.appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'upload',
              filename: file.name,
              filedata: b64,
              mimeType: file.type || 'image/jpeg'
            })
          });
          const upData = await upResp.json();
          if (upData.ok && upData.url) {
            uploadedNames.push(upData.url);
          } else {
            uploadedNames.push(CONFIG.photoFolder + file.name);
          }
        } catch (_) {
          uploadedNames.push(CONFIG.photoFolder + file.name);
        }
      }

      const merged = [...existingNames, ...uploadedNames];
      payload.fields.Photo = merged.join(', ');
      fields.Photo = payload.fields.Photo;   // app.js state'ini de güncelle
      payload.fields.Photo_Ekli = 'TRUE';
      fields.Photo_Ekli = 'TRUE';
    }

    const resp = await fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return resp.json();
  },

  // ── Fotoğraf URL çöz ─────────────────────────────────────────
  async resolvePhotoUrl(filename) {
    if (!filename) return null;
    if (/^https?:\/\//.test(filename)) return filename; // zaten URL

    // "photos/dosyaadi" → "dosyaadi" (Drive klasör prefix'ini at)
    const basename = filename.replace(/^photos\//, '');

    if (!CONFIG.appsScriptUrl) return null;

    try {
      const resp = await fetch(CONFIG.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getPhotoUrl', filename: basename })
      });
      const data = await resp.json();
      return data.ok ? data.url : null;
    } catch(e) { return null; }
  },

  // ── Yardımcı: File → base64 ───────────────────────────────────
  _toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};