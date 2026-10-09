const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const db = require('./database');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
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
  return ['interclass', 'internal'].includes(value) ? value : 'all';
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
function parsePlayerBody(body, existingPhoto = null, uploadedFile = null) {
  const name = requiredText(body.name, 'nome', 100);
  return {
    name,
    photoPath: uploadedFile ? `/uploads/${uploadedFile.filename}` : existingPhoto
  };
}
function getScores(matchId) {
  const rows = db.prepare(`SELECT team_side, COUNT(*) AS score FROM goals WHERE match_id = ? GROUP BY team_side`).all(matchId);
  return { A: rows.find(row => row.team_side === 'A')?.score || 0, B: rows.find(row => row.team_side === 'B')?.score || 0 };
}
function getMatchSummary(match) {
  const scores = getScores(match.id);
  const isSecondYear = match.opponent_type === 'second_year';
  const playerCounts = db.prepare(`SELECT team_side, COUNT(*) AS count FROM match_players WHERE match_id = ? GROUP BY team_side`).all(match.id);
  const counts = { A: 0, B: 0 };
  playerCounts.forEach(row => { counts[row.team_side] = row.count; });
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
  const matches = getMatchList().filter(match => match.opponent_type === 'second_year');
  return {
    matches: matches.length,
    wins: matches.filter(match => match.score_a > match.score_b).length,
    draws: matches.filter(match => match.score_a === match.score_b).length,
    losses: matches.filter(match => match.score_a < match.score_b).length,
    goalsFor: matches.reduce((sum, match) => sum + match.score_a, 0),
    goalsAgainst: matches.reduce((sum, match) => sum + match.score_b, 0)
  };
}
function getPlayerStats(playerId, scope = 'all') {
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  if (!player) return null;
  const scopeCondition = scope === 'interclass'
    ? "AND m.opponent_type = 'second_year'"
    : scope === 'internal' ? "AND m.opponent_type = 'classmates'" : '';
  const played = db.prepare(`
    SELECT m.id, mp.team_side
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.player_id = ? ${scopeCondition}
    ORDER BY m.played_on DESC, m.id DESC
  `).all(playerId);
  let wins = 0, draws = 0, losses = 0;
  for (const appearance of played) {
    const score = getScores(appearance.id);
    const own = appearance.team_side === 'A' ? score.A : score.B;
    const rival = appearance.team_side === 'A' ? score.B : score.A;
    if (own > rival) wins++;
    else if (own === rival) draws++;
    else losses++;
  }
  const goals = db.prepare(`
    SELECT COUNT(*) AS count
    FROM goals g JOIN matches m ON m.id = g.match_id
    WHERE g.player_id = ? AND g.goal_type = 'normal' ${scopeCondition}
  `).get(playerId).count;
  return { ...player, matches_played: played.length, goals, wins, draws, losses, win_rate: played.length ? Math.round((wins / played.length) * 100) : 0, goals_per_match: played.length ? Number((goals / played.length).toFixed(2)) : 0 };
}
function getPlayerList(includeInactive = false, scope = 'all') {
  const players = db.prepare(`SELECT * FROM players ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY is_active DESC, name COLLATE NOCASE ASC`).all();
  return players.map(player => getPlayerStats(player.id, scope));
}
function getMatchList(limit = null, scope = 'all') {
  const where = scope === 'interclass' ? "WHERE opponent_type = 'second_year'" : scope === 'internal' ? "WHERE opponent_type = 'classmates'" : '';
  const rows = db.prepare(`SELECT * FROM matches ${where} ORDER BY played_on DESC, id DESC`).all().map(getMatchSummary);
  return Number.isInteger(limit) ? rows.slice(0, limit) : rows;
}
function getMatchDetail(matchId) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return null;
  const summary = getMatchSummary(match);
  const players = db.prepare(`
    SELECT p.id, p.name, p.photo_path, p.is_active, mp.team_side
    FROM match_players mp JOIN players p ON p.id = mp.player_id
    WHERE mp.match_id = ?
    ORDER BY mp.team_side, p.name COLLATE NOCASE
  `).all(matchId);
  const goals = db.prepare(`
    SELECT g.*, p.name AS player_name, p.photo_path AS player_photo
    FROM goals g LEFT JOIN players p ON p.id = g.player_id
    WHERE g.match_id = ?
    ORDER BY g.id
  `).all(matchId);
  return { ...summary, players, goals };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'FutSENAI', database: 'SQLite' }));

