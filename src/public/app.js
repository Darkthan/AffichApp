function getStoredToken() {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  } catch { return ''; }
}
let authToken = getStoredToken();

function authHeaders() {
  const headers = {};
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  return headers;
}

async function fetchJSON(url, options = {}) {
  const base = options || {};
  const headers = { ...(base.headers || {}) };
  if (authToken && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + authToken;
  if (base.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
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
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c == null) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

function renderList(items) {
  const container = document.getElementById('list');
  container.innerHTML = '';
  if (!items.length) {
    container.appendChild(el('p', { class: 'muted' }, 'Aucune demande pour le moment.'));
    return;
  }
  const table = el('table', { class: 'table' });
  table.appendChild(
    el('thead', {}, el('tr', {}, el('th', {}, 'ID'), el('th', {}, 'Demandeur'), el('th', {}, 'Email'), el('th', {}, 'Type'), el('th', {}, 'Statut'), el('th', {}, 'Actions')))
  );
  const tbody = el('tbody');
  const isAdmin = window.currentUser && window.currentUser.role === 'admin';
  items.forEach((it) => {
    const isOwner = window.currentUser && window.currentUser.id === it.ownerId;
    const actionsCell = isAdmin
      ? el(
          'div',
          { class: 'btn-group' },
          el(
            'button',
            { class: 'btn small info', onclick: async () => { await updateStatus(it.id, 'demande'); await loadList(); } },
            'Demandé'
          ),
          el(
            'button',
            { class: 'btn small warn', onclick: async () => { await updateStatus(it.id, 'impression'); await loadList(); } },
            "Impression"
          ),
          el(
            'button',
            { class: 'btn small', onclick: async () => { await updateStatus(it.id, 'disponible'); await loadList(); } },
            'Disponible'
          ),
          el(
            'button',
            {
              class: 'btn small danger',
              onclick: async () => {
                if (!confirm('Supprimer cette demande ?')) return;
                try {
                  await deleteRequest(it.id);
                  await loadList();
                } catch (e) {
                  alert('Suppression impossible: ' + (e.message || ''));
                }
              },
            },
            'Supprimer'
          )
        )
      : isOwner
        ? el(
            'button',
            {
              class: 'btn small danger',
              onclick: async () => {
                if (!confirm('Supprimer cette demande ?')) return;
                try {
                  await deleteRequest(it.id);
                  await loadList();
                } catch (e) {
                  alert('Suppression impossible: ' + (e.message || ''));
                }
              },
            },
            'Supprimer'
          )
        : el('span', { class: 'muted' }, '—');
    tbody.appendChild(
      el(
        'tr',
        {},
        el('td', {}, String(it.id)),
        el('td', {}, it.applicantName),
        el('td', {}, it.email && it.email.trim() ? it.email : '—'),
        el('td', {}, it.cardType),
        el('td', {}, statusLabel(it.status)),
        el('td', {}, actionsCell)
      )
    );
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

async function deleteRequest(id) {
  const res = await fetch(`/api/requests/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Delete failed');
}

async function loadList() {
  try {
    const items = await fetchJSON('/api/requests');
    renderList(items);
  } catch (e) {
    console.error(e);
  }
}

async function updateStatus(id, status) {
  try {
    await fetchJSON(`/api/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadList();
  } catch (e) {
    alert('Impossible de mettre à jour le statut.');
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = document.getElementById('form-msg');
  msg.textContent = '';
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.email != null && payload.email.trim() === '') delete payload.email;
  if (payload.details != null && payload.details.trim() === '') delete payload.details;
  if (!payload.applicantName || !payload.cardType) {
    msg.textContent = 'Veuillez remplir les champs obligatoires.';
    msg.className = 'msg error';
    return;
  }
  try {
    await fetchJSON('/api/requests', { method: 'POST', body: JSON.stringify(payload) });
    msg.textContent = 'Demande envoyée ✔';
    msg.className = 'msg success';
    form.reset();
    await loadList();
  } catch (e) {
    const details = e && e.data && e.data.details ? ' (' + e.data.details.join(', ') + ')' : '';
    msg.textContent = "Erreur lors de l'envoi de la demande: " + (e.message || '') + details;
    msg.className = 'msg error';
  }
}

function statusLabel(code) {
  switch (code) {
    case 'demande':
      return 'Demandé';
    case 'impression':
      return "En cours d'impression";
    case 'disponible':
      return 'Disponible';
    default:
      return code;
  }
}

async function login(email, password) {
  const res = await fetchJSON('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  authToken = res.token;
  localStorage.setItem('token', authToken);
  window.currentUser = res.user;
  window.location.replace('/login.html');
}

function logout() {
  authToken = '';
  try { localStorage.removeItem('token'); } catch {}
  try { sessionStorage.removeItem('token'); } catch {}
  window.currentUser = null;
  window.location.replace('/login.html');
}

function renderAuth() {
  const userInfo = document.getElementById('user-info');
  const loginLink = document.getElementById('login-link');
  const adminPanel = document.getElementById('admin-panel');
  const requestSection = document.getElementById('request-section');
  const requestsListSection = document.getElementById('requests-list-section');
  const requestForm = document.getElementById('request-form');
  const passwordForm = document.getElementById('password-form');
  const callForm = document.getElementById('call-form');
  const isAuth = !!window.currentUser;
  if (isAuth) {
    if (loginLink) loginLink.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userInfo.removeAttribute('hidden');
    document.getElementById('user-name').textContent = window.currentUser.name || window.currentUser.email;
    document.getElementById('user-role').textContent = window.currentUser.role === 'admin' ? 'Administrateur' : window.currentUser.role === 'appel' ? 'Appel' : 'Demandeur';
    if (window.currentUser.role === 'admin') { adminPanel.classList.remove('hidden'); adminPanel.removeAttribute('hidden'); } else { adminPanel.classList.add('hidden'); adminPanel.setAttribute('hidden',''); }
    // Le rôle 'appel' ne voit ni la soumission ni la liste des demandes
    if (window.currentUser.role === 'appel') {
      if (requestSection) { requestSection.classList.add('hidden'); requestSection.setAttribute('hidden',''); }
      if (requestsListSection) { requestsListSection.classList.add('hidden'); requestsListSection.setAttribute('hidden',''); }
      if (requestForm) { requestForm.classList.add('hidden'); requestForm.setAttribute('hidden',''); }
    } else {
      if (requestSection) { requestSection.classList.remove('hidden'); requestSection.removeAttribute('hidden'); }
      if (requestsListSection) { requestsListSection.classList.remove('hidden'); requestsListSection.removeAttribute('hidden'); }
      if (requestForm) { requestForm.classList.remove('hidden'); requestForm.removeAttribute('hidden'); }
    }
    if (callForm) { callForm.classList.remove('hidden'); callForm.removeAttribute('hidden'); }
    if (passwordForm) { passwordForm.classList.remove('hidden'); passwordForm.removeAttribute('hidden'); }
  } else {
    if (loginLink) loginLink.classList.remove('hidden');
    userInfo.classList.add('hidden');
    userInfo.setAttribute('hidden','');
    adminPanel.classList.add('hidden');
    adminPanel.setAttribute('hidden','');
    if (requestSection) { requestSection.classList.add('hidden'); requestSection.setAttribute('hidden',''); }
    if (requestsListSection) { requestsListSection.classList.add('hidden'); requestsListSection.setAttribute('hidden',''); }
    if (requestForm) { requestForm.classList.add('hidden'); requestForm.setAttribute('hidden',''); }
    if (callForm) { callForm.classList.add('hidden'); callForm.setAttribute('hidden',''); }
    if (passwordForm) { passwordForm.classList.add('hidden'); passwordForm.setAttribute('hidden',''); }
  }
  refreshUI();
}

async function refreshUI() {
  await loadCardTypes();
  if (window.currentUser) {
    if (window.currentUser.role !== 'appel') {
      await loadList();
    } else {
      const listEl = document.getElementById('list');
      if (listEl) listEl.innerHTML = '';
    }
    await loadCalls();
  } else {
    document.getElementById('list').innerHTML = '<p class="muted">Connectez-vous pour voir vos demandes</p>';
    document.getElementById('calls-list').innerHTML = '<p class="muted">Connectez-vous pour voir les appels</p>';
  }
}

async function loadCardTypes() {
  try {
    const types = await fetchJSON('/api/card-types');
    const select = document.getElementById('card-type-select');
    select.innerHTML = '<option value="">-- Choisir --</option>';
    types.forEach((t) => select.appendChild(el('option', { value: t.code }, t.label)));
  } catch {}
}

async function addCardType(label) {
  await fetchJSON('/api/card-types', { method: 'POST', body: JSON.stringify({ label }) });
  await loadCardTypes();
}

async function deleteCardType(code) {
  const res = await fetch(`/api/card-types/${encodeURIComponent(code)}`, { method: 'DELETE', headers: authHeaders() });
  if (res.status === 409) {
    const e = new Error('in_use');
    e.status = 409;
    throw e;
  }
  if (!res.ok) throw new Error('delete_failed');
}

async function loadTypesList() {
  try {
    const types = await fetchJSON('/api/card-types');
    const container = document.getElementById('types-list');
    if (!container) return;
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
                  if (!confirm(`Supprimer le type "${t.label}" ?`)) return;
                  try {
                    await deleteCardType(t.code);
                    await loadCardTypes();
                    await loadTypesList();
                  } catch (e) {
                    if (e && e.status === 409) alert('Impossible: ce type est utilisé par au moins une demande.');
                    else alert('Suppression impossible.');
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
    // Ne pas faire échouer la création si le rafraîchissement de la liste rate
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
                if (!confirm('Supprimer cet utilisateur ?')) return;
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

window.addEventListener('DOMContentLoaded', async () => {
  const ok = await ensureAuthOrRedirect();
  if (!ok) return;
  document.getElementById('request-form').addEventListener('submit', onSubmit);
  /* login form removed; standalone page */
  /*document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email');
    const password = fd.get('password');
    try {
      await login(email, password);
    } catch {
      alert('Identifiants invalides');
    }
  });*/
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => logout());
  const callForm = document.getElementById('call-form');
  if (callForm) callForm.addEventListener('submit', onCallSubmit);
  const logoForm = document.getElementById('logo-form');
  if (logoForm) logoForm.addEventListener('submit', onLogoSubmit);
  const passwordForm = document.getElementById('password-form');
  if (passwordForm) passwordForm.addEventListener('submit', onPasswordSubmit);
  document.getElementById('add-type-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const label = new FormData(formEl).get('label');
    try {
      await addCardType(label);
      // Recharger entièrement la page pour refléter l'ajout
      window.location.reload();
    } catch (err) {
      alert("Impossible d'ajouter le type: " + (err.message || ''));
    }
  });
  let creatingUser = false;
  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (creatingUser) return;
    creatingUser = true;
    const formEl = e.currentTarget;
    const submitBtn = formEl.querySelector('button[type="submit"]');
    const msgEl = document.getElementById('add-user-msg');
    if (msgEl) { msgEl.textContent = ''; msgEl.className = 'msg'; }
    const data = Object.fromEntries(new FormData(formEl).entries());
    try {
      if (submitBtn) submitBtn.disabled = true;
      await addUser(data);
      formEl.reset();
      if (msgEl) { msgEl.textContent = 'Utilisateur créé ✔'; msgEl.className = 'msg success'; }
    } catch (err) {
      const txt = err && err.status === 409 ? 'Email déjà utilisé' : "Impossible de créer l'utilisateur";
      if (msgEl) { msgEl.textContent = txt; msgEl.className = 'msg error'; }
      else alert(txt);
    } finally {
      creatingUser = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // restore session if token exists
  if (authToken) {
    try {
      const me = await fetchJSON('/api/auth/me');
      window.currentUser = me.user;
    } catch {}
  }
  renderAuth();
  if (window.currentUser && window.currentUser.role === 'admin') {
    await loadUsers();
    await loadTypesList();
  }
  // initial load of calls if authenticated
  if (window.currentUser) await loadCalls();
});

// --- Calls (appels) ---
async function createCall(data) {
  return fetchJSON('/api/calls', { method: 'POST', body: JSON.stringify(data) });
}

async function deleteCall(id) {
  const res = await fetch(`/api/calls/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Delete failed');
}

function renderCalls(items) {
  const container = document.getElementById('calls-list');
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) { container.appendChild(el('p', { class: 'muted' }, 'Aucun appel pour le moment.')); return; }
  const table = el('table', { class: 'table' });
  table.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Nom'), el('th', {}, "Lieu de l'appel"), el('th', {}, 'Créé le'), el('th', {}, 'Par'), el('th', {}, 'Actions'))));
  const tbody = el('tbody');
  const user = window.currentUser || {};
  items.forEach((c) => {
    const canDelete = true; // suppression autorisée pour tout rôle authentifié
    tbody.appendChild(el('tr', {},
      el('td', {}, c.name),
      el('td', {}, c.location),
      el('td', {}, new Date(c.createdAt).toLocaleString()),
      el('td', {}, c.createdByName || '—'),
      el('td', {}, canDelete ? el('button', { class: 'btn small danger', onclick: async () => { if (!confirm('Supprimer cet appel ?')) return; try { await deleteCall(c.id); await loadCalls(); } catch { alert('Suppression impossible'); } } }, 'Supprimer') : el('span', { class: 'muted' }, '—'))
    ));
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

async function loadCalls() {
  try {
    const items = await fetchJSON('/api/calls');
    renderCalls(items);
  } catch (e) { console.warn('Failed to load calls', e); }
}

async function onCallSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = document.getElementById('call-msg');
  if (msg) { msg.textContent = ''; msg.className = 'msg'; }
  const fd = new FormData(form);
  const name = (fd.get('name') || '').toString().trim();
  const location = (fd.get('location') || '').toString().trim();
  if (!name || !location) { if (msg) { msg.textContent = 'Nom et lieu requis.'; msg.className = 'msg error'; } return; }
  try {
    await createCall({ name, location });
    form.reset();
    if (msg) { msg.textContent = 'Appel ajouté ✔'; msg.className = 'msg success'; }
    await loadCalls();
  } catch (err) {
    const reason = err && (err.message || (err.data && err.data.error)) ? ': ' + (err.message || err.data.error) : '';
    if (msg) { msg.textContent = "Impossible d'ajouter l'appel" + reason; msg.className = 'msg error'; }
  }
}

// --- Change own password ---
async function changeMyPassword(password, confirm) {
  return fetchJSON('/api/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ password, confirm }),
  });
}

async function onPasswordSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = document.getElementById('password-msg');
  if (msg) { msg.textContent = ''; msg.className = 'msg'; }
  const fd = new FormData(form);
  const pwd1 = String(fd.get('pwd1') || '').trim();
  const pwd2 = String(fd.get('pwd2') || '').trim();
  if (!pwd1 || !pwd2) { if (msg) { msg.textContent = 'Champs requis'; msg.className = 'msg error'; } return; }
  if (pwd1 !== pwd2) { if (msg) { msg.textContent = 'Les mots de passe ne correspondent pas'; msg.className = 'msg error'; } return; }
  if (pwd1.length < 4) { if (msg) { msg.textContent = 'Mot de passe trop court (min 4)'; msg.className = 'msg error'; } return; }
  try {
    await changeMyPassword(pwd1, pwd2);
    form.reset();
    if (msg) { msg.textContent = 'Mot de passe mis à jour ✔'; msg.className = 'msg success'; }
  } catch (err) {
    const reason = err && err.message ? ' (' + err.message + ')' : '';
    if (msg) { msg.textContent = "Erreur lors de la mise à jour" + reason; msg.className = 'msg error'; }
  }
}

// --- Logo upload (admin only) ---
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
