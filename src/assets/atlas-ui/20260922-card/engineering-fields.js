/* Read-only presentation of explicit passport fields; never infer fabrication data. */
(function (root) {
  'use strict';
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const format = value => value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
  function fields(passport, object) {
    const p = passport || {}, dimensions = [], position = [], specification = [];
    const addText = (rows, label, key) => { const value = text(p[key]); if (value) rows.push({ label, value, field: key }); };
    const addNumber = (rows, label, key, unit) => {
      const value = number(p[key]); if (value !== null) rows.push({ label, value: `${format(value)} ${unit}`, field: key });
    };
    const materials = [];
    addText(materials, 'Материал', 'material');
    addText(materials, 'Марка стали', 'steel_grade');
    addText(materials, 'Класс арматуры', 'reinforcement_grade');
    addNumber(dimensions, 'Длина по источнику', 'source_length_mm', 'мм');
    addNumber(dimensions, 'Длина стержня в паспорте', 'bar_length_mm', 'мм');
    addNumber(dimensions, 'Диаметр стержня', 'bar_diameter_mm', 'мм');
    addNumber(dimensions, 'Толщина по паспорту', 'thickness_mm', 'мм');
    if (Array.isArray(p.dimensions_mm) && p.dimensions_mm.length === 3 && p.dimensions_mm.every(v => number(v) !== null)) {
      dimensions.push({label:'Размеры по паспорту (порядок источника)',value:p.dimensions_mm.map(format).join(' × ')+' мм',field:'dimensions_mm'});
    }
    const bounds = object?.bounds;
    let modelBounds = null;
    if (Array.isArray(bounds) && bounds.length === 2 && bounds.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) {
      const sizes = bounds[1].map((value, i) => value - bounds[0][i]);
      if (sizes.every(value => value >= 0)) modelBounds = sizes.map(format).join(' × ') + ' м';
    }
    addText(position, 'Уровень по паспорту', 'floor');
    addText(position, 'Положение по паспорту', 'location_label');
    addText(position, 'Родитель / узел', 'parent_id');
    addText(position, 'Направление по паспорту', 'direction');
    addText(position, 'Ориентация по паспорту', 'nominal_orientation');
    for (const [key, label] of [['top_level_m','Отметка верха по паспорту'],['bottom_level_m','Отметка низа по паспорту']]) {
      if (typeof p[key] === 'number' && Number.isFinite(p[key])) position.push({label,value:format(p[key])+' м',field:key});
    }
    addText(specification, 'Марка сборки', 'assembly_mark');
    addText(specification, 'Марка', 'mark');
    addText(specification, 'Позиция', 'position');
    addNumber(specification, 'Количество сборки в паспорте', 'assembly_count', 'шт.');
    addNumber(specification, 'Количество стержней в паспорте', 'bar_count', 'шт.');
    addNumber(specification, 'Масса единицы по источнику', 'source_unit_mass_kg', 'кг');
    addText(specification, 'Источник', 'source');
    addText(specification, 'Редакция добавления', 'revision_added');
    addText(specification, 'Обоснование размеров и привязки', 'source_dimension_basis');
    return {
      materials, dimensions, position, specification, modelBounds,
      notes: [...new Set([text(p.note), text(p.confidence), p.anchor_hole_not_modeled === true ? 'Отверстия анкеров не моделировались.' : null].filter(Boolean))],
      fabricationIncomplete: p.fabrication_geometry_complete === false || p.partial_geometry === true || p.geometry_complete === false,
      modelBoundsLabel: 'Габарит модели по X/Y/Z · не для изготовления',
      missingMaterial: 'Нет данных в источнике'
    };
  }
  // A changing selection invalidates both success and failure from older requests.
  function selectionLoader(load, publish) {
    let generation = 0;
    return async object => {
      const current = ++generation;
      publish({ state: object ? 'loading' : 'empty', object });
      if (!object) return;
      try {
        const passport = await load(object);
        if (current === generation) publish({ state: 'ready', object, data: fields(passport, object) });
      } catch {
        if (current === generation) publish({ state: 'error', object });
      }
    };
  }
  root.AtlasEngineeringFields = { fields, selectionLoader };
})(typeof window === 'undefined' ? globalThis : window);