app.get('/api/dashboard', (req, res, next) => {
  try {
    const scope = normalizeScope(req.query.scope);
    const activePlayers = db.prepare('SELECT COUNT(*) AS count FROM players WHERE is_active = 1').get().count;
    const filteredMatches = getMatchList(null, scope);
    const totalMatches = filteredMatches.length;
    const totalGoals = filteredMatches.reduce((sum, match) => sum + match.total_goals, 0);
    const recentMatches = filteredMatches.slice(0, 5);
    const allPlayers = getPlayerList(false, scope);
    const eligibleScorers = allPlayers.filter(player => player.goals > 0 || player.matches_played > 0);
    const topScorers = [...eligibleScorers].sort((a, b) => b.goals - a.goals || b.matches_played - a.matches_played || a.name.localeCompare(b.name)).slice(0, 5);
    const averageGoals = totalMatches ? Number((totalGoals / totalMatches).toFixed(1)) : 0;
    const secondYearRivalry = getSecondYearRivalry();
    res.json({ scope, summary: { activePlayers, totalMatches, totalGoals, averageGoals }, recentMatches, topScorers, players: allPlayers, secondYearRivalry });
  } catch (error) { next(error); }
});
app.get('/api/players', (req, res, next) => {
  try {
    res.json({ data: getPlayerList(req.query.includeInactive === 'true', normalizeScope(req.query.scope)), scope: normalizeScope(req.query.scope) });
  } catch (error) { next(error); }
});

app.post('/api/players', upload.single('photo'), (req, res, next) => {
  try {
    const player = parsePlayerBody(req.body, null, req.file);
    const result = db.prepare(`INSERT INTO players (name, photo_path) VALUES (?, ?)`)
      .run(player.name, player.photoPath);
    res.status(201).json({ message: 'Jogador cadastrado com sucesso.', data: getPlayerStats(Number(result.lastInsertRowid)) });
  } catch (error) { if (req.file) safeRemoveUpload(`/uploads/${req.file.filename}`); next(error); }
});

app.put('/api/players/:id', upload.single('photo'), (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!existing) throw httpError(404, 'Jogador não encontrado.');
    const player = parsePlayerBody(req.body, existing.photo_path, req.file);
    db.prepare(`UPDATE players SET name = ?, photo_path = ? WHERE id = ?`)
      .run(player.name, player.photoPath, id);
    if (req.file && existing.photo_path !== player.photoPath) safeRemoveUpload(existing.photo_path);
    res.json({ message: 'Jogador atualizado com sucesso.', data: getPlayerStats(id) });
  } catch (error) { if (req.file) safeRemoveUpload(`/uploads/${req.file.filename}`); next(error); }
});

app.patch('/api/players/:id/archive', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!player) throw httpError(404, 'Jogador não encontrado.');
    const active = player.is_active ? 0 : 1;
    db.prepare('UPDATE players SET is_active = ? WHERE id = ?').run(active, id);
    res.json({ message: active ? 'Jogador reativado.' : 'Jogador arquivado. O histórico foi preservado.', is_active: active });
  } catch (error) { next(error); }
});

app.delete('/api/players/:id', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!player) throw httpError(404, 'Jogador não encontrado.');
    const appearances = db.prepare('SELECT COUNT(*) AS count FROM match_players WHERE player_id = ?').get(id).count;
    if (appearances > 0) {
      db.prepare('UPDATE players SET is_active = 0 WHERE id = ?').run(id);
      return res.json({ message: 'Este jogador tem partidas no histórico, então foi arquivado para preservar as estatísticas.' , archived: true });
    }
    db.prepare('DELETE FROM players WHERE id = ?').run(id);
    safeRemoveUpload(player.photo_path);
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
      const player = db.prepare('SELECT id, is_active FROM players WHERE id = ?').get(playerId);
      if (!player || !player.is_active) throw httpError(400, 'Um dos jogadores selecionados não está disponível. Atualize a lista de jogadores.');
    }
    if (opponentType === 'classmates' && (!participants.some(p => p.team_side === 'A') || !participants.some(p => p.team_side === 'B'))) {
      throw httpError(400, 'Cada time precisa ter pelo menos um jogador.');
    }
    const createMatch = db.transaction(() => {
      const result = db.prepare('INSERT INTO matches (played_on, opponent_type) VALUES (?, ?)').run(playedOn, opponentType);
      const matchId = Number(result.lastInsertRowid);
      const addPlayer = db.prepare('INSERT INTO match_players (match_id, player_id, team_side) VALUES (?, ?, ?)');
      for (const p of participants) addPlayer.run(matchId, Number(p.player_id), p.team_side);
      return matchId;
    });
    const id = createMatch();
    res.status(201).json({ message: 'Partida criada. Agora você pode registrar os gols.', data: getMatchDetail(id) });
  } catch (error) { next(error); }
});
app.delete('/api/matches/:id', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const result = db.prepare('DELETE FROM matches WHERE id = ?').run(id);
    if (!result.changes) throw httpError(404, 'Partida não encontrada.');
    res.json({ message: 'Partida e seus gols foram removidos.' });
  } catch (error) { next(error); }
});

