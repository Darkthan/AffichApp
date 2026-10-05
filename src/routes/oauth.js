const express = require('express');
const rateLimit = require('express-rate-limit');
const oauth = require('../services/oauth');
const { getByEmail } = require('../services/users');
const { verifyPassword } = require('../services/auth');
const { getClientIp } = require('../utils/ip');

const router = express.Router();
const integrationScopes = ['cards:read', 'cards:write', 'names:write'];
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, keyGenerator: getClientIp });
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function origin(req) {
  return (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function metadata(req) {
  const base = origin(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp', ...integrationScopes]
  };
}

function validRedirect(uri) {
  try {
    const url = new URL(uri);
    return !url.hash && !url.username && !url.password &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}

async function authorizeParams(req) {
  const params = req.method === 'POST' ? req.body : req.query;
  const { client_id: clientId, redirect_uri: redirectUri, response_type: responseType, code_challenge: challenge, code_challenge_method: method, state, scope, resource } = params;
  if ((scope !== undefined && typeof scope !== 'string') || (resource !== undefined && typeof resource !== 'string')) { return null; }
  const scopes = typeof scope === 'string' ? [...new Set(scope.split(' ').filter(Boolean))] : ['mcp'];
  const isMcp = scopes.length === 1 && scopes[0] === 'mcp';
  const validScope = isMcp || (scopes.length > 0 && scopes.every(value => integrationScopes.includes(value)));
  const expectedResource = `${origin(req)}${isMcp ? '/mcp' : '/api/integration'}`;
  const client = await oauth.getClient(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri) || responseType !== 'code' || method !== 'S256' ||
      typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
      !validScope || (resource && resource !== expectedResource)) { return null; }
  return { client, redirectUri, challenge, state: typeof state === 'string' ? state : '', scope: scopes.join(' ') };
}

router.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({ resource: `${origin(req)}/mcp`, authorization_servers: [origin(req)], scopes_supported: ['mcp'], bearer_methods_supported: ['header'] });
});
router.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
  res.json({ resource: `${origin(req)}/mcp`, authorization_servers: [origin(req)], scopes_supported: ['mcp'], bearer_methods_supported: ['header'] });
});
router.get('/.well-known/oauth-protected-resource/api/integration', (req, res) => {
  res.json({ resource: `${origin(req)}/api/integration`, authorization_servers: [origin(req)], scopes_supported: integrationScopes, bearer_methods_supported: ['header'] });
});
router.get('/.well-known/oauth-authorization-server', (req, res) => res.json(metadata(req)));

router.post('/register', loginLimiter, async (req, res, next) => {
  try {
    const { client_name: name, redirect_uris: redirects, token_endpoint_auth_method: authMethod } = req.body || {};
    if (!Array.isArray(redirects) || !redirects.length || redirects.length > 5 ||
        !redirects.every((uri) => typeof uri === 'string' && validRedirect(uri)) ||
        (authMethod && authMethod !== 'none') || (name && (typeof name !== 'string' || name.length > 100))) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }
    const client = await oauth.registerClient(name || 'Client MCP', redirects);
    return res.status(201).json(client);
  } catch (error) { return next(error); }
});

router.get('/authorize', async (req, res, next) => {
  try {
    const auth = await authorizeParams(req);
    if (!auth) { return res.status(400).send('Requête OAuth invalide.'); }
    const hidden = Object.entries(req.query).filter(([key]) => ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'].includes(key))
      .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join('');
    res.set('Cache-Control', 'no-store');
    return res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autoriser l’accès à AffichApp</title><link rel="stylesheet" href="/styles.css"></head><body><main class="container" style="max-width:520px;margin:4rem auto"><section class="card"><h1>Autoriser l’accès à AffichApp</h1><p><strong>${escapeHtml(auth.client.client_name)}</strong> demande l’accès aux demandes de cartes avec les droits de votre compte.</p><p>Autorisations demandées : ${escapeHtml(auth.scope.split(' ').map(value => ({ mcp: 'Accès MCP', 'cards:read': 'Lire les cartes et les types', 'cards:write': 'Modifier les statuts des cartes', 'names:write': 'Ajouter des noms à la présaisie' }[value])).join(', '))}.</p><p>Redirection vers : <code>${escapeHtml(new URL(auth.redirectUri).origin)}</code></p><form action="/authorize" method="post" class="grid">${hidden}<label>Email<input type="email" name="email" required autocomplete="username"></label><label>Mot de passe<input type="password" name="password" required autocomplete="current-password"></label><button type="submit">Se connecter et autoriser</button></form></section></main></body></html>`);
  } catch (error) { return next(error); }
});

router.post('/authorize', express.urlencoded({ extended: false }), loginLimiter, async (req, res, next) => {
  try {
    const auth = await authorizeParams(req);
    if (!auth) { return res.status(400).send('Requête OAuth invalide.'); }
    const user = await getByEmail(req.body.email || '');
    if (!user || !(await verifyPassword(req.body.password || '', user.passwordHash))) {
      return res.status(401).send('Identifiants incorrects. Revenez à la page précédente pour réessayer.');
    }
    const code = await oauth.createCode(auth.client.client_id, auth.redirectUri, auth.challenge, user.id, auth.scope);
    const redirect = new URL(auth.redirectUri);
    redirect.searchParams.set('code', code);
    if (auth.state) { redirect.searchParams.set('state', auth.state); }
    return res.redirect(302, redirect.toString());
  } catch (error) { return next(error); }
});

router.post('/token', express.urlencoded({ extended: false }), loginLimiter, async (req, res, next) => {
  try {
    const { grant_type: grant, client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier, refresh_token: refresh } = req.body || {};
    if (!await oauth.getClient(clientId)) { return res.status(400).json({ error: 'invalid_client' }); }
    let tokens;
    if (grant === 'authorization_code' && typeof code === 'string' && typeof redirectUri === 'string' && typeof verifier === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      tokens = await oauth.exchangeCode(code, clientId, redirectUri, verifier);
    } else if (grant === 'refresh_token' && typeof refresh === 'string') {
      tokens = await oauth.refreshToken(refresh, clientId);
    }
    res.set('Cache-Control', 'no-store');
    return tokens ? res.json(tokens) : res.status(400).json({ error: 'invalid_grant' });
  } catch (error) { return next(error); }
});

module.exports = { router, origin };
