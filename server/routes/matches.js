// Rotas de partidas, escalações, gols e assistências.
const express = require('express');
const dataStore = require('../data-store');
const Stats = require('../stats');
const { httpError, requiredText, validId } = require('../http');

const router = express.Router();

const MAX_GOALS = 300;

// Acrescenta um gol ao histórico. Gol contra é creditado ao lado adversário.
function addGoal(nextData, matchId, teamSide, playerId, goalType) {
  nextData.goals.push({
    id: nextData.nextIds.goals++,
    match_id: matchId,
    team_side: teamSide,
    player_id: playerId,
    goal_type: goalType
  });
}

function addPlayerGoals(nextData, matchId, entry) {
  for (let i = 0; i < entry.normalGoals; i++) addGoal(nextData, matchId, entry.teamSide, entry.playerId, 'normal');
  const opposingSide = entry.teamSide === 'A' ? 'B' : 'A';
  for (let i = 0; i < entry.ownGoals; i++) addGoal(nextData, matchId, opposingSide, entry.playerId, 'own_goal');
}

// Contra o 2º Ano só guardamos o total de gols do adversário, sem artilheiros externos.
function addOpponentGoals(nextData, matchId, opponentGoals, opponentOwnGoals) {
  for (let i = 0; i < opponentGoals; i++) addGoal(nextData, matchId, 'B', null, 'normal');
  for (let i = 0; i < opponentOwnGoals; i++) addGoal(nextData, matchId, 'A', null, 'own_goal');
}

function matchDetailById(matchId) {
  return Stats.matchDetail(dataStore.getData(), matchId);
}

function validateParticipants(participants, opponentType) {
  if (!Array.isArray(participants)) throw httpError(400, 'Selecione os jogadores da partida.');
  if (opponentType === 'second_year' && participants.length < 1) throw httpError(400, 'Selecione pelo menos um jogador do 3º A.');
  if (opponentType === 'classmates' && participants.length < 2) throw httpError(400, 'Selecione pelo menos dois jogadores, um para cada time.');
  const seen = new Set();
  for (const participant of participants) {
    const playerId = Number(participant.player_id);
    const validSide = opponentType === 'second_year' ? participant.team_side === 'A' : ['A', 'B'].includes(participant.team_side);
    if (!Number.isInteger(playerId) || playerId < 1 || !validSide) throw httpError(400, 'Há um jogador ou time inválido na escalação.');
    if (seen.has(playerId)) throw httpError(400, 'Cada jogador só pode estar em um time por partida.');
    seen.add(playerId);
    const player = dataStore.getData().players.find(item => item.id === playerId);
    if (!player || !player.is_active) throw httpError(400, 'Um dos jogadores selecionados não está disponível. Atualize a lista de jogadores.');
  }
  if (opponentType === 'classmates' && (!participants.some(p => p.team_side === 'A') || !participants.some(p => p.team_side === 'B'))) {
    throw httpError(400, 'Cada time precisa ter pelo menos um jogador.');
  }
}

function validateOpponentGoals(match, opponentGoals, opponentOwnGoals, rangeMessage) {
  for (const count of [opponentGoals, opponentOwnGoals]) {
    if (!Number.isInteger(count) || count < 0 || count > MAX_GOALS) throw httpError(400, rangeMessage);
  }
  if (match.opponent_type !== 'second_year' && (opponentGoals > 0 || opponentOwnGoals > 0)) {
    throw httpError(400, 'Os campos de gols do 2º Ano só podem ser usados em confrontos contra essa turma.');
  }
}

router.get('/', (req, res, next) => {
  try {
    const scope = Stats.normalizeScope(req.query.scope);
    res.json({ data: Stats.matchList(dataStore.getData(), scope), scope });
  } catch (error) { next(error); }
});

router.get('/:id', (req, res, next) => {
  try {
    const match = matchDetailById(validId(req.params.id));
    if (!match) throw httpError(404, 'Partida não encontrada.');
    res.json({ data: match });
  } catch (error) { next(error); }
});

