# Yapı Envanteri — Ayvalık

Google Forms benzeri web arayüzü: Yapı No seç → harita parsele uçar → Sheets'ten öznitelikler gelir → düzenle → kaydet.

## Dizin Yapısı

```
ayvalik-envanter/
├── index.html          ← tarayıcıda açılan sayfa
├── css/
│   └── main.css        ← tüm stiller
├── js/
│   ├── config.js       ← ← ← YENİ ALAN EKLEMEK İÇİN SADECE BURAYI DEĞİŞTİRİN
│   ├── api.js          ← CSV okuma + Apps Script yazma
│   ├── map.js          ← MapLibre harita
│   ├── form.js         ← form render
│   └── app.js          ← koordinatör
├── data/
│   └── yapi.geojson    ← GeoJSON buraya koyun
├── photos/             ← fotoğrafları buraya kopyalayın (isteğe bağlı)
└── apps_script.gs      ← Google Apps Script kodu
```

## Veri Akışı

```
GeoJSON (./data/yapi.geojson)
  → geometri + YapiNO → harita katmanı
  → YapiNO listesi → dropdown

Google Sheets (published CSV)
  → YapiNO ile indekslenir → form alanları

Form → Kaydet → Apps Script Web App → Sheets satırı güncelle
```

GeoJSON ve Sheets **ayrı** çalışır; join yoktur. Ortak anahtar: `YapiNO`.

## Kurulum

### 1) GeoJSON hazırlama

```bash
ogr2ogr -f GeoJSON data/yapi.geojson yapi.gpkg yapi -t_srs EPSG:4326
```

`data/yapi.geojson` olarak kaydedin (dizin zaten var).

### 2) Yerel sunucu başlatma

Tarayıcılar `file://` üzerinden fetch'e izin vermez. Klasörü sunun:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Veya VS Code Live Server, nginx, Netlify Drop, GitHub Pages.

### 3) Tab adını bulun

Apps Script'i deploy etmeden önce sheet'in tab adını öğrenin:
`listSheetNames()` fonksiyonunu Apps Script editöründe bir kez çalıştırın,
Logs'ta tab adlarını ve gid'lerini göreceksiniz. `gid=1549451906` karşılığı adı
`SHEET_TAB_NAME` sabitine yazın.

### 4) Apps Script deploy

1. https://script.google.com → Yeni Proje → `apps_script.gs` içeriğini yapıştırın
2. `SHEET_TAB_NAME` doğrulayın
3. **Deploy → New deployment**
   - Type: Web app
   - Execute as: Me
   - Who has access: **Anyone**
4. Verilen URL'i `js/config.js` → `appsScriptUrl` alanına yapıştırın

### 5) Fotoğraf yükleme

Varsayılan davranış: `photos/<dosyaadı>` yolunu `Photo` sütununa yazar.
Gerçek Drive yüklemesi için `apps_script.gs` dosyasındaki `DRIVE_FOLDER_ID`
sabitine bir Google Drive klasör ID'si girin.

## Form Alanı Ekleme / Çıkarma

`js/config.js` dosyasındaki `fields` dizisini düzenleyin:

```js
{ key: 'YeniSutun',   // Sheets sütun adıyla birebir aynı
  label: 'Görünen Ad',
  group: 'Kart Başlığı',
  type: 'select',      // text | number | select | textarea | boolean | file
  editable: true,      // false → sadece gösterilir, düzenlenemez
  required: true,      // doluluk % hesabına dahil edilir
  options: ['', 'A', 'B', 'C']  // sadece select için
}
```

Sheets'te de aynı adda sütun açmayı unutmayın.

## Hızlı Test (Demo Modu)

`appsScriptUrl: ''` bırakırsanız CSV'den okuma yapılır ama yazma sadece
tarayıcı belleğine gider. Sayfa yenilenince kayıplar — gerçek deploy öncesi
test için idealdir.
