const state = {
  view: 'dashboard',
  dashboard: null,
  players: [],
  matches: [],
  stats: null,
  selectedMatch: null,
  playerSearch: '',
  playerStatus: 'active',
  matchSearch: '',
  statsScope: 'internal',
  statsSort: 'goals',
  statsSortDirection: 'desc',
  readOnly: false,
  staticData: null
};

const pageContent = document.getElementById('pageContent');
const modalRoot = document.getElementById('modalRoot');
const toastStack = document.getElementById('toastStack');
const readOnlyNotice = document.getElementById('readOnlyNotice');
const viewNames = { dashboard: 'Visão geral', players: 'Jogadores', matches: 'Partidas', stats: 'Estatísticas', matchDetail: 'Detalhes da partida' };
const readOnlyActions = new Set(['new-player', 'edit-player', 'archive-player', 'reactivate-player', 'new-goal', 'delete-match', 'delete-goal', 'delete-assist']);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}
function avatar(person, extraClass = '') {
  const classes = `player-avatar ${extraClass}`.trim();
  const photoPath = person?.photo_path && state.readOnly
    ? new URL(person.photo_path.replace(/^\/+/, ''), document.baseURI).href
    : person?.photo_path;
  const image = photoPath ? `<img src="${esc(photoPath)}" alt="Foto de ${esc(person.name)}" loading="lazy">` : esc(initials(person?.nickname || person?.name));
  return `<div class="${classes}">${image}</div>`;
}
function shortDate(dateValue, withYear = false) {
  if (!dateValue) return 'Data não informada';
  const parts = String(dateValue).slice(0, 10).split('-');
  if (parts.length !== 3) return esc(dateValue);
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(date).replace('.', '');
}
function fullDate(dateValue) {
  if (!dateValue) return 'Data não informada';
  const parts = String(dateValue).slice(0, 10).split('-');
  if (parts.length !== 3) return esc(dateValue);
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}
function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function safeText(value, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : esc(value); }
function goalTypeLabel(type) {
  return type === 'own_goal' ? 'Gol contra' : 'Gol';
}
function outcomeLabel(match) {
  if (match.outcome === 'draw') return 'Empate';
  return match.outcome === 'A' ? `${match.team_a_name} venceu` : `${match.team_b_name} venceu`;
}
async function api(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (state.readOnly) return staticApi(url, method);
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (method !== 'GET') {
      try {
        await enableReadOnlyMode();
      } catch (snapshotError) {
        throw new Error(`A API está indisponível e não foi possível carregar o JSON publicado: ${snapshotError.message}`, { cause: error });
      }
      closeModal();
      await renderCurrent();
      throw new Error('O servidor ficou indisponível. A interface foi alternada para somente leitura; a alteração não foi salva.');
    }
    try {
      await enableReadOnlyMode();
      return staticApi(url, method);
    } catch (snapshotError) {
      throw new Error(`A API está indisponível e não foi possível carregar o JSON publicado: ${snapshotError.message}`, { cause: error });
    }
  }
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    if (response.status === 404 && method === 'GET' && new URL(url, document.baseURI).pathname.endsWith('/api/health')) {
      await enableReadOnlyMode();
      return staticApi(url, method);
    }
    const error = new Error(data.error || data.message || `Erro na solicitação (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}
function staticMatchSummary(match, data) {
  const goals = data.goals.filter(goal => goal.match_id === match.id);
  const participants = data.match_players.filter(participant => participant.match_id === match.id);
  const scoreA = goals.filter(goal => goal.team_side === 'A').length;
  const scoreB = goals.filter(goal => goal.team_side === 'B').length;
  const interclass = match.opponent_type === 'second_year';
  return {
    ...match,
    location: 'Quadra',
    team_a_name: interclass ? '3º A' : 'Time Vermelho',
    team_b_name: interclass ? '2º Ano' : 'Time Branco',
    score_a: scoreA,
    score_b: scoreB,
    players_a: participants.filter(player => player.team_side === 'A').length,
    players_b: interclass ? 0 : participants.filter(player => player.team_side === 'B').length,
    total_players: participants.filter(player => !interclass || player.team_side === 'A').length,
    total_goals: goals.length,
    outcome: scoreA === scoreB ? 'draw' : scoreA > scoreB ? 'A' : 'B'
  };
}
function staticMatchList(scope, data) {
  return data.matches
    .filter(match => match.opponent_type === (scope === 'interclass' ? 'second_year' : 'classmates'))
    .sort((left, right) => right.played_on.localeCompare(left.played_on) || right.id - left.id)
    .map(match => staticMatchSummary(match, data));
}
function staticPlayerStats(player, scope, data) {
  const matchById = new Map(data.matches.map(match => [match.id, match]));
  const played = data.match_players
    .filter(participant => participant.player_id === player.id)
    .filter(participant => matchById.get(participant.match_id)?.opponent_type === (scope === 'interclass' ? 'second_year' : 'classmates'));
  const wins = played.filter(participant => {
    const score = staticMatchSummary(matchById.get(participant.match_id), data);
    return participant.team_side === 'A' ? score.score_a > score.score_b : score.score_b > score.score_a;
  }).length;
  const draws = played.filter(participant => {
    const score = staticMatchSummary(matchById.get(participant.match_id), data);
    return score.score_a === score.score_b;
  }).length;
  const goals = data.goals.filter(goal => goal.player_id === player.id && goal.goal_type === 'normal'
    && matchById.get(goal.match_id)?.opponent_type === (scope === 'interclass' ? 'second_year' : 'classmates')).length;
  const assists = played.reduce((sum, participant) => sum + (Number(participant.assists) || 0), 0);
  const losses = played.length - wins - draws;
  return {
    ...player,
    matches_played: played.length,
    goals,
    assists,
    wins,
    draws,
    losses,
    win_rate: played.length ? Math.round((wins / played.length) * 100) : 0,
    goals_per_match: played.length ? Number((goals / played.length).toFixed(2)) : 0
  };
}
function staticRivalry(data) {
  const matches = staticMatchList('interclass', data);
  return {
    matches: matches.length,
    wins: matches.filter(match => match.score_a > match.score_b).length,
    draws: matches.filter(match => match.score_a === match.score_b).length,
    losses: matches.filter(match => match.score_a < match.score_b).length,
    goalsFor: matches.reduce((sum, match) => sum + match.score_a, 0),
    goalsAgainst: matches.reduce((sum, match) => sum + match.score_b, 0)
  };
}
function staticMatchDetail(matchId, data) {
  const match = data.matches.find(item => item.id === matchId);
  if (!match) return null;
  const playersById = new Map(data.players.map(player => [player.id, player]));
  return {
    ...staticMatchSummary(match, data),
    players: data.match_players.filter(participant => participant.match_id === matchId)
      .map(participant => {
        const player = playersById.get(participant.player_id);
        return { id: player.id, name: player.name, photo_path: player.photo_path, is_active: player.is_active, team_side: participant.team_side, assists: Number(participant.assists) || 0 };
      })
      .sort((left, right) => left.team_side.localeCompare(right.team_side) || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' })),
    goals: data.goals.filter(goal => goal.match_id === matchId).sort((left, right) => left.id - right.id)
      .map(goal => {
        const player = playersById.get(goal.player_id);
        return { ...goal, player_name: player?.name ?? null, player_photo: player?.photo_path ?? null };
      })
  };
}
function staticApi(url, method) {
  if (method !== 'GET') throw new Error('Esta cópia está em modo somente leitura. Inicie o servidor para alterar os dados.');
  const endpoint = new URL(url, document.baseURI);
  const data = state.staticData;
  const scope = endpoint.searchParams.get('scope') === 'interclass' ? 'interclass' : 'internal';
  if (endpoint.pathname.endsWith('/api/health')) return { ok: true, app: 'FutSENAI', database: 'JSON' };
  if (endpoint.pathname.endsWith('/api/dashboard')) {
    const matches = staticMatchList(scope, data);
    const players = data.players.filter(player => player.is_active).map(player => staticPlayerStats(player, scope, data));
    const totalGoals = matches.reduce((sum, match) => sum + match.total_goals, 0);
    const topScorers = [...players].filter(player => player.goals > 0 || player.assists > 0 || player.matches_played > 0)
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists || right.wins - left.wins || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' })).slice(0, 5);
    return {
      scope,
      summary: { activePlayers: data.players.filter(player => player.is_active).length, totalMatches: matches.length, totalGoals, averageGoals: matches.length ? Number((totalGoals / matches.length).toFixed(1)) : 0 },
      recentMatches: matches.slice(0, 5),
      topScorers,
      players,
      secondYearRivalry: staticRivalry(data)
    };
  }
  if (endpoint.pathname.endsWith('/api/players')) {
    const includeInactive = endpoint.searchParams.get('includeInactive') === 'true';
    const players = data.players.filter(player => includeInactive || player.is_active)
      .sort((left, right) => right.is_active - left.is_active || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }))
      .map(player => staticPlayerStats(player, scope, data));
    return { data: players, scope };
  }
  if (endpoint.pathname.endsWith('/api/matches')) return { data: staticMatchList(scope, data), scope };
  if (endpoint.pathname.endsWith('/api/stats')) {
    const matches = staticMatchList(scope, data);
    const players = data.players.map(player => staticPlayerStats(player, scope, data))
      .filter(player => player.matches_played > 0 || player.goals > 0 || player.assists > 0)
      .sort((left, right) => right.goals - left.goals || right.assists - left.assists || right.wins - left.wins || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
    const totalGoals = matches.reduce((sum, match) => sum + match.total_goals, 0);
    return {
      scope,
      aggregate: {
        matches: matches.length,
        goals: totalGoals,
        averageGoals: matches.length ? Number((totalGoals / matches.length).toFixed(1)) : 0,
        draws: matches.filter(match => match.outcome === 'draw').length,
        wins: matches.filter(match => match.outcome === 'A').length,
        losses: matches.filter(match => match.outcome === 'B').length,
        mostRecent: matches[0] || null,
        secondYearRivalry: staticRivalry(data)
      },
      players
    };
  }
  const matchDetail = endpoint.pathname.match(/\/api\/matches\/(\d+)$/);
  if (matchDetail) {
    const result = staticMatchDetail(Number(matchDetail[1]), data);
    if (!result) throw new Error('Partida não encontrada no JSON publicado.');
    return { data: result };
  }
  throw new Error('Esta operação não está disponível na cópia somente leitura.');
}
async function enableReadOnlyMode() {
  if (state.staticData) return;
  const snapshotUrl = new URL('data/futsenai.json', document.baseURI);
  const response = await fetch(snapshotUrl);
  if (!response.ok) throw new Error(`O arquivo de dados respondeu com status ${response.status}.`);
  const data = await response.json();
  if (data.schemaVersion !== 1 || !Array.isArray(data.players) || !Array.isArray(data.matches)
    || !Array.isArray(data.match_players) || !Array.isArray(data.goals)) {
    throw new Error('O arquivo de dados publicado não tem um formato válido.');
  }
  state.staticData = data;
  state.readOnly = true;
  document.body.classList.add('read-only-mode');
  readOnlyNotice.hidden = false;
  document.getElementById('storageStatus').textContent = 'Visualizando a cópia publicada dos dados.';
}
function jsonOptions(method, payload) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}
function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  toastStack.appendChild(item);
  window.setTimeout(() => { item.style.opacity = '0'; item.style.transform = 'translateY(5px)'; window.setTimeout(() => item.remove(), 220); }, 3700);
}
function setLoading(message = 'Carregando...') {
  pageContent.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${esc(message)}</p></div>`;
}
function updateChrome() {
  document.getElementById('pageCrumb').textContent = viewNames[state.view] || 'FutSENAI';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === (state.view === 'matchDetail' ? 'matches' : state.view)));
  const date = new Date();
  document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
  if (state.dashboard) document.getElementById('navPlayerCount').textContent = state.dashboard.summary.activePlayers;
}
function setSidebarOpen(isOpen) {
  document.getElementById('sidebar').classList.toggle('open', isOpen);
  document.body.classList.toggle('sidebar-open', isOpen);
  document.getElementById('mobileMenu').setAttribute('aria-expanded', String(isOpen));
}
async function navigate(view) {
  state.view = view;
  state.selectedMatch = null;
  setSidebarOpen(false);
  updateChrome();
  await renderCurrent();
}
async function renderCurrent() {
  updateChrome();
  try {
    if (state.view === 'dashboard') return await renderDashboard();
    if (state.view === 'players') return await renderPlayers();
    if (state.view === 'matches') return await renderMatches();
    if (state.view === 'stats') return await renderStats();
    if (state.view === 'matchDetail') return await renderMatchDetail();
  } catch (error) {
    pageContent.innerHTML = `<div class="empty-state"><div class="empty-symbol">!</div><h3>Não foi possível carregar esta página</h3><p>${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Tentar novamente</button></div>`;
  }
}

