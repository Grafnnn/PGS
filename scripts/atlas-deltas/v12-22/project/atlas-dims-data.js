// Размеры подтверждены по листам проекта для проверки ядра 1.3.0.
(function () {
  'use strict';
  const source = 'R07_L105';
  const profile = { value_mm: 160, source_key: source, basis: 'spec', note: 'АС.2, лист 105, Ст1, поз. 1.2. Квадратная труба □160 × 5; 5 мм — толщина стенки.' };
  window.ATLAS_DIMS = {
    schema: 'atlas-dims-1',
    items: {
      'ALBUM2::R07_VC_C11': {
        length: profile,
        width: profile,
        height: { value_mm: 3015, source_key: source, basis: 'spec', note: 'Длина установленной вертикально стойки Ст1, поз. 1.2.' }
      },
      'ALBUM2::PAR_MAIN': {
        top: { value_m: 12, source_key: 'R08_AR_9', basis: 'sheet', datum: '±0,000 проекта', note: 'Верх парапета основной кровли по АР, лист 9.' }
      }
    }
  };
})();

// Сетка 1–9 / А–К, шаг 6,000 м: АР, лист 6, полный PDF стр. 8.
window.ATLAS_AXIS_REFERENCE = { verified: true, datum: '±0,000 проекта, сетка модели', source: 'АР, л. 6, PDF стр. 8' };
