/* End-to-end check against an isolated, real AffichApp server. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

(async () => {
  const original = process.cwd();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'badge-oauth-test-'));
  let server;
  try {
    process.chdir(temporary);
    const users = require('../src/services/users');
    const admin = await users.create({ name: 'Test', email: 'badge-test@example.test', role: 'admin', password: 'test-password-123' });
    await require('../src/services/cardTypes').seedDefaultsIfEmpty();
    const app = require('../src/app').createApp();
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const db = require('../src/services/db').db;
    const card = await db.create({ applicantName: 'Élodie Martin', cardType: 'etudiants' }, admin);
    let stored = {}, listener, permission = true, refreshes = 0, badState = false;
    const browser = {
      storage: { local: { get: async () => structuredClone(stored), set: async value => { stored = structuredClone(value); } } },
      permissions: { contains: async () => permission },
      identity: {
        getRedirectURL: () => 'https://badges-test.extensions.allizom.org/',
        launchWebAuthFlow: async ({ url }) => {
          const parsed = new URL(url);
          assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
          assert.equal(parsed.searchParams.get('resource'), origin + '/api/integration');
          const body = new URLSearchParams(parsed.searchParams);
          body.set('email', admin.email); body.set('password', 'test-password-123');
          const response = await fetch(origin + '/authorize', { method: 'POST', body, redirect: 'manual' });
          assert.equal(response.status, 302);
          const callback = new URL(response.headers.get('location'));
          if (badState) { callback.searchParams.set('state', 'tampered'); }
          return callback.href;
        },
      },
      runtime: { getURL: value => 'moz-extension://test/' + value, openOptionsPage: async () => {}, onMessage: { addListener: fn => { listener = fn; } } },
      browserAction: { onClicked: { addListener: () => {} } },
    };
    const context = vm.createContext({ browser, crypto: webcrypto, URL, URLSearchParams, TextEncoder, Uint8Array, btoa, AbortSignal, console,
      fetch: async (url, options) => {
        assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
        if (options.body instanceof URLSearchParams && options.body.get('grant_type') === 'refresh_token') { refreshes++; }
        return fetch(url, options);
      } });
    for (const file of ['names.js', 'affichapp.js', 'background.js']) {
      vm.runInContext(await fs.readFile(path.join(__dirname, 'extension', file), 'utf8'), context);
    }
    const api = context.AffichApp;
    await assert.rejects(api.cards({}), /Connectez-vous/);
    assert.throws(() => api.serverUrl('https://example.test/path'), /origine/);
    assert.throws(() => api.serverUrl('http://example.test'), /HTTPS/);
    await api.configure(origin); await api.connect();
    const listed = await api.cards({});
    assert.equal(listed[0].applicantName, card.applicantName);
    assert.equal(listed[0].id, card.id);
    assert.equal(listed[0].email, undefined);
    const core = require('./extension/core');
    const parsedNames = core.parse('Nom complet\n"Élodie Martin"');
    const resolved = core.resolve(parsedNames, [{ key: 'inactive:1', last: 'Martin', first: 'Elodie' }]);
    assert.equal(resolved[0].status, 'trouve');
    const ambiguous = core.resolve(parsedNames, [{ last: 'Martin', first: 'Elodie' }, { last: 'Martin', first: 'Élodie' }]);
    assert.equal(ambiguous[0].status, 'ambigu');
    stored.affichapp.expires = 0;
    const concurrent = await Promise.all([api.cards({}), api.types()]);
    assert.equal(concurrent[0].length, 1); assert.equal(refreshes, 1);
    const result = await api.updateStatus([card.id, 99999], 'impression');
    assert.equal(result.updated.length, 1); assert.equal(result.failed.length, 1);
    assert.equal((await db.getById(card.id)).status, 'impression');
    await assert.rejects(api.updateStatus([card.id], 'disponible', 'https://wrong-server.test'), /serveur a changé/);
    await api.addName('Alice Dupont', 'etudiants');
    assert((await require('../src/services/suggestions').getAll()).some(item => item.name === 'Alice Dupont'));
    const contentSender = { url: 'https://idcapt.example.test/Activation_badge', tab: { id: 1 } };
    const status = await listener({ type: 'AFFICH_STATUS' }, contentSender);
    assert(status.ok); assert.equal(Object.keys(status.data).sort().join(','), 'autoNames,connected,mixedCategory,server');
    assert.equal(listener({ type: 'AFFICH_CONFIGURE', server: 'https://attacker.test' }, contentSender), undefined);
    assert.equal(listener({ type: 'AFFICH_CARDS' }, { url: 'https://other.test/page', tab: { id: 2 } }), undefined);
    const classifier = require('./extension/names');
    assert.equal(classifier.category('prof'), 'enseignants');
    assert.equal(classifier.category(' PROF '), 'enseignants');
    assert.equal(classifier.category('personnel'), 'personnels');
    assert.equal(classifier.category('prof_personnel'), 'personnels');
    assert.equal(classifier.category('2NDEA'), 'etudiants');
    assert.equal(classifier.category(''), null);
    assert.equal(classifier.category('  '), null);
    const people = [
      { last: 'Prof', first: 'Test', group: 'prof' },
      { last: 'Agent', first: 'Test', group: 'personnel' },
      { last: 'Mixte', first: 'Test', group: 'prof_personnel' },
      { last: 'Eleve', first: 'Test', group: '6EMEA' },
      { last: 'Sans', first: 'Classe', group: '' },
      { last: 'Dupont', first: 'Alice', group: 'prof' },
      { last: 'Homonyme', first: 'Test', group: 'prof' },
      { last: 'Homonyme', first: 'Test', group: 'personnel' },
    ];
    const disabled = await api.syncNames(people);
    assert.equal(disabled.disabled, true);
    assert(!(await require('../src/services/suggestions').getAll()).some(item => item.name === 'Prof Test'));
    await api.nameSettings(true, 'personnels');
    const enriched = await api.syncNames(people);
    assert.equal(enriched.added, 4); assert.equal(enriched.existing, 1); assert.equal(enriched.skipped, 2);
    const known = await require('../src/services/suggestions').getAll();
    for (const [name, type] of [['Prof Test', 'enseignants'], ['Agent Test', 'personnels'], ['Mixte Test', 'personnels'], ['Eleve Test', 'etudiants']]) {
      assert.equal(known.find(item => item.name === name).cardType, type);
    }
    assert(!known.some(item => item.name === 'Sans Classe' || item.name === 'Homonyme Test'));
    assert.equal(known.find(item => item.name === 'Alice Dupont').cardType, 'etudiants');
    const repeated = await api.syncNames(people);
    assert.equal(repeated.added, 0); assert.equal(repeated.existing, 5);
    await api.nameSettings(false, 'personnels');
    assert.equal((await api.syncNames([{last:'Disabled',first:'Test',group:'prof'}])).disabled, true);
    permission = false; await assert.rejects(api.cards({}), /retiré/); permission = true;
    await api.disconnect(); assert.equal(stored.affichapp.access, undefined);
    badState = true; await assert.rejects(api.connect(), /Retour de connexion invalide/); badState = false;
    await api.configure('https://other-server.example.test'); assert.equal(stored.affichapp.refresh, undefined); assert.equal(stored.affichapp.clientId, undefined);
    console.log('PASS: OAuth PKCE, callback state, real card API, name matching, ambiguity, refresh concurrency, status updates, autocomplete, sender restrictions, permissions and disconnect.');
  } finally {
    if (server) { await new Promise(resolve => server.close(resolve)); }
    process.chdir(original);
    if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('badge-oauth-test-')) {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
