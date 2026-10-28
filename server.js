const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const dataStore = require('./data-store');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const LOCAL_EDITOR_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000'
]);
const publicDirectory = path.join(__dirname, 'public');
const uploadsDirectory = path.join(publicDirectory, 'uploads');
fs.mkdirSync(uploadsDirectory, { recursive: true });

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDirectory));

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadsDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return callback(new Error('Formato inválido. Envie uma imagem JPG, PNG, WEBP ou GIF.'));
    }
    callback(null, true);
  }
});

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function isLoopbackAddress(address) {
  return address === '::1' || address === '127.0.0.1' || address?.startsWith('::ffff:127.');
}
function requireLocalEditor(req, res, next) {
  const host = req.get('host')?.toLowerCase();
  const origin = req.get('origin');
  if (PORT !== 3000 || !isLoopbackAddress(req.socket.remoteAddress)
    || !LOCAL_EDITOR_ORIGINS.has(origin) || !LOCAL_EDITOR_ORIGINS.has(`http://${host}`)) {
    return res.status(403).json({ error: 'Edição disponível somente no servidor local em http://localhost:3000.' });
  }
  next();
}
function requiredText(value, field, max = 120) {
  const text = String(value ?? '').trim();
  if (!text) throw httpError(400, `Preencha o campo ${field}.`);
  if (text.length > max) throw httpError(400, `O campo ${field} deve ter no máximo ${max} caracteres.`);
  return text;
}
function optionalText(value, max = 500) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw httpError(400, `O texto deve ter no máximo ${max} caracteres.`);
  return text;
}
function normalizeScope(value) {
  return value === 'interclass' ? 'interclass' : 'internal';
}
function validId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Identificador inválido.');
  return id;
}
function safeRemoveUpload(photoPath) {
  if (!photoPath || !photoPath.startsWith('/uploads/')) return;
  const file = path.join(publicDirectory, photoPath.replace(/^\//, ''));
  if (file.startsWith(uploadsDirectory) && fs.existsSync(file)) fs.unlink(file, () => {});
}
function parsePlayerBody(body, existingPhoto = null, existingReservePhoto = null, uploadedPhoto = null, uploadedReservePhoto = null, existingQuality = 3) {
  const name = requiredText(body.name, 'nome', 100);
  const quality = Number(body.quality ?? existingQuality);
  if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
    throw httpError(400, 'A qualidade do jogador deve ser um número inteiro de 1 a 5.');
  }
  return {
    name,
    quality,
    photoPath: uploadedPhoto ? `/uploads/${uploadedPhoto.filename}` : existingPhoto,
    reservePhotoPath: uploadedReservePhoto ? `/uploads/${uploadedReservePhoto.filename}` : existingReservePhoto
  };
}
function uploadedPlayerPhotos(files) {
  return ['photo', 'reserve_photo'].flatMap(field => files?.[field] || []);
}
function getScores(matchId, data = dataStore.getData()) {
  return data.goals.reduce((scores, goal) => {
    if (goal.match_id === matchId) scores[goal.team_side]++;
    return scores;
  }, { A: 0, B: 0 });
}
function getMatchSummary(match, data = dataStore.getData()) {
  const scores = getScores(match.id, data);
  const isSecondYear = match.opponent_type === 'second_year';
  const counts = { A: 0, B: 0 };
  data.match_players.filter(participant => participant.match_id === match.id)
    .forEach(participant => { counts[participant.team_side]++; });
  let outcome = 'draw';
  if (scores.A > scores.B) outcome = 'A';
  if (scores.B > scores.A) outcome = 'B';
  return {
    ...match,
    location: 'Quadra',
    team_a_name: isSecondYear ? '3º A' : 'Time Vermelho',
    team_b_name: isSecondYear ? '2º Ano' : 'Time Branco',
    score_a: scores.A,
    score_b: scores.B,
    players_a: counts.A,
    players_b: isSecondYear ? 0 : counts.B,
    total_players: counts.A + (isSecondYear ? 0 : counts.B),
    total_goals: scores.A + scores.B,
    outcome
  };
}
function getSecondYearRivalry() {
  const matches = getMatchList(null, 'interclass');
  return {
    matches: matches.length,
    wins: matches.filter(match => match.score_a > match.score_b).length,
    draws: matches.filter(match => match.score_a === match.score_b).length,
    losses: matches.filter(match => match.score_a < match.score_b).length,
    goalsFor: matches.reduce((sum, match) => sum + match.score_a, 0),
    goalsAgainst: matches.reduce((sum, match) => sum + match.score_b, 0)
  };
}
function getPlayerStats(playerId, scope = 'internal', data = dataStore.getData()) {
  const player = data.players.find(item => item.id === playerId);
  if (!player) return null;
  const matchesById = new Map(data.matches.map(match => [match.id, match]));
  const played = data.match_players
    .filter(participant => participant.player_id === playerId)
    .map(participant => ({ ...participant, match: matchesById.get(participant.match_id) }))
    .filter(appearance => appearance.match && (!scope || appearance.match.opponent_type === (scope === 'interclass' ? 'second_year' : 'classmates')))
    .sort((left, right) => right.match.played_on.localeCompare(left.match.played_on) || right.match.id - left.match.id);
  let wins = 0, draws = 0, losses = 0;
  for (const appearance of played) {
    const score = getScores(appearance.match_id, data);
    const own = appearance.team_side === 'A' ? score.A : score.B;
    const rival = appearance.team_side === 'A' ? score.B : score.A;
    if (own > rival) wins++;
    else if (own === rival) draws++;
    else losses++;
  }
  const goals = data.goals.filter(goal => {
    if (goal.player_id !== playerId || goal.goal_type !== 'normal') return false;
    const match = matchesById.get(goal.match_id);
    return match && (!scope || match.opponent_type === (scope === 'interclass' ? 'second_year' : 'classmates'));
  }).length;
  const assists = played.reduce((sum, appearance) => sum + (Number(appearance.assists) || 0), 0);
  return { ...player, matches_played: played.length, goals, assists, wins, draws, losses, win_rate: played.length ? Math.round((wins / played.length) * 100) : 0, goals_per_match: played.length ? Number((goals / played.length).toFixed(2)) : 0 };
}
function getPlayerList(includeInactive = false, scope = 'internal', data = dataStore.getData()) {
  const players = data.players
    .filter(player => includeInactive || player.is_active)
    .sort((left, right) => right.is_active - left.is_active || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
  return players.map(player => getPlayerStats(player.id, scope, data));
}
function getPlayerHistory(playerId, data = dataStore.getData()) {
  const player = data.players.find(item => item.id === playerId);
  if (!player) return null;
  const matchesById = new Map(data.matches.map(match => [match.id, match]));
  const appearances = data.match_players
    .filter(participant => participant.player_id === playerId)
    .map(participant => ({ participant, match: matchesById.get(participant.match_id) }))
    .filter(appearance => appearance.match)
    .sort((left, right) => right.match.played_on.localeCompare(left.match.played_on) || right.match.id - left.match.id)
    .slice(0, 10)
    .map(({ participant, match }) => {
      const summary = getMatchSummary(match, data);
      const scores = getScores(match.id, data);
      const playerScore = participant.team_side === 'A' ? scores.A : scores.B;
      const opponentScore = participant.team_side === 'A' ? scores.B : scores.A;
      return {
        ...summary,
        team_side: participant.team_side,
        result: playerScore > opponentScore ? 'win' : playerScore < opponentScore ? 'loss' : 'draw',
        goals: data.goals.filter(goal => goal.match_id === match.id && goal.player_id === playerId && goal.goal_type === 'normal').length,
        own_goals: data.goals.filter(goal => goal.match_id === match.id && goal.player_id === playerId && goal.goal_type === 'own_goal').length,
        assists: Number(participant.assists) || 0
      };
    });
  return {
    player,
    stats: {
      internal: getPlayerStats(playerId, 'internal', data),
      interclass: getPlayerStats(playerId, 'interclass', data)
    },
    matches: appearances
  };
}
function getMatchList(limit = null, scope = 'internal', data = dataStore.getData()) {
  const rows = data.matches
    .filter(match => !scope || match.opponent_type === (scope === 'interclass' ? 'second_year' : 'classmates'))
    .sort((left, right) => right.played_on.localeCompare(left.played_on) || right.id - left.id)
    .map(match => getMatchSummary(match, data));
  return Number.isInteger(limit) ? rows.slice(0, limit) : rows;
}
function getMatchDetail(matchId, data = dataStore.getData()) {
  const match = data.matches.find(item => item.id === matchId);
  if (!match) return null;
  const summary = getMatchSummary(match, data);
  const playersById = new Map(data.players.map(player => [player.id, player]));
  const players = data.match_players
    .filter(participant => participant.match_id === matchId)
    .map(participant => {
      const player = playersById.get(participant.player_id);
      return { id: player.id, name: player.name, photo_path: player.photo_path, photo_reserve_path: player.photo_reserve_path, is_active: player.is_active, team_side: participant.team_side, assists: Number(participant.assists) || 0 };
    })
    .sort((left, right) => left.team_side.localeCompare(right.team_side) || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
  const goals = data.goals.filter(goal => goal.match_id === matchId).sort((left, right) => left.id - right.id).map(goal => {
    const player = playersById.get(goal.player_id);
    return { ...goal, player_name: player?.name ?? null, player_photo: player?.photo_path ?? null, player_reserve_photo: player?.photo_reserve_path ?? null };
  });
  return { ...summary, players, goals };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'FutSENAI', database: 'JSON' }));
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  requireLocalEditor(req, res, next);
});

