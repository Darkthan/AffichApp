'use strict';
const $ = id => document.getElementById(id);
async function send(type, fields = {}) {
  const reply = await browser.runtime.sendMessage({ type, ...fields });
  if (!reply?.ok) { throw new Error(reply?.error || 'Extension indisponible.'); }
  return reply.data;
}
function serverOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Indiquez une origine HTTPS, sans chemin (HTTP seulement sur localhost).');
  }
  return url.origin;
}
async function refresh() {
  const config = await send('AFFICH_STATUS');
  $('server').value = config.server;
  $('auto-names').checked = config.autoNames;
  $('mixed-category').value = config.mixedCategory;
  $('connection').textContent = config.connected ? 'Connexion AffichApp enregistrée.' : 'Vous n’êtes pas connecté à AffichApp.';
  $('connect').disabled = !config.server;
  $('disconnect').disabled = !config.connected;
  $('add').disabled = !config.connected;
  $('type').replaceChildren(new Option('Sans type', ''));
  if (config.connected) {
    const types = await send('AFFICH_TYPES');
    types.forEach(type => $('type').append(new Option(type.label, type.code)));
  }
}
async function run(action) {
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  $('status').textContent = 'Traitement en cours…'; $('status').className = '';
  try { await action(); $('status').textContent = 'Enregistré.'; $('status').className = 'success'; }
  catch (error) { $('status').textContent = error.message; $('status').className = 'error'; }
  finally {
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
    await refresh().catch(error => { $('status').textContent = error.message; $('status').className = 'error'; });
  }
}
$('save').onclick = () => {
  let server;
  try { server = serverOrigin($('server').value.trim()); }
  catch (error) { $('status').textContent = error.message; return; }
  // Request permission directly in the click gesture, before asynchronous work.
  const permission = browser.permissions.request({ origins: [server + '/*'] });
  run(async () => {
    if (!await permission) { throw new Error('Accès au serveur refusé.'); }
    await send('AFFICH_CONFIGURE', { server });
  });
};
$('connect').onclick = () => run(() => send('AFFICH_CONNECT'));
$('disconnect').onclick = () => run(() => send('AFFICH_DISCONNECT'));
$('save-name-settings').onclick = () => run(() => send('AFFICH_NAME_SETTINGS', { enabled: $('auto-names').checked, mixedCategory: $('mixed-category').value }));
$('add').onclick = () => run(async () => {
  const name = $('name').value.trim();
  if (!name) { throw new Error('Saisissez un nom.'); }
  await send('AFFICH_ADD_NAME', { name, cardType: $('type').value });
  $('name').value = '';
});
refresh().catch(error => { $('status').textContent = error.message; });
