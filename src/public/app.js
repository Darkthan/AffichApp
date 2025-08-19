let authToken = localStorage.getItem('token') || '';

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
  localStorage.removeItem('token');
  window.currentUser = null;
  window.location.replace('/login.html');
}

function renderAuth() {
  const userInfo = document.getElementById('user-info');
  const loginLink = document.getElementById('login-link');
  const adminPanel = document.getElementById('admin-panel');
  const requestForm = document.getElementById('request-form');
  const isAuth = !!window.currentUser;
  if (isAuth) {
    if (loginLink) loginLink.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userInfo.removeAttribute('hidden');
    document.getElementById('user-name').textContent = window.currentUser.name || window.currentUser.email;
    document.getElementById('user-role').textContent = window.currentUser.role === 'admin' ? 'Administrateur' : 'Demandeur';
    if (window.currentUser.role === 'admin') { adminPanel.classList.remove('hidden'); adminPanel.removeAttribute('hidden'); } else { adminPanel.classList.add('hidden'); adminPanel.setAttribute('hidden',''); }
    requestForm.classList.remove('hidden');
    requestForm.removeAttribute('hidden');
  } else {
    if (loginLink) loginLink.classList.remove('hidden');
    userInfo.classList.add('hidden');
    userInfo.setAttribute('hidden','');
    adminPanel.classList.add('hidden');
    adminPanel.setAttribute('hidden','');
    requestForm.classList.add('hidden');
    requestForm.setAttribute('hidden','');
  }
  refreshUI();
}

async function refreshUI() {
  await loadCardTypes();
  if (window.currentUser) await loadList(); else document.getElementById('list').innerHTML = '<p class="muted">Connectez-vous pour voir vos demandes</p>';
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
    table.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'ID'), el('th', {}, 'Nom'), el('th', {}, 'Email'), el('th', {}, 'Role'), el('th', {}, 'Actions'))));
    const tbody = el('tbody');
    users.forEach((u) =>
      tbody.appendChild(
        el(
          'tr',
          {},
          el('td', {}, String(u.id)),
          el('td', {}, u.name),
          el('td', {}, u.email),
          el('td', {}, u.role),
          el(
            'td',
            {},
            el(
              'button',
              {
                onclick: async () => {
                  const name = prompt('Nom', u.name) ?? u.name;
                  const email = prompt('Email', u.email) ?? u.email;
                  const role = prompt("Role ('admin' ou 'requester')", u.role) ?? u.role;
                  const password = prompt('Nouveau mot de passe (laisser vide pour ne pas changer)', '');
                  try {
                    await fetchJSON(`/api/users/${u.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ name, email, role, password }),
                    });
                    await loadUsers();
                  } catch {
                    alert("Echec de la mise à jour de l'utilisateur");
                  }
                },
              },
              'Modifier'
            ),
            ' ',
            el(
              'button',
              {
                onclick: async () => {
                  if (!confirm('Supprimer cet utilisateur ?')) return;
                  try {
                    await fetch(`/api/users/${u.id}`, { method: 'DELETE', headers: authHeaders() });
                    await loadUsers();
                  } catch {
                    alert("Echec de la suppression de l'utilisateur");
                  }
                },
              },
              'Supprimer'
            )
          )
        )
      )
    );
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
  document.getElementById('add-type-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const label = new FormData(formEl).get('label');
    try {
      await addCardType(label);
      formEl.reset();
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
  if (window.currentUser && window.currentUser.role === 'admin') await loadUsers();
});