function statCard(label, value, icon, foot) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
}
function scopeFilterHtml() {
  return `<label class="scope-filter"><span>Partidas consideradas</span><select id="statsScope"><option value="internal" ${state.statsScope === 'internal' ? 'selected' : ''}>Somente entre nós · 3º A</option><option value="interclass" ${state.statsScope === 'interclass' ? 'selected' : ''}>Somente contra o 2º Ano</option></select></label>`;
}
function rivalryPanel(rivalry) {
  const r = rivalry || { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
  return `<section class="rivalry-panel"><div class="rivalry-title"><div><div class="eyebrow">CONFRONTO INTERCLASSE</div><h2>3º A <span>×</span> 2º Ano</h2><p>Placar histórico entre as turmas, independente do filtro das estatísticas gerais.</p></div><div class="rivalry-blue-mark">2º</div></div><div class="rivalry-metrics"><div class="rivalry-metric red-metric"><span>Vitórias do 3º A</span><strong>${r.wins}</strong></div><div class="rivalry-metric"><span>Empates</span><strong>${r.draws}</strong></div><div class="rivalry-metric blue-metric"><span>Vitórias do 2º Ano</span><strong>${r.losses}</strong></div><div class="rivalry-metric"><span>Gols · 3º A : 2º Ano</span><strong>${r.goalsFor} : ${r.goalsAgainst}</strong></div></div><div class="rivalry-foot">${r.matches} ${r.matches === 1 ? 'partida interclasse registrada' : 'partidas interclasse registradas'}</div></section>`;
}
function teamIconClass(match, side) {
  if (match.opponent_type === 'second_year') return side === 'A' ? 'red' : 'blue';
  return side === 'A' ? 'red' : 'dark';
}
function renderMatchRow(match) {
  const opponent = match.opponent_type === 'second_year';
  const playersText = opponent ? `${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'} do 3º A` : `${match.total_players} ${match.total_players === 1 ? 'jogador' : 'jogadores'}`;
  return `<div class="match-row"><div><div class="match-meta"><span class="match-date">${shortDate(match.played_on, true)}</span><span>•</span><span>${playersText}</span><span>•</span><span>Quadra</span><span class="match-kind ${opponent ? 'interclass' : ''}">${opponent ? 'INTERCLASSE' : 'ENTRE NÓS'}</span></div><div class="match-teams"><div class="team-mini"><span class="team-badge ${teamIconClass(match, 'A')}">●</span><span>${esc(match.team_a_name)}</span></div><span class="versus">×</span><div class="team-mini"><span class="team-badge ${teamIconClass(match, 'B')}">●</span><span>${esc(match.team_b_name)}</span></div></div></div><div class="match-score">${match.score_a}<span class="dash">:</span>${match.score_b}</div></div>`;
}
function scorerRow(player, index) {
  const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
  return `<div class="scorer-row ${rankClass ? `rank-${rankClass}` : ''}"><div class="rank-number ${rankClass}">${String(index + 1).padStart(2, '0')}</div>${avatar(player, 'small')}<div class="scorer-info"><strong>${esc(player.nickname || player.name)}</strong><span>${player.matches_played} partidas · ${player.wins} vitórias</span></div><div class="goal-count">${player.goals} gols</div></div>`;
}
async function renderDashboard() {
  setLoading('Atualizando o placar da turma...');
  const result = await api(`/api/dashboard?scope=${state.statsScope}`);
  state.dashboard = result;
  state.players = result.players;
  updateChrome();
  const s = result.summary;
  const matchActionLabel = state.readOnly ? 'Testar sorteio' : 'Registrar partida';
  const scorerHtml = result.topScorers.length ? result.topScorers.map(scorerRow).join('') : `<div class="empty-inline"><strong>Nenhuma estatística neste filtro</strong>Registre gols ou selecione outro tipo de partida.</div>`;
  const recentHtml = result.recentMatches.length ? result.recentMatches.map(renderMatchRow).join('') : `<div class="empty-inline"><strong>Nenhuma partida neste filtro</strong>Registre um jogo para ver o placar por aqui.</div>`;
  pageContent.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow">BEM-VINDO À QUADRA</div><h1>O jogo começa aqui<span style="color:var(--red)">.</span></h1><p>Organize a resenha, guarde os resultados e descubra quem está brilhando na quadra.</p></div><div class="heading-actions">${state.readOnly ? '' : '<button class="btn btn-secondary" data-action="new-player">＋ Novo jogador</button>'}<button class="btn btn-primary" data-action="new-match">＋ ${matchActionLabel}</button></div></section>
    <div class="scope-filter-row">${scopeFilterHtml()}</div>
    <section class="stats-grid">
      ${statCard('Jogadores ativos', s.activePlayers, '♟', 'Elenco disponível do 3º A')}
      ${statCard('Partidas consideradas', s.totalMatches, '⚑', 'De acordo com o filtro acima')}
      ${statCard('Gols marcados', s.totalGoals, '⚽︎', 'Placar dos jogos selecionados')}
      ${statCard('Média de gols / jogo', s.averageGoals, '↗', 'Gols divididos pelas partidas filtradas')}
    </section>
    ${rivalryPanel(result.secondYearRivalry)}
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Últimas partidas</h2><div class="panel-subtitle">${state.statsScope === 'interclass' ? 'Somente jogos contra o 2º Ano' : 'Somente jogos entre jogadores do 3º A'}</div></div><button class="text-action" data-action="go-matches">Ver todas →</button></div><div class="match-list">${recentHtml}</div></article>
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Artilharia da turma</h2><div class="panel-subtitle">Gols no recorte selecionado</div></div><button class="text-action" data-action="go-stats">Ranking →</button></div><div class="scorer-list">${scorerHtml}</div></article>
    </section>
    <section class="dashboard-bottom">
      <article class="panel how-it-works-panel"><div class="panel-head"><div><h2 class="panel-title">O foco é a resenha</h2><div class="panel-subtitle">As equipes mudam. As estatísticas dos jogadores ficam.</div></div></div><div class="how-it-works-list">
        <div class="how-it-works-item"><span class="quick-action-icon">⚽︎</span><div><strong>Artilharia individual</strong><p>Conte os gols de cada pessoa de uma vez, sem registrar lance por lance.</p></div></div>
        <div class="how-it-works-item"><span class="quick-action-icon">♟</span><div><strong>Escalação personalizada</strong><p>Monte novas equipes a cada partida, inclusive com quantidades diferentes de jogadores.</p></div></div>
        <div class="how-it-works-item"><span class="quick-action-icon">▦</span><div><strong>Histórico da turma</strong><p>Consulte os placares e as estatísticas individuais de todos os jogos registrados.</p></div></div>
      </div></article>
      <article class="panel quick-panel"><div class="panel-head"><div><h2 class="panel-title">Atalhos rápidos</h2><div class="panel-subtitle">Mais praticidade para organizar o jogo</div></div></div><div class="quick-actions">
        <button class="quick-action" data-action="new-match"><span class="quick-action-icon">⚑︎</span><span><strong>${state.readOnly ? 'Testar sorteio' : 'Nova partida'}</strong><span>${state.readOnly ? 'Prévia sem criar partida' : 'Monte os times e registre'}</span></span></button>
        <button class="quick-action" data-action="new-player"><span class="quick-action-icon">♟︎</span><span><strong>Novo jogador</strong><span>Adicione um amigo</span></span></button>
        <button class="quick-action" data-action="go-players"><span class="quick-action-icon">☷︎</span><span><strong>Elenco completo</strong><span>Fotos e dados da turma</span></span></button>
        <button class="quick-action" data-action="go-stats"><span class="quick-action-icon">↗︎</span><span><strong>Ver estatísticas</strong><span>Compare os números</span></span></button>
      </div></article>
    </section>`;
}
function playerCard(player) {
  const archived = !player.is_active;
  return `<article class="player-card"><div class="player-card-head">${avatar(player)}<div class="player-card-name"><h3>${esc(player.name)}${archived ? '<span class="archived-label">ARQUIVADO</span>' : ''}</h3><p>${player.matches_played} ${player.matches_played === 1 ? 'partida disputada' : 'partidas disputadas'}</p><span class="player-quality">Qualidade <strong>${player.quality || 3}/5</strong></span></div></div><div class="player-mini-stats"><div><strong>${player.matches_played}</strong><span>PARTIDAS</span></div><div><strong>${player.goals}</strong><span>GOLS</span></div><div><strong>${player.wins}</strong><span>VITÓRIAS</span></div></div><div class="player-card-actions"><button class="btn btn-secondary btn-small" data-action="edit-player" data-id="${player.id}">✎ Editar</button>${archived ? `<button class="btn btn-secondary btn-small" data-action="reactivate-player" data-id="${player.id}">Reativar</button>` : `<button class="btn btn-danger btn-small" data-action="archive-player" data-id="${player.id}">Arquivar</button>`}</div></article>`;
}
async function renderPlayers() {
  setLoading('Carregando elenco...');
  const result = await api(`/api/players?includeInactive=${state.playerStatus === 'all'}&scope=${state.statsScope}`);
  state.players = result.data;
  if (state.dashboard) state.dashboard.summary.activePlayers = state.players.filter(p => p.is_active).length;
  updateChrome();
  const active = state.players.filter(p => p.is_active).length;
  const filtered = state.players.filter(p => `${p.name}`.toLowerCase().includes(state.playerSearch.toLowerCase()));
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">ELENCO</div><h1>Jogadores<span style="color:var(--red)">.</span></h1><p>Qualidade, foto e estatísticas de cada jogador — tudo em um só lugar.</p></div><div class="heading-actions"><button class="btn btn-primary" data-action="new-player">＋ Cadastrar jogador</button></div></section>
    <div class="toolbar"><label class="searchbox"><span>⌕</span><input id="playerSearch" type="search" placeholder="Buscar jogador pelo nome..." value="${esc(state.playerSearch)}" autocomplete="off"></label>${scopeFilterHtml()}<select class="filter-select" id="playerStatus"><option value="active" ${state.playerStatus === 'active' ? 'selected' : ''}>Jogadores ativos</option><option value="all" ${state.playerStatus === 'all' ? 'selected' : ''}>Incluir arquivados</option></select><span class="results-label" id="playerResultsLabel">${filtered.length} encontrados · ${active} ativos</span></div>
    <div class="player-grid" id="playerGrid">${filtered.length ? filtered.map(playerCard).join('') : `<div class="empty-state"><div class="empty-symbol">♟</div><h3>${state.playerSearch ? 'Nenhum jogador encontrado' : 'Seu elenco começa com um nome'}</h3><p>${state.playerSearch ? 'Tente buscar por outro nome.' : 'Cadastre seus amigos, coloque uma foto e comece a montar os times.'}</p>${state.playerSearch ? '' : '<button class="btn btn-primary" data-action="new-player">＋ Cadastrar primeiro jogador</button>'}</div>`}</div>`;
}
function renderPlayerGridOnly() {
  const grid = document.getElementById('playerGrid');
  if (!grid) return;
  const filtered = state.players.filter(p => `${p.name}`.toLowerCase().includes(state.playerSearch.toLowerCase()));
  grid.innerHTML = filtered.length ? filtered.map(playerCard).join('') : `<div class="empty-state"><div class="empty-symbol">⌕</div><h3>Nenhum jogador encontrado</h3><p>Tente buscar por outro nome.</p></div>`;
  const active = state.players.filter(p => p.is_active).length;
  const label = document.getElementById('playerResultsLabel');
  if (label) label.textContent = `${filtered.length} encontrados · ${active} ativos`;
}
function matchCard(match) {
  const interclass = match.opponent_type === 'second_year';
  const players = interclass ? `${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'} do 3º A` : `${match.total_players} ${match.total_players === 1 ? 'jogador' : 'jogadores'}`;
  const teamA = interclass ? '3º A' : 'Time Vermelho';
  const teamB = interclass ? '2º Ano' : 'Time Branco';
  return `<article class="match-card ${interclass ? 'match-card-interclass' : ''}"><div class="match-card-top"><span><strong>${shortDate(match.played_on, true)}</strong> · Quadra <em class="match-kind ${interclass ? 'interclass' : ''}">${interclass ? 'INTERCLASSE' : 'ENTRE NÓS'}</em></span><span>${players}</span></div><div class="match-card-scoreboard"><div class="match-team-box"><div class="team-large-icon ${teamIconClass(match, 'A')}">●</div><strong title="${esc(teamA)}">${esc(teamA)}</strong><small>${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'}</small></div><div class="scoreboard-score">${match.score_a}<span>:</span>${match.score_b}</div><div class="match-team-box"><div class="team-large-icon ${teamIconClass(match, 'B')}">●</div><strong title="${esc(teamB)}">${esc(teamB)}</strong><small>${interclass ? 'Placar total do adversário' : `${match.players_b} ${match.players_b === 1 ? 'jogador' : 'jogadores'}`}</small></div></div><div class="match-card-bottom"><span class="participants-label"><b>${match.total_goals}</b> gols · ${players}</span><div class="match-card-actions"><button data-action="open-match" data-id="${match.id}">Detalhes ↗</button><button data-action="delete-match" data-id="${match.id}">Excluir</button></div></div></article>`;
}
async function renderMatches() {
  setLoading('Buscando o histórico das partidas...');
  const result = await api(`/api/matches?scope=${state.statsScope}`);
  state.matches = result.data;
  const filtered = state.matches.filter(m => `${m.played_on}`.toLowerCase().includes(state.matchSearch.toLowerCase()));
  const matchActionLabel = state.readOnly ? 'Testar sorteio' : 'Registrar partida';
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">HISTÓRICO</div><h1>Partidas<span style="color:var(--red)">.</span></h1><p>Cada jogo tem sua escalação, seu placar e sua própria história.</p></div><div class="heading-actions"><button class="btn btn-primary" data-action="new-match">＋ ${matchActionLabel}</button></div></section><div class="toolbar"><label class="searchbox"><span>⌕</span><input id="matchSearch" type="search" placeholder="Buscar por data (AAAA-MM-DD)..." value="${esc(state.matchSearch)}" autocomplete="off"></label>${scopeFilterHtml()}<span class="results-label" id="matchResultsLabel">${filtered.length} partidas encontradas</span></div><div class="match-cards" id="matchCards">${filtered.length ? filtered.map(matchCard).join('') : `<div class="empty-state"><div class="empty-symbol">⚑</div><h3>${state.matchSearch ? 'Nenhuma partida encontrada' : 'O apito inicial está esperando'}</h3><p>${state.matchSearch ? 'Tente outra data ou limpe a busca.' : state.readOnly ? 'Teste o sorteio de times com os jogadores ativos sem criar uma partida.' : 'Registre uma partida, distribua os jogadores entre os times e anote cada gol.'}</p>${state.matchSearch ? '' : `<button class="btn btn-primary" data-action="new-match">＋ ${state.readOnly ? 'Testar sorteio' : 'Registrar primeira partida'}</button>`}</div>`}</div>`;
}
function renderMatchCardsOnly() {
  const container = document.getElementById('matchCards');
  if (!container) return;
  const filtered = state.matches.filter(m => `${m.played_on}`.toLowerCase().includes(state.matchSearch.toLowerCase()));
  container.innerHTML = filtered.length ? filtered.map(matchCard).join('') : `<div class="empty-state"><div class="empty-symbol">⌕</div><h3>Nenhuma partida encontrada</h3><p>Tente outra data ou limpe a busca.</p></div>`;
  const label = document.getElementById('matchResultsLabel');
  if (label) label.textContent = `${filtered.length} partidas encontradas`;
}
async function renderStats() {
  setLoading('Calculando as estatísticas da turma...');
  const result = await api(`/api/stats?scope=${state.statsScope}`);
  state.stats = result;
  renderStatsContent();
}
function statsSortHeader(label, key) {
  const sorted = state.statsSort === key;
  const direction = sorted ? state.statsSortDirection : 'desc';
  const indicator = sorted ? (direction === 'desc' ? ' ↓' : ' ↑') : '';
  return `<th aria-sort="${sorted ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}"><button class="stats-sort-button${sorted ? ' active' : ''}" data-stats-sort="${key}" aria-label="Ordenar por ${label.toLowerCase()}${sorted ? ` em ordem ${direction === 'desc' ? 'decrescente' : 'crescente'}` : ''}">${label}${indicator}</button></th>`;
}
function renderStatsContent() {
  const result = state.stats;
  if (!result) return;
  const a = result.aggregate;
  const ranking = [...result.players].sort((left, right) => {
    const value = player => state.statsSort === 'ga' ? player.goals + player.assists : Number(player[state.statsSort]) || 0;
    const difference = value(left) - value(right);
    if (difference) return difference * (state.statsSortDirection === 'desc' ? -1 : 1);
    if (state.statsSort === 'goals') {
      const assistDifference = right.assists - left.assists;
      if (assistDifference) return assistDifference;
      const winDifference = right.wins - left.wins;
      if (winDifference) return winDifference;
    } else if (state.statsSort === 'ga') {
      const goalDifference = right.goals - left.goals;
      if (goalDifference) return goalDifference;
      const assistDifference = right.assists - left.assists;
      if (assistDifference) return assistDifference;
      const winDifference = right.wins - left.wins;
      if (winDifference) return winDifference;
    }
    return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
  });
  const tableRows = ranking.length ? ranking.map((p, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    return `<tr class="${rankClass ? `rank-${rankClass}` : ''}"><td><div class="player-cell"><span class="rank-number ${rankClass}">${i + 1}</span>${avatar(p)}<span>${esc(p.name)}</span></div></td><td class="num">${p.matches_played}</td><td class="num">${p.goals}</td><td class="num">${p.assists}</td><td class="num">${p.wins}</td><td class="num">${p.losses}</td><td class="num">${p.goals + p.assists}</td></tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty-inline"><strong>Sem estatísticas neste filtro</strong>Registre partidas e gols, ou selecione outro tipo de partida.</div></td></tr>`;
  const top = [...result.players].filter(player => player.goals > 0)
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists || right.wins - left.wins || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }))[0];
  const topWaiter = [...result.players].filter(player => player.assists > 0)
    .sort((left, right) => right.assists - left.assists || right.goals - left.goals || right.wins - left.wins || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }))[0];
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">NÚMEROS DO JOGO</div><h1>Estatísticas<span style="color:var(--red)">.</span></h1><p>Veja a evolução da turma, quem decide e como cada jogador contribui.</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="go-matches">Ver partidas</button></div></section>
    <div class="scope-filter-row">${scopeFilterHtml()}</div>
    <section class="stats-grid">${statCard('Partidas no recorte', a.matches, '⚑', 'De acordo com o filtro')}${statCard('Gols no recorte', a.goals, '⚽︎', 'Todos os gols desses jogos')}${statCard('Média por partida', a.averageGoals, '↗', 'Gols por jogo considerado')}${statCard('Empates', a.draws, '＝', 'Jogos que terminaram iguais')}</section>
    ${rivalryPanel(a.secondYearRivalry)}
    <div class="stats-page-grid"><article class="panel"><div class="panel-head"><div><h2 class="panel-title">Ranking dos jogadores</h2><div class="panel-subtitle">Gols, assistências e desempenho, clique nas colunas para ordenar</div></div></div><div class="table-wrap"><table class="stats-table"><thead><tr><th>Jogador</th>${statsSortHeader('Jogos', 'matches_played')}${statsSortHeader('Gols', 'goals')}${statsSortHeader('Assistências', 'assists')}${statsSortHeader('Vitórias', 'wins')}${statsSortHeader('Derrotas', 'losses')}${statsSortHeader('G/A', 'ga')}</tr></thead><tbody>${tableRows}</tbody></table></div></article>
    <div><article class="stat-hero top-scorer-hero"><div class="stat-hero-copy"><div class="eyebrow">ARTILHEIRO</div><strong>${top ? `${esc(top.name)} - ${top.goals} ${top.goals === 1 ? 'gol' : 'gols'}` : '—'}</strong><p>${top ? `${esc(top.name)} lidera a artilharia.` : 'Quando houver gols nesse recorte, o destaque aparece aqui.'}</p></div>${top ? avatar(top, 'stat-hero-avatar') : ''}</article><article class="stat-hero top-waiter-hero"><div class="stat-hero-copy"><div class="eyebrow">GARÇOM</div><strong>${topWaiter ? `${esc(topWaiter.name)} - ${topWaiter.assists} ${topWaiter.assists === 1 ? 'assistência' : 'assistências'}` : '—'}</strong><p>${topWaiter ? `${esc(topWaiter.name)} lidera as assistências.` : 'Quando houver assistências nesse recorte, o destaque aparece aqui.'}</p></div>${topWaiter ? avatar(topWaiter, 'stat-hero-avatar') : ''}</article><article class="panel" style="margin-top:17px"><div class="panel-head"><div><h2 class="panel-title">Resumo do histórico</h2><div class="panel-subtitle">Números das partidas filtradas</div></div></div><div class="stats-metric-list"><div class="stats-metric"><span>Jogadores com estatísticas</span><strong>${ranking.length}</strong></div><div class="stats-metric"><span>Média de gols por partida</span><strong>${a.averageGoals}</strong></div><div class="stats-metric"><span>Partidas empatadas</span><strong>${a.draws}</strong></div><div class="stats-metric"><span>Total de partidas</span><strong>${a.matches}</strong></div></div></article></div></div>`;
}
async function renderMatchDetail() {
  if (!state.selectedMatch) return navigate('matches');
  setLoading('Abrindo a súmula da partida...');
  const result = await api(`/api/matches/${state.selectedMatch}`);
  const match = result.data;
  state.matchDetail = match;
  const interclass = match.opponent_type === 'second_year';

  const groupedGoals = new Map();
  for (const goal of match.goals) {
    const key = `${goal.goal_type}:${goal.player_id ?? 'unknown'}:${goal.team_side}`;
    if (!groupedGoals.has(key)) groupedGoals.set(key, { ...goal, count: 0 });
    const group = groupedGoals.get(key);
    group.count++;
  }
  const goals = groupedGoals.size ? [...groupedGoals.values()].map(goal => {
    const aggregateOpponentGoal = interclass && !goal.player_id && goal.team_side === 'B';
    const opponentOwnGoal = interclass && !goal.player_id && goal.team_side === 'A' && goal.goal_type === 'own_goal';
    const goalSideClass = goal.team_side === 'A' ? 'goal-side-red' : interclass ? 'goal-side-blue' : 'goal-side-gray';
    const author = aggregateOpponentGoal ? 'Gols totais do 2º Ano' : opponentOwnGoal ? 'Gol contra do 2º Ano' : goal.player_name ? esc(goal.player_name) : 'Autor não informado';
    const description = aggregateOpponentGoal || opponentOwnGoal ? 'Total agregado do adversário · sem identificação individual' : `${goalTypeLabel(goal.goal_type)} · ponto para ${goal.team_side === 'A' ? esc(match.team_a_name) : esc(match.team_b_name)}`;
    return `<div class="goal-event goal-event-counted ${goalSideClass} ${aggregateOpponentGoal ? 'aggregate-opponent-goal' : ''}">
      <div class="goal-total-badge">${goal.count > 1 ? `×${goal.count}` : '⚽︎'}</div>
      <div class="goal-event-main"><strong>${author}${goal.goal_type === 'own_goal' ? ' · Gol contra' : ''}</strong><span>${description}</span></div>
    </div>`;
  }).join('') : `<div class="empty-inline"><strong>Nenhum gol lançado</strong>Edite as estatísticas para informar os gols da partida.</div>`;

  const rosterFor = side => {
    const players = match.players.filter(player => player.team_side === side);
    return players.map(player => {
      const playerGoals = match.goals.filter(goal => goal.player_id === player.id && goal.goal_type === 'normal').length;
      const playerOwnGoals = match.goals.filter(goal => goal.player_id === player.id && goal.goal_type === 'own_goal').length;
      const assists = Number(player.assists) || 0;
      const statText = playerGoals || assists
        ? [
          playerGoals ? `<strong>${playerGoals} ${playerGoals === 1 ? 'gol' : 'gols'}</strong>` : '',
          assists ? `${assists} ${assists === 1 ? 'assistência' : 'assistências'}` : '',
          playerOwnGoals ? `${playerOwnGoals} contra` : ''
        ].filter(Boolean).join(' · ')
        : 'Sem participação em gols';
      return `<div class="roster-player">${avatar(player)}<div class="roster-player-info"><strong>${esc(player.name)}</strong><small class="roster-player-stats">${statText}</small></div></div>`;
    }).join('') || '<div class="empty-inline">Sem jogadores nesta equipe</div>';
  };

  const rosterMarkup = interclass
    ? `<section class="roster-team-column red-team roster-3a-only"><div class="roster-team-heading"><span class="team-color-dot"></span><strong>Jogadores do 3º A</strong><span class="results-label">${match.players_a}</span></div><div class="roster-team-list">${rosterFor('A')}</div><div class="opponent-roster-note"><span class="opponent-blue-dot"></span>O 2º Ano é registrado somente pelo placar total.</div></section>`
    : `<section class="roster-team-column red-team"><div class="roster-team-heading"><span class="team-color-dot"></span><strong>${esc(match.team_a_name)}</strong><span class="results-label">${match.players_a}</span></div><div class="roster-team-list">${rosterFor('A')}</div></section><section class="roster-team-column white-team"><div class="roster-team-heading"><span class="team-color-dot dark"></span><strong>${esc(match.team_b_name)}</strong><span class="results-label">${match.players_b}</span></div><div class="roster-team-list">${rosterFor('B')}</div></section>`;

  pageContent.innerHTML = `<div class="detail-header"><button class="back-button" data-action="back-matches" aria-label="Voltar">←</button><div><div class="eyebrow">${interclass ? 'SÚMULA INTERCLASSE' : 'SÚMULA DA PARTIDA'}</div><h1 style="font:800 25px var(--display);margin:0">${interclass ? '3º A × 2º Ano' : 'Partida'} · ${shortDate(match.played_on, true)}<span style="color:var(--red)">.</span></h1></div></div>
    <section class="detail-match-hero ${interclass ? 'detail-interclass' : ''}"><div class="match-card-top"><span><strong>${fullDate(match.played_on)}</strong> · Quadra</span><span class="match-kind ${interclass ? 'interclass' : ''}">${interclass ? `INTERCLASSE · ${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'} do 3º A` : `ENTRE NÓS · ${match.total_players} ${match.total_players === 1 ? 'jogador' : 'jogadores'}`}</span></div><div class="detail-scoreboard"><div class="detail-team"><div class="team-large-icon ${teamIconClass(match, 'A')}">●</div><strong>${esc(match.team_a_name)}</strong><small>${interclass ? `${match.players_a} jogadores escalados` : `${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'}`}</small></div><div><div class="detail-score">${match.score_a}<span>:</span>${match.score_b}</div><div class="detail-result-note">${esc(outcomeLabel(match))}</div></div><div class="detail-team"><div class="team-large-icon ${teamIconClass(match, 'B')}">●</div><strong>${esc(match.team_b_name)}</strong><small>${interclass ? 'Placar total do adversário' : `${match.players_b} ${match.players_b === 1 ? 'jogador' : 'jogadores'}`}</small></div></div></section>
    <div class="detail-columns"><article class="roster-panel"><div class="panel-head"><div><h2 class="panel-title">${interclass ? 'Escalação do 3º A' : 'Jogadores de cada time'}</h2><div class="panel-subtitle">${interclass ? 'Somente os jogadores da nossa turma têm estatísticas individuais' : 'As equipes são montadas novamente em cada partida'}</div></div><span class="goal-count">${match.total_players} jogadores</span></div><div class="team-roster-grid ${interclass ? 'interclass-roster-grid' : ''}">${rosterMarkup}</div></article>
    <article class="goals-panel"><div class="panel-head"><div><h2 class="panel-title">Gols da partida</h2><div class="panel-subtitle">${interclass ? 'Gols individuais do 3º A e total agregado do 2º Ano' : 'Gols e assistências registrados nesta partida'}</div></div><button class="btn btn-primary btn-small" data-action="new-goal">✎ Editar estatísticas</button></div><div class="goal-timeline">${goals}</div></article></div>
    <div class="detail-actions"><button class="btn btn-secondary" data-action="back-matches">← Voltar ao histórico</button><button class="btn btn-danger" data-action="delete-match" data-id="${match.id}">Excluir partida</button></div>`;
}
function modal(title, subtitle, body, footer, wide = false) {
  modalRoot.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="modal-close" data-modal-close aria-label="Fechar">×</button></div>${body}<div class="modal-footer">${footer}</div></div>`;
  modalRoot.dataset.open = 'true';
  document.body.style.overflow = 'hidden';
  const first = modalRoot.querySelector('input:not([type="hidden"]),select,button:not([data-modal-close])');
  if (first) window.setTimeout(() => first.focus(), 40);
}
function closeModal() {
  modalRoot.innerHTML = '';
  delete modalRoot.dataset.open;
  document.body.style.overflow = '';
}
function openPlayerModal(player = null) {
  const editing = Boolean(player);
  const selectedQuality = Number(player?.quality) || 3;
  const body = `<form id="playerForm" enctype="multipart/form-data"><div class="modal-body"><div class="form-grid"><div class="form-field full"><label for="playerName">Nome do jogador *</label><input id="playerName" name="name" maxlength="100" required value="${esc(player?.name || '')}" placeholder="Ex.: Gabriel Santos"></div><div class="form-field full"><label for="playerQuality">Qualidade para o sorteio *</label><select id="playerQuality" name="quality" required>${[1, 2, 3, 4, 5].map(quality => `<option value="${quality}" ${selectedQuality === quality ? 'selected' : ''}>${quality} · ${'★'.repeat(quality)}${'☆'.repeat(5 - quality)}</option>`).join('')}</select><div class="form-help">Avalie de 1 a 5 para ajudar a equilibrar os times sorteados.</div></div><div class="form-field full"><label>Foto do jogador <span class="optional">(opcional)</span></label><div class="photo-upload"><div class="photo-preview" id="photoPreview">${player?.photo_path ? `<img src="${esc(player.photo_path)}" alt="Foto atual">` : esc(initials(player?.name || 'FS'))}</div><div style="min-width:0;flex:1"><input id="playerPhoto" name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><div class="form-help" style="margin-top:7px">JPG, PNG, WEBP ou GIF · até 5 MB</div></div></div></div></div></div><div class="modal-footer" style="display:none"></div></form>`;
  const footer = `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="playerForm" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Cadastrar jogador'}</button>`;
  modal(editing ? 'Editar jogador' : 'Novo jogador', editing ? 'Atualize o nome, a qualidade ou a foto.' : 'Cadastre o nome, a qualidade e, se quiser, uma foto do jogador.', body, footer);
  const photoInput = document.getElementById('playerPhoto');
  photoInput?.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    const preview = document.getElementById('photoPreview');
    if (!preview) return;
    if (!file) { preview.innerHTML = player?.photo_path ? `<img src="${esc(player.photo_path)}" alt="Foto atual">` : esc(initials(document.getElementById('playerName').value || 'FS')); return; }
    if (file.size > 5 * 1024 * 1024) { photoInput.value = ''; toast('A imagem deve ter no máximo 5 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => { preview.innerHTML = `<img src="${reader.result}" alt="Prévia da foto">`; };
    reader.readAsDataURL(file);
  });
  document.getElementById('playerName')?.addEventListener('input', () => {
    const preview = document.getElementById('photoPreview');
    if (preview && !preview.querySelector('img')) preview.textContent = initials(document.getElementById('playerName').value || 'FS');
  });
}
function updateTeamCounts() {
  const selected = [...document.querySelectorAll('.participant-check:checked')];
  const form = document.getElementById('matchForm');
  const interclass = form?.querySelector('[name="opponent_type"]')?.value === 'second_year';
  const a = selected.filter(box => box.closest('.participant-row').querySelector('.participant-side').value === 'A').length;
  const b = selected.length - a;
  const ca = document.getElementById('teamACount');
  const cb = document.getElementById('teamBCount');
  if (ca) ca.textContent = `${a} ${a === 1 ? 'jogador' : 'jogadores'}`;
  if (cb) cb.textContent = `${b} ${b === 1 ? 'jogador' : 'jogadores'}`;
  const total = document.getElementById('selectedCount');
  if (total) total.textContent = interclass ? `${selected.length} jogadores do 3º A selecionados` : `${selected.length} selecionados`;
  const counts = document.getElementById('teamCounts');
  if (counts) {
    counts.classList.toggle('interclass-counts', interclass);
    if (interclass) counts.innerHTML = `<span class="interclass-count-note"><i class="legend-dot" style="background:var(--red)"></i><strong>${selected.length} ${selected.length === 1 ? 'jogador' : 'jogadores'}</strong> do 3º A selecionados. O 2º Ano será registrado apenas pelo placar total.</span>`;
    else counts.innerHTML = `<span><i class="legend-dot" style="background:var(--red)"></i><strong id="teamACount">${a} jogadores</strong> no Time Vermelho</span><span><i class="legend-dot" style="background:#60636f"></i><strong id="teamBCount">${b} jogadores</strong> no Time Branco</span>`;
  }
}
function updateMatchFormMode() {
  const form = document.getElementById('matchForm');
  if (!form) return;
  clearTeamDraw();
  const interclass = form.querySelector('[name="opponent_type"]')?.value === 'second_year';
  form.classList.toggle('interclass-mode', interclass);
  form.querySelectorAll('.participant-row').forEach(row => {
    const select = row.querySelector('.participant-side');
    if (interclass) select.value = 'A';
    select.disabled = interclass || !row.querySelector('.participant-check').checked;
  });
  const caption = document.getElementById('teamsCaption');
  if (caption) caption.textContent = interclass ? '02 · Escolha quem jogou pelo 3º A' : '02 · Monte as escalações';
  updateTeamCounts();
}
function clearTeamDraw() {
  const results = document.getElementById('teamDrawResults');
  if (results) {
    results.hidden = true;
    results.innerHTML = '';
    delete results.dataset.revealedCount;
  }
}
function drawTeams() {
  if (document.getElementById('opponentType')?.value === 'second_year') {
    toast('O sorteio de dois times está disponível nas partidas entre nós.', 'warning');
    return;
  }
  const selected = [...modalRoot.querySelectorAll('.participant-check:checked')];
  if (selected.length < 2) {
    toast('Selecione pelo menos dois jogadores para sortear os times.', 'warning');
    return;
  }

  const chosenPlayers = selected.map(check => {
    const player = state.players.find(item => item.id === Number(check.value))
      || state.dashboard?.players.find(item => item.id === Number(check.value));
    if (!player) throw new Error('Não foi possível encontrar um dos jogadores selecionados.');
    return { player, check, quality: Number(player.quality) || 3 };
  });
  const counts = { A: Math.ceil(chosenPlayers.length / 2), B: Math.floor(chosenPlayers.length / 2) };
  const isJonas = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR') === 'jonas';
  const jonas = chosenPlayers.find(item => isJonas(item.player.name));
  const jonasMustBeShorter = chosenPlayers.length % 2 === 1 && jonas;
  const movablePlayers = chosenPlayers.filter(item => item !== jonas || !jonasMustBeShorter);
  const candidateBuckets = [0, 1, 2].map(() => ({ count: 0, teams: null }));
  const isValidDifference = difference => difference >= 0 && difference <= 2;
  const getDifference = (qualityA, qualityB) => counts.A === counts.B
    ? Math.abs(qualityA - qualityB)
    : qualityB - qualityA;
  const considerTeams = (playersA, playersB) => {
    const qualityA = playersA.reduce((sum, item) => sum + item.quality, 0);
    const qualityB = playersB.reduce((sum, item) => sum + item.quality, 0);
    const difference = getDifference(qualityA, qualityB);
    if (!Number.isInteger(difference) || !isValidDifference(difference)) return;
    const bucket = candidateBuckets[difference];
    bucket.count++;
    if (Math.random() < 1 / bucket.count) {
      bucket.teams = {
        A: { side: 'A', name: 'Time Vermelho', players: [...playersA], quality: qualityA },
        B: { side: 'B', name: 'Time Branco', players: [...playersB], quality: qualityB }
      };
    }
  };

  if (movablePlayers.length <= 16) {
    const playersA = [];
    const playersB = jonasMustBeShorter ? [jonas] : [];
    const selectTeams = index => {
      if (playersA.length > counts.A || playersB.length > counts.B) return;
      if (index === movablePlayers.length) {
        if (playersA.length === counts.A && playersB.length === counts.B) considerTeams(playersA, playersB);
        return;
      }
      const item = movablePlayers[index];
      if (playersA.length < counts.A) {
        playersA.push(item);
        selectTeams(index + 1);
        playersA.pop();
      }
      if (playersB.length < counts.B) {
        playersB.push(item);
        selectTeams(index + 1);
        playersB.pop();
      }
    };
    selectTeams(0);
  } else {
    const getDistanceFromRange = difference => difference < 0 ? -difference : Math.max(0, difference - 2);
    for (let attempt = 0; attempt < 3000; attempt++) {
      const teams = {
        A: { side: 'A', name: 'Time Vermelho', players: [], quality: 0 },
        B: { side: 'B', name: 'Time Branco', players: [], quality: 0 }
      };
      if (jonasMustBeShorter) {
        teams.B.players.push(jonas);
        teams.B.quality += jonas.quality;
      }
      const shuffled = [...movablePlayers];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
      }
      shuffled.sort((left, right) => right.quality - left.quality);
      for (const item of shuffled) {
        const available = ['A', 'B'].filter(side => teams[side].players.length < counts[side]);
        const target = available.length === 1
          ? available[0]
          : teams.A.quality === teams.B.quality
            ? (Math.random() < 0.5 ? 'A' : 'B')
            : teams.A.quality < teams.B.quality ? 'A' : 'B';
        teams[target].players.push(item);
        teams[target].quality += item.quality;
      }

      let currentDifference = getDifference(teams.A.quality, teams.B.quality);
      let currentDistance = getDistanceFromRange(currentDifference);
      let improved = true;
      while (improved && currentDistance > 0) {
        improved = false;
        let bestSwap;
        let bestDistance = currentDistance;
        for (const red of teams.A.players) {
          for (const white of teams.B.players) {
            if (jonasMustBeShorter && white === jonas) continue;
            const qualityA = teams.A.quality - red.quality + white.quality;
            const qualityB = teams.B.quality - white.quality + red.quality;
            const distance = getDistanceFromRange(getDifference(qualityA, qualityB));
            if (distance < bestDistance) {
              bestDistance = distance;
              bestSwap = [red, white, qualityA, qualityB];
            }
          }
        }
        if (bestSwap) {
          const [red, white, qualityA, qualityB] = bestSwap;
          teams.A.players[teams.A.players.indexOf(red)] = white;
          teams.B.players[teams.B.players.indexOf(white)] = red;
          teams.A.quality = qualityA;
          teams.B.quality = qualityB;
          currentDifference = getDifference(qualityA, qualityB);
          currentDistance = bestDistance;
          improved = true;
        }
      }
      considerTeams(teams.A.players, teams.B.players);
    }
  }

  const availableBuckets = candidateBuckets.filter(bucket => bucket.teams);
  if (!availableBuckets.length) {
    toast('Não há uma divisão possível com diferença de qualidade entre 0 e 2 sem deixar o time menor em desvantagem. Ajuste as qualidades dos jogadores e tente novamente.', 'warning');
    return;
  }
  const selectedBucket = availableBuckets[Math.floor(Math.random() * availableBuckets.length)];
  const sortedTeams = [selectedBucket.teams.A, selectedBucket.teams.B];
  sortedTeams.forEach(team => team.players.forEach(check => {
    const select = check.check.closest('.participant-row').querySelector('.participant-side');
    select.value = team.side;
    select.disabled = false;
  }));
  updateTeamCounts();

  const results = document.getElementById('teamDrawResults');
  let cardIndex = 0;
  const maxTeamSize = Math.max(...sortedTeams.map(team => team.players.length));
  const cardIndexByPlayer = new Map();
  for (let playerIndex = 0; playerIndex < maxTeamSize; playerIndex++) {
    sortedTeams.forEach(team => {
      const entry = team.players[playerIndex];
      if (entry) cardIndexByPlayer.set(entry, cardIndex++);
    });
  }
  const deckHeader = `<div class="draw-stage-heading"><div class="draw-stage-title"><span class="draw-stage-kicker"><i class="draw-stage-pulse"></i>SORTEIO DE CARTAS</span><strong>Revele os jogadores</strong><small>Clique no baralho para revelar uma carta por vez.</small><span class="draw-stage-progress" id="drawStageProgress" role="status">0 de ${cardIndex} jogadores revelados</span></div><button type="button" class="draw-deck" data-action="reveal-next-player" aria-label="Revelar próximo jogador"><span class="draw-deck-cards" aria-hidden="true"><span class="draw-deck-card draw-deck-card-shadow"></span><span class="draw-deck-card draw-deck-card-mid">⚽︎</span><span class="draw-deck-card draw-deck-card-top"><b>FS</b><i>✦</i></span></span><span class="draw-deck-hint">CLIQUE PARA REVELAR</span></button></div>`;
  results.dataset.revealedCount = '0';
  results.innerHTML = deckHeader + sortedTeams.map(team => {
    const cardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const cardSuits = [
      { symbol: '♥', name: 'copas', color: 'red' },
      { symbol: '♦', name: 'ouros', color: 'red' },
      { symbol: '♣', name: 'paus', color: 'black' },
      { symbol: '♠', name: 'espadas', color: 'black' }
    ];
    const cards = team.players.map(entry => {
      const { player, quality } = entry;
      const index = cardIndexByPlayer.get(entry);
      const dealX = team.side === 'A' ? '82px' : '-82px';
      const teamLabel = team.side === 'A' ? 'TIME VERMELHO' : 'TIME BRANCO';
      const rank = cardRanks[Math.floor(Math.random() * cardRanks.length)];
      const suit = cardSuits[Math.floor(Math.random() * cardSuits.length)];
      const corner = `<span class="draw-playing-card-corner draw-suit-${team.side === 'A' ? 'red' : 'blue'}" aria-hidden="true"><b>${rank}</b><i>${suit.symbol}</i></span>`;
      return `<div class="draw-player-card" data-card-index="${index}" style="--deal-x:${dealX}" aria-label="Carta ainda não revelada, ${esc(team.name)}"><div class="draw-player-card-inner"><div class="draw-card-face draw-card-back"><span class="draw-card-back-emblem">⚽︎</span><small>${teamLabel}</small></div><div class="draw-card-face draw-card-front" aria-hidden="true">${corner}<span class="draw-card-team-label"><i></i>${teamLabel}</span><div class="draw-card-player-row">${avatar(player, 'small')}<span class="draw-card-player-copy"><strong>${esc(player.name)}</strong><small>★ ${quality} · qualidade</small></span></div>${corner}</div></div></div>`;
    }).join('');
    return `<section class="draw-team draw-team-${team.side.toLowerCase()}"><div class="draw-team-heading"><div><span>${team.name}</span><strong>${team.players.length} ${team.players.length === 1 ? 'jogador' : 'jogadores'} · qualidade ${team.quality}</strong></div><span class="draw-team-ball">⚽︎</span></div><div class="draw-team-cards">${cards}</div></section>`;
  }).join('');
  results.hidden = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  results.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  results.querySelector('.draw-deck').focus({ preventScroll: true });
}
function revealNextPlayer(button) {
  const results = document.getElementById('teamDrawResults');
  if (!results || results.hidden) return;
  const revealedCount = Number(results.dataset.revealedCount || 0);
  const card = results.querySelector(`.draw-player-card[data-card-index="${revealedCount}"]`);
  if (!card) return;

  card.classList.add('is-revealed');
  card.querySelector('.draw-card-front').removeAttribute('aria-hidden');
  const nextCount = revealedCount + 1;
  results.dataset.revealedCount = String(nextCount);
  const total = results.querySelectorAll('.draw-player-card').length;
  const progress = document.getElementById('drawStageProgress');
  const complete = nextCount === total;
  if (progress) progress.textContent = complete
    ? `Sorteio concluído · ${total} ${total === 1 ? 'jogador revelado' : 'jogadores revelados'}`
    : `${nextCount} de ${total} jogadores revelados`;
  if (complete) {
    button.disabled = true;
    button.setAttribute('aria-label', 'Todos os jogadores foram revelados');
    button.querySelector('.draw-deck-hint').textContent = 'SORTEIO CONCLUÍDO';
  }
}
function openMatchModal(testOnly = false) {
  const players = (state.players.length ? state.players : state.dashboard?.players || []).filter(p => p.is_active);
  if (!players.length) {
    if (testOnly) {
      toast('Não há jogadores ativos para testar o sorteio.', 'warning');
      return;
    }
    toast('Cadastre pelo menos um jogador ativo antes de criar uma partida.', 'warning');
    openPlayerModal();
    return;
  }
  const defaultType = players.length < 2 ? 'second_year' : 'classmates';
  const playerRows = players.map(player => `<label class="participant-row"><input class="participant-check" type="checkbox" value="${player.id}"><span class="participant-player">${avatar(player, 'small')}<span style="min-width:0"><strong>${esc(player.name)}</strong></span></span><select class="participant-side" aria-label="Time de ${esc(player.name)}" disabled><option value="A">Time Vermelho</option><option value="B">Time Branco</option></select></label>`).join('');
  const formWrapper = testOnly ? 'div' : 'form';
  const matchSetup = testOnly ? '' : `<div class="section-caption">01 · Tipo e data da partida</div><div class="form-grid"><div class="form-field full"><label for="opponentType">Tipo de partida *</label><select id="opponentType" name="opponent_type"><option value="classmates" ${defaultType === 'classmates' ? 'selected' : ''} ${players.length < 2 ? 'disabled' : ''}>Entre nós · somente 3º A</option><option value="second_year" ${defaultType === 'second_year' ? 'selected' : ''}>Interclasse · contra o 2º Ano (azul)</option></select><div class="form-help">No interclasse, o 2º Ano não precisa ser cadastrado: você registra apenas o total de gols deles.</div></div><div class="form-field full"><label for="matchDate">Data da partida *</label><input id="matchDate" name="played_on" type="date" required max="${todayIso()}" value="${todayIso()}"></div></div>`;
  const modeNotice = testOnly ? '<div class="draw-test-notice" role="status"><strong>Modo de teste</strong><span>O sorteio é apenas uma prévia: nenhuma partida será criada ou salva.</span></div>' : '';
  const caption = testOnly ? 'Selecione jogadores para testar o sorteio' : '02 · Monte as escalações';
  const helper = testOnly ? 'A prévia usa os jogadores ativos e as qualidades cadastradas. Fechar esta janela descarta o resultado.' : 'Cada partida tem uma escalação independente. Nas partidas entre nós, os times podem ficar desbalanceados. Contra o 2º Ano, escolha todos os jogadores do 3º A que participaram.';
  const body = `<${formWrapper} id="matchForm" class="${testOnly ? 'team-draw-test-mode' : ''}"><div class="modal-body">${modeNotice}${matchSetup}<div class="section-caption" id="teamsCaption">${caption}</div><div class="participant-toolbar"><span id="selectedCount">0 selecionados</span><div class="participant-tools"><button type="button" data-action="select-all-players">Selecionar todos</button><button type="button" data-action="clear-players">Limpar</button><button type="button" class="draw-teams-button" data-action="draw-teams">⚄ Sortear times</button></div></div><div class="participant-list">${playerRows}</div><div class="team-draw-results" id="teamDrawResults" aria-live="polite" hidden></div><div class="team-counts" id="teamCounts"><span><i class="legend-dot" style="background:var(--red)"></i><strong id="teamACount">0 jogadores</strong> no Time Vermelho</span><span><i class="legend-dot" style="background:#60636f"></i><strong id="teamBCount">0 jogadores</strong> no Time Branco</span></div><p class="form-help" style="margin-top:10px">${helper}</p></div></${formWrapper}>`;
  const footer = testOnly ? '<button type="button" class="btn btn-secondary" data-modal-close>Fechar teste</button>' : `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="matchForm" class="btn btn-primary">Criar partida →</button>`;
  modal(testOnly ? 'Testar sorteio de times' : 'Registrar partida', testOnly ? 'Escolha jogadores ativos e veja uma prévia do sorteio.' : 'Escolha o tipo de confronto, a data e os jogadores do 3º A.', body, footer, true);
  modalRoot.querySelectorAll('.participant-check').forEach(check => check.addEventListener('change', () => {
    clearTeamDraw();
    const interclass = document.getElementById('opponentType')?.value === 'second_year';
    const select = check.closest('.participant-row').querySelector('.participant-side');
    select.disabled = interclass || !check.checked;
    updateTeamCounts();
  }));
  modalRoot.querySelectorAll('.participant-side').forEach(select => select.addEventListener('change', () => {
    clearTeamDraw();
    updateTeamCounts();
  }));
  document.getElementById('opponentType')?.addEventListener('change', updateMatchFormMode);
  updateMatchFormMode();
}
function openGoalModal() {
  const match = state.matchDetail;
  if (!match) return;
  const interclass = match.opponent_type === 'second_year';
  const goalsFor = (playerId, goalType) => match.goals.filter(goal => goal.player_id === playerId && goal.goal_type === goalType).length;
  const opponentGoals = match.goals.filter(goal => interclass && !goal.player_id && goal.team_side === 'B' && goal.goal_type === 'normal').length;
  const opponentOwnGoals = match.goals.filter(goal => interclass && !goal.player_id && goal.team_side === 'A' && goal.goal_type === 'own_goal').length;
  const playersFor = side => match.players.filter(player => player.team_side === side).map(player => `
    <div class="goal-entry-row" data-player-id="${player.id}">
      <div class="goal-entry-player">${avatar(player, 'small')}<strong>${esc(player.name)}</strong></div>
      <label class="goal-count-field"><span>Gols</span><input type="number" min="0" max="99" value="${goalsFor(player.id, 'normal')}" data-goal-kind="goals" aria-label="Total de gols de ${esc(player.name)}"></label>
      <label class="goal-count-field"><span>Assist.</span><input type="number" min="0" max="99" value="${Number(player.assists) || 0}" data-goal-kind="assists" aria-label="Total de assistências de ${esc(player.name)}"></label>
      <label class="goal-count-field own-goal-field"><span>Contra</span><input type="number" min="0" max="99" value="${goalsFor(player.id, 'own_goal')}" data-goal-kind="own_goals" aria-label="Total de gols contra de ${esc(player.name)}"></label>
    </div>`).join('') || '<div class="empty-inline">Nenhum jogador nesta equipe.</div>';
  const teamRows = interclass
    ? `<section class="goal-entry-team red-team"><div class="goal-entry-team-heading"><span class="team-color-dot"></span><strong>Jogadores do 3º A</strong></div>${playersFor('A')}</section><section class="goal-entry-team blue-team"><div class="goal-entry-team-heading"><span class="team-color-dot blue"></span><strong>2º Ano · gols da equipe</strong></div><div class="opponent-goals-input"><p>Edite os totais atuais. Gols contra do 2º Ano contam para o 3º A.</p><label class="goal-count-field"><span>Gols do 2º Ano</span><input id="opponentGoals" name="opponent_goals" type="number" min="0" max="300" value="${opponentGoals}" aria-label="Gols do 2º Ano"></label><label class="goal-count-field"><span>Gols contra do 2º Ano</span><input id="opponentOwnGoals" name="opponent_own_goals" type="number" min="0" max="300" value="${opponentOwnGoals}" aria-label="Gols contra do 2º Ano"></label></div></section>`
    : `<section class="goal-entry-team red-team"><div class="goal-entry-team-heading"><span class="team-color-dot"></span><strong>${esc(match.team_a_name)}</strong></div>${playersFor('A')}</section><section class="goal-entry-team white-team"><div class="goal-entry-team-heading"><span class="team-color-dot dark"></span><strong>${esc(match.team_b_name)}</strong></div>${playersFor('B')}</section>`;
  const body = `<form id="goalForm"><div class="modal-body"><div class="goal-score-preview ${interclass ? 'goal-score-interclass' : ''}"><div class="score-side"><strong>${esc(match.team_a_name)}</strong></div><div class="score-big">${match.score_a}<span class="score-separator">:</span>${match.score_b}</div><div class="score-side"><strong>${esc(match.team_b_name)}</strong></div></div><p class="goal-form-instructions">${interclass ? 'Confira e ajuste os totais de gols e assistências do 3º A e do 2º Ano.' : 'Confira e ajuste os totais de gols, assistências e gols contra de cada jogador.'} Os números informados substituirão os valores atuais.</p><div class="goal-entry-teams ${interclass ? 'goal-entry-interclass' : ''}">${teamRows}</div></div></form>`;
  const footer = `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="goalForm" class="btn btn-primary">Salvar estatísticas</button>`;
  modal('Editar estatísticas da partida', 'Altere os totais de cada jogador; os dados anteriores serão substituídos.', body, footer, true);
}
async function refreshForCurrent() {
  closeModal();
  await renderCurrent();
}
async function submitPlayerForm(form) {
  const submitButton = modalRoot.querySelector('button[form="playerForm"][type="submit"]');
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Salvando...'; }
  try {
    const formData = new FormData(form);
    const id = form.dataset.playerId;
    const result = await api(id ? `/api/players/${id}` : '/api/players', { method: id ? 'PUT' : 'POST', body: formData });
    toast(result.message || 'Jogador salvo.');
    closeModal();
    state.playerSearch = '';
    if (state.view === 'dashboard') await renderDashboard();
    else if (state.view === 'players') await renderPlayers();
    else if (state.view === 'matches') { const p = await api('/api/players'); state.players = p.data; await renderMatches(); }
    else if (state.view === 'stats') await renderStats();
  } catch (error) {
    toast(error.message, 'error');
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = form.dataset.playerId ? 'Salvar alterações' : 'Cadastrar jogador'; }
  }
}
async function submitMatchForm(form) {
  const submitButton = modalRoot.querySelector('button[form="matchForm"][type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  const interclass = payload.opponent_type === 'second_year';
  const participants = [...modalRoot.querySelectorAll('.participant-check:checked')].map(check => ({ player_id: Number(check.value), team_side: interclass ? 'A' : check.closest('.participant-row').querySelector('.participant-side').value }));
  payload.participants = participants;
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Criando partida...'; }
  try {
    const result = await api('/api/matches', jsonOptions('POST', payload));
    toast(result.message || 'Partida criada.');
    closeModal();
    state.selectedMatch = result.data.id;
    state.view = 'matchDetail';
    updateChrome();
    await renderMatchDetail();
  } catch (error) {
    toast(error.message, 'error');
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Criar partida →'; }
  }
}
async function submitGoalForm(form) {
  const submitButton = modalRoot.querySelector('button[form="goalForm"][type="submit"]');
  const entries = [...modalRoot.querySelectorAll('.goal-entry-row')].map(row => ({
    player_id: Number(row.dataset.playerId),
    goals: Number(row.querySelector('[data-goal-kind="goals"]').value || 0),
    assists: Number(row.querySelector('[data-goal-kind="assists"]').value || 0),
    own_goals: Number(row.querySelector('[data-goal-kind="own_goals"]').value || 0)
  }));
  const opponentGoals = Number(modalRoot.querySelector('#opponentGoals')?.value || 0);
  const opponentOwnGoals = Number(modalRoot.querySelector('#opponentOwnGoals')?.value || 0);
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Salvando estatísticas...'; }
  try {
    const result = await api(`/api/matches/${state.selectedMatch}/goals`, jsonOptions('PUT', { entries, opponent_goals: opponentGoals, opponent_own_goals: opponentOwnGoals }));
    toast(result.message || 'Gols registrados.');
    closeModal();
    await renderMatchDetail();
  } catch (error) {
    toast(error.message, 'error');
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Salvar estatísticas'; }
  }
}
async function deletePlayer(id, archive = false) {
  const player = state.players.find(p => p.id === id);
  if (!player) return;
  const question = archive ? `Arquivar ${player.name}? Ele não aparecerá nas novas escalações, mas o histórico será preservado.` : `Excluir ${player.name}? Esta ação não pode ser desfeita.`;
  if (!window.confirm(question)) return;
  try {
    const result = archive ? await api(`/api/players/${id}/archive`, { method: 'PATCH' }) : await api(`/api/players/${id}`, { method: 'DELETE' });
    toast(result.message || 'Cadastro atualizado.');
    if (state.view === 'players') await renderPlayers(); else await renderDashboard();
  } catch (error) { toast(error.message, 'error'); }
}
async function deleteMatch(id) {
  if (!window.confirm('Excluir esta partida e todos os gols registrados nela? Essa ação não pode ser desfeita.')) return;
  try {
    const result = await api(`/api/matches/${id}`, { method: 'DELETE' });
    toast(result.message || 'Partida excluída.');
    state.selectedMatch = null;
    if (state.view === 'matchDetail') { state.view = 'matches'; updateChrome(); }
    await renderCurrent();
  } catch (error) { toast(error.message, 'error'); }
}
async function deleteGoal(matchId, goalId) {
  if (!window.confirm('Remover este gol do placar?')) return;
  try {
    const result = await api(`/api/matches/${matchId}/goals/${goalId}`, { method: 'DELETE' });
    toast('Gol removido.');
    await renderMatchDetail();
  } catch (error) { toast(error.message, 'error'); }
}
async function deleteAssist(matchId, playerId) {
  try {
    const result = await api(`/api/matches/${matchId}/assists/${playerId}`, { method: 'DELETE' });
    toast(result.message || 'Assistência removida.');
    await renderMatchDetail();
  } catch (error) { toast(error.message, 'error'); }
}

// Delegated click actions keep the interface simple as each view is redrawn.
document.addEventListener('click', async event => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !event.target.closest('#mobileMenu')) {
    setSidebarOpen(false);
  }
  const statsSortButton = event.target.closest('[data-stats-sort]');
  if (statsSortButton && state.view === 'stats') {
    const sort = statsSortButton.dataset.statsSort;
    if (state.statsSort === sort) state.statsSortDirection = state.statsSortDirection === 'desc' ? 'asc' : 'desc';
    else { state.statsSort = sort; state.statsSortDirection = 'desc'; }
    renderStatsContent();
    return;
  }
  const navButton = event.target.closest('[data-view]');
  if (navButton) { await navigate(navButton.dataset.view); return; }
  const closeButton = event.target.closest('[data-modal-close]');
  if (closeButton) { closeModal(); return; }
  if (event.target === modalRoot) { closeModal(); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (state.readOnly && readOnlyActions.has(action)) {
    toast('Esta cópia está em modo somente leitura. Inicie o servidor para alterar os dados.', 'error');
    return;
  }
  const id = Number(button.dataset.id);
  try {
    if (action === 'new-player') openPlayerModal();
    else if (action === 'edit-player') {
      if (!state.players.length) { const r = await api('/api/players?includeInactive=true'); state.players = r.data; }
      const player = state.players.find(p => p.id === id) || (await api('/api/players?includeInactive=true')).data.find(p => p.id === id);
      if (player) { openPlayerModal(player); document.getElementById('playerForm').dataset.playerId = player.id; }
    }
    else if (action === 'archive-player') await deletePlayer(id, true);
    else if (action === 'reactivate-player') {
      const result = await api(`/api/players/${id}/archive`, { method: 'PATCH' }); toast(result.message); await renderPlayers();
    }
    else if (action === 'new-match') {
      const result = await api('/api/players');
      state.players = result.data;
      openMatchModal(state.readOnly);
    }
    else if (action === 'new-goal') openGoalModal();
    else if (action === 'open-match') { state.selectedMatch = id; state.view = 'matchDetail'; updateChrome(); await renderMatchDetail(); }
    else if (action === 'delete-match') await deleteMatch(id);
    else if (action === 'delete-goal') await deleteGoal(Number(button.dataset.matchId), id);
    else if (action === 'delete-assist') await deleteAssist(Number(button.dataset.matchId), id);
    else if (action === 'back-matches' || action === 'go-matches') await navigate('matches');
    else if (action === 'go-players') await navigate('players');
    else if (action === 'go-stats') await navigate('stats');
    else if (action === 'retry') await renderCurrent();
    else if (action === 'select-all-players') {
      modalRoot.querySelectorAll('.participant-check').forEach((check, index) => { check.checked = true; const select = check.closest('.participant-row').querySelector('.participant-side'); const interclass = document.getElementById('opponentType')?.value === 'second_year'; select.disabled = interclass ? true : false; select.value = interclass ? 'A' : (index % 2 === 0 ? 'A' : 'B'); }); clearTeamDraw(); updateTeamCounts();
    }
    else if (action === 'clear-players') {
      modalRoot.querySelectorAll('.participant-check').forEach(check => { check.checked = false; check.closest('.participant-row').querySelector('.participant-side').disabled = true; }); clearTeamDraw(); updateTeamCounts();
    }
    else if (action === 'draw-teams') drawTeams();
    else if (action === 'reveal-next-player') revealNextPlayer(button);
  } catch (error) { toast(error.message, 'error'); }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  if (state.readOnly) {
    toast('Esta cópia está em modo somente leitura. Inicie o servidor para alterar os dados.', 'error');
    return;
  }
  const form = event.target;
  if (form.id === 'playerForm') await submitPlayerForm(form);
  if (form.id === 'matchForm') await submitMatchForm(form);
  if (form.id === 'goalForm') await submitGoalForm(form);
});
document.addEventListener('input', event => {
  if (event.target.id === 'playerSearch') { state.playerSearch = event.target.value; renderPlayerGridOnly(); }
  if (event.target.id === 'matchSearch') { state.matchSearch = event.target.value; renderMatchCardsOnly(); }
});
document.addEventListener('change', async event => {
  if (event.target.id === 'playerStatus') { state.playerStatus = event.target.value; await renderPlayers(); }
  if (event.target.id === 'statsScope') { state.statsScope = event.target.value; await renderCurrent(); }
});
document.getElementById('quickAddPlayer').addEventListener('click', () => {
  if (state.readOnly) {
    toast('Esta cópia está em modo somente leitura. Inicie o servidor para alterar os dados.', 'error');
    return;
  }
  openPlayerModal();
});
document.getElementById('mobileMenu').addEventListener('click', () => {
  setSidebarOpen(!document.getElementById('sidebar').classList.contains('open'));
});

// Start by checking that the backend is reachable, then render the dashboard.
(async function boot() {
  try {
    await api('/api/health');
    await renderDashboard();
  } catch (error) {
    pageContent.innerHTML = `<div class="empty-state"><div class="empty-symbol">!</div><h3>Não foi possível carregar o FutSENAI</h3><p>Verifique se o servidor está iniciado ou se o arquivo de dados foi publicado em <strong>public/data/futsenai.json</strong>.</p><p style="font-size:10px">Detalhe: ${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Tentar novamente</button></div>`;
  }
})();
