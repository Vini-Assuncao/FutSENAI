// Monta a aplicação Express: arquivos estáticos, API REST e tratamento de erros.
const express = require('express');
const { publicDirectory } = require('./config');
const { requireLocalEditor } = require('./local-editor');
const { errorHandler } = require('./http');
const playersRouter = require('./routes/players');
const matchesRouter = require('./routes/matches');
const dashboardRouter = require('./routes/dashboard');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(publicDirectory));

  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'FutSENAI Score', database: 'JSON' }));

  // Leituras são públicas; qualquer alteração exige o servidor local.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    requireLocalEditor(req, res, next);
  });

  app.use('/api', dashboardRouter);
  app.use('/api/players', playersRouter);
  app.use('/api/matches', matchesRouter);

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
