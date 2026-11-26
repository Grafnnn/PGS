// Голубое R1.17.2 · опциональные документные размеры для пилота этапа 1.
// Геометрия и численные высоты «По модели» остаются данными сцены.
(function () {
  'use strict';
  const support = 'SRC:19/26-2026-ТКР|-|p37|s-#9694567370';
  const pipe = 'SRC:19/26-2026-ТКР|нет в источнике|p32|s-#503e71c39f';
  const casing = 'SRC:19/26-2026-ТКР|нет в источнике|p21|s-#0a7021c5a7';
  const well = 'SRC:19/26-2026-ТКР|-|p35|s-#585f9ccac7';
  const sleeves = 'SRC:19/26-2026-ТКР|нет в источнике|p38|s1#b50823d22f';
  const invert = 'SRC:19/26-2026-ППО|-|p18|s-#255db1ed7c';
  const size = (value_mm, source_key, note, basis = 'sheet') => ({ value_mm, basis, source_key, note });
  const unknown = (what, note) => ({ what, note });
  const supportNote = 'ТКР, лист 8. Для трубы Ø225 приведены ориентировочные размеры бетонного упора.';
  window.AtlasDimsAvoid = ['#pdExcavationOverview', '.field-tools', '.pd-plan-controls'];
  window.ATLAS_DIMS = {
    schema: 'atlas-dims-1',
    items: {
      'NET-V-SUPPORT-UP-2': {
        length: size(500, support, supportNote),
        width: size(900, support, supportNote),
        height: size(600, support, supportNote)
      },
      'NET-V-PIPE-OPEN-1': {
        axis_path: [[0.5995814711393889, -0.022406683519122096, 200.59596336663128], [6.846, -0.25583871875, 200.56328603121094]],
        diameter: size(225, pipe, 'Наружный диаметр рабочей трубы на плане открытого участка.'),
        unresolved: [unknown('length', 'В ПД приведён интервал ПК0+00–ПК0+07 длиной 7 м. Видимое тело начинается после узла КВ‑1; его осевую длину сверяем отдельно по модели.')]
      },
      'NET-V-CASING-HDD-1': {
        diameter: size(400, casing, 'Наружный диаметр футляра. В документах есть расхождение по толщине стенки.'),
        unresolved: [unknown('length', 'ТКР, лист 3, даёт 24 м по плану, а с учётом прокола 34 м. Уточнить, какая длина относится к выбранному телу.')]
      },
      'NET-GOL-PD-NODE-KV1-SAND': {
        height: size(100, well, 'Толщина песчаной подготовки под колодец по разрезу КВ‑1.'),
        unresolved: [unknown('bottom', 'Абсолютная отметка низа песчаной подготовки в ТКР отсутствует.')]
      },
      'NET-GOL-PD-NODE-KV1-BASE': {
        unresolved: [
          unknown('bottom', 'В ТКР показана плита ПН‑15; отметка её низа на листе не проставлена.'),
          unknown('top', 'Абсолютная отметка верха плиты в ТКР не проставлена. Геометрическую отметку можно видеть отдельно как модельную.')
        ]
      },
      'NET-GOL-PD-NODE-KV1-RING-01': {
        unresolved: [unknown('height', 'ТКР подтверждает марку КС‑15‑9а и диаметр камеры в свету. Высота отдельного яруса на листе не дана; полная высота камеры к нему не относится.')]
      },
      'NET-GOL-WELL-SLEEVES': {
        model_extent: false,
        diameter: size(500, sleeves, 'Размер каждой из двух проходных гильз. Спецификация, поз. 9.', 'spec'),
        length: size(300, sleeves, 'Длина одной гильзы, а не всей сборки. Спецификация, поз. 9.', 'spec'),
        unresolved: [unknown('axis', 'Абсолютная отметка монтажа двух гильз не подтверждена.')]
      },
      'NET-GOL-PD-REF-R12-KV1-INVERT': {
        model_extent: false,
        invert: {
          value_m: 200.5,
          datum: 'Высотные отметки ППО по продольному профилю В1',
          basis: 'sheet',
          source_key: invert,
          note: 'Лоток на ПК0+00 у КВ‑1. Отметка не относится к оси трубы или к торцу видимого тела.'
        }
      },
      'NET-GOL-PD-NODE-KV1-TIE-CUT': {
        model_extent: false,
        unresolved: [
          unknown('diameter', 'Подтвердить диаметр существующей трубы. ТКР, листы 3 и 6, показывает Ø315, профиль ППО и спецификация ТКР, поз. 23, указывают Ø400. DN200 относится к проходу задвижки.'),
          unknown('axis', 'Не подтверждена высотная привязка узла врезки.')
        ]
      }
    }
  };
})();
