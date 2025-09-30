const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_e) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };

