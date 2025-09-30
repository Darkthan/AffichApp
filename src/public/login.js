function getStoredToken() {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  } catch { return ''; }
}
let authToken = getStoredToken();

async function fetchJSON(url, options = {}) {
  const base = options || {};
  const headers = { ...(base.headers || {}) };
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

async function login(email, password, remember) {
  const res = await fetchJSON('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  authToken = res.token;
  try {
    // Clear previous tokens then set according to preference
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    if (remember) {localStorage.setItem('token', authToken);}
    else {sessionStorage.setItem('token', authToken);}
  } catch {}
  // verify and redirect
  try { await fetchJSON('/api/auth/me', { headers: { Authorization: 'Bearer ' + authToken } }); } catch {}
  window.location.replace('/');
}

window.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('login-form');
  const msg = document.getElementById('login-msg');

  // If already logged in (token), validate and go home
  if (authToken) {
    try {
      await fetchJSON('/api/auth/me', { headers: { Authorization: 'Bearer ' + authToken } });
      window.location.replace('/');
      return;
    } catch {
      try { localStorage.removeItem('token'); } catch {}
      authToken = '';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    try {
      const fd = new FormData(form);
      const remember = !!fd.get('remember');
      await login(fd.get('email'), fd.get('password'), remember);
    } catch (err) {
      const code = err && err.status ? ` (HTTP ${err.status})` : '';
      msg.textContent = 'Identifiants invalides' + code;
      msg.className = 'msg error';
    }
  });
});
