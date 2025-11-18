function getStoredToken() {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  } catch { return ''; }
}
let authToken = getStoredToken();
let cardTypesCache = [];
let suggestionsCache = [];
let esRequests = null;

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

function renderList(items) {
  const container = document.getElementById('list');
  container.innerHTML = '';
  if (!items.length) {
    container.appendChild(el('p', { class: 'muted' }, 'Aucune demande pour le moment.'));
    return;
  }
  const table = el('table', { class: 'table' });
  table.appendChild(
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', {}, 'ID'),
        el('th', {}, 'Demandeur'),
        el('th', { class: 'col-email' }, 'Email'),
        el('th', { class: 'col-type' }, 'Type'),
        el('th', {}, 'Statut'),
        el('th', {}, 'Actions')
      )
    )
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
        el('td', { class: 'col-email' }, it.email && it.email.trim() ? it.email : '—'),
        el('td', { class: 'col-type' }, it.cardType),
        el('td', {}, statusLabel(it.status)),
        el('td', {}, el('div', { class: 'btn-group' }, actions.length ? actions : el('span', { class: 'muted' }, '—')))
      )
    );
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

async function deleteRequest(id) {
  await fetchJSON(`/api/requests/${id}`, { method: 'DELETE' });
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
  } catch (_e) {
    alert('Impossible de mettre à jour le statut.');
  }
}

// Suggestions API and UI
async function fetchSuggestions(q) {
  const qp = q && q.trim() ? ('?q=' + encodeURIComponent(q.trim())) : '';
  return fetchJSON('/api/requests/suggestions' + qp);
}

// typeLabelFromCode already defined earlier

function renderApplicantSuggestions(list, targetInput, typeSelect) {
  const box = document.getElementById('applicant-suggest-box');
  if (!box) {return;}
  box.innerHTML = '';
  if (!list || !list.length) { box.setAttribute('hidden', ''); return; }
  list.slice(0, 5).forEach((s) => {
    const item = el('div', { class: 'suggest-item' },
      el('span', { class: 'suggest-name' }, s.name),
      el('span', { class: 'suggest-type' }, typeLabelFromCode(s.cardType))
    );
    item.addEventListener('mousedown', (e) => { e.preventDefault(); });
    item.addEventListener('click', () => {
      if (targetInput) { targetInput.value = s.name; }
      if (typeSelect && s.cardType) { typeSelect.value = s.cardType; }
      box.setAttribute('hidden', '');
    });
    box.appendChild(item);
  });
  box.removeAttribute('hidden');
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

function renderTopbarMenu() { /* menu supprimé: plus d'actions ici */ }

function closeMenu() {
  const menu = document.getElementById('menu-dropdown');
  const toggle = document.getElementById('menu-toggle');
  if (menu) {menu.classList.remove('open');}
  if (toggle) {toggle.setAttribute('aria-expanded', 'false');}
}

async function refreshUI() {
  await loadCardTypes();
  await loadSuggestions();
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

// --- Browser Notifications for new requests ---
function ensureNotificationPermission() {
  if (!('Notification' in window)) { return; }
  if (Notification.permission === 'default') {
    setTimeout(() => { try { Notification.requestPermission(); } catch {} }, 500);
  }
}

function typeLabelFromCode(code) {
  const t = (cardTypesCache || []).find((x) => x.code === code);
  return (t && t.label) || code || '';
}

function initRequestNotifications() {
  if (!window.currentUser) { return; }
  if (!('EventSource' in window)) { return; }
  if (esRequests) { return; }
  const token = authToken || '';
  if (!token) { return; }
  try {
    esRequests = new EventSource(`/api/requests/events?token=${encodeURIComponent(token)}`);
    esRequests.addEventListener('request.created', (ev) => {
      let data = null; try { data = JSON.parse(ev.data); } catch {}
      if (data && data.ownerId && window.currentUser && data.ownerId === window.currentUser.id) {
        // ignore self-created notifications
        return;
      }
      const title = 'Nouvelle demande de carte';
      const body = data ? `${data.applicantName} • ${typeLabelFromCode(data.cardType)}` : 'Une nouvelle demande a été ajoutée.';
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body, icon: '/public/logo' }); } catch {}
      } else {
        try {
          const container = document.getElementById('list');
          const note = el('p', { class: 'msg success' }, body);
          container && container.prepend(note);
          setTimeout(() => { note && note.remove(); }, 4000);
        } catch {}
      }
      loadList().catch(() => {});
    });
  } catch {}
}

