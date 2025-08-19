/* Simple smoke checks to validate basic modules */
const assert = require('assert');

try {
  const { validateNewRequest, validateStatus } = require('../src/services/validator');
  // Valid request
  const ok = validateNewRequest({
    applicantName: 'Alice',
    email: 'alice@example.com',
    cardType: 'etudiant',
    details: 'Urgent',
  });
  assert.equal(ok.valid, true, 'Expected valid request');

  // Invalid request
  const bad = validateNewRequest({ applicantName: '', email: 'invalid', cardType: '' });
  assert.equal(bad.valid, false, 'Expected invalid request');

  // Status
  assert.equal(validateStatus('pending').valid, true);
  assert.equal(validateStatus('approved').valid, true);
  assert.equal(validateStatus('rejected').valid, true);
  assert.equal(validateStatus('other').valid, false);

  // Route module loads without throwing
  require('../src/routes/requests');

  console.log('Smoke checks passed');
  process.exit(0);
} catch (err) {
  console.error('Smoke checks failed:', err && err.stack ? err.stack : err);
  process.exit(1);
}

