// ═══════════════════════════════════════════════════════════════
//  apps_script.gs
//  Google Apps Script — Yapı Envanteri Web App
//
//  KURULUM:
//  1. https://script.google.com → Yeni Proje
//  2. Bu kodu Code.gs'e yapıştırın
//  3. SHEET_TAB_NAME'i doğrulayın (sheet adı değil, tab adı)
//  4. Deploy → New deployment → Web app
//     Execute as: Me | Who has access: Anyone
//  5. URL'i kopyalayıp js/config.js → appsScriptUrl'e yapıştırın
// ═══════════════════════════════════════════════════════════════

const SHEET_ID      = '1qFN8DmuUxvST-tW_tnV07OjuP5UPhn7b15h5Ju4dK9E';
const SHEET_TAB_NAME = 'Sheet1';   // ← gid=1549451906 karşılığı tab adını yazın
const ID_COLUMN     = 'YapiNO';

// Drive'a fotoğraf yükleme klasörü (opsiyonel)
// Boş bırakılırsa Drive yükleme devre dışı, sadece dosya adı kaydedilir.
const DRIVE_FOLDER_ID = '';

// ─────────────────────────────────────────────────────────────
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || 'save';

    if (action === 'upload') return handleUpload(body);
    if (action === 'save')   return handleSave(body);

    return jsonResp({ ok: false, error: 'Bilinmeyen action: ' + action });
  } catch (err) {
    return jsonResp({ ok: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ── Kayıt yazma ───────────────────────────────────────────────
function handleSave(body) {
  const idValue = String(body[ID_COLUMN] || '').trim();
  if (!idValue) return jsonResp({ ok: false, error: ID_COLUMN + ' eksik' });

  const fields = body.fields || {};
  const sheet  = openSheet();
  const data   = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());

  const idCol = headers.indexOf(ID_COLUMN);
  if (idCol < 0) return jsonResp({ ok: false, error: 'Başlıkta ' + ID_COLUMN + ' bulunamadı' });

  // Mevcut satırı ara
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === idValue) { rowIdx = i; break; }
  }

  if (rowIdx === -1) {
    // Yeni satır ekle
    const newRow = headers.map((h, i) => {
      if (i === idCol) return idValue;
      return fields[h] !== undefined ? fields[h] : '';
    });
    sheet.appendRow(newRow);
    rowIdx = sheet.getLastRow() - 1;
  } else {
    // Mevcut satırı güncelle
    Object.keys(fields).forEach(key => {
      const col = headers.indexOf(key);
      if (col >= 0) sheet.getRange(rowIdx + 1, col + 1).setValue(fields[key]);
    });
  }

  return jsonResp({ ok: true, row: rowIdx + 1 });
}

// ── Drive'a fotoğraf yükle (opsiyonel) ───────────────────────
function handleUpload(body) {
  if (!DRIVE_FOLDER_ID) {
    return jsonResp({ ok: true, url: '', note: 'Drive yükleme devre dışı' });
  }
  const filename = body.filename || 'photo.jpg';
  const mimeType = body.mimeType || 'image/jpeg';
  const b64data  = body.filedata || '';

  const bytes  = Utilities.base64Decode(b64data);
  const blob   = Utilities.newBlob(bytes, mimeType, filename);
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return jsonResp({ ok: true, url: file.getDownloadUrl(), id: file.getId() });
}

// ── Yardımcılar ───────────────────────────────────────────────
function openSheet() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_TAB_NAME);
  if (!sheet) throw new Error('"' + SHEET_TAB_NAME + '" adında tab bulunamadı');
  return sheet;
}

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Tab adını bulmak için yardımcı (bir kez çalıştırın) ───────
function listSheetNames() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ss.getSheets().forEach(s => Logger.log(s.getName() + ' | gid: ' + s.getSheetId()));
}