app.get('/api/dashboard', (req, res, next) => {
  try {
    const scope = normalizeScope(req.query.scope);
    const data = dataStore.getData();
    const activePlayers = data.players.filter(player => player.is_active).length;
    const filteredMatches = getMatchList(null, scope, data);
    const totalMatches = filteredMatches.length;
    const totalGoals = filteredMatches.reduce((sum, match) => sum + match.total_goals, 0);
    const recentMatches = filteredMatches.slice(0, 5);
    const allPlayers = getPlayerList(false, scope, data);
    const eligibleScorers = allPlayers.filter(player => player.goals > 0 || player.matches_played > 0);
    const topScorers = [...eligibleScorers].sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.wins - a.wins || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })).slice(0, 5);
    const averageGoals = totalMatches ? Number((totalGoals / totalMatches).toFixed(1)) : 0;
    const secondYearRivalry = getSecondYearRivalry();
    res.json({ scope, summary: { activePlayers, totalMatches, totalGoals, averageGoals }, recentMatches, topScorers, players: allPlayers, secondYearRivalry });
  } catch (error) { next(error); }
});
app.get('/api/players', (req, res, next) => {
  try {
    const data = dataStore.getData();
    const scope = normalizeScope(req.query.scope);
    res.json({ data: getPlayerList(req.query.includeInactive === 'true', scope, data), scope });
  } catch (error) { next(error); }
});
app.get('/api/players/:id/history', (req, res, next) => {
  try {
    const history = getPlayerHistory(validId(req.params.id));
    if (!history) throw httpError(404, 'Jogador não encontrado.');
    res.json({ data: history });
  } catch (error) { next(error); }
});