router.post('/', (req, res, next) => {
  try {
    const playedOn = requiredText(req.body.played_on, 'data da partida', 30);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn) || Number.isNaN(Date.parse(`${playedOn}T12:00:00`))) throw httpError(400, 'Informe uma data válida.');
    const opponentType = req.body.opponent_type === 'second_year' ? 'second_year' : 'classmates';
    const participants = req.body.participants;
    validateParticipants(participants, opponentType);
    const id = dataStore.transaction(data => {
      const matchId = data.nextIds.matches++;
      data.matches.push({ id: matchId, played_on: playedOn, opponent_type: opponentType });
      for (const participant of participants) {
        data.match_players.push({
          id: data.nextIds.match_players++,
          match_id: matchId,
          player_id: Number(participant.player_id),
          team_side: participant.team_side
        });
      }
      return matchId;
    });
    res.status(201).json({ message: 'Partida criada. Agora você pode registrar os gols.', data: matchDetailById(id) });
  } catch (error) { next(error); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    if (!dataStore.getData().matches.some(match => match.id === id)) throw httpError(404, 'Partida não encontrada.');
    dataStore.transaction(data => {
      data.matches = data.matches.filter(match => match.id !== id);
      data.match_players = data.match_players.filter(participant => participant.match_id !== id);
      data.goals = data.goals.filter(goal => goal.match_id !== id);
    });
    res.json({ message: 'Partida e seus gols foram removidos.' });
  } catch (error) { next(error); }
});

// Soma novos gols/assistências aos registros atuais.
router.post('/:id/goals', (req, res, next) => {
  try {
    const matchId = validId(req.params.id);
    const data = dataStore.getData();
    const match = data.matches.find(item => item.id === matchId);
    if (!match) throw httpError(404, 'Partida não encontrada.');
    if (!Array.isArray(req.body.entries)) throw httpError(400, 'Informe a quantidade de gols dos jogadores.');

    const opponentGoals = Number(req.body.opponent_goals ?? 0);
    const opponentOwnGoals = Number(req.body.opponent_own_goals ?? 0);
    if (!Number.isInteger(opponentGoals) || opponentGoals < 0 || opponentGoals > MAX_GOALS) throw httpError(400, 'A quantidade de gols do adversário deve estar entre 0 e 300.');
    if (!Number.isInteger(opponentOwnGoals) || opponentOwnGoals < 0 || opponentOwnGoals > MAX_GOALS) throw httpError(400, 'A quantidade de gols contra do adversário deve estar entre 0 e 300.');
    if (match.opponent_type !== 'second_year' && (opponentGoals > 0 || opponentOwnGoals > 0)) throw httpError(400, 'Os campos de gols do 2º Ano só podem ser usados em confrontos contra essa turma.');

    const participants = data.match_players.filter(participant => participant.match_id === matchId);
    const participantById = new Map(participants.map(participant => [participant.player_id, participant]));
    const seen = new Set();
    const entries = [];
    let totalNewGoals = opponentGoals + opponentOwnGoals;
    let totalNewAssists = 0;
    for (const entry of req.body.entries) {
      const playerId = Number(entry.player_id);
      if (!Number.isInteger(playerId) || !participantById.has(playerId)) throw httpError(400, 'Todos os jogadores precisam pertencer a esta partida.');
      if (seen.has(playerId)) throw httpError(400, 'Um jogador aparece mais de uma vez no formulário.');
      seen.add(playerId);
      const normalGoals = Number(entry.goals ?? 0);
      const ownGoals = Number(entry.own_goals ?? 0);
      const assists = Number(entry.assists ?? 0);
      for (const count of [normalGoals, ownGoals, assists]) {
        if (!Number.isInteger(count) || count < 0 || count > 99) throw httpError(400, 'A quantidade de gols e assistências deve estar entre 0 e 99 por jogador.');
      }
      totalNewGoals += normalGoals + ownGoals;
      totalNewAssists += assists;
      entries.push({ playerId, normalGoals, ownGoals, assists, teamSide: participantById.get(playerId).team_side });
    }
    if (totalNewGoals < 1 && totalNewAssists < 1) throw httpError(400, 'Informe pelo menos um gol ou uma assistência para registrar.');
    if (totalNewGoals > MAX_GOALS) throw httpError(400, 'Registre no máximo 300 gols de uma só vez.');
    if (totalNewAssists > MAX_GOALS) throw httpError(400, 'Registre no máximo 300 assistências de uma só vez.');

    dataStore.transaction(nextData => {
      for (const entry of entries) {
        const participant = nextData.match_players.find(item => item.match_id === matchId && item.player_id === entry.playerId);
        participant.assists = (Number(participant.assists) || 0) + entry.assists;
        addPlayerGoals(nextData, matchId, entry);
      }
      addOpponentGoals(nextData, matchId, opponentGoals, opponentOwnGoals);
    });
    const messages = [];
    if (totalNewGoals) messages.push(`${totalNewGoals} ${totalNewGoals === 1 ? 'gol registrado' : 'gols registrados'}`);
    if (totalNewAssists) messages.push(`${totalNewAssists} ${totalNewAssists === 1 ? 'assistência registrada' : 'assistências registradas'}`);
    res.status(201).json({ message: `${messages.join(' e ')} com sucesso.`, data: matchDetailById(matchId) });
  } catch (error) { next(error); }
});

