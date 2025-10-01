function getStoredToken() {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  } catch { return ''; }
}
let authToken = getStoredToken();

function authHeaders() {
  const headers = {};
  if (authToken) {headers['Authorization'] = 'Bearer ' + authToken;}
  return headers;
}

async function fetchJSON(url, options = {}) {
  const base = options || {};
  const headers = { ...(base.headers || {}) };
  if (authToken && !headers['Authorization']) {headers['Authorization'] = 'Bearer ' + authToken;}
  if (base.body !== null && base.body !== undefined && !headers['Content-Type']) {headers['Content-Type'] = 'application/json';}
  // Protection CSRF: ajouter X-Requested-With pour toutes les requêtes API
  if (!headers['X-Requested-With']) {headers['X-Requested-With'] = 'XMLHttpRequest';}
  const res = await fetch(url, { ...base, headers });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') {e.className = v;}
    else if (k.startsWith('on') && typeof v === 'function') {e.addEventListener(k.slice(2), v);}
    else {e.setAttribute(k, v);}
  });
  children.flat().forEach((c) => {
    if (c === null || c === undefined) {return;}
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

function logout() {
  authToken = '';
  try { localStorage.removeItem('token'); } catch {}
  try { sessionStorage.removeItem('token'); } catch {}
  window.currentUser = null;
  window.location.replace('/login.html');
}

async function ensureAuthOrRedirect() {
  if (!authToken) {
    window.location.replace('/login.html');
    return false;
  }
  try {
    const me = await fetchJSON('/api/auth/me');
    window.currentUser = me.user;
    return true;
  } catch {
    try { localStorage.removeItem('token'); } catch {}
    window.location.replace('/login.html');
    return false;
  }
}

function renderTopbarMenu() {
  const menu = document.getElementById('menu-dropdown');
  if (!menu) {return;}
  menu.innerHTML = '';
  if (window.currentUser) {
    const homeLink = el('a', { class: 'menu-item', href: '/' }, 'Accueil');
    const logoutBtn = el('button', { class: 'menu-item', onclick: () => { closeMenu(); logout(); } }, 'Se déconnecter');
    menu.append(homeLink, logoutBtn);
  } else {
    const loginLink = el('a', { class: 'menu-item', href: '/login.html' }, 'Se connecter');
    menu.append(loginLink);
  }
}

function closeMenu() {
  const menu = document.getElementById('menu-dropdown');
  const toggle = document.getElementById('menu-toggle');
  if (menu) {menu.classList.remove('open');}
  if (toggle) {toggle.setAttribute('aria-expanded', 'false');}
}

async function loadCardTypes() {
  try {
    const types = await fetchJSON('/api/card-types');
    return types;
  } catch { return []; }
}

async function addCardType(label) {
  await fetchJSON('/api/card-types', { method: 'POST', body: JSON.stringify({ label }) });
}

async function deleteCardType(code) {
  const res = await fetch(`/api/card-types/${encodeURIComponent(code)}`, { method: 'DELETE', headers: authHeaders() });
  if (res.status === 409) {
    const e = new Error('in_use');
    e.status = 409;
    throw e;
  }
  if (!res.ok) {throw new Error('delete_failed');}
}

async function loadTypesList() {
  try {
    const types = await loadCardTypes();
    const container = document.getElementById('types-list');
    if (!container) {return;}
    container.innerHTML = '';
    const table = el('table', { class: 'table' });
    table.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Libellé'), el('th', {}, 'Code'), el('th', {}, 'Actions'))));
    const tbody = el('tbody');
    types.forEach((t) => {
      tbody.appendChild(
        el(
          'tr',
          {},
          el('td', {}, t.label),
          el('td', {}, t.code),
          el(
            'td',
            {},
            el(
              'button',
              {
                class: 'btn small danger',
                onclick: async () => {
                  if (!confirm(`Supprimer le type "${t.label}" ?`)) {return;}
                  try {
                    await deleteCardType(t.code);
                    await loadTypesList();
                  } catch (e) {
                    if (e && e.status === 409) {alert('Impossible: ce type est utilisé par au moins une demande.');}
                    else {alert('Suppression impossible.');}
                  }
                },
              },
              'Supprimer'
            )
          )
        )
      );
    });
    table.appendChild(tbody);
    container.appendChild(table);
  } catch {}
}

async function addUser(formData) {
  const created = await fetchJSON('/api/auth/register', { method: 'POST', body: JSON.stringify(formData) });
  try {
    await loadUsers();
  } catch (e) {
    console.warn('Refresh users failed after create:', e);
  }
  return created;
}

async function loadUsers() {
  try {
    const users = await fetchJSON('/api/users');
    const container = document.getElementById('users-list');
    container.innerHTML = '';
    const table = el('table', { class: 'table' });
    table.appendChild(
      el('thead', {}, el('tr', {}, el('th', {}, 'ID'), el('th', {}, 'Nom'), el('th', {}, 'Email'), el('th', {}, 'Role'), el('th', {}, 'Actions')))
    );
    const tbody = el('tbody');

    function buildRow(user, editing = false) {
      const row = el('tr');
      const idTd = el('td', {}, String(user.id));
      const nameTd = el('td');
      const emailTd = el('td');
      const roleTd = el('td');
      const actionsTd = el('td', { class: 'user-actions-cell' });

      if (!editing) {
        nameTd.textContent = user.name;
        emailTd.textContent = user.email;
        roleTd.textContent = user.role;
        actionsTd.append(
          el(
            'button',
            {
              class: 'btn',
              onclick: () => {
                row.replaceWith(buildRow(user, true));
              },
            },
            'Modifier'
          ),
          ' ',
          el(
            'button',
            {
              class: 'btn danger',
              onclick: async () => {
                if (!confirm('Supprimer cet utilisateur ?')) {return;}
                try {
                  await fetch(`/api/users/${user.id}`, { method: 'DELETE', headers: authHeaders() });
                  await loadUsers();
                } catch {
                  alert("Echec de la suppression de l'utilisateur");
                }
              },
            },
            'Supprimer'
          )
        );
      } else {
        const nameInput = el('input', { type: 'text', value: user.name });
        const emailInput = el('input', { type: 'email', value: user.email });
        const roleSelect = el(
          'select',
          {},
          el('option', { value: 'requester' }, 'Demandeur'),
          el('option', { value: 'admin' }, 'Administrateur'),
          el('option', { value: 'appel' }, 'Appel')
        );
        roleSelect.value = user.role;
        nameTd.append(nameInput);
        emailTd.append(emailInput);
        roleTd.append(roleSelect);

        const pwdInput = el('input', { type: 'password', placeholder: 'Nouveau mot de passe (optionnel)', class: 'user-pwd-input' });
        actionsTd.append(
          pwdInput,
          ' ',
          el(
            'button',
            {
              class: 'btn small',
              onclick: async () => {
                try {
                  const name = nameInput.value.trim();
                  const email = emailInput.value.trim();
                  const role = roleSelect.value;
                  const password = pwdInput.value || '';
                  await fetchJSON(`/api/users/${user.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ name, email, role, password }),
                  });
                  await loadUsers();
                } catch {
                  alert("Echec de la mise à jour de l'utilisateur");
                }
              },
            },
            'Enregistrer'
          ),
          ' ',
          el(
            'button',
            {
              class: 'btn small danger',
              onclick: () => {
                row.replaceWith(buildRow(user, false));
              },
            },
            'Annuler'
          )
        );
      }

      row.append(idTd, nameTd, emailTd, roleTd, actionsTd);
      return row;
    }

    users.forEach((u) => tbody.appendChild(buildRow(u, false)));
    table.appendChild(tbody);
    container.appendChild(table);
  } catch {}
}

async function onLogoSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = document.getElementById('logo-msg');
  if (msg) { msg.textContent = ''; msg.className = 'msg'; }
  const file = form.logo && form.logo.files && form.logo.files[0];
  if (!file) { if (msg) { msg.textContent = 'Sélectionnez un fichier image'; msg.className = 'msg error'; } return; }
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
    if (msg) { msg.textContent = 'Type non supporté (PNG, JPEG, WEBP)'; msg.className = 'msg error'; }
    return;
  }
  if (file.size > 4 * 1024 * 1024) { if (msg) { msg.textContent = 'Fichier trop volumineux (> 4MB)'; msg.className = 'msg error'; } return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await fetchJSON('/api/settings/logo', { method: 'POST', body: JSON.stringify({ data: reader.result }) });
      if (msg) { msg.textContent = 'Logo mis à jour ✔'; msg.className = 'msg success'; }
    } catch (err) {
      const reason = err && err.message ? ' (' + err.message + ')' : '';
      if (msg) { msg.textContent = 'Echec du téléversement' + reason; msg.className = 'msg error'; }
    }
  };
  reader.readAsDataURL(file);
}

window.addEventListener('DOMContentLoaded', async () => {
  // Menu toggle
  const toggle = document.getElementById('menu-toggle');
  const dropdown = document.getElementById('menu-dropdown');
  const logo = document.querySelector('.brand-logo');
  const titleEl = document.querySelector('.brand-title');
  const goHome = (e) => { e.preventDefault(); window.location.assign('/'); };
  if (logo) { logo.style.cursor = 'pointer'; logo.title = "Retour à l'accueil"; logo.addEventListener('click', goHome); }
  if (titleEl) { titleEl.style.cursor = 'pointer'; titleEl.title = "Retour à l'accueil"; titleEl.addEventListener('click', goHome); }
  if (toggle && dropdown) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!dropdown.classList.contains('open')) {return;}
      if (!dropdown.contains(e.target) && e.target !== toggle) {
        dropdown.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const ok = await ensureAuthOrRedirect();
  if (!ok) {return;}

  renderTopbarMenu();

  const adminPanel = document.getElementById('admin-panel');
  const nonAdminPanel = document.getElementById('non-admin-panel');

  if (window.currentUser && window.currentUser.role === 'admin') {
    if (adminPanel) {
      adminPanel.classList.remove('hidden');
      adminPanel.removeAttribute('hidden');
    }
    if (nonAdminPanel) {
      nonAdminPanel.classList.add('hidden');
      nonAdminPanel.setAttribute('hidden', '');
    }

    const logoForm = document.getElementById('logo-form');
    if (logoForm) {logoForm.addEventListener('submit', onLogoSubmit);}

    const importForm = document.getElementById('import-suggestions-form');
    if (importForm) {
      importForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('import-msg');
        if (msg) { msg.textContent = ''; msg.className = 'msg'; }
        const file = importForm.querySelector('input[type="file"][name="csv"]').files[0];
        if (!file) { if (msg) { msg.textContent = 'Fichier requis'; msg.className = 'msg error'; } return; }
        try {
          const text = await file.text();
          const res = await fetchJSON('/api/settings/suggestions/import-csv', { method: 'POST', body: JSON.stringify({ csv: text }) });
          if (msg) { msg.textContent = `Import terminé ✔ (importés: ${res.imported}, ignorés: ${res.skipped})`; msg.className = 'msg success'; }
          importForm.reset();
        } catch (err) {
          const reason = err && err.message ? ': ' + err.message : '';
          if (msg) { msg.textContent = 'Échec de l\'import' + reason; msg.className = 'msg error'; }
        }
      });
    }

    // Export suggestions as CSV
    const exportBtn = document.getElementById('export-suggestions-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        const msg = document.getElementById('suggestions-actions-msg');
        if (msg) { msg.textContent = ''; msg.className = 'msg'; }
        try {
          const res = await fetch('/api/settings/suggestions/export-csv', { headers: authHeaders() });
          if (!res.ok) { throw new Error('Export échoué'); }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'suggestions-export.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          if (msg) { msg.textContent = 'Export effectué ✔'; msg.className = 'msg success'; }
        } catch (_err) {
          if (msg) { msg.textContent = 'Échec de l\'export'; msg.className = 'msg error'; }
        }
      });
    }

    // Export then delete suggestions
    const exportDeleteBtn = document.getElementById('export-then-delete-btn');
    if (exportDeleteBtn) {
      exportDeleteBtn.addEventListener('click', async () => {
        const msg = document.getElementById('suggestions-actions-msg');
        if (msg) { msg.textContent = ''; msg.className = 'msg'; }
        // First export
        try {
          const res = await fetch('/api/settings/suggestions/export-csv', { headers: authHeaders() });
          if (!res.ok) { throw new Error('Export échoué'); }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'suggestions-export.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (_err) {
          if (msg) { msg.textContent = 'Échec de l\'export, suppression annulée'; msg.className = 'msg error'; }
          return;
        }
        // Then confirm deletion
        if (!confirm('Confirmer la suppression de toutes les suggestions ?')) { return; }
        try {
          const del = await fetch('/api/settings/suggestions', { method: 'DELETE', headers: authHeaders() });
          if (!del.ok) { throw new Error('Suppression échouée'); }
          if (msg) { msg.textContent = 'Suggestions supprimées ✔'; msg.className = 'msg success'; }
        } catch (_err2) {
          if (msg) { msg.textContent = 'Échec de la suppression'; msg.className = 'msg error'; }
        }
      });
    }

    document.getElementById('add-type-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formEl = e.currentTarget;
      const label = new FormData(formEl).get('label');
      try {
        await addCardType(label);
        await loadTypesList();
        formEl.reset();
      } catch (err) {
        alert("Impossible d'ajouter le type: " + (err.message || ''));
      }
    });

    let creatingUser = false;
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (creatingUser) {return;}
      creatingUser = true;
      const formEl = e.currentTarget;
      const submitBtn = formEl.querySelector('button[type="submit"]');
      const msgEl = document.getElementById('add-user-msg');
      if (msgEl) { msgEl.textContent = ''; msgEl.className = 'msg'; }
      const data = Object.fromEntries(new FormData(formEl).entries());
      try {
        if (submitBtn) {submitBtn.disabled = true;}
        await addUser(data);
        formEl.reset();
        if (msgEl) { msgEl.textContent = 'Utilisateur créé ✔'; msgEl.className = 'msg success'; }
      } catch (err) {
        const txt = err && err.status === 409 ? 'Email déjà utilisé' : "Impossible de créer l'utilisateur";
        if (msgEl) { msgEl.textContent = txt; msgEl.className = 'msg error'; }
        else {alert(txt);}
      } finally {
        creatingUser = false;
        if (submitBtn) {submitBtn.disabled = false;}
      }
    });

    await loadUsers();
    await loadTypesList();
  } else {
    if (adminPanel) {
      adminPanel.classList.add('hidden');
      adminPanel.setAttribute('hidden', '');
    }
    if (nonAdminPanel) {
      nonAdminPanel.classList.remove('hidden');
      nonAdminPanel.removeAttribute('hidden');
    }
  }

  // Notifications section visible for any authenticated user
  const notifPanel = document.getElementById('notifications-panel');
  if (window.currentUser && notifPanel) {
    notifPanel.classList.remove('hidden');
    notifPanel.removeAttribute('hidden');
    const msg = document.getElementById('push-msg');
    const enableBtn = document.getElementById('enable-push-btn');
    const disableBtn = document.getElementById('disable-push-btn');

    async function getVapidPublicKey() {
      try {
        const res = await fetch('/api/notifications/vapid-public');
        if (!res.ok) { return null; }
        const data = await res.json();
        return data.publicKey || null;
      } catch { return null; }
    }

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
      return outputArray;
    }

    async function subscribePush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { msg.textContent = 'Notifications push non supportées'; msg.className = 'msg error'; return; }
      try {
        const pub = await getVapidPublicKey();
        if (!pub) { msg.textContent = 'Serveur non configuré (VAPID)'; msg.className = 'msg error'; return; }
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pub) });
        await fetchJSON('/api/notifications/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
        msg.textContent = 'Notifications activées ✔'; msg.className = 'msg success';
      } catch (_e) {
        msg.textContent = 'Échec de l\'activation des notifications'; msg.className = 'msg error';
      }
    }

    async function unsubscribePush() {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) { msg.textContent = 'Aucun service worker'; msg.className = 'msg'; return; }
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetchJSON('/api/notifications/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) });
          await sub.unsubscribe();
        }
        msg.textContent = 'Notifications désactivées ✔'; msg.className = 'msg success';
      } catch {
        msg.textContent = 'Échec de la désactivation'; msg.className = 'msg error';
      }
    }

    if (enableBtn) { enableBtn.addEventListener('click', subscribePush); }
    if (disableBtn) { disableBtn.addEventListener('click', unsubscribePush); }

    // Dev: generate VAPID keys (admin only, non-production)
    const genBtn = document.getElementById('gen-vapid-btn');
    if (genBtn) {
      genBtn.addEventListener('click', async () => {
        if (msg) { msg.textContent = ''; msg.className = 'msg'; }
        try {
          const res = await fetch('/api/notifications/generate-vapid', { headers: authHeaders() });
          if (!res.ok) {
            if (msg) { msg.textContent = 'Génération indisponible (production ou droits insuffisants).'; msg.className = 'msg error'; }
            return;
          }
          const data = await res.json();
          if (msg) { msg.textContent = 'Clés VAPID générées (dev). Copiez-les pour configurer votre serveur.'; msg.className = 'msg success'; }
        } catch {
          if (msg) { msg.textContent = 'Erreur lors de la génération des clés.'; msg.className = 'msg error'; }
        }
      });
    }

    const genProdBtn = document.getElementById('gen-vapid-prod-btn');
    if (genProdBtn) {
      genProdBtn.addEventListener('click', async () => {
        if (!confirm('Confirmer la génération et l\'installation de nouvelles clés VAPID sur ce serveur ?')) { return; }
        try {
          const res = await fetch('/api/notifications/vapid/generate', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
          if (!res.ok) { if (msg) { msg.textContent = 'Échec de la génération côté serveur.'; msg.className = 'msg error'; } return; }
          const data = await res.json();
          if (msg) { msg.textContent = 'Clés VAPID installées sur le serveur ✔'; msg.className = 'msg success'; }
        } catch {
          if (msg) { msg.textContent = "Erreur lors de l'installation des clés."; msg.className = 'msg error'; }
        }
      });
    }
  }
});

// === FAIL2BAN MANAGEMENT ===
async function loadFail2BanConfig() {
  try {
    const config = await fetchJSON('/api/fail2ban/config', { method: 'GET' });
    document.getElementById('fail2ban-enabled').checked = config.enabled;
    document.getElementById('fail2ban-max-attempts').value = config.maxAttempts || 5;
    document.getElementById('fail2ban-ban-duration').value = config.banDuration || 15;
  } catch (e) {
    console.error('Erreur chargement config fail2ban:', e);
  }
}

async function loadBannedIps() {
  try {
    const banned = await fetchJSON('/api/fail2ban/banned', { method: 'GET' });
    const container = document.getElementById('banned-ips-list');

    if (banned.length === 0) {
      container.innerHTML = '<p class="muted">Aucune IP bannie actuellement.</p>';
      return;
    }

    container.innerHTML = '';
    banned.forEach((record) => {
      const div = el('div', { class: 'user-item' },
        el('span', {}, `IP: ${record.ip} - Banni jusqu'à ${new Date(record.bannedUntil).toLocaleString()} (${record.attempts} tentatives)`),
        el('button', { class: 'btn danger small' }, 'Débannir')
      );

      div.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`Débannir l'IP ${record.ip} ?`)) {return;}
        try {
          await fetchJSON(`/api/fail2ban/banned/${encodeURIComponent(record.ip)}`, { method: 'DELETE' });
          loadBannedIps();
        } catch (e) {
          alert('Erreur débannissement: ' + e.message);
        }
      });

      container.appendChild(div);
    });
  } catch (e) {
    console.error('Erreur chargement IPs bannies:', e);
  }
}

// === WEBAUTHN CONFIG ===
async function loadWebAuthnConfig() {
  try {
    const config = await fetchJSON('/api/settings/webauthn');
    document.getElementById('webauthn-rp-name').value = config.rpName || '';
    document.getElementById('webauthn-rp-id').value = config.rpID || '';
    document.getElementById('webauthn-origin').value = config.origin || '';
  } catch (e) {
    console.error('Erreur chargement config WebAuthn:', e);
  }
}

const webauthnConfigForm = document.getElementById('webauthn-config-form');
if (webauthnConfigForm) {
  loadWebAuthnConfig();

  webauthnConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('webauthn-config-msg');
    msg.textContent = '';

    const rpName = document.getElementById('webauthn-rp-name').value.trim();
    const rpID = document.getElementById('webauthn-rp-id').value.trim();
    const origin = document.getElementById('webauthn-origin').value.trim();

    try {
      await fetchJSON('/api/settings/webauthn', {
        method: 'PATCH',
        body: JSON.stringify({ rpName, rpID, origin })
      });
      msg.textContent = '✓ Configuration WebAuthn sauvegardée';
      msg.className = 'msg success';
    } catch (e) {
      msg.textContent = '✗ ' + e.message;
      msg.className = 'msg error';
    }
  });
}

const fail2banConfigForm = document.getElementById('fail2ban-config-form');
if (fail2banConfigForm) {
  fail2banConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('fail2ban-config-msg');
    msg.textContent = '';

    const enabled = document.getElementById('fail2ban-enabled').checked;
    const maxAttempts = parseInt(document.getElementById('fail2ban-max-attempts').value, 10);
    const banDuration = parseInt(document.getElementById('fail2ban-ban-duration').value, 10);

    try {
      await fetchJSON('/api/fail2ban/config', {
        method: 'PATCH',
        body: JSON.stringify({ enabled, maxAttempts, banDuration })
      });
      msg.textContent = '✓ Configuration sauvegardée';
      msg.className = 'msg success';
    } catch (e) {
      msg.textContent = '✗ ' + e.message;
      msg.className = 'msg error';
    }
  });
}