app.post('/api/players', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'reserve_photo', maxCount: 1 }]), (req, res, next) => {
  try {
    const files = req.files;
    const player = parsePlayerBody(req.body, null, null, files?.photo?.[0], files?.reserve_photo?.[0]);
    const id = dataStore.transaction(data => {
      const id = data.nextIds.players++;
      data.players.push({
        id,
        name: player.name,
        photo_path: player.photoPath,
        photo_reserve_path: player.reservePhotoPath,
        quality: player.quality,
        is_active: 1
      });
      return id;
    });
    res.status(201).json({ message: 'Jogador cadastrado com sucesso.', data: getPlayerStats(id) });
  } catch (error) {
    for (const file of uploadedPlayerPhotos(req.files)) safeRemoveUpload(`/uploads/${file.filename}`);
    next(error);
  }
});

app.put('/api/players/:id', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'reserve_photo', maxCount: 1 }]), (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const existing = dataStore.getData().players.find(item => item.id === id);
    if (!existing) throw httpError(404, 'Jogador não encontrado.');
    const files = req.files;
    const uploadedPhoto = files?.photo?.[0];
    const uploadedReservePhoto = files?.reserve_photo?.[0];
    const player = parsePlayerBody(req.body, existing.photo_path, existing.photo_reserve_path, uploadedPhoto, uploadedReservePhoto, existing.quality);
    dataStore.transaction(data => {
      const current = data.players.find(item => item.id === id);
      current.name = player.name;
      current.photo_path = player.photoPath;
      current.photo_reserve_path = player.reservePhotoPath;
      current.quality = player.quality;
    });
    for (const oldPhoto of new Set([existing.photo_path, existing.photo_reserve_path])) {
      if (oldPhoto && oldPhoto !== player.photoPath && oldPhoto !== player.reservePhotoPath) safeRemoveUpload(oldPhoto);
    }
    res.json({ message: 'Jogador atualizado com sucesso.', data: getPlayerStats(id) });
  } catch (error) {
    for (const file of uploadedPlayerPhotos(req.files)) safeRemoveUpload(`/uploads/${file.filename}`);
    next(error);
  }
});

