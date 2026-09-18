const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { getSettings, updateSettings } = require('./settings');

const SECRET_PREFIX = 'enc:v1';

function hasEnvironmentValue(name) {
  return Object.prototype.hasOwnProperty.call(process.env, name) && String(process.env[name] || '').trim() !== '';
}

function encryptionKey() {
  let secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV !== 'production') {
    const keyFile = path.join(process.cwd(), 'data', '.settings-encryption-key');
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    if (!fs.existsSync(keyFile)) {
      fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    }
    secret = fs.readFileSync(keyFile, 'utf-8').trim();
  }
  if (!secret) {
    const error = new Error('SETTINGS_ENCRYPTION_KEY or JWT_SECRET is required');
    error.code = 'E_ENCRYPTION_KEY_REQUIRED';
    throw error;
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptPassword(password) {
  if (!password) { return ''; }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SECRET_PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

function decryptPassword(value) {
  if (!value) { return ''; }
  const parts = String(value).split(':');
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== SECRET_PREFIX) { return ''; }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[2], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[3], 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64url')), decipher.final()]).toString('utf8');
}

function envOrStored(name, storedValue, trim = true) {
  if (!hasEnvironmentValue(name)) { return storedValue; }
  const value = String(process.env[name]);
  return trim ? value.trim() : value;
}

async function getConfiguration() {
  const settings = await getSettings();
  const stored = settings.magicLink || {};
  let storedPassword = '';
  if (stored.smtpPassEncrypted && !hasEnvironmentValue('SMTP_PASS')) {
    try {
      storedPassword = decryptPassword(stored.smtpPassEncrypted);
    } catch (error) {
      console.error('[magic-link] Impossible de déchiffrer le mot de passe SMTP:', error.message);
    }
  }

  const portRaw = envOrStored('SMTP_PORT', stored.smtpPort || 587);
  const port = Number.parseInt(portRaw, 10);
  const secureRaw = envOrStored('SMTP_SECURE', stored.smtpSecure === true ? 'true' : 'false');
  return {
    appBaseUrl: String(envOrStored('APP_BASE_URL', stored.appBaseUrl || '') || '').replace(/\/$/, ''),
    smtpHost: String(envOrStored('SMTP_HOST', stored.smtpHost || '') || ''),
    smtpPort: Number.isFinite(port) ? port : 587,
    smtpSecure: String(secureRaw).toLowerCase() === 'true',
    smtpUser: String(envOrStored('SMTP_USER', stored.smtpUser || '') || ''),
    smtpPass: String(envOrStored('SMTP_PASS', storedPassword, false) || ''),
    mailFrom: String(envOrStored('MAIL_FROM', stored.mailFrom || '') || ''),
    environmentOverrides: {
      appBaseUrl: hasEnvironmentValue('APP_BASE_URL'),
      smtpHost: hasEnvironmentValue('SMTP_HOST'),
      smtpPort: hasEnvironmentValue('SMTP_PORT'),
      smtpSecure: hasEnvironmentValue('SMTP_SECURE'),
      smtpUser: hasEnvironmentValue('SMTP_USER'),
      smtpPass: hasEnvironmentValue('SMTP_PASS'),
      mailFrom: hasEnvironmentValue('MAIL_FROM'),
    },
  };
}

function isConfigured(config) {
  return Boolean(config && config.appBaseUrl && config.smtpHost && config.mailFrom);
}

async function updateStoredConfiguration(values) {
  const settings = await getSettings();
  const current = settings.magicLink || {};
  const effective = await getConfiguration();
  const overrides = effective.environmentOverrides;
  const updated = {
    appBaseUrl: overrides.appBaseUrl ? (current.appBaseUrl || '') : values.appBaseUrl,
    smtpHost: overrides.smtpHost ? (current.smtpHost || '') : values.smtpHost,
    smtpPort: overrides.smtpPort ? (current.smtpPort || 587) : values.smtpPort,
    smtpSecure: overrides.smtpSecure ? (current.smtpSecure === true) : values.smtpSecure,
    smtpUser: overrides.smtpUser ? (current.smtpUser || '') : values.smtpUser,
    mailFrom: overrides.mailFrom ? (current.mailFrom || '') : values.mailFrom,
    smtpPassEncrypted: current.smtpPassEncrypted || '',
  };
  if (!overrides.smtpPass && values.smtpPass) { updated.smtpPassEncrypted = encryptPassword(values.smtpPass); }
  if (!overrides.smtpPass && values.clearPassword) { updated.smtpPassEncrypted = ''; }
  await updateSettings({ magicLink: updated });
  return getConfiguration();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createTransport(config) {
  const timeout = Number.parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10);
  const transportConfig = {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    connectionTimeout: Number.isFinite(timeout) ? timeout : 10000,
    greetingTimeout: Number.isFinite(timeout) ? timeout : 10000,
    socketTimeout: Number.isFinite(timeout) ? timeout * 2 : 20000,
  };
  if (config.smtpUser) { transportConfig.auth = { user: config.smtpUser, pass: config.smtpPass }; }
  return nodemailer.createTransport(transportConfig);
}

async function testConnection(config = null) {
  const effective = config || await getConfiguration();
  if (!isConfigured(effective)) {
    const error = new Error('SMTP is not configured');
    error.code = 'E_SMTP_NOT_CONFIGURED';
    throw error;
  }
  const transporter = createTransport(effective);
  await transporter.verify();
  return true;
}

async function sendMagicLink({ to, name, url }, config = null) {
  const effective = config || await getConfiguration();
  if (!isConfigured(effective)) { throw new Error('SMTP is not configured'); }
  const transporter = createTransport(effective);
  const safeName = escapeHtml(name || to);
  const safeUrl = escapeHtml(url);
  await transporter.sendMail({
    from: effective.mailFrom,
    to,
    subject: 'Votre lien de connexion',
    text: `Bonjour ${name || ''},\n\nConnectez-vous avec ce lien valable 15 minutes :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
    html: `<p>Bonjour ${safeName},</p><p>Utilisez le bouton ci-dessous pour vous connecter. Ce lien est valable 15 minutes et ne peut servir qu'une fois.</p><p><a href="${safeUrl}">Se connecter</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
  });
}

module.exports = {
  getConfiguration,
  isConfigured,
  updateStoredConfiguration,
  testConnection,
  sendMagicLink,
  encryptPassword,
  decryptPassword,
};
