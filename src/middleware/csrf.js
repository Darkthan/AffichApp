// Middleware de protection CSRF basé sur X-Requested-With header
// Pour les requêtes qui modifient l'état (POST, PATCH, DELETE)

function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();

  // Seules les méthodes qui modifient l'état nécessitent la protection CSRF
  if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE' && method !== 'PUT') {
    return next();
  }

  // Only bypass CSRF when the API key has already been validated by apiKeyPreAuth middleware.
  // Checking req.isApiKeyAuth (set by the pre-auth middleware) ensures CSRF is bypassed
  // only for requests with a PROVEN valid key, not any request that sets the header.
  if (req.isApiKeyAuth) {
    return next();
  }

  // Vérifier la présence du header X-Requested-With
  const xRequestedWith = req.get('X-Requested-With');

  if (xRequestedWith !== 'XMLHttpRequest') {
    console.warn('[CSRF] Requête bloquée:', {
      method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CSRF validation failed: X-Requested-With header required'
    });
  }

  // Header valide, continuer
  next();
}

module.exports = { csrfProtection };