async function loadSuggestions() {
  try {
    const list = await fetchJSON('/api/requests/suggestions');
    suggestionsCache = Array.isArray(list) ? list : [];
    const dl = document.getElementById('applicant-suggestions');
    if (dl) {
      dl.innerHTML = '';
      suggestionsCache.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.name;
        dl.appendChild(opt);
      });
    }
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
  const logo = document.querySelector('.brand-logo');
  const titleEl = document.querySelector('.brand-title');
  const goHome = (e) => { e.preventDefault(); window.location.assign('/'); };
  if (logo) { logo.style.cursor = 'pointer'; logo.title = "Retour à l'accueil"; logo.addEventListener('click', goHome); }
  if (titleEl) { titleEl.style.cursor = 'pointer'; titleEl.title = "Retour à l'accueil"; titleEl.addEventListener('click', goHome); }
  const ok = await ensureAuthOrRedirect();
  if (!ok) {return;}
  document.getElementById('request-form').addEventListener('submit', onSubmit);
  // Auto-select card type when picking a known applicant
  const applicantInput = document.getElementById('applicant-name');
  const typeSelect = document.getElementById('card-type-select');
  if (applicantInput && typeSelect) {
    const maybeAutofill = () => {
      const v = (applicantInput.value || '').trim().toLowerCase();
      if (!v) {return;}
      const found = (suggestionsCache || []).find((s) => (s.name || '').toLowerCase() === v);
      if (found && found.cardType) { typeSelect.value = found.cardType; }
    };
    const onInputSuggest = async () => {
      const v = applicantInput.value || '';
      try {
        const list = await fetchSuggestions(v);
        renderApplicantSuggestions(list, applicantInput, typeSelect);
      } catch {}
    };
    applicantInput.addEventListener('input', onInputSuggest);
    applicantInput.addEventListener('focus', onInputSuggest);
    applicantInput.addEventListener('change', () => { maybeAutofill(); document.getElementById('applicant-suggest-box')?.setAttribute('hidden',''); });
    applicantInput.addEventListener('blur', () => { setTimeout(() => document.getElementById('applicant-suggest-box')?.setAttribute('hidden',''), 100); });
  }
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
  // Notifications: ask permission and init SSE
  ensureNotificationPermission();
  initRequestNotifications();
  // Register service worker (for background push notifications)
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js'); } catch {}
  }
});

// --- Calls (appels) ---
async function createCall(data) {
  return fetchJSON('/api/calls', { method: 'POST', body: JSON.stringify(data) });
}

async function deleteCall(id) {
  await fetchJSON(`/api/calls/${id}`, { method: 'DELETE' });
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
  const footer = el('div', { class: 'modal-footer' },
    el('button', { type: 'button', class: 'btn secondary', onclick: () => { document.body.removeChild(backdrop); } }, 'Annuler'),
    el('button', { type: 'submit', class: 'btn' }, 'Enregistrer')
  );
  form.append(
    el('label', {}, 'Nom du demandeur', nameInput),
    el('label', {}, 'Email', emailInput),
    el('label', {}, 'Type de carte', typeSelect),
    el('label', {}, 'Détails', detailsInput),
    footer
  );
  const msg = el('p', { class: 'msg', id: 'edit-msg' });
  modal.append(header, form, msg);
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

// Gérer l'erreur de chargement du logo (masquer si inexistant)
window.addEventListener('DOMContentLoaded', () => {
  const headerLogo = document.getElementById('header-logo');
  if (headerLogo) {
    headerLogo.addEventListener('error', () => {
      headerLogo.style.display = 'none';
    });
  }
});
