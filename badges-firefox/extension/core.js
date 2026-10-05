(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toUpperCase().replace(/[’'`\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  function parse(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/).find(x => x.trim()) || '';
    const separators = [';', '\t', ','];
    const delimiter = separators.find(s => first.includes(s)) || null;
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else if (quoted || !cell.trim()) quoted = !quoted;
        else cell += ch;
      } else if (!quoted && delimiter && ch === delimiter) { row.push(cell.trim()); cell = ''; }
      else if (!quoted && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (quoted) throw new Error('Guillemet non fermé dans le fichier CSV.');
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
    if (!rows.length) throw new Error('Ajoutez au moins un nom.');
    const head = rows[0].map(normalize);
    const ni = head.findIndex(x => ['NOM', 'NOM DE FAMILLE'].includes(x));
    const pi = head.indexOf('PRENOM'), ci = head.indexOf('CLASSE');
    const full = head.findIndex(x => ['NOM COMPLET', 'NOM PRENOM', 'PRENOM NOM'].includes(x));
    const header = ni >= 0 || full >= 0;
    const entries = (header ? rows.slice(1) : rows).map((r, i) => {
      if (!header && r.length > 3) throw new Error(`Ligne ${i + 1} : utilisez Nom;Prénom;Classe ou une seule colonne.`);
      const last = header ? (ni >= 0 ? r[ni] || '' : '') : r[0];
      const firstName = header ? (pi >= 0 ? r[pi] || '' : '') : r[1] || '';
      const name = header && full >= 0 ? r[full] || '' : (firstName ? '' : last);
      const entry = {label: r.join(' ; '), name: normalize(name), last: normalize(last), first: normalize(firstName), group: normalize(header ? (ci >= 0 ? r[ci] || '' : '') : r[2] || '')};
      if (!(entry.name || entry.last)) throw new Error(`Ligne ${i + 1 + Number(header)} : nom manquant.`);
      return entry;
    });
    if (!entries.length) throw new Error('Le fichier contient seulement un en-tête.');
    return entries;
  }
  function matches(entry, person) {
    const last = normalize(person.last), first = normalize(person.first);
    if (entry.group && entry.group !== normalize(person.group)) return false;
    if (entry.first) return entry.last === last && entry.first === first;
    return [last, `${last} ${first}`.trim(), `${first} ${last}`.trim()].includes(entry.name);
  }
  function resolve(entries, people) {
    return entries.map(entry => {
      const candidates = people.filter(person => matches(entry, person));
      return {entry, candidates, status: candidates.length === 0 ? 'absent' : candidates.length > 1 ? 'ambigu' : 'trouve'};
    });
  }
  const api = {normalize, parse, matches, resolve};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BadgeListCore = api;
})(globalThis);
