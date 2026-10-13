const message = document.getElementById('message');
const secret = document.getElementById('token-secret');
const secretPanel = document.getElementById('new-token');
function hideSecret() { secret.value = ''; secretPanel.hidden = true; }

async function api(method = 'GET', suffix = '', body) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  const response = await fetch(`/api/personal-tokens${suffix}`, {
    method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 401) { window.location.href = '/login.html'; throw new Error('Connexion requise.'); }
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) { throw new Error(data.error || 'Opération impossible.'); }
  return data;
}

async function loadTokens() {
  const tokens = await api();
  const list = document.getElementById('token-list');
  list.replaceChildren();
  if (!tokens.length) { list.textContent = 'Aucun jeton actif.'; }
  for (const token of tokens) {
    const row = document.createElement('p');
    const label = document.createElement('span');
    label.textContent = `${token.name} — expire le ${new Date(token.expiresAt).toLocaleDateString('fr-FR')} `;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Révoquer';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api('DELETE', `/${encodeURIComponent(token.id)}`);
        hideSecret();
        message.textContent = 'Jeton révoqué.';
        await loadTokens();
      } catch (error) { message.textContent = error.message; button.disabled = false; }
    });
    row.append(label, button);
    list.append(row);
  }
}

document.getElementById('mcp-url').value = `${window.location.origin}/mcp`;
document.getElementById('token-form').addEventListener('submit', async event => {
  event.preventDefault();
  hideSecret();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const data = await api('POST', '', { name: form.elements.name.value, expiresInDays: Number(form.elements.days.value) });
    secret.value = data.token;
    secretPanel.hidden = false;
    message.textContent = 'Jeton créé.';
    await loadTokens();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
document.getElementById('hide-token').addEventListener('click', hideSecret);
document.getElementById('copy-token').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(secret.value); message.textContent = 'Jeton copié.'; }
  catch { secret.select(); message.textContent = 'Sélectionnez puis copiez le jeton.'; }
});
window.addEventListener('pagehide', hideSecret);
loadTokens().catch(error => { message.textContent = error.message; });
