(function (root) {
  'use strict';
  const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  function category(group, mixed = 'personnels') {
    const value = normalize(group);
    if (['prof', 'profs', 'professeur', 'professeurs', 'enseignant', 'enseignants'].includes(value)) { return 'enseignants'; }
    if (['personnel', 'personnels'].includes(value)) { return 'personnels'; }
    if (value === 'prof_personnel') { return ['enseignants', 'personnels'].includes(mixed) ? mixed : null; }
    if (!value || ['-', '—', 'sans classe', 'aucune', 'non renseigne'].includes(value)) { return null; }
    return 'etudiants';
  }
  function prepare(people, mixed) {
    const candidates = new Map();
    let skipped = 0;
    for (const person of people) {
      const last = typeof person.last === 'string' ? person.last.trim() : '';
      const first = typeof person.first === 'string' ? person.first.trim() : '';
      const cardType = category(person.group, mixed);
      if (!last || !first || !cardType) { skipped++; continue; }
      const name = `${last} ${first}`, key = normalize(name);
      const old = candidates.get(key);
      if (old && old.cardType !== cardType) { old.conflict = true; }
      else if (!old) { candidates.set(key, { name, alternateName: `${first} ${last}`, cardType, last, first, group: person.group }); }
    }
    const records = [];
    for (const record of candidates.values()) {
      if (record.conflict) { skipped++; } else { records.push(record); }
    }
    return { records, skipped };
  }
  const api = { category, prepare };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.BadgeNames = api; }
})(globalThis);
