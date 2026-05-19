// ═══════════════════════════════════════════════════════════════
//  config.js — form alanlarını ve bağlantıları bu dosyadan değiştirin
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  geoJsonUrl:     './data/yapi.geojson',
  csvUrl:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAopwOG4dW7Uu6XSsT2-LsUcIWpxAJ17XeibnscVYRPSqQXDL7Vaf6-a3RbBC9OXHrcibn2D6fpOX4/pub?gid=1549451906&single=true&output=csv',
  appsScriptUrl:  'https://script.google.com/macros/s/AKfycbzrcesm0RmbzZ7KD9lhiVfzs335S8STQpjDeAbXHUHqq3iEpQ3JYymtUqjYFho9ut0wBw/exec',   // deploy sonrası buraya yapıştırın
   idField:        'YapiNO',
  photoFolder:    'photos/',
 
  fields: [
 
    // KİMLİK ────────────────────────────────────────────────────
    { key: 'YapiNO',              label: 'Yapı No',            group: 'Kimlik', type: 'text',   editable: false },
    { key: 'AdaNO',               label: 'Ada No',             group: 'Kimlik', type: 'text',   editable: false },
    { key: 'ParselNO',            label: 'Parsel No',          group: 'Kimlik', type: 'text',   editable: false },
    { key: 'PreviousInventoryNo', label: 'Önceki Envanter No', group: 'Kimlik', type: 'text',   editable: true  },
    { key: 'Adres',               label: 'Adres',              group: 'Kimlik', type: 'text',   editable: true  },
    { key: 'Owner_1',             label: 'Mülk Sahibi',        group: 'Kimlik', type: 'select', editable: true,
      options: ['', 'INDIVIDUAL', 'PRIVATE', 'FOUNDATION', 'GOVERNMENT', 'MUNICIPALITY', 'ARMY', 'OTHER'] },
    { key: 'User_1',              label: 'Kaydeden',           group: 'Kimlik', type: 'select', editable: true,
      options: ['', 'INDIVIDUAL', 'PRIVATE', 'FOUNDATION', 'GOVERNMENT', 'MUNICIPALITY', 'ARMY', 'OTHER'] },
    { key: 'PreservingBody',      label: 'Koruma Kurumu',      group: 'Kimlik', type: 'text',   editable: true  },
 
    // DÖNEM VE DURUM ────────────────────────────────────────────
    { key: 'ConstructionStatus',  label: 'Yapı Durumu',        group: 'Dönem ve Durum', type: 'select', editable: true,
      options: ['', 'GOOD', 'MEDIUM', 'BAD', 'RUIN', 'NEW BUILDING', 'LOST'] },
    { key: 'FloorNumber',         label: 'Kat Sayısı',         group: 'Dönem ve Durum', type: 'text',   editable: true },
    { key: 'Period',              label: 'Dönem',              group: 'Dönem ve Durum', type: 'select', editable: true,
      options: ['', 'OTTOMAN', '18TH-19TH', '19TH', '19TH-20TH', '20TH', 'MODERN', 'NEW BUILDING', 'OTHER'] },
    { key: 'CulturalValue',       label: 'Kültürel Değer',     group: 'Dönem ve Durum', type: 'select', editable: true,
      options: ['', 'LISTED BUILDING', 'PROPOSED TO BE LISTED', 'NOT LISTED',
                'NEW BUILDING SUITABLE', 'NEW BUILDING UNSUITABLE',
                'LOST HISTORIC BUILDING+NEW BUILDING SUITABLE',
                'LOST HISTORIC BUILDING+NEW BUILDING UNSUITABLE'] },
    { key: 'Authenticity',        label: 'Özgünlük',           group: 'Dönem ve Durum', type: 'text',   editable: true },
    { key: 'Authenticity_2',      label: 'Özgünlük Sınıfı',   group: 'Dönem ve Durum', type: 'text',   editable: true },
 
    // KULLANIM ──────────────────────────────────────────────────
    { key: 'UsageType',           label: 'Kullanım Sürekliliği', group: 'Kullanım', type: 'select', editable: true,
      options: ['', 'CONTINUOUS', 'CONTINUOUSLY', 'ABANDONED', 'SEASONAL', 'UNDER CONSTRUCTION'] },
    { key: 'AuthenticUse',        label: 'Özgün Kullanım',    group: 'Kullanım', type: 'text', editable: true },
    { key: 'AuthenticUse_House',  label: 'Özgün Kull. Notu',  group: 'Kullanım', type: 'text', editable: true },
    { key: 'CurrentUse',          label: 'Mevcut Kullanım',   group: 'Kullanım', type: 'text', editable: true },
    { key: 'CurrentUse_House',    label: 'Mevcut Kull. Notu', group: 'Kullanım', type: 'text', editable: true },
    { key: 'CurrentUse_Classification', label: 'Kullanım Sınıfı', group: 'Kullanım', type: 'text', editable: true },
    { key: 'SuggestedUse_1',      label: 'Önerilen Kullanım', group: 'Kullanım', type: 'text', editable: true },
    { key: 'SuggestedUse_House',  label: 'Önerilen Kull. Notu', group: 'Kullanım', type: 'text', editable: true },
 
    // YAPI SİSTEMİ ──────────────────────────────────────────────
    { key: 'Material',            label: 'Malzeme',            group: 'Yapı Sistemi', type: 'text', editable: true },
    { key: 'Material_Concrete_1', label: 'Beton Malzeme',      group: 'Yapı Sistemi', type: 'text', editable: true },
    { key: 'Material_Steel',      label: 'Çelik Malzeme',      group: 'Yapı Sistemi', type: 'text', editable: true },
    { key: 'ConstructionType',    label: 'Yapım Sistemi',      group: 'Yapı Sistemi', type: 'text', editable: true },
    { key: 'ConstructionType_Concrete', label: 'Beton Sistemi',group: 'Yapı Sistemi', type: 'text', editable: true },
    { key: 'ConstructionType_Steel',    label: 'Çelik Sistemi',group: 'Yapı Sistemi', type: 'text', editable: true },
    { key: 'Implementation_1',    label: 'Müdahale 1',         group: 'Yapı Sistemi', type: 'text', editable: true },
    { key: 'Implementation_2',    label: 'Müdahale 2',         group: 'Yapı Sistemi', type: 'text', editable: true },
 
    // CEPHE ─────────────────────────────────────────────────────
    { key: 'DoorWindowRatio',     label: 'Kapı/Pencere Oranı', group: 'Cephe', type: 'boolean', editable: true },
    { key: 'FacadeRatio',         label: 'Cephe Oranı',        group: 'Cephe', type: 'boolean', editable: true },
    { key: 'ShopFacade',          label: 'Vitrin Cephe',        group: 'Cephe', type: 'boolean', editable: true },
    { key: 'BalconyAddition',     label: 'Balkon Eklentisi',    group: 'Cephe', type: 'boolean', editable: true },
    { key: 'Overhan',             label: 'Çıkma',               group: 'Cephe', type: 'boolean', editable: true },
 
    // MÜDAHALE ──────────────────────────────────────────────────
    { key: 'OverallRemoval',      label: 'Toplu Yıkım',         group: 'Müdahale', type: 'boolean', editable: true },
    { key: 'FloorRemoval',        label: 'Kat Kaldırma',        group: 'Müdahale', type: 'boolean', editable: true },
    { key: 'UpperFloorReconstruction', label: 'Üst Kat Yenileme', group: 'Müdahale', type: 'boolean', editable: true },
 
    // ALTYAPI ───────────────────────────────────────────────────
    { key: 'HeatingType_1',       label: 'Isıtma Tipi',         group: 'Altyapı', type: 'select', editable: true,
      options: ['', 'NON EXISTANT', 'CENTRAL', 'A.C.', 'STOVE', 'OTHER'] },
    { key: 'Sanitation_1',        label: 'Kanalizasyon',        group: 'Altyapı', type: 'select', editable: true,
      options: ['', 'EXISTANT', 'NON EXISTANT'] },
    { key: 'CleanWater_1',        label: 'Temiz Su',            group: 'Altyapı', type: 'select', editable: true,
      options: ['', 'EXISTANT', 'NON EXISTANT'] },
    { key: 'Electricity_1',       label: 'Elektrik',            group: 'Altyapı', type: 'select', editable: true,
      options: ['', 'EXISTANT', 'NON EXISTANT'] },
 
    // FOTOĞRAF VE NOTLAR ────────────────────────────────────────
    { key: 'Photo',               label: 'Fotoğraf',            group: 'Fotoğraf & Notlar', type: 'file',     editable: true },
    { key: 'Photo_Ekli',          label: 'Fotoğraf Eklendi',    group: 'Fotoğraf & Notlar', type: 'boolean',  editable: true },
    { key: 'Note',                label: 'Saha Notu',           group: 'Fotoğraf & Notlar', type: 'textarea', editable: true },
  ]
};
 