const refreshBannedBtn = document.getElementById('refresh-banned-ips');
if (refreshBannedBtn) {
  refreshBannedBtn.addEventListener('click', loadBannedIps);
}

// Charger la config fail2ban au démarrage si admin
const adminPanelCheck = document.getElementById('admin-panel');
if (adminPanelCheck && !adminPanelCheck.hidden) {
  loadFail2BanConfig();
  loadBannedIps();
}

// Gérer l'erreur de chargement du logo (masquer si inexistant)
const headerLogo = document.getElementById('header-logo');
if (headerLogo) {
  headerLogo.addEventListener('error', () => {
    headerLogo.style.display = 'none';
  });
}

// === PASSKEYS MANAGEMENT ===
async function loadMyPasskeys() {
  try {
    const passkeys = await fetchJSON('/api/passkeys/my-passkeys', { method: 'GET' });
    const container = document.getElementById('my-passkeys-list');

    if (passkeys.length === 0) {
      container.innerHTML = '<p class="muted">Aucune passkey enregistrée.</p>';
      return;
    }

    container.innerHTML = '';
    passkeys.forEach((pk) => {
      const div = el('div', { class: 'user-item' },
        el('span', {}, `${pk.nickname} - Créée le ${new Date(pk.createdAt).toLocaleString()}${pk.lastUsedAt ? ` - Dernière utilisation: ${new Date(pk.lastUsedAt).toLocaleString()}` : ''}`),
        el('button', { class: 'btn danger small' }, 'Supprimer')
      );

      div.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`Supprimer la passkey "${pk.nickname}" ?`)) {return;}
        try {
          await fetchJSON(`/api/passkeys/my-passkeys/${pk.id}`, { method: 'DELETE' });
          loadMyPasskeys();
          const msg = document.getElementById('passkey-msg');
          if (msg) {
            msg.textContent = '✓ Passkey supprimée';
            msg.className = 'msg success';
          }
        } catch (e) {
          const msg = document.getElementById('passkey-msg');
          if (msg) {
            msg.textContent = '✗ ' + e.message;
            msg.className = 'msg error';
          }
        }
      });

      container.appendChild(div);
    });
  } catch (e) {
    console.error('Erreur chargement passkeys:', e);
  }
}

