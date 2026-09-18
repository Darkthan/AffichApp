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

function storeAuthToken(token, remember = false) {
  authToken = token;
  try {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    if (remember) { localStorage.setItem('token', token); }
    else { sessionStorage.setItem('token', token); }
  } catch {}
}

async function verifyMagicLink(token) {
  const res = await fetchJSON('/api/auth/magic-link/verify', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
  storeAuthToken(res.token);
  window.location.replace('/');
}

window.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('login-form');
  const msg = document.getElementById('login-msg');

  const magicToken = new window.URLSearchParams(window.location.search).get('magic_token');
  if (magicToken) {
    msg.textContent = 'Vérification du lien de connexion…';
    try {
      await verifyMagicLink(magicToken);
      return;
    } catch {
      window.history.replaceState({}, '', '/login.html');
      msg.textContent = 'Ce lien de connexion est invalide, expiré ou déjà utilisé.';
      msg.className = 'msg error';
    }
  }

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
      // Si c'est une erreur 403 (bannissement fail2ban)
      if (err && err.status === 403) {
        const errorData = err.data || {};
        msg.textContent = errorData.message || 'Trop de tentatives échouées. Votre IP est temporairement bloquée.';
        msg.className = 'msg error';
        msg.style.whiteSpace = 'pre-line';
      } else {
        const code = err && err.status ? ` (HTTP ${err.status})` : '';
        msg.textContent = 'Identifiants invalides' + code;
        msg.className = 'msg error';
      }
    }
  });

  const magicForm = document.getElementById('magic-link-form');
  const magicMsg = document.getElementById('magic-link-msg');
  if (magicForm) {
    magicForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = magicForm.querySelector('button[type="submit"]');
      button.disabled = true;
      magicMsg.textContent = 'Envoi en cours…';
      magicMsg.className = 'msg';
      try {
        const fd = new FormData(magicForm);
        const result = await fetchJSON('/api/auth/magic-link/request', {
          method: 'POST',
          body: JSON.stringify({ email: fd.get('email') })
        });
        magicMsg.textContent = result.message;
        magicMsg.className = 'msg success';
        if (result.magicLink) {
          const link = document.createElement('a');
          link.href = result.magicLink;
          link.textContent = 'Ouvrir le lien de développement';
          magicMsg.append(document.createElement('br'), link);
        }
      } catch (error) {
        magicMsg.textContent = error.status === 503
          ? 'L’envoi par e-mail n’est pas encore configuré sur ce serveur.'
          : 'Impossible de générer le lien de connexion.';
        magicMsg.className = 'msg error';
      } finally {
        button.disabled = false;
      }
    });
  }

  // === PASSKEY LOGIN ===
  const passkeyLoginBtn = document.getElementById('passkey-login-btn');
  const passkeyLoginMsg = document.getElementById('passkey-login-msg');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  // Ensure passkey button matches submit button width (visually consistent)
  function syncPasskeyWidth() {
    if (!passkeyLoginBtn || !submitBtn) { return; }
    const rect = submitBtn.getBoundingClientRect();
    if (rect && rect.width) {
      passkeyLoginBtn.style.width = Math.round(rect.width) + 'px';
    }
  }
  // Initial sync and on resize
  syncPasskeyWidth();
  window.addEventListener('resize', syncPasskeyWidth);

  if (passkeyLoginBtn) {
    passkeyLoginBtn.addEventListener('click', async () => {
      passkeyLoginMsg.textContent = '';
      passkeyLoginMsg.className = 'msg';

      try {
        // Vérifier le support WebAuthn
        if (!window.PublicKeyCredential) {
          passkeyLoginMsg.textContent = 'Votre navigateur ne supporte pas les passkeys';
          passkeyLoginMsg.className = 'msg error';
          return;
        }

        // Étape 1: Obtenir les options (sans email pour mode discoverable)
        passkeyLoginMsg.textContent = 'Génération des options...';

        const optionsRes = await fetchJSON('/api/passkeys/authenticate/generate-options', {
          method: 'POST',
          body: JSON.stringify({})
        });

        // Étape 2: Authentifier avec la passkey
        passkeyLoginMsg.textContent = 'Veuillez utiliser votre passkey...';

        const credential = await window.WebAuthnHelper.startAuthentication(optionsRes);

        // Étape 3: Vérifier
        passkeyLoginMsg.textContent = 'Vérification...';

        const verifyRes = await fetchJSON('/api/passkeys/authenticate/verify', {
          method: 'POST',
          body: JSON.stringify({ credential, challengeKey: optionsRes.challengeKey })
        });

        // Succès - stocker le token
        authToken = verifyRes.token;
        try {
          localStorage.setItem('token', authToken);
        } catch {}

        // Rediriger
        window.location.replace('/');
      } catch (e) {
        console.error('Erreur passkey login:', e);
        passkeyLoginMsg.textContent = e.message || 'Erreur lors de l\'authentification';
        passkeyLoginMsg.className = 'msg error';
      }
    });
  }
});
