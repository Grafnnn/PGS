'use strict';
(function (root) {
  root.AtlasSourceRecovery = {
    create(data, originalSources) {
      const records = new Map();
      const sources = Object.assign(Object.create(null), originalSources);
      for (const [key, source] of Object.entries(data.sources)) {
        if (Object.hasOwn(sources, key)) throw new Error('Duplicate recovery source: ' + key);
        sources[key] = source;
      }
      for (const group of data.groups) for (const record of group.records) {
        if (records.has(record.key)) throw new Error('Duplicate recovery record: ' + record.key);
        records.set(record.key, group);
      }
      return {
        sources,
        links(object) {
          // Never replace or augment previously assigned links.
          if (object.sourceKeys?.length) return object.sourceKeys;
          return (records.get(object.albumRecord?.key)?.sources || []).map(key => ({
            key, method: 'verified_original_passport'
          }));
        },
        note(object) {
          if (object.sourceKeys?.length) return '';
          const group = records.get(object.albumRecord?.key);
          if (!group) return 'В исходном индексе нет назначенного источника. Произвольная привязка не добавлена.';
          return [group.original_source && 'Исходная ссылка: ' + group.original_source,
            ...group.unresolved].filter(Boolean).join('. ');
        }
      };
    }
  };
})(typeof window === 'undefined' ? globalThis : window);
