(() => {
  'use strict';
  const existing = document.getElementById('badge-list-helper');
  if (existing) { existing.hidden = !existing.hidden; return; }
  if (!/^\/Activation_badge\/?$/i.test(location.pathname)) {
    alert('Ouvrez la page Activation Identifiants (Activation_badge), puis cliquez sur l’extension.'); return;
  }
  const C = globalThis.BadgeListCore;
  const host = document.createElement('div'); host.id = 'badge-list-helper';
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:18px;top:18px;width:420px;max-width:calc(100vw - 36px);z-index:2147483647;color:#172b40;font:14px/1.5 system-ui,sans-serif}
      :host([hidden]){display:none!important}*{box-sizing:border-box}section{background:#fff;border:1px solid #bccbd9;border-radius:14px;box-shadow:0 12px 50px #18344945;max-height:94vh;overflow:auto;padding:20px}
      h2{font-size:21px;margin:0 0 6px}p{margin:8px 0;color:#40556a}label{display:block;font-weight:600;margin-top:12px}textarea,select{width:100%;font:inherit;border:1px solid #9fb2c5;border-radius:7px;padding:9px;background:white;color:#172b40}textarea{height:135px;resize:vertical}
      button{font:inherit;cursor:pointer;border:1px solid #b6c7d8;border-radius:7px;background:#eef3f8;color:#172b40;padding:8px 11px;margin:5px 4px 0 0}button.primary{background:#145f9d;color:white;border-color:#145f9d}button:disabled{opacity:.45;cursor:default}.close{float:right;margin:0;padding:2px 9px}input{max-width:100%;font:inherit;margin-top:6px}small{display:block;color:#516479}#status{padding:9px;background:#edf4fa;border-radius:7px;white-space:pre-wrap}pre{font:12px/1.5 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto}details{margin-top:10px}
    </style>
    <section aria-label="Sélection de badges"><button class="close" id="close" title="Masquer">×</button>
      <h2>Sélection de badges</h2><p>Collez une liste ou importez un fichier. L’analyse parcourt les pages des tableaux choisis.</p>
      <details open><summary>Cartes AffichApp</summary><p>Récupérez les cartes à faire, puis choisissez les noms à rechercher dans IDCapt.</p>
      <button id="api-settings">Réglages et connexion</button>
      <label for="api-status-filter">Statut AffichApp</label><select id="api-status-filter"><option value="">Cartes à faire</option><option value="demande">Demandé</option><option value="impression">Impression</option><option value="disponible">Disponible</option></select>
      <label for="api-type-filter">Type de carte</label><select id="api-type-filter"><option value="">Tous les types</option></select>
      <button id="api-load">Récupérer les cartes</button><button id="api-all" disabled>Tout sélectionner</button><div id="api-cards" style="max-height:200px;overflow:auto"></div><p id="api-message" role="status" aria-live="polite">Configurez votre serveur dans les réglages.</p>
      <button id="api-use" disabled>Utiliser les noms sélectionnés</button>
      <label for="api-new-status">Mettre à jour les cartes sélectionnées</label><select id="api-new-status"><option value="impression">Impression</option><option value="disponible">Disponible</option><option value="demande">Demandé</option></select><button id="api-update" disabled>Envoyer le statut à AffichApp</button><small>Action manuelle : cocher un badge ne modifie pas son statut AffichApp.</small></details>
      <label for="names">Un nom par ligne</label><textarea id="names" placeholder="DUPONT Marie&#10;MARTIN Paul&#10;ou : Nom;Prénom;Classe"></textarea>
      <label for="file">Importer TXT ou CSV</label><input id="file" type="file" accept=".txt,.csv,text/plain,text/csv">
      <small>Accents et majuscules ignorés. Prénom conseillé ; les homonymes ne sont pas cochés.</small>
      <label for="scope">Rechercher dans</label><select id="scope"><option value="both">Actifs et non actifs</option><option value="inactive">Non actifs uniquement</option><option value="active">Actifs uniquement</option></select>
      <div><button id="analyze" class="primary">1. Analyser la liste</button><button id="apply" disabled>2. Cocher les correspondances</button><button id="stop" disabled>Arrêter</button></div>
      <p id="status" role="status" aria-live="polite">Prêt. L’impression et l’encodage restent à lancer manuellement.</p>
      <pre id="report"></pre><button id="export" disabled>Télécharger le bilan TXT</button>
      <details><summary>À savoir</summary><p>Les filtres et la recherche du site sont respectés. Pour chercher partout, mettez-les sur « Tous » et videz la recherche avant l’analyse. Laissez l’onglet ouvert et évitez de manipuler le site pendant le traitement.</p><p>Les cases déjà cochées sont conservées. Le bilan porte sur les noms de votre liste. Les fichiers importés restent dans le navigateur. La connexion AffichApp échange les noms et statuts uniquement avec le serveur configuré.</p></details>
    </section>`;
  document.body.append(host);
  const $ = id => root.getElementById(id);
  const kinds = {inactive: {box: '.check_personne', page: '.buttonPaginationActivation', title: 'non actifs'}, active: {box: '.check_personne2', page: '.buttonPaginationActivation2', title: 'actifs'}};
  let busy = false, stopped = false, plan = null, report = '', invalidated = false;
  let apiCards = [], apiBusy = false, apiServer = '';
  const apiSelected = new Set();
  async function apiMessage(type, fields = {}) {
    const reply = await browser.runtime.sendMessage({type, ...fields});
    if (!reply?.ok) throw new Error(reply?.error || 'Extension indisponible.');
    return reply.data;
  }
  function updateApiControls() {
    const locked = busy || apiBusy;
    for (const id of ['api-load','api-settings','api-status-filter','api-type-filter','api-new-status']) $(id).disabled = locked;
    $('api-all').disabled = locked || !apiCards.length;
    $('api-use').disabled = locked || !apiSelected.size;
    $('api-update').disabled = locked || !apiSelected.size;
    $('api-cards').querySelectorAll('input').forEach(input => { input.disabled = locked; });
  }
  function renderApiCards() {
    $('api-cards').replaceChildren();
    const visible = new Set(apiCards.map(card => card.id));
    for (const id of apiSelected) if (!visible.has(id)) apiSelected.delete(id);
    const labels = {demande:'Demandé',impression:'Impression',disponible:'Disponible'};
    for (const card of apiCards) {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.checked = apiSelected.has(card.id);
      input.onchange = () => { if (input.checked) apiSelected.add(card.id); else apiSelected.delete(card.id); updateApiControls(); };
      label.append(input, document.createTextNode(` #${card.id} · ${card.applicantName} · ${card.cardType} · ${labels[card.status] || card.status}`));
      $('api-cards').append(label);
    }
    updateApiControls();
  }
  async function apiRun(action) {
    if (busy || apiBusy) return;
    apiBusy = true; updateApiControls(); $('analyze').disabled = true; $('apply').disabled = true;
    $('api-message').textContent = 'Connexion à AffichApp…';
    try { await action(); } catch (error) { $('api-message').textContent = error.message; }
    finally { apiBusy = false; updateApiControls(); $('analyze').disabled = busy; $('apply').disabled = busy || !plan; }
  }
  $('api-settings').onclick = () => apiMessage('AFFICH_SETTINGS').catch(error => { $('api-message').textContent = error.message; });
  $('api-load').onclick = () => apiRun(async () => {
    const config = await apiMessage('AFFICH_STATUS');
    const types = await apiMessage('AFFICH_TYPES');
    const selectedType = $('api-type-filter').value;
    $('api-type-filter').replaceChildren();
    const all = document.createElement('option'); all.value = ''; all.textContent = 'Tous les types'; $('api-type-filter').append(all);
    types.forEach(type => { const option = document.createElement('option'); option.value = type.code; option.textContent = type.label; $('api-type-filter').append(option); });
    $('api-type-filter').value = selectedType;
    apiCards = await apiMessage('AFFICH_CARDS', {filters:{status:$('api-status-filter').value,cardType:$('api-type-filter').value}});
    const after = await apiMessage('AFFICH_STATUS');
    if (after.server !== config.server) { apiCards = []; apiSelected.clear(); renderApiCards(); throw new Error('Le serveur a changé. Récupérez de nouveau les cartes.'); }
    if (apiServer !== config.server) apiSelected.clear();
    apiServer = config.server;
    renderApiCards(); $('api-message').textContent = `${apiCards.length} carte(s) récupérée(s). Choisissez les noms, puis utilisez-les pour l’analyse.`;
  });
  for (const id of ['api-status-filter','api-type-filter']) $(id).onchange = () => { apiCards = []; apiSelected.clear(); renderApiCards(); $('api-message').textContent = 'Cliquez sur « Récupérer les cartes » pour appliquer le filtre.'; };
  $('api-all').onclick = () => { const clear = apiSelected.size === apiCards.length; apiCards.forEach(card => { if (clear) apiSelected.delete(card.id); else apiSelected.add(card.id); }); renderApiCards(); };
  $('api-use').onclick = () => {
    if (busy || apiBusy) return;
    const names = [...new Set(apiCards.filter(card => apiSelected.has(card.id)).map(card => card.applicantName))];
    if ($('names').value.trim() && !confirm('Remplacer la liste actuelle par les noms AffichApp sélectionnés ?')) return;
    $('names').value = 'Nom complet\n' + names.map(name => '"' + name.replace(/"/g, '""') + '"').join('\n');
    invalidate(); $('status').textContent = `${names.length} nom(s) importé(s) depuis AffichApp. Cliquez sur « Analyser la liste ».`;
  };
  $('api-update').onclick = () => {
    const ids = [...apiSelected], status = $('api-new-status').value;
    if (!ids.length || !confirm(`Changer le statut de ${ids.length} carte(s) dans AffichApp vers « ${status} » ? Cette action ne confirme pas leur impression.`)) return;
    apiRun(async () => {
      const result = await apiMessage('AFFICH_UPDATE', {ids,status,server:apiServer});
      apiCards.forEach(card => { if (result.updated.includes(card.id)) card.status = status; });
      renderApiCards();
      $('api-message').textContent = `${result.updated.length} statut(s) mis à jour.` + (result.failed.length ? '\nÉchecs : ' + result.failed.map(item => `#${item.id} : ${item.error}`).join('\n') : '');
    });
  };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const filters = () => JSON.stringify(['regime','classe','profil','searchActivation','nbParPageActivation'].map(id => document.getElementById(id)?.value ?? null));
  let runFilters = '';
  function guard() {
    if (stopped) throw new Error('Traitement arrêté. Les cases déjà cochées restent cochées. Relancez une analyse avant de continuer.');
    if (filters() !== runFilters) throw new Error('Les filtres ont changé. Relancez une analyse.');
  }
  function state(box) {
    const file = (box.getAttribute('src') || '').split('/').pop().split('?')[0];
    if (file === 'checkbox1.png') return true;
    if (file === 'checkbox.png') return false;
    throw new Error('Image de case inconnue : version du site non prise en charge.');
  }
  function rows(kind) {
    return [...document.querySelectorAll(kinds[kind].box)].map(box => {
      const row = box.closest('tr'); if (!row) return null;
      const last = row.querySelector('.nom_personne')?.textContent.trim() || '';
      const first = row.querySelector('.prenom_personne')?.textContent.trim() || '';
      if (!last) return null;
      const id = box.getAttribute('alt');
      if (!id) throw new Error('Identifiant de ligne manquant.');
      return {key: `${kind}:${id}`, id, kind, last, first, group: row.querySelector('.classe_personne')?.textContent.trim() || '', checked: state(box), box};
    }).filter(Boolean);
  }
  const pager = kind => [...document.querySelectorAll(kinds[kind].page)];
  function current(kind) { const active = pager(kind).find(x => x.classList.contains('desactived')); return active ? Number(active.dataset.page) : 1; }
  const signature = kind => [...document.querySelectorAll(kinds[kind].box)].map(x => x.getAttribute('alt')).join('|');
  async function go(kind, target) {
    guard();
    const oldPage = current(kind); if (oldPage === target) return;
    const control = pager(kind).find(x => Number(x.dataset.page) === target && !x.classList.contains('desactived'));
    if (!control) throw new Error(`Page ${target} inaccessible dans les ${kinds[kind].title}.`);
    const oldSignature = signature(kind); control.click();
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      await delay(150); guard();
      if (current(kind) === target && signature(kind) !== oldSignature) { await delay(250); guard(); return; }
    }
    throw new Error(`La page ${target} des ${kinds[kind].title} n’a pas été chargée. Bilan incomplet.`);
  }
  async function walk(selectedKinds, visit, phase) {
    for (const kind of selectedKinds) {
      let backSteps = 0;
      while (current(kind) > 1) {
        if (++backSteps > 200) throw new Error('Pagination non reconnue.');
        const previous = pager(kind).map(x => Number(x.dataset.page)).filter(n => n > 0 && n < current(kind));
        if (!previous.length) throw new Error('Impossible de revenir à la première page.');
        await go(kind, Math.min(...previous));
      }
      const visited = new Set();
      for (let n = 0; n < 200; n++) {
        guard(); const p = current(kind);
        if (visited.has(p)) throw new Error('Boucle de pagination détectée.');
        visited.add(p); $('status').textContent = `${phase} · ${kinds[kind].title} · page ${p}…`;
        await visit(rows(kind)); guard();
        const next = pager(kind).map(x => Number(x.dataset.page)).filter(v => v > p);
        if (!next.length) break;
        if (n === 199) throw new Error('Trop de pages : bilan incomplet.');
        await go(kind, Math.min(...next));
      }
    }
  }
  const describe = p => `${p.last} ${p.first} — ${p.group || 'sans classe'} (${kinds[p.kind].title})`;
  function setReport(text) { report = text; $('report').textContent = text; $('export').disabled = !text; }
  function invalidate() { plan = null; $('apply').disabled = true; invalidated = true; }
  function setBusy(value) {
    busy = value; ['analyze','file','names','scope','close','api-load','api-settings','api-status-filter','api-type-filter','api-new-status'].forEach(id => $(id).disabled = value);
    $('stop').disabled = !value; $('apply').disabled = value || !plan;
    updateApiControls();
  }
  async function run(action) {
    if (busy) return; stopped = false; runFilters = filters(); setBusy(true);
    try { await action(); } catch (error) {
      invalidate(); $('status').textContent = error.message;
      setReport(`${report}\n\nTRAITEMENT INCOMPLET : ${error.message}\nLe résultat final n’est pas confirmé. Vérifiez la sélection avant toute impression.`);
    } finally { setBusy(false); }
  }
  $('analyze').onclick = () => run(async () => {
    invalidate(); setReport('');
    const entries = C.parse($('names').value);
    const selectedKinds = $('scope').value === 'both' ? ['inactive','active'] : [$('scope').value];
    if (!selectedKinds.some(k => document.querySelector(kinds[k].box))) throw new Error('Aucune ligne détectée. Vérifiez les filtres et le chargement de la page.');
    const people = new Map();
    await walk(selectedKinds, batch => { for (const {box, ...p} of batch) {
      const old = people.get(p.key);
      if (old && (old.last !== p.last || old.first !== p.first || old.group !== p.group)) throw new Error('Identifiant de ligne incohérent.');
      people.set(p.key, p);
    } }, 'Analyse');
    let enrichment = '';
    try {
      const config = await apiMessage('AFFICH_STATUS');
      if (config.autoNames) {
        const prepared = globalThis.BadgeNames.prepare([...people.values()], config.mixedCategory);
        const scanned = prepared.records;
        const totals = { added: 0, existing: 0, skipped: prepared.skipped, failed: 0 };
        for (let offset = 0; offset < scanned.length; offset += 25) {
          guard(); $('status').textContent = `Présaisie AffichApp · ${offset}/${scanned.length} noms lus…`;
          const result = await apiMessage('AFFICH_SYNC_NAMES', { people: scanned.slice(offset, offset + 25).map(({last,first,group}) => ({last,first,group})) });
          if (result.disabled) break;
          for (const key of Object.keys(totals)) totals[key] += result[key] || 0;
          if (result.failed) { enrichment = `Erreur de présaisie : ${result.error}. Les noms restants ne sont pas importés.\n`; break; }
        }
        enrichment += `Présaisie AffichApp : ${totals.added} nom(s) ajouté(s), ${totals.existing} déjà présent(s), ${totals.skipped} ignoré(s), ${totals.failed} en échec.\n`;
      }
    } catch (error) {
      enrichment = `Présaisie AffichApp non mise à jour : ${error.message}\n`;
    }
    guard();
    const results = C.resolve(entries, [...people.values()]);
    const targets = new Map(results.filter(r => r.status === 'trouve').map(r => [r.candidates[0].key, r.candidates[0]]));
    const prechecked = [...people.values()].filter(p => p.checked && !targets.has(p.key));
    plan = {results, targets, selectedKinds, filters: runFilters, enrichment}; invalidated = false;
    const lines = results.map(r => r.status === 'trouve' ? `À COCHER / DÉJÀ COCHÉ : ${r.entry.label} → ${describe(r.candidates[0])}` : r.status === 'absent' ? `NON TROUVÉ dans les tableaux filtrés : ${r.entry.label}` : `AMBIGU — non coché : ${r.entry.label}\n  ${r.candidates.map(describe).join('\n  ')}`);
    if (prechecked.length) lines.unshift(`ATTENTION : ${prechecked.length} case(s) déjà cochée(s) hors de votre liste sont conservées.\n${prechecked.map(describe).join('\n')}\n`);
    setReport(`ANALYSE — ${people.size} personnes parcourues ; ${targets.size} cases uniques à sélectionner.\n${enrichment}\n${lines.join('\n')}`);
    $('status').textContent = `${targets.size} correspondance(s) unique(s). ${results.filter(r => r.status !== 'trouve').length} entrée(s) non résolue(s). Cliquez sur « Cocher » pour appliquer.`;
    if (!targets.size) plan = null;
  });
  $('apply').onclick = () => run(async () => {
    const p = plan;
    if (!p || p.filters !== filters() || invalidated) throw new Error('Relancez l’analyse avant de cocher.');
    plan = null; const touched = new Set(), verified = new Set(), failures = new Map();
    await walk(p.selectedKinds, async batch => {
      for (const person of batch) {
        guard(); const expected = p.targets.get(person.key); if (!expected) continue;
        if (person.last !== expected.last || person.first !== expected.first || person.group !== expected.group) throw new Error('Une personne a changé depuis l’analyse.');
        touched.add(person.key);
        if (!state(person.box)) {
          person.box.click(); await delay(70); guard();
          if (!person.box.isConnected || !state(person.box)) failures.set(person.key, 'Clic non confirmé');
        }
      }
    }, 'Sélection');
    await walk(p.selectedKinds, batch => {
      for (const person of batch) {
        const expected = p.targets.get(person.key);
        if (expected && person.last === expected.last && person.first === expected.first && person.group === expected.group && person.checked) verified.add(person.key);
      }
    }, 'Vérification de la sélection');
    const lines = p.results.map(r => {
      if (r.status === 'absent') return `NON TROUVÉ dans les tableaux filtrés : ${r.entry.label}`;
      if (r.status === 'ambigu') return `AMBIGU — non coché : ${r.entry.label}\n  ${r.candidates.map(describe).join('\n  ')}`;
      const person = r.candidates[0];
      return verified.has(person.key) ? `COCHÉ : ${r.entry.label} → ${describe(person)}` : `NON COCHÉ : ${r.entry.label} — ${failures.get(person.key) || (touched.has(person.key) ? 'Sélection non conservée après pagination' : 'Ligne disparue depuis l’analyse')}`;
    });
    setReport(`BILAN — ${new Date().toLocaleString('fr-FR')}\n${verified.size} case(s) unique(s) cochée(s) et vérifiée(s) sur ${p.targets.size}.\nFiltres du site : ${p.filters}\nLes cases préexistantes ont été conservées.\n${p.enrichment || ''}\n${lines.join('\n')}`);
    $('status').textContent = `${verified.size}/${p.targets.size} cases confirmées. ${p.results.filter(r => r.status !== 'trouve' || !verified.has(r.candidates[0].key)).length} entrée(s) non cochée(s) ou non résolue(s). Consultez le bilan avant d’imprimer.`;
  });
  $('names').addEventListener('input', invalidate); $('scope').addEventListener('change', invalidate);
  $('file').onchange = async () => {
    invalidate(); const file = $('file').files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Fichier trop volumineux (maximum 2 Mo).');
      const bytes = await file.arrayBuffer(); let text;
      const b = new Uint8Array(bytes);
      if (b[0] === 255 && b[1] === 254) text = new TextDecoder('utf-16le').decode(bytes);
      else if (b[0] === 254 && b[1] === 255) text = new TextDecoder('utf-16be').decode(bytes);
      else { try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { text = new TextDecoder('windows-1252').decode(bytes); } }
      $('names').value = text; $('status').textContent = `${file.name} chargé. Cliquez sur « Analyser ». `;
    } catch (error) { $('status').textContent = error.message; }
  };
  $('close').onclick = () => { host.hidden = true; };
  $('stop').onclick = () => { stopped = true; };
  $('export').onclick = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + report], {type: 'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'bilan-badges.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  // Stop if the user interacts with the site while automatic traversal is running.
  for (const event of ['click','input','change','keydown']) document.addEventListener(event, e => {
    if (!e.isTrusted || e.composedPath().includes(host)) return;
    if (busy) stopped = true;
    else if (event === 'input' || event === 'change') invalidate();
  }, true);
})();
