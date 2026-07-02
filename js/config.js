// ═══════════════════════════════════════════════════════════════
//  config.js — Online mod (GitHub Pages + Google Sheets)
//  Alan sırası paper survey sheet (1–23) ile eşleştirilmiştir.
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  geoJsonUrl:     './data/yapi.geojson',
  csvUrl:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAopwOG4dW7Uu6XSsT2-LsUcIWpxAJ17XeibnscVYRPSqQXDL7Vaf6-a3RbBC9OXHrcibn2D6fpOX4/pub?gid=1549451906&single=true&output=csv',
  appsScriptUrl:  'https://script.google.com/macros/s/AKfycbzEu694lWNklAL9sXHhQa-sdoJQvzFVKB8WLIxq4HicLOqfbkYGQxD5Pho5zIRQ86OYFg/exec',
  idField:        'fid',          // ← birincil anahtar
  photoFolder:    'photos/',

  // Bina başlığını döndürür: YapiNO varsa o, yoksa Ada/Parsel
  buildingLabel(attrs) {
    const yapiNo = attrs && (attrs.YapiNO || attrs['YapiNO']);
    if (yapiNo && String(yapiNo).trim()) return String(yapiNo).trim();
    const ada    = attrs && (attrs.AdaNO    || '—');
    const parsel = attrs && (attrs.ParselNO || '—');
    return `Ada ${ada} / Parsel ${parsel}`;
  },

  fields: [
    // 1–2. KİMLİK ─────────────────────────────────────────────
    { key: 'YapiNO',              label: 'Building No',            group: 'Identity', type: 'text',   editable: false },
    { key: 'AdaNO',               label: 'Block No',               group: 'Identity', type: 'text',   editable: false },
    { key: 'ParselNO',            label: 'Parcel No',              group: 'Identity', type: 'text',   editable: false },
    { key: 'PreviousInventoryNo', label: 'Previous Inventory No',  group: 'Identity', type: 'text',   editable: true  },
    { key: 'Adres',               label: 'Address',                group: 'Identity', type: 'text',   editable: true  },

    // 4. İNŞAAT TARİHİ / DÖNEMİ ──────────────────────────────
    { key: 'Period',              label: 'Construction Date/Period', group: 'Period', type: 'select', editable: true,
      options: ['', '16TH', '17TH', '18TH', '19TH', '20TH', 'OTHER'] },

    // 8. KULLANIM DURUMU ──────────────────────────────────────
    { key: 'UsageType',           label: 'Use Status',              group: 'Use Status & Ownership', type: 'multiselect', editable: true,
      options: ['', 'CONTINUOUS', 'SEASONAL', 'ABANDONED', 'UNDER CONSTRUCTION', 'OTHER'] },

    // 9. KULLANAN ─────────────────────────────────────────────
    { key: 'User_1',              label: 'User',                    group: 'Use Status & Ownership', type: 'multiselect', editable: true,
      options: ['', 'INDIVIDUAL', 'FOUNDATION', 'GOVERNMENT', 'MUNICIPALITY', 'OTHER'] },

    // 10. MÜLKİYET ───────────────────────────────────────────
    { key: 'Owner_1',             label: 'Owner',                   group: 'Use Status & Ownership', type: 'multiselect', editable: true,
      options: ['', 'INDIVIDUAL', 'FOUNDATION', 'GOVERNMENT', 'MUNICIPALITY', 'OTHER'] },

    { key: 'CommunitySign',       label: 'Community Sign',          group: 'Use Status & Ownership', type: 'multiselect', editable: true,
      options: ['', 'MUSLIM', 'CHRISTIAN', 'JEWISH', 'OTHER'] },

    { key: 'PreservingBody',      label: 'Preservation Authority', group: 'Use Status & Ownership', type: 'multiselect', editable: true,
      options: ['', 'PRIVATE', 'MUNICIPALITY', 'STATE',
               'MINISTRY OF CULTURE', 'MINISTRY OF EDUCATION', 'MINISTRY OF INTERNAL AFFAIRS',
               'OTHER'] },

    // 12. OTANTİK KAT SAYISI ──────────────────────────────────
    { key: 'FloorNumber',         label: 'Authentic Floor No',      group: 'Floors & Condition', type: 'floorNumber', editable: true,
      placeholder: 'e.g. 1+2+ATTIC, ROOF, BASEMENT+1',
      floorOptions: [
        { token: 'BS',   label: 'Basement' },
        { token: 'SM',   label: 'Semi Floor' },
        { token: 'ROOF', label: 'Terrace / Roof' },
      ] },

    // 13. YAPI DURUMU ─────────────────────────────────────────
    { key: 'ConstructionStatus',  label: 'Construction Status',    group: 'Floors & Condition', type: 'select', editable: true,
      options: ['', 'GOOD', 'MEDIUM', 'BAD', 'RUIN', 'NEW BUILDING', 'LOST', 'UNKNOWN', 'OTHER'] },

    // 14. YAPI SİSTEMİ ────────────────────────────────────────
    { key: 'ConstructionType',    label: 'Construction Type',      group: 'Floors & Condition', type: 'multiselect', editable: true,
      options: ['', 'MASONRY', 'CARCASS', 'CONCRETE', 'STEEL', 'OTHER'] },

    // 15. MALZEME ─────────────────────────────────────────────
    { key: 'Material',            label: 'Material',                group: 'Floors & Condition', type: 'multiselect', editable: true,
      options: ['', 'TIMBER', 'STONE', 'CONCRETE', 'BRICK', 'STEEL', 'OTHER'] },

    // 16. KORUMA STATÜSÜ ──────────────────────────────────────
    { key: 'CulturalValue',       label: 'Legal Status of Conservation', group: 'Floors & Condition', type: 'select', editable: true,
      options: ['', 'LISTED BUILDING', 'PROPOSED TO BE LISTED', 'NOT LISTED',
                'NEW BUILDING SUITABLE', 'NEW BUILDING UNSUITABLE',
                'LOST HISTORIC BUILDING+NEW BUILDING SUITABLE',
                'LOST HISTORIC BUILDING+NEW BUILDING UNSUITABLE', 'OTHER'] },

    // 17. GÜNÜMÜZ KULLANIMI ───────────────────────────────────
    { key: 'CurrentUse',          label: "Today's Use",             group: 'Usage', type: 'multiselect', editable: true,
      options: ['',
        'HOUSE', 'SHOP', 'OFFICE', 'COMMERCE', 'SERVICE', 'STORAGE',
        'TOURISM', 'TOURISM SERVICE',
        'ATELIER', 'ART GALLERY',
        'CULTURAL FACILITY', 'EDUCATION', 'SCHOOL',
        'HEALTH FACILITY', 'PHARMACY', 'DENTIST',
        'MOSQUE', 'CHURCH',
        'GOVERNMENT', 'MUNICIPALITY', 'INSTITUTION', 'POLICE STATION',
        'REAL ESTATE AGENCY', 'AGENCY OFFICE', 'NOTARY',
        'BANK', 'CHAMBER OF COMMERCE', 'COOPERATIVE',
        'PTT', 'CUSTOMS BUREAU',
        'TURKISH BATH', 'FOUNTAIN', 'MONUMENT', 'TOMB',
        'GARDEN', 'PARKING', 'GARAGE', 'OUTBUILDING',
        'INDUSTRY', 'LOGISTICS', 'KITCHEN', 'ENTRANCE',
        'NOT IN USE', 'OTHER'] },

    // 18. OTANTİK KULLANIM ────────────────────────────────────
    { key: 'AuthenticUse',        label: 'Authentic Use',           group: 'Usage', type: 'multiselect', editable: true,
      options: ['',
        'HOUSE', 'SHOP', 'OFFICE', 'COMMERCE', 'STORAGE',
        'MOSQUE', 'CHURCH', 'SCHOOL', 'SCHOOL FOR GIRLS',
        'CARAVANSERAI', 'CARAVANSERAI OR HOSPITAL',
        'BATH', 'LIBRARY', 'THEATRE', 'CINEMA',
        'FOUNTAIN', 'GARDEN', 'COURTYARD', 'CURTILAGE',
        'TOMB', 'PALACE', 'CASTLE', 'ARCH', 'BARRACKS', 'LIGHTHOUSE',
        'CUSTOMS', 'CONSULATE', 'PUBLISHER', 'SOAP FACTORY',
        'IMARET', 'TEKKE', 'DERVISH LODGE', 'KASAPIKA',
        'MUSLIM CEMETERY', 'OUTBUILDING', 'OTHER'] },

    // 19. ÖNERİLEN KULLANIM ───────────────────────────────────
    { key: 'SuggestedUse_1',      label: 'Suggested Use',           group: 'Usage', type: 'multiselect', editable: true,
      options: ['',
        'COMMERCE', 'SERVICE', 'TOURISM SERVICE',
        'CULTURE', 'EDUCATION', 'RELIGION', 'HEALTH',
        'STORAGE', 'OFFICE', 'ATELIER',
        'LIBRARY', 'MUSEUM', 'THEATRE', 'CINEMA',
        'BATH', 'MOSQUE', 'CHURCH',
        'FOUNTAIN', 'ARCH', 'CASTLE', 'BARRACKS',
        'GARDEN', 'NURSING HOME',
        'LOCAL AUTHORITY', 'PARKING', 'BANK', 'OTHER'] },

    // 20. OTANTİKLİK DURUMU ───────────────────────────────────
    { key: 'Authenticity',        label: 'Status of Authenticity', group: 'Authenticity', type: 'multiselect', editable: true,
      options: ['', 'GOOD', 'MEDIUM', 'BAD', 'RUIN', 'LOST', 'NEW BUILDING', 'OTHER'] },
    // Authenticity_2 formdan kaldırıldı — DB sütunu korunuyor.

    // 21. DEĞİŞİKLİKLER ───────────────────────────────────────
    { key: 'ChangesGroup',  label: 'Changes',  group: 'Changes', type: 'changesGroup', editable: true,
      otherKey: 'Implementation_2',
      items: [
        { label: 'Door/Window Ratios',         boolKey: 'DoorWindowRatio' },
        { label: 'Facade Ratios',               boolKey: 'FacadeRatio' },
        { label: 'Floor Additions',             token: 'FLOOR ADDITIONS' },
        { label: 'Extensional Building',        token: 'EXTENSIONAL BUILDING' },
        { label: 'Additions in the Garden',     token: 'ADDITIONS IN THE GARDEN' },
        { label: 'Ground Floor Reconstruction', token: 'GROUND FLOOR RECONSTRUCTION' },
        { label: 'Removal of Ottoman Period',   token: 'REMOVAL OF OTTOMAN PERIOD' },
        { label: 'Doors or Windows',            token: 'DOORS OR WINDOWS' },
        { label: 'Shop Windows',                boolKey: 'ShopFacade' },
        { label: 'Internal Reconstruction',     token: 'INTERNAL RECONSTRUCTION' },
        { label: 'United Buildings',            token: 'UNITED BUILDINGS' },
        { label: 'Divided',                     token: 'DIVIDED' },
        { label: 'Balcony Addition',            boolKey: 'BalconyAddition' },
        { label: 'Other',                       token: 'OTHER', hasOther: true },
      ] },

    // ALTYAPI ─────────────────────────────────────────────────
    { key: 'HeatingType_1', label: 'Heating System',    group: 'Infrastructure', type: 'select', editable: true,
      options: ['', 'CENTRAL', 'A.C.', 'STOVE', 'TSACKI', 'OTHER', 'NON EXISTANT'] },
    { key: 'Sanitation_1',  label: 'Sewage Connection', group: 'Infrastructure', type: 'select', editable: true,
      options: ['', 'EXISTANT', 'NON EXISTANT'] },
    { key: 'CleanWater_1',  label: 'Water Supply',      group: 'Infrastructure', type: 'select', editable: true,
      options: ['', 'EXISTANT', 'NON EXISTANT'] },
    { key: 'Electricity_1', label: 'Electricity',       group: 'Infrastructure', type: 'select', editable: true,
      options: ['', 'EXISTANT', 'NON EXISTANT'] },

    // 22–23. NOTLAR + FOTOĞRAF ────────────────────────────────
    { key: 'Note',       label: 'Field Note',     group: 'Notes & Photo', type: 'textarea', editable: true },
    { key: 'Photo',      label: 'Photo',          group: 'Notes & Photo', type: 'file',     editable: true },
    { key: 'Photo_Ekli', label: 'Photo Attached', group: 'Notes & Photo', type: 'boolean',  editable: true },
  ]
};