app.post('/api/matches/:id/goals', (req, res, next) => {
  try {
    const matchId = validId(req.params.id);
    const match = db.prepare('SELECT id, opponent_type FROM matches WHERE id = ?').get(matchId);
    if (!match) throw httpError(404, 'Partida não encontrada.');
    if (!Array.isArray(req.body.entries)) throw httpError(400, 'Informe a quantidade de gols dos jogadores.');

    const opponentGoals = Number(req.body.opponent_goals ?? 0);
    if (!Number.isInteger(opponentGoals) || opponentGoals < 0 || opponentGoals > 300) throw httpError(400, 'A quantidade de gols do adversário deve estar entre 0 e 300.');
    if (match.opponent_type !== 'second_year' && opponentGoals > 0) throw httpError(400, 'O campo de gols totais do 2º Ano só pode ser usado em confrontos contra essa turma.');

    const participants = db.prepare('SELECT player_id, team_side FROM match_players WHERE match_id = ?').all(matchId);
    const participantById = new Map(participants.map(participant => [participant.player_id, participant]));
    const seen = new Set();
    const entries = [];
    let totalNewGoals = opponentGoals;
    for (const entry of req.body.entries) {
      const playerId = Number(entry.player_id);
      if (!Number.isInteger(playerId) || !participantById.has(playerId)) throw httpError(400, 'Todos os jogadores precisam pertencer a esta partida.');
      if (seen.has(playerId)) throw httpError(400, 'Um jogador aparece mais de uma vez no formulário.');
      seen.add(playerId);
      const normalGoals = Number(entry.goals ?? 0);
      const ownGoals = Number(entry.own_goals ?? 0);
      for (const count of [normalGoals, ownGoals]) {
        if (!Number.isInteger(count) || count < 0 || count > 99) throw httpError(400, 'A quantidade de gols deve estar entre 0 e 99 por jogador.');
      }
      totalNewGoals += normalGoals + ownGoals;
      entries.push({ playerId, normalGoals, ownGoals, teamSide: participantById.get(playerId).team_side });
    }
    if (totalNewGoals < 1) throw httpError(400, 'Informe pelo menos um gol para registrar.');
    if (totalNewGoals > 300) throw httpError(400, 'Registre no máximo 300 gols de uma só vez.');

    const saveGoals = db.transaction(() => {
      const addGoal = db.prepare('INSERT INTO goals (match_id, team_side, player_id, goal_type) VALUES (?, ?, ?, ?)');
      for (const entry of entries) {
        for (let i = 0; i < entry.normalGoals; i++) addGoal.run(matchId, entry.teamSide, entry.playerId, 'normal');
        const opposingSide = entry.teamSide === 'A' ? 'B' : 'A';
        for (let i = 0; i < entry.ownGoals; i++) addGoal.run(matchId, opposingSide, entry.playerId, 'own_goal');
      }
      // Contra o 2º Ano, só guardamos o total de gols do adversário, sem artilheiros externos.
      for (let i = 0; i < opponentGoals; i++) addGoal.run(matchId, 'B', null, 'normal');
    });
    saveGoals();
    res.status(201).json({ message: `${totalNewGoals} ${totalNewGoals === 1 ? 'gol registrado' : 'gols registrados'} com sucesso.`, data: getMatchDetail(matchId) });
  } catch (error) { next(error); }
});
app.delete('/api/matches/:matchId/goals/:goalId', (req, res, next) => {
  try {
    const matchId = validId(req.params.matchId);
    const goalId = validId(req.params.goalId);
    const result = db.prepare('DELETE FROM goals WHERE id = ? AND match_id = ?').run(goalId, matchId);
    if (!result.changes) throw httpError(404, 'Gol não encontrado nesta partida.');
    res.json({ message: 'Gol removido.', data: getMatchDetail(matchId) });
  } catch (error) { next(error); }
});

app.get('/api/stats', (req, res, next) => {
  try {
    const scope = normalizeScope(req.query.scope);
    const players = getPlayerList(true, scope).filter(p => p.matches_played > 0 || p.goals > 0).sort((a, b) => b.goals - a.goals || b.wins - a.wins || a.name.localeCompare(b.name));
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
  console.log(`Banco de dados: ${path.join(__dirname, 'data', 'futsenai.sqlite')}\n`);
});
