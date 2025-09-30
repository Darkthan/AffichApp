const webpush = require('web-push');
const subscriptions = require('./subscriptions');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let configured = false;
function ensureConfigured() {
  if (configured) { return; }
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
}

function isEnabled() { return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY); }

async function sendToAllExcept(payload, excludeUserId) {
  ensureConfigured();
  if (!isEnabled()) { return; }
  const subs = await subscriptions.listAll();
  const toSend = subs.filter((s) => !excludeUserId || s.userId !== excludeUserId);
  const data = JSON.stringify(payload);
  await Promise.allSettled(
    toSend.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data).catch(() => {}))
  );
}

async function broadcastNewRequest(reqItem, creator) {
  await sendToAllExcept({
    type: 'request.created',
    title: 'Nouvelle demande de carte',
    body: `${reqItem.applicantName} • ${reqItem.cardType}`,
    data: { id: reqItem.id, cardType: reqItem.cardType },
  }, creator && creator.id);
}

module.exports = { isEnabled, broadcastNewRequest };

