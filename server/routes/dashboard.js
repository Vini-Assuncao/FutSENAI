// Rotas de leitura agregada: painel inicial e estatísticas.
const express = require('express');
const dataStore = require('../data-store');
const Stats = require('../stats');

const router = express.Router();

router.get('/dashboard', (req, res, next) => {
  try {
    res.json(Stats.dashboard(dataStore.getData(), Stats.normalizeScope(req.query.scope)));
  } catch (error) { next(error); }
});

router.get('/stats', (req, res, next) => {
  try {
    res.json(Stats.statistics(dataStore.getData(), Stats.normalizeScope(req.query.scope)));
  } catch (error) { next(error); }
});

module.exports = router;
