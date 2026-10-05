/* OAuth credentials stay in the extension background, never in the IDCapt page. */
globalThis.AffichApp = (() => {
  'use strict';
  let queue = Promise.resolve();
  const serialize = task => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  function serverUrl(value) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Indiquez seulement l’origine du serveur, par exemple https://cartes.example.org.');
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Utilisez HTTPS (HTTP est accepté uniquement pour un serveur local).');
    }
    return url.origin;
  }
  const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
  async function state() { return (await browser.storage.local.get('affichapp')).affichapp || {}; }
  async function save(value) { await browser.storage.local.set({ affichapp: value }); }
  async function network(server, path, options = {}) {
    const response = await fetch(server + path, { ...options, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 403 ? 'Votre compte ou son autorisation ne permet pas cette action.' :
        response.status === 401 ? 'Connexion expirée. Reconnectez-vous dans les réglages.' : `AffichApp : ${data.error || 'requête refusée'} (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function tokens(data) {
    if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
      throw new Error('Réponse OAuth du serveur invalide.');
    }
    return { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + data.expires_in * 1000 };
  }
  async function connect() {
    const config = await state();
    if (!config.server) { throw new Error('Enregistrez le serveur dans les réglages.'); }
    if (!await browser.permissions.contains({ origins: [config.server + '/*'] })) { throw new Error('Enregistrez le serveur pour autoriser son accès.'); }
    const redirect = browser.identity.getRedirectURL();
    if (!config.clientId) {
      const client = await network(config.server, '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'IDCapt — sélection de badges', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) });
      if (typeof client.client_id !== 'string') { throw new Error('Enregistrement OAuth invalide.'); }
      config.clientId = client.client_id;
      await save(config);
    }
    const verifier = random(), nonce = random();
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirect, response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', state: nonce, scope: 'cards:read cards:write names:write', resource: config.server + '/api/integration' });
    const result = new URL(await browser.identity.launchWebAuthFlow({ url: config.server + '/authorize?' + params, interactive: true }));
    const expected = new URL(redirect);
    if (result.origin !== expected.origin || result.pathname !== expected.pathname || result.searchParams.get('state') !== nonce || !result.searchParams.get('code')) {
      throw new Error('Retour de connexion invalide. Réessayez.');
    }
    const data = await network(config.server, '/token', { method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: config.clientId, code: result.searchParams.get('code'), redirect_uri: redirect, code_verifier: verifier }) });
    await save({ ...config, ...tokens(data) });
  }
  async function renew(config) {
    try {
      const data = await network(config.server, '/token', { method: 'POST', body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: config.clientId, refresh_token: config.refresh }) });
      Object.assign(config, tokens(data));
      await save(config);
    } catch (error) {
      if (error.status === 400 || error.status === 401) { await save({ server: config.server, clientId: config.clientId, autoNames: config.autoNames, mixedCategory: config.mixedCategory }); }
      throw error;
    }
  }
  async function api(path, options = {}) {
    const config = await state();
    if (!config.server || !config.refresh) { throw new Error('Connectez-vous à AffichApp dans les réglages de l’extension.'); }
    if (!await browser.permissions.contains({ origins: [config.server + '/*'] })) { throw new Error('L’accès au serveur a été retiré. Enregistrez-le à nouveau dans les réglages.'); }
    if (config.expires <= Date.now() + 60000) { await renew(config); }
    const perform = () => network(config.server, '/api/integration' + path, { ...options,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.access } });
    try { return await perform(); }
    catch (error) {
      if (error.status !== 401) { throw error; }
      await renew(config);
      return perform();
    }
  }
  return {
    serverUrl,
    status: async () => { const config = await state(); return { server: config.server || '', connected: !!config.refresh, autoNames: !!config.autoNames, mixedCategory: config.mixedCategory === undefined ? 'personnels' : config.mixedCategory }; },
    nameSettings: (enabled, mixedCategory) => serialize(async () => {
      if (typeof enabled !== 'boolean' || !['', 'enseignants', 'personnels'].includes(mixedCategory)) { throw new Error('Réglage de présaisie invalide.'); }
      await save({ ...await state(), autoNames: enabled, mixedCategory });
    }),
    configure: value => serialize(async () => {
      const server = serverUrl(value), old = await state();
      if (!await browser.permissions.contains({ origins: [server + '/*'] })) { throw new Error('Autorisez l’accès au serveur avant de l’enregistrer.'); }
      await save(old.server === server ? old : { server });
    }),
    connect: () => serialize(connect),
    disconnect: () => serialize(async () => { const config = await state(); await save({ server: config.server, clientId: config.clientId, autoNames: config.autoNames, mixedCategory: config.mixedCategory }); }),
    syncNames: people => serialize(async () => {
      const config = await state();
      if (!config.autoNames) { return { disabled: true }; }
      if (!Array.isArray(people) || people.length > 10000) { throw new Error('Liste de noms invalide ou trop volumineuse.'); }
      const capabilities = await api('/capabilities');
      if (!capabilities.importMissingNames) { throw new Error('Mettez à jour AffichApp pour importer uniquement les noms absents.'); }
      const prepared = BadgeNames.prepare(people, config.mixedCategory);
      const result = { added: 0, existing: 0, skipped: prepared.skipped, failed: 0, error: '' };
      for (const record of prepared.records) {
        try {
          const saved = await api('/names', { method: 'POST', body: JSON.stringify({ ...record, onlyIfMissing: true }) });
          if (typeof saved.added !== 'boolean') { throw new Error('Le serveur doit être mis à jour pour l’import des seuls noms absents.'); }
          if (saved.added) { result.added++; } else { result.existing++; }
        } catch (error) {
          result.failed++;
          result.error = error.message;
          result.failed += prepared.records.length - result.added - result.existing - result.failed;
          break;
        }
      }
      return result;
    }),
    cards: filters => serialize(async () => {
      const query = new URLSearchParams();
      if (filters?.status && !['demande', 'impression', 'disponible', 'all'].includes(filters.status)) { throw new Error('Statut invalide.'); }
      if (filters?.status) { query.set('status', filters.status); }
      if (filters?.cardType) { query.set('cardType', String(filters.cardType)); }
      const cards = await api('/cards?' + query);
      if (!Array.isArray(cards) || cards.some(card => !Number.isSafeInteger(card.id) || typeof card.applicantName !== 'string')) { throw new Error('Liste de cartes invalide.'); }
      return cards;
    }),
    types: () => serialize(() => api('/card-types')),
    updateStatus: (ids, status, expectedServer) => serialize(async () => {
      if (expectedServer && (await state()).server !== expectedServer) { throw new Error('Le serveur a changé. Récupérez de nouveau les cartes avant de modifier leur statut.'); }
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || !['demande', 'impression', 'disponible'].includes(status)) { throw new Error('Sélection ou statut invalide.'); }
      const updated = [], failed = [];
      for (const id of new Set(ids)) {
        try { await api(`/cards/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); updated.push(id); }
        catch (error) { failed.push({ id, error: error.message }); }
      }
      return { updated, failed };
    }),
    addName: (name, cardType) => serialize(() => api('/names', { method: 'POST', body: JSON.stringify({ name, ...(cardType ? { cardType } : {}) }) })),
  };
})();
