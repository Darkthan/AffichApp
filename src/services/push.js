const webpush = require('web-push');
const subscriptions = require('./subscriptions');
const { findByCode } = require('./cardTypes');
const fs = require('fs').promises;
const path = require('path');

let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
let VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

const DATA_DIR = path.join(process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

async function loadStoredKeys() {
  try {
    const raw = await fs.readFile(VAPID_FILE, 'utf-8');
    const obj = JSON.parse(raw);
    if (obj && obj.publicKey && obj.privateKey) { return obj; }
  } catch {}
  return null;
}

async function saveStoredKeys(pub, priv, subject) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = { publicKey: pub, privateKey: priv, subject: subject || 'mailto:admin@example.com' };
  await fs.writeFile(VAPID_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

let configured = false;
async function ensureConfigured() {
  if (configured) { return true; }
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    return true;
  }
  const stored = await loadStoredKeys();
  if (stored) {
    VAPID_PUBLIC_KEY = stored.publicKey;
    VAPID_PRIVATE_KEY = stored.privateKey;
    VAPID_SUBJECT = stored.subject || VAPID_SUBJECT;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    return true;
  }
  return false;
}

function isEnabledSync() { return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY); }
async function isEnabled() { return !!(await ensureConfigured()); }

function getPublicKeySync() { return VAPID_PUBLIC_KEY || ''; }
async function getPublicKey() { await ensureConfigured(); return VAPID_PUBLIC_KEY || ''; }

async function sendToAllExcept(payload, excludeUserId) {
  await ensureConfigured();
  if (!(await isEnabled())) { return; }
  const subs = await subscriptions.listAll();
  const toSend = subs.filter((s) => !excludeUserId || s.userId !== excludeUserId);
  const data = JSON.stringify(payload);
  await Promise.allSettled(
    toSend.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data).catch(() => {}))
  );
}

async function broadcastNewRequest(reqItem, creator) {
  let label = reqItem.cardType;
  try {
    const t = await findByCode(reqItem.cardType);
    if (t && t.label) { label = t.label; }
  } catch {}
  await sendToAllExcept({
    type: 'request.created',
    title: 'Nouvelle demande de carte',
    body: `${reqItem.applicantName} • ${label}`,
    data: { id: reqItem.id, cardType: reqItem.cardType },
  }, creator && creator.id);
}

async function generateAndSetKeys() {
  const keys = webpush.generateVAPIDKeys();
  VAPID_PUBLIC_KEY = keys.publicKey;
  VAPID_PRIVATE_KEY = keys.privateKey;
  await saveStoredKeys(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT);
  configured = false;
  await ensureConfigured();
  return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT };
}

module.exports = { isEnabled, broadcastNewRequest, generateAndSetKeys, getPublicKey };