// Substitui os totais de gols e assistências da partida.
router.put('/:id/goals', (req, res, next) => {
  try {
    const matchId = validId(req.params.id);
    const data = dataStore.getData();
    const match = data.matches.find(item => item.id === matchId);
    if (!match) throw httpError(404, 'Partida não encontrada.');
    if (!Array.isArray(req.body.entries)) throw httpError(400, 'Informe os totais de gols e assistências dos jogadores.');

    const opponentGoals = Number(req.body.opponent_goals ?? 0);
    const opponentOwnGoals = Number(req.body.opponent_own_goals ?? 0);
    validateOpponentGoals(match, opponentGoals, opponentOwnGoals, 'Os gols do 2º Ano devem estar entre 0 e 300.');

    const participants = data.match_players.filter(participant => participant.match_id === matchId);
    const participantById = new Map(participants.map(participant => [participant.player_id, participant]));
    const seen = new Set();
    const entries = [];
    let totalGoals = opponentGoals + opponentOwnGoals;
    let totalAssists = 0;
    for (const entry of req.body.entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw httpError(400, 'Cada estatística precisa identificar um jogador.');
      const playerId = Number(entry.player_id);
      if (!Number.isInteger(playerId) || !participantById.has(playerId)) throw httpError(400, 'Todos os jogadores precisam pertencer a esta partida.');
      if (seen.has(playerId)) throw httpError(400, 'Um jogador aparece mais de uma vez no formulário.');
      seen.add(playerId);
      const goals = Number(entry.goals ?? 0);
      const ownGoals = Number(entry.own_goals ?? 0);
      const assists = Number(entry.assists ?? 0);
      for (const count of [goals, ownGoals, assists]) {
        if (!Number.isInteger(count) || count < 0 || count > 99) {
          throw httpError(400, 'Cada total de gols e assistências deve estar entre 0 e 99 por jogador.');
        }
      }
      totalGoals += goals + ownGoals;
      totalAssists += assists;
      entries.push({ playerId, normalGoals: goals, ownGoals, assists, teamSide: participantById.get(playerId).team_side });
    }
    if (seen.size !== participants.length) throw httpError(400, 'Informe os totais de todos os jogadores escalados.');
    if (totalGoals > MAX_GOALS) throw httpError(400, 'Registre no máximo 300 gols por partida.');
    if (totalAssists > MAX_GOALS) throw httpError(400, 'Registre no máximo 300 assistências por partida.');

    dataStore.transaction(nextData => {
      nextData.goals = nextData.goals.filter(goal => goal.match_id !== matchId);
      for (const entry of entries) {
        const participant = nextData.match_players.find(item => item.match_id === matchId && item.player_id === entry.playerId);
        participant.assists = entry.assists;
        addPlayerGoals(nextData, matchId, entry);
      }
      addOpponentGoals(nextData, matchId, opponentGoals, opponentOwnGoals);
    });
    res.json({ message: 'Estatísticas da partida atualizadas.', data: matchDetailById(matchId) });
  } catch (error) { next(error); }
});

router.delete('/:matchId/assists/:playerId', (req, res, next) => {
  try {
    const matchId = validId(req.params.matchId);
    const playerId = validId(req.params.playerId);
    const participant = dataStore.getData().match_players.find(item => item.match_id === matchId && item.player_id === playerId);
    if (!participant || !(Number(participant.assists) > 0)) throw httpError(404, 'Assistência não encontrada nesta partida.');
    dataStore.transaction(data => {
      const current = data.match_players.find(item => item.match_id === matchId && item.player_id === playerId);
      current.assists--;
    });
    res.json({ message: 'Assistência removida.', data: matchDetailById(matchId) });
  } catch (error) { next(error); }
});

router.delete('/:matchId/goals/:goalId', (req, res, next) => {
  try {
    const matchId = validId(req.params.matchId);
    const goalId = validId(req.params.goalId);
    if (!dataStore.getData().goals.some(goal => goal.id === goalId && goal.match_id === matchId)) {
      throw httpError(404, 'Gol não encontrado nesta partida.');
    }
    dataStore.transaction(data => {
      data.goals = data.goals.filter(goal => goal.id !== goalId || goal.match_id !== matchId);
    });
    res.json({ message: 'Gol removido.', data: matchDetailById(matchId) });
  } catch (error) { next(error); }
});

module.exports = router;