app.patch('/api/players/:id/archive', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const player = dataStore.getData().players.find(item => item.id === id);
    if (!player) throw httpError(404, 'Jogador não encontrado.');
    const active = player.is_active ? 0 : 1;
    dataStore.transaction(data => {
      data.players.find(item => item.id === id).is_active = active;
    });
    res.json({ message: active ? 'Jogador reativado.' : 'Jogador arquivado. O histórico foi preservado.', is_active: active });
  } catch (error) { next(error); }
});

app.delete('/api/players/:id', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const player = dataStore.getData().players.find(item => item.id === id);
    if (!player) throw httpError(404, 'Jogador não encontrado.');
    const appearances = dataStore.getData().match_players.filter(item => item.player_id === id).length;
    if (appearances > 0) {
      dataStore.transaction(data => {
        data.players.find(item => item.id === id).is_active = 0;
      });
      return res.json({ message: 'Este jogador tem partidas no histórico, então foi arquivado para preservar as estatísticas.' , archived: true });
    }
    dataStore.transaction(data => {
      data.players = data.players.filter(item => item.id !== id);
      data.goals.forEach(goal => { if (goal.player_id === id) goal.player_id = null; });
    });
    for (const photo of new Set([player.photo_path, player.photo_reserve_path])) safeRemoveUpload(photo);
    res.json({ message: 'Jogador excluído com sucesso.', archived: false });
  } catch (error) { next(error); }
});