async function loadAllPasskeys() {
  try {
    const passkeys = await fetchJSON('/api/passkeys/all', { method: 'GET' });
    const container = document.getElementById('all-passkeys-list');

    if (!container) {return;}

    if (passkeys.length === 0) {
      container.innerHTML = '<p class="muted">Aucune passkey enregistrée.</p>';
      return;
    }

    container.innerHTML = '';
    passkeys.forEach((pk) => {
      const div = el('div', { class: 'user-item' },
        el('span', {}, `${pk.userEmail} (${pk.userName}) - ${pk.nickname} - Créée: ${new Date(pk.createdAt).toLocaleString()}`),
        el('button', { class: 'btn danger small' }, 'Supprimer')
      );

      div.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`Supprimer la passkey "${pk.nickname}" de ${pk.userEmail} ?`)) {return;}
        try {
          await fetchJSON(`/api/passkeys/all/${pk.id}`, { method: 'DELETE' });
          loadAllPasskeys();
        } catch (e) {
          alert('Erreur suppression: ' + e.message);
        }
      });

      container.appendChild(div);
    });
  } catch (e) {
    console.error('Erreur chargement all passkeys:', e);
  }
}

const addPasskeyBtn = document.getElementById('add-passkey-btn');
if (addPasskeyBtn) {
  addPasskeyBtn.addEventListener('click', async () => {
    const msg = document.getElementById('passkey-msg');
    if (msg) {
      msg.textContent = '';
      msg.className = 'msg';
    }

    try {
      // Vérifier le support WebAuthn
      if (!window.PublicKeyCredential) {
        if (msg) {
          msg.textContent = 'Votre navigateur ne supporte pas les passkeys';
          msg.className = 'msg error';
        }
        return;
      }

      // Demander un surnom
      const nickname = prompt('Donnez un nom à cette passkey (ex: "iPhone", "Windows Hello")', 'Ma passkey');
      if (!nickname) {return;}

      // Étape 1: Obtenir les options du serveur
      if (msg) {
        msg.textContent = 'Génération des options...';
        msg.className = 'msg';
      }

      const options = await fetchJSON('/api/passkeys/register/generate-options', { method: 'POST' });

      // Étape 2: Créer la passkey
      if (msg) {
        msg.textContent = 'Veuillez utiliser votre appareil pour créer la passkey...';
        msg.className = 'msg';
      }

      const credential = await window.WebAuthnHelper.startRegistration(options);

      // Étape 3: Envoyer au serveur pour vérification
      if (msg) {
        msg.textContent = 'Vérification...';
        msg.className = 'msg';
      }

      await fetchJSON('/api/passkeys/register/verify', {
        method: 'POST',
        body: JSON.stringify({ credential, nickname })
      });

      // Succès
      if (msg) {
        msg.textContent = '✓ Passkey créée avec succès !';
        msg.className = 'msg success';
      }

      loadMyPasskeys();
    } catch (e) {
      console.error('Erreur création passkey:', e);
      if (msg) {
        msg.textContent = '✗ ' + (e.message || 'Erreur lors de la création de la passkey');
        msg.className = 'msg error';
      }
    }
  });
}

const refreshAllPasskeysBtn = document.getElementById('refresh-all-passkeys');
if (refreshAllPasskeysBtn) {
  refreshAllPasskeysBtn.addEventListener('click', loadAllPasskeys);
}

// Charger les passkeys au démarrage
loadMyPasskeys();

// Si admin, charger aussi toutes les passkeys
const adminPanelForPasskeys = document.getElementById('admin-panel');
if (adminPanelForPasskeys && !adminPanelForPasskeys.hidden) {
  loadAllPasskeys();
}
