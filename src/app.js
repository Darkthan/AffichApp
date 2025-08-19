const path = require('path');
const fs = require('fs');
const express = require('express');
const { router: requestsRouter } = require('./routes/requests');
const { router: authRouter } = require('./routes/auth');
const { router: usersRouter } = require('./routes/users');
const { router: cardTypesRouter } = require('./routes/cardTypes');
const { router: publicRouter } = require('./routes/public');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  app.use('/api/requests', requestsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/card-types', cardTypesRouter);
  app.use('/public', publicRouter);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Global error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err && err.message ? err.message : undefined });
  });

  // Ensure data directory exists at startup
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  return app;
}

module.exports = { createApp };
