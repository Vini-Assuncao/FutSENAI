// Rotas de leitura agregada: painel inicial e estatísticas.
const express = require('express');
const dataStore = require('../data-store');
const Stats = require('../stats');
const { httpError, validId } = require('../http');

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

router.get('/compare', (req, res, next) => {
  try {
    const a = validId(req.query.a);
    const b = validId(req.query.b);
    if (a === b) throw httpError(400, 'Escolha dois jogadores diferentes.');
    const result = Stats.compare(dataStore.getData(), a, b, Stats.normalizeScope(req.query.scope));
    if (!result) throw httpError(404, 'Jogador não encontrado.');
    res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
