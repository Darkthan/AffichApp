function getStoredToken() {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  } catch { return ''; }
}
let authToken = getStoredToken();
let cardTypesCache = [];

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
    const canDelete = isAdmin || isOwner;
    const canEdit = isAdmin || isOwner;
    const actions = [];
    // Prepare edit icon button (we will append it LAST)
    const iconEmoji = el('span', { class: 'icon-emoji', 'aria-hidden': 'true' }, '✏️');
    const editAttrs = { class: 'icon-btn', title: canEdit ? 'Modifier' : 'Modification non autorisée', 'aria-label': 'Modifier' };
    if (canEdit) { editAttrs.onclick = () => openEditDialog(it); } else { editAttrs.disabled = 'disabled'; }
    const editButton = el('button', editAttrs, iconEmoji);
    // Admin actions: status + delete
    if (isAdmin) {
      actions.push(
        el('button', { class: 'btn small info', title: 'Marquer demandé', onclick: async () => { await updateStatus(it.id, 'demande'); await loadList(); } }, 'Demandé'),
        el('button', { class: 'btn small warn', title: "Marquer impression", onclick: async () => { await updateStatus(it.id, 'impression'); await loadList(); } }, 'Impression'),
        el('button', { class: 'btn small', title: 'Marquer disponible', onclick: async () => { await updateStatus(it.id, 'disponible'); await loadList(); } }, 'Disponible')
      );
    }
    if (canDelete) {
      // Force a line break before the delete button
      actions.push(el('span', { class: 'flex-break' }));
      actions.push(
        el(
          'button',
          {
            class: 'btn small danger',
            title: 'Supprimer',
            onclick: async () => {
              if (!confirm('Supprimer cette demande ?')) {return;}
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
      );
    }
    // Append edit pencil LAST
    actions.push(editButton);
    tbody.appendChild(
      el(
        'tr',
        {},
        el('td', {}, String(it.id)),
        el('td', {}, it.applicantName),
        el('td', {}, it.email && it.email.trim() ? it.email : '—'),
        el('td', {}, it.cardType),
        el('td', {}, statusLabel(it.status)),
        el('td', {}, el('div', { class: 'btn-group' }, actions.length ? actions : el('span', { class: 'muted' }, '—')))
      )
    );
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

async function deleteRequest(id) {
  const res = await fetch(`/api/requests/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {throw new Error('Delete failed');}
}

async function loadList() {
  try {
    const items = await fetchJSON('/api/requests');
    renderList(items);
  } catch (_e) {
    console.error(_e);
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
  if (payload.email !== null && payload.email !== undefined && payload.email.trim() === '') {delete payload.email;}
  if (payload.details !== null && payload.details !== undefined && payload.details.trim() === '') {delete payload.details;}
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


function logout() {
  authToken = '';
  try { localStorage.removeItem('token'); } catch {}
  try { sessionStorage.removeItem('token'); } catch {}
  window.currentUser = null;
  window.location.replace('/login.html');
}

function renderAuth() {
  const requestSection = document.getElementById('request-section');
  const requestsListSection = document.getElementById('requests-list-section');
  const requestForm = document.getElementById('request-form');
  const callForm = document.getElementById('call-form');
  const isAuth = !!window.currentUser;
  if (isAuth) {
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
  } else {
    if (requestSection) { requestSection.classList.add('hidden'); requestSection.setAttribute('hidden',''); }
    if (requestsListSection) { requestsListSection.classList.add('hidden'); requestsListSection.setAttribute('hidden',''); }
    if (requestForm) { requestForm.classList.add('hidden'); requestForm.setAttribute('hidden',''); }
    if (callForm) { callForm.classList.add('hidden'); callForm.setAttribute('hidden',''); }
  }
  renderTopbarMenu();
  refreshUI();
}

function renderTopbarMenu() {
  const menu = document.getElementById('menu-dropdown');
  if (!menu) {return;}
  menu.innerHTML = '';
  if (window.currentUser) {
    const settingsLink = el('a', { class: 'menu-item', href: '/settings.html' }, 'Paramètres');
    const logoutBtn = el('button', { class: 'menu-item', onclick: () => { closeMenu(); logout(); } }, 'Se déconnecter');
    menu.append(settingsLink, logoutBtn);
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

async function refreshUI() {
  await loadCardTypes();
  if (window.currentUser) {
    if (window.currentUser.role !== 'appel') {
      await loadList();
    } else {
      const listEl = document.getElementById('list');
      if (listEl) {listEl.innerHTML = '';}
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
    cardTypesCache = types;
    const select = document.getElementById('card-type-select');
    select.innerHTML = '<option value="">-- Choisir --</option>';
    types.forEach((t) => select.appendChild(el('option', { value: t.code }, t.label)));
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
  // Menu toggle & outside click
  const toggle = document.getElementById('menu-toggle');
  const dropdown = document.getElementById('menu-dropdown');
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
  if (logoutBtn) {logoutBtn.addEventListener('click', () => logout());}
  const callForm = document.getElementById('call-form');
  if (callForm) {callForm.addEventListener('submit', onCallSubmit);}

  // restore session if token exists
  if (authToken) {
    try {
      const me = await fetchJSON('/api/auth/me');
      window.currentUser = me.user;
    } catch {}
  }
  renderAuth();
  // initial load of calls if authenticated
  if (window.currentUser) {await loadCalls();}
});

// --- Calls (appels) ---
async function createCall(data) {
  return fetchJSON('/api/calls', { method: 'POST', body: JSON.stringify(data) });
}

async function deleteCall(id) {
  const res = await fetch(`/api/calls/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {throw new Error('Delete failed');}
}

function renderCalls(items) {
  const container = document.getElementById('calls-list');
  if (!container) {return;}
  container.innerHTML = '';
  if (!items.length) { container.appendChild(el('p', { class: 'muted' }, 'Aucun appel pour le moment.')); return; }
  const table = el('table', { class: 'table' });
  table.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Nom'), el('th', {}, "Lieu de l'appel"), el('th', {}, 'Créé le'), el('th', {}, 'Par'), el('th', {}, 'Actions'))));
  const tbody = el('tbody');
  items.forEach((c) => {
    const canDelete = true; // suppression autorisée pour tout rôle authentifié
    tbody.appendChild(el('tr', {},
      el('td', {}, c.name),
      el('td', {}, c.location),
      el('td', {}, new Date(c.createdAt).toLocaleString()),
      el('td', {}, c.createdByName || '—'),
      el('td', {}, canDelete ? el('button', { class: 'btn small danger', onclick: async () => { if (!confirm('Supprimer cet appel ?')) {return;} try { await deleteCall(c.id); await loadCalls(); } catch { alert('Suppression impossible'); } } }, 'Supprimer') : el('span', { class: 'muted' }, '—'))
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

// --- Edit dialog for requests ---
async function updateRequest(id, payload) {
  return fetchJSON(`/api/requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

function openEditDialog(item) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: 'modal' });
  const header = el('div', { class: 'modal-header' }, `Modifier la demande #${item.id}`);
  const form = el('form', { class: 'modal-body' });
  const nameInput = el('input', { type: 'text', value: item.applicantName, required: true });
  const emailInput = el('input', { type: 'email', value: item.email || '' });
  const typeSelect = el('select');
  typeSelect.appendChild(el('option', { value: '' }, '-- Choisir --'));
  (cardTypesCache || []).forEach((t) => typeSelect.appendChild(el('option', { value: t.code, selected: item.cardType === t.code ? 'selected' : undefined }, t.label)));
  const detailsInput = el('textarea', { rows: '3' }, item.details || '');
  form.append(
    el('label', {}, 'Nom du demandeur', nameInput),
    el('label', {}, 'Email', emailInput),
    el('label', {}, 'Type de carte', typeSelect),
    el('label', {}, 'Détails', detailsInput),
  );
  const footer = el('div', { class: 'modal-footer' },
    el('button', { type: 'button', class: 'btn secondary', onclick: () => { document.body.removeChild(backdrop); } }, 'Annuler'),
    el('button', { type: 'submit', class: 'btn' }, 'Enregistrer')
  );
  const msg = el('p', { class: 'msg', id: 'edit-msg' });
  modal.append(header, form, footer, msg);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const payload = {
      applicantName: nameInput.value.trim(),
      email: emailInput.value.trim(),
      cardType: typeSelect.value,
      details: detailsInput.value,
    };
    if (!payload.applicantName) { msg.textContent = 'Nom requis.'; msg.className = 'msg error'; return; }
    if (!payload.cardType) { msg.textContent = 'Type de carte requis.'; msg.className = 'msg error'; return; }
    if (payload.email === '') { delete payload.email; }
    if (payload.details !== undefined && payload.details.trim() === '') { payload.details = null; }
    try {
      await updateRequest(item.id, payload);
      msg.textContent = 'Enregistré ✔'; msg.className = 'msg success';
      document.body.removeChild(backdrop);
      await loadList();
    } catch (err) {
      const reason = err && (err.message || (err.data && err.data.error)) ? ': ' + (err.message || err.data.error) : '';
      msg.textContent = 'Échec de la mise à jour' + reason; msg.className = 'msg error';
    }
  });
}
