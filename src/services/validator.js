function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isEmail(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0) return false;
  return /.+@.+\..+/.test(s);
}

function validateNewRequest(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload manquant ou invalide'] };
  }
  if (!isNonEmptyString(payload.applicantName)) errors.push('applicantName requis');
  const emailVal = payload.email == null ? '' : String(payload.email).trim();
  if (emailVal && !isEmail(emailVal)) errors.push('email invalide');
  if (!isNonEmptyString(payload.cardType)) errors.push('cardType requis');
  if (payload.details && typeof payload.details !== 'string') errors.push('details doit être une chaîne');
  return { valid: errors.length === 0, errors };
}

// Status codes (French-friendly codes without accents)
const allowedStatuses = ['demande', 'impression', 'disponible'];

function validateStatus(status) {
  const errors = [];
  if (!isNonEmptyString(status)) errors.push('status requis');
  if (!allowedStatuses.includes(status)) errors.push(`status doit être parmi: ${allowedStatuses.join(', ')}`);
  return { valid: errors.length === 0, errors };
}

module.exports = { validateNewRequest, validateStatus, allowedStatuses };
