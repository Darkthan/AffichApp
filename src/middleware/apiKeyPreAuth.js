const apiKeys = require('../services/apiKeys');

// Pre-validates the API key before CSRF middleware runs.
// This ensures the CSRF bypass is gated on a PROVEN valid key,
// not merely on the presence of the header (which any browser can forge).
async function apiKeyPreAuth(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey) { return next(); }

  const keyRecord = await apiKeys.validate(rawKey);
  if (keyRecord) {
    req.user = { role: keyRecord.role, name: keyRecord.name, apiKeyId: keyRecord.id };
    req.isApiKeyAuth = true;
  }
  // Always continue — auth failure is handled by requireAuth later
  next();
}

module.exports = { apiKeyPreAuth };