app.get('/api/matches', (req, res, next) => {
  try { res.json({ data: getMatchList(null, normalizeScope(req.query.scope)), scope: normalizeScope(req.query.scope) }); }
  catch (error) { next(error); }
});
app.get('/api/matches/:id', (req, res, next) => {
  try {
    const match = getMatchDetail(validId(req.params.id));
    if (!match) throw httpError(404, 'Partida não encontrada.');
    res.json({ data: match });
  } catch (error) { next(error); }
});
app.post('/api/matches', (req, res, next) => {
  try {
    const playedOn = requiredText(req.body.played_on, 'data da partida', 30);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn) || Number.isNaN(Date.parse(`${playedOn}T12:00:00`))) throw httpError(400, 'Informe uma data válida.');
    const opponentType = req.body.opponent_type === 'second_year' ? 'second_year' : 'classmates';
    const participants = req.body.participants;
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
    res.status(201).json({ message: 'Partida criada. Agora você pode registrar os gols.', data: getMatchDetail(id) });
  } catch (error) { next(error); }
});
app.delete('/api/matches/:id', (req, res, next) => {
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

app.post('/api/matches/:id/goals', (req, res, next) => {
  try {
    const matchId = validId(req.params.id);
    const data = dataStore.getData();
    const match = data.matches.find(item => item.id === matchId);
    if (!match) throw httpError(404, 'Partida não encontrada.');
    if (!Array.isArray(req.body.entries)) throw httpError(400, 'Informe a quantidade de gols dos jogadores.');

    const opponentGoals = Number(req.body.opponent_goals ?? 0);
    const opponentOwnGoals = Number(req.body.opponent_own_goals ?? 0);
    if (!Number.isInteger(opponentGoals) || opponentGoals < 0 || opponentGoals > 300) throw httpError(400, 'A quantidade de gols do adversário deve estar entre 0 e 300.');
    if (!Number.isInteger(opponentOwnGoals) || opponentOwnGoals < 0 || opponentOwnGoals > 300) throw httpError(400, 'A quantidade de gols contra do adversário deve estar entre 0 e 300.');
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
    if (totalNewGoals > 300) throw httpError(400, 'Registre no máximo 300 gols de uma só vez.');
    if (totalNewAssists > 300) throw httpError(400, 'Registre no máximo 300 assistências de uma só vez.');

    dataStore.transaction(nextData => {
      const addGoal = (teamSide, playerId, goalType) => {
        nextData.goals.push({
          id: nextData.nextIds.goals++,
          match_id: matchId,
          team_side: teamSide,
          player_id: playerId,
          goal_type: goalType
        });
      };
      for (const entry of entries) {
        const participant = nextData.match_players.find(item => item.match_id === matchId && item.player_id === entry.playerId);
        participant.assists = (Number(participant.assists) || 0) + entry.assists;
        for (let i = 0; i < entry.normalGoals; i++) addGoal(entry.teamSide, entry.playerId, 'normal');
        const opposingSide = entry.teamSide === 'A' ? 'B' : 'A';
        for (let i = 0; i < entry.ownGoals; i++) addGoal(opposingSide, entry.playerId, 'own_goal');
      }
      // Contra o 2º Ano, só guardamos o total de gols do adversário, sem artilheiros externos.
      for (let i = 0; i < opponentGoals; i++) addGoal('B', null, 'normal');
      for (let i = 0; i < opponentOwnGoals; i++) addGoal('A', null, 'own_goal');
    });
    const messages = [];
    if (totalNewGoals) messages.push(`${totalNewGoals} ${totalNewGoals === 1 ? 'gol registrado' : 'gols registrados'}`);
    if (totalNewAssists) messages.push(`${totalNewAssists} ${totalNewAssists === 1 ? 'assistência registrada' : 'assistências registradas'}`);
    res.status(201).json({ message: `${messages.join(' e ')} com sucesso.`, data: getMatchDetail(matchId) });
  } catch (error) { next(error); }
});
app.put('/api/matches/:id/goals', (req, res, next) => {
  try {
    const matchId = validId(req.params.id);
    const data = dataStore.getData();
    const match = data.matches.find(item => item.id === matchId);
    if (!match) throw httpError(404, 'Partida não encontrada.');
    if (!Array.isArray(req.body.entries)) throw httpError(400, 'Informe os totais de gols e assistências dos jogadores.');

    const opponentGoals = Number(req.body.opponent_goals ?? 0);
    const opponentOwnGoals = Number(req.body.opponent_own_goals ?? 0);
    for (const count of [opponentGoals, opponentOwnGoals]) {
      if (!Number.isInteger(count) || count < 0 || count > 300) throw httpError(400, 'Os gols do 2º Ano devem estar entre 0 e 300.');
    }
    if (match.opponent_type !== 'second_year' && (opponentGoals > 0 || opponentOwnGoals > 0)) {
      throw httpError(400, 'Os campos de gols do 2º Ano só podem ser usados em confrontos contra essa turma.');
    }

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
      entries.push({ playerId, goals, ownGoals, assists, teamSide: participantById.get(playerId).team_side });
    }
    if (seen.size !== participants.length) throw httpError(400, 'Informe os totais de todos os jogadores escalados.');
    if (totalGoals > 300) throw httpError(400, 'Registre no máximo 300 gols por partida.');
    if (totalAssists > 300) throw httpError(400, 'Registre no máximo 300 assistências por partida.');

    dataStore.transaction(nextData => {
      nextData.goals = nextData.goals.filter(goal => goal.match_id !== matchId);
      const addGoal = (teamSide, playerId, goalType) => {
        nextData.goals.push({
          id: nextData.nextIds.goals++,
          match_id: matchId,
          team_side: teamSide,
          player_id: playerId,
          goal_type: goalType
        });
      };
      for (const entry of entries) {
        const participant = nextData.match_players.find(item => item.match_id === matchId && item.player_id === entry.playerId);
        participant.assists = entry.assists;
        for (let i = 0; i < entry.goals; i++) addGoal(entry.teamSide, entry.playerId, 'normal');
        const opposingSide = entry.teamSide === 'A' ? 'B' : 'A';
        for (let i = 0; i < entry.ownGoals; i++) addGoal(opposingSide, entry.playerId, 'own_goal');
      }
      for (let i = 0; i < opponentGoals; i++) addGoal('B', null, 'normal');
      for (let i = 0; i < opponentOwnGoals; i++) addGoal('A', null, 'own_goal');
    });
    res.json({ message: 'Estatísticas da partida atualizadas.', data: getMatchDetail(matchId) });
  } catch (error) { next(error); }
});
app.delete('/api/matches/:matchId/assists/:playerId', (req, res, next) => {
  try {
    const matchId = validId(req.params.matchId);
    const playerId = validId(req.params.playerId);
    const participant = dataStore.getData().match_players.find(item => item.match_id === matchId && item.player_id === playerId);
    if (!participant || !(Number(participant.assists) > 0)) throw httpError(404, 'Assistência não encontrada nesta partida.');
    dataStore.transaction(data => {
      const current = data.match_players.find(item => item.match_id === matchId && item.player_id === playerId);
      current.assists--;
    });
    res.json({ message: 'Assistência removida.', data: getMatchDetail(matchId) });
  } catch (error) { next(error); }
});
app.delete('/api/matches/:matchId/goals/:goalId', (req, res, next) => {
  try {
    const matchId = validId(req.params.matchId);
    const goalId = validId(req.params.goalId);
    if (!dataStore.getData().goals.some(goal => goal.id === goalId && goal.match_id === matchId)) {
      throw httpError(404, 'Gol não encontrado nesta partida.');
    }
    dataStore.transaction(data => {
      data.goals = data.goals.filter(goal => goal.id !== goalId || goal.match_id !== matchId);
    });
    res.json({ message: 'Gol removido.', data: getMatchDetail(matchId) });
  } catch (error) { next(error); }
});

app.get('/api/stats', (req, res, next) => {
  try {
    const scope = normalizeScope(req.query.scope);
    const players = getPlayerList(true, scope).filter(p => p.matches_played > 0 || p.goals > 0 || p.assists > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.wins - a.wins || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    const matches = getMatchList(null, scope);
    const totalGoals = matches.reduce((sum, match) => sum + match.total_goals, 0);
    const aggregate = {
      matches: matches.length,
      goals: totalGoals,
      averageGoals: matches.length ? Number((totalGoals / matches.length).toFixed(1)) : 0,
      draws: matches.filter(m => m.outcome === 'draw').length,
      wins: matches.filter(m => m.outcome === 'A').length,
      losses: matches.filter(m => m.outcome === 'B').length,
      mostRecent: matches[0] || null,
      secondYearRivalry: getSecondYearRivalry()
    };
    res.json({ scope, aggregate, players });
  } catch (error) { next(error); }
});
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'A imagem deve ter no máximo 5 MB.' : error.message;
    return res.status(400).json({ error: message });
  }
  const status = error.status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? 'Ocorreu um erro interno. Confira o terminal do servidor.' : error.message });
});

app.listen(PORT, () => {
  console.log(`\n⚽ FutSENAI rodando em http://localhost:${PORT}`);
  console.log(`Dados JSON: ${dataStore.dataFile}\n`);
});
