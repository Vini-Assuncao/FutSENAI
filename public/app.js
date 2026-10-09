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
  statsScope: 'all'
};

const pageContent = document.getElementById('pageContent');
const modalRoot = document.getElementById('modalRoot');
const toastStack = document.getElementById('toastStack');
const viewNames = { dashboard: 'Visão geral', players: 'Jogadores', matches: 'Partidas', stats: 'Estatísticas', matchDetail: 'Detalhes da partida' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}
function avatar(person, extraClass = '') {
  const classes = `player-avatar ${extraClass}`.trim();
  const image = person?.photo_path ? `<img src="${esc(person.photo_path)}" alt="Foto de ${esc(person.name)}" loading="lazy">` : esc(initials(person?.nickname || person?.name));
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
  const response = await fetch(url, options);
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || data.message || `Erro na solicitação (${response.status}).`);
  return data;
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
async function navigate(view) {
  state.view = view;
  state.selectedMatch = null;
  document.getElementById('sidebar').classList.remove('open');
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
  return `<label class="scope-filter"><span>Partidas consideradas</span><select id="statsScope"><option value="all" ${state.statsScope === 'all' ? 'selected' : ''}>Todas as partidas (somar tudo)</option><option value="internal" ${state.statsScope === 'internal' ? 'selected' : ''}>Somente entre nós · 3º A</option><option value="interclass" ${state.statsScope === 'interclass' ? 'selected' : ''}>Somente interclasse · 3º A × 2º Ano</option></select></label>`;
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
  return `<div class="scorer-row"><div class="rank-number ${index === 0 ? 'gold' : ''}">${String(index + 1).padStart(2, '0')}</div>${avatar(player, 'small')}<div class="scorer-info"><strong>${esc(player.nickname || player.name)}</strong><span>${player.matches_played} partidas · ${player.wins} vitórias</span></div><div class="goal-count">${player.goals} ${player.goals === 1 ? 'gol' : 'gols'}</div></div>`;
}
async function renderDashboard() {
  setLoading('Atualizando o placar da turma...');
  const result = await api(`/api/dashboard?scope=${state.statsScope}`);
  state.dashboard = result;
  state.players = result.players;
  updateChrome();
  const s = result.summary;
  const scorerHtml = result.topScorers.length ? result.topScorers.map(scorerRow).join('') : `<div class="empty-inline"><strong>Nenhuma estatística neste filtro</strong>Registre gols ou selecione outro tipo de partida.</div>`;
  const recentHtml = result.recentMatches.length ? result.recentMatches.map(renderMatchRow).join('') : `<div class="empty-inline"><strong>Nenhuma partida neste filtro</strong>Registre um jogo para ver o placar por aqui.</div>`;
  pageContent.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow">BEM-VINDO AO CAMPO</div><h1>O jogo começa aqui<span style="color:var(--red)">.</span></h1><p>Organize a resenha, guarde os resultados e descubra quem está brilhando na quadra.</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="new-player">＋ Novo jogador</button><button class="btn btn-primary" data-action="new-match">＋ Registrar partida</button></div></section>
    <div class="scope-filter-row">${scopeFilterHtml()}</div>
    <section class="stats-grid">
      ${statCard('Jogadores ativos', s.activePlayers, '♟', 'Elenco disponível do 3º A')}
      ${statCard('Partidas consideradas', s.totalMatches, '⚑', 'De acordo com o filtro acima')}
      ${statCard('Gols marcados', s.totalGoals, '⚽︎', 'Placar dos jogos selecionados')}
      ${statCard('Média de gols / jogo', s.averageGoals, '↗', 'Gols divididos pelas partidas filtradas')}
    </section>
    ${rivalryPanel(result.secondYearRivalry)}
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Últimas partidas</h2><div class="panel-subtitle">${state.statsScope === 'all' ? 'Todos os confrontos registrados' : state.statsScope === 'interclass' ? 'Somente jogos contra o 2º Ano' : 'Somente jogos entre jogadores do 3º A'}</div></div><button class="text-action" data-action="go-matches">Ver todas →</button></div><div class="match-list">${recentHtml}</div></article>
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Artilharia da turma</h2><div class="panel-subtitle">Gols no recorte selecionado</div></div><button class="text-action" data-action="go-stats">Ranking →</button></div><div class="scorer-list">${scorerHtml}</div></article>
    </section>
    <section class="dashboard-bottom">
      <article class="panel how-it-works-panel"><div class="panel-head"><div><h2 class="panel-title">O foco é a resenha</h2><div class="panel-subtitle">As equipes mudam. As estatísticas dos jogadores ficam.</div></div></div><div class="how-it-works-list">
        <div class="how-it-works-item"><span class="quick-action-icon">⚽︎</span><div><strong>Artilharia individual</strong><p>Conte os gols de cada pessoa de uma vez, sem registrar lance por lance.</p></div></div>
        <div class="how-it-works-item"><span class="quick-action-icon">♟</span><div><strong>Escalação personalizada</strong><p>Monte novas equipes a cada partida, inclusive com quantidades diferentes de jogadores.</p></div></div>
        <div class="how-it-works-item"><span class="quick-action-icon">▦</span><div><strong>Histórico da turma</strong><p>Consulte os placares e as estatísticas individuais de todos os jogos registrados.</p></div></div>
      </div></article>
      <article class="panel quick-panel"><div class="panel-head"><div><h2 class="panel-title">Atalhos rápidos</h2><div class="panel-subtitle">Mais praticidade para organizar o jogo</div></div></div><div class="quick-actions">
        <button class="quick-action" data-action="new-match"><span class="quick-action-icon">⚑</span><span><strong>Nova partida</strong><span>Monte os times e registre</span></span></button>
        <button class="quick-action" data-action="new-player"><span class="quick-action-icon">♟</span><span><strong>Novo jogador</strong><span>Adicione um amigo</span></span></button>
        <button class="quick-action" data-action="go-players"><span class="quick-action-icon">☷</span><span><strong>Elenco completo</strong><span>Fotos e dados da turma</span></span></button>
        <button class="quick-action" data-action="go-stats"><span class="quick-action-icon">↗</span><span><strong>Ver estatísticas</strong><span>Compare os números</span></span></button>
      </div></article>
    </section>`;
}
function playerCard(player) {
  const archived = !player.is_active;
  return `<article class="player-card"><div class="player-card-head">${avatar(player)}<div class="player-card-name"><h3>${esc(player.name)}${archived ? '<span class="archived-label">ARQUIVADO</span>' : ''}</h3><p>${player.matches_played} ${player.matches_played === 1 ? 'partida disputada' : 'partidas disputadas'}</p></div></div><div class="player-mini-stats"><div><strong>${player.matches_played}</strong><span>PARTIDAS</span></div><div><strong>${player.goals}</strong><span>GOLS</span></div><div><strong>${player.wins}</strong><span>VITÓRIAS</span></div></div><div class="player-card-actions"><button class="btn btn-secondary btn-small" data-action="edit-player" data-id="${player.id}">✎ Editar</button>${archived ? `<button class="btn btn-secondary btn-small" data-action="reactivate-player" data-id="${player.id}">Reativar</button>` : `<button class="btn btn-danger btn-small" data-action="archive-player" data-id="${player.id}">Arquivar</button>`}</div></article>`;
}
async function renderPlayers() {
  setLoading('Carregando elenco...');
  const result = await api(`/api/players?includeInactive=${state.playerStatus === 'all'}&scope=${state.statsScope}`);
  state.players = result.data;
  if (state.dashboard) state.dashboard.summary.activePlayers = state.players.filter(p => p.is_active).length;
  updateChrome();
  const active = state.players.filter(p => p.is_active).length;
  const filtered = state.players.filter(p => `${p.name}`.toLowerCase().includes(state.playerSearch.toLowerCase()));
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">ELENCO</div><h1>Jogadores<span style="color:var(--red)">.</span></h1><p>Nome, foto e estatísticas de cada jogador — tudo em um só lugar.</p></div><div class="heading-actions"><button class="btn btn-primary" data-action="new-player">＋ Cadastrar jogador</button></div></section>
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
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">HISTÓRICO</div><h1>Partidas<span style="color:var(--red)">.</span></h1><p>Cada jogo tem sua escalação, seu placar e sua própria história.</p></div><div class="heading-actions"><button class="btn btn-primary" data-action="new-match">＋ Registrar partida</button></div></section><div class="toolbar"><label class="searchbox"><span>⌕</span><input id="matchSearch" type="search" placeholder="Buscar por data (AAAA-MM-DD)..." value="${esc(state.matchSearch)}" autocomplete="off"></label>${scopeFilterHtml()}<span class="results-label" id="matchResultsLabel">${filtered.length} partidas encontradas</span></div><div class="match-cards" id="matchCards">${filtered.length ? filtered.map(matchCard).join('') : `<div class="empty-state"><div class="empty-symbol">⚑</div><h3>${state.matchSearch ? 'Nenhuma partida encontrada' : 'O apito inicial está esperando'}</h3><p>${state.matchSearch ? 'Tente outra data ou limpe a busca.' : 'Registre uma partida, distribua os jogadores entre os times e anote cada gol.'}</p>${state.matchSearch ? '' : '<button class="btn btn-primary" data-action="new-match">＋ Registrar primeira partida</button>'}</div>`}</div>`;
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
  const a = result.aggregate;
  const ranking = result.players;
  const tableRows = ranking.length ? ranking.map((p, i) => `<tr><td><div class="player-cell"><span class="rank-number ${i === 0 ? 'gold' : ''}">${i + 1}</span>${avatar(p)}<span>${esc(p.name)}</span></div></td><td class="num">${p.matches_played}</td><td class="num">${p.goals}</td><td class="num">${p.wins}</td><td class="num">${p.draws}</td><td class="num">${p.losses}</td><td class="num">${p.win_rate}%</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-inline"><strong>Sem estatísticas neste filtro</strong>Registre partidas e gols, ou selecione outro tipo de partida.</div></td></tr>`;
  const top = ranking[0];
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">NÚMEROS DO JOGO</div><h1>Estatísticas<span style="color:var(--red)">.</span></h1><p>Veja a evolução da turma, quem decide e como cada jogador contribui.</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="go-matches">Ver partidas</button></div></section>
    <div class="scope-filter-row">${scopeFilterHtml()}</div>
    <section class="stats-grid">${statCard('Partidas no recorte', a.matches, '⚑', 'De acordo com o filtro')}${statCard('Gols no recorte', a.goals, '⚽︎', 'Todos os gols desses jogos')}${statCard('Média por partida', a.averageGoals, '↗', 'Gols por jogo considerado')}${statCard('Empates', a.draws, '＝', 'Jogos que terminaram iguais')}</section>
    ${rivalryPanel(a.secondYearRivalry)}
    <div class="stats-page-grid"><article class="panel"><div class="panel-head"><div><h2 class="panel-title">Ranking dos jogadores</h2><div class="panel-subtitle">Artilharia e desempenho no recorte selecionado</div></div></div><div class="table-wrap"><table class="stats-table"><thead><tr><th>Jogador</th><th style="text-align:center">J</th><th style="text-align:center">G</th><th style="text-align:center">V</th><th style="text-align:center">E</th><th style="text-align:center">D</th><th style="text-align:center">Aprov.</th></tr></thead><tbody>${tableRows}</tbody></table></div></article>
    <div><article class="stat-hero"><div class="eyebrow">ARTILHEIRO NO RECORTE</div><strong>${top ? `${top.goals} ${top.goals === 1 ? 'gol' : 'gols'}` : '—'}</strong><p>${top ? `${esc(top.name)} lidera a artilharia dentro do filtro selecionado.` : 'Quando houver gols nesse recorte, o destaque aparece aqui.'}</p></article><article class="panel" style="margin-top:17px"><div class="panel-head"><div><h2 class="panel-title">Resumo do histórico</h2><div class="panel-subtitle">Números das partidas filtradas</div></div></div><div class="stats-metric-list"><div class="stats-metric"><span>Jogadores com estatísticas</span><strong>${ranking.length}</strong></div><div class="stats-metric"><span>Média de gols por partida</span><strong>${a.averageGoals}</strong></div><div class="stats-metric"><span>Partidas empatadas</span><strong>${a.draws}</strong></div><div class="stats-metric"><span>Total de partidas</span><strong>${a.matches}</strong></div></div></article></div></div>`;
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
    if (!groupedGoals.has(key)) groupedGoals.set(key, { ...goal, ids: [], count: 0 });
    const group = groupedGoals.get(key);
    group.ids.push(goal.id);
    group.count++;
  }
  const goals = groupedGoals.size ? [...groupedGoals.values()].map(goal => {
    const aggregateOpponentGoal = interclass && !goal.player_id && goal.team_side === 'B';
    const author = aggregateOpponentGoal ? 'Gols totais do 2º Ano' : goal.player_name ? esc(goal.player_name) : 'Autor não informado';
    const description = aggregateOpponentGoal ? 'Total agregado do adversário · sem artilharia individual' : `${goalTypeLabel(goal.goal_type)} · ponto para ${goal.team_side === 'A' ? esc(match.team_a_name) : esc(match.team_b_name)}`;
    return `<div class="goal-event goal-event-counted ${aggregateOpponentGoal ? 'aggregate-opponent-goal' : ''}">
      <div class="goal-total-badge">${goal.count > 1 ? `×${goal.count}` : '⚽︎'}</div>
      <div class="goal-event-main"><strong>${author}${goal.goal_type === 'own_goal' ? ' · Gol contra' : ''}</strong><span>${description}</span></div>
      <button class="goal-delete" title="Desfazer um gol deste registro" aria-label="Desfazer um gol" data-action="delete-goal" data-match-id="${match.id}" data-id="${goal.ids[goal.ids.length - 1]}">−</button>
    </div>`;
  }).join('') : `<div class="empty-inline"><strong>Nenhum gol lançado</strong>Use “Registrar gols” para informar quantos cada jogador fez.</div>`;

  const rosterFor = side => {
    const players = match.players.filter(player => player.team_side === side);
    return players.map(player => {
      const playerGoals = match.goals.filter(goal => goal.player_id === player.id && goal.goal_type === 'normal').length;
      const playerOwnGoals = match.goals.filter(goal => goal.player_id === player.id && goal.goal_type === 'own_goal').length;
      const statText = [playerGoals ? `${playerGoals} ${playerGoals === 1 ? 'gol' : 'gols'}` : '', playerOwnGoals ? `${playerOwnGoals} contra` : ''].filter(Boolean).join(' · ');
      return `<div class="roster-player">${avatar(player)}<div class="roster-player-info"><strong>${esc(player.name)}</strong><small>${statText || 'Na escalação'}</small></div></div>`;
    }).join('') || '<div class="empty-inline">Sem jogadores nesta equipe</div>';
  };

  const rosterMarkup = interclass
    ? `<section class="roster-team-column red-team roster-3a-only"><div class="roster-team-heading"><span class="team-color-dot"></span><strong>Jogadores do 3º A</strong><span class="results-label">${match.players_a}</span></div><div class="roster-team-list">${rosterFor('A')}</div><div class="opponent-roster-note"><span class="opponent-blue-dot"></span>O 2º Ano é registrado somente pelo placar total.</div></section>`
    : `<section class="roster-team-column red-team"><div class="roster-team-heading"><span class="team-color-dot"></span><strong>${esc(match.team_a_name)}</strong><span class="results-label">${match.players_a}</span></div><div class="roster-team-list">${rosterFor('A')}</div></section><section class="roster-team-column white-team"><div class="roster-team-heading"><span class="team-color-dot dark"></span><strong>${esc(match.team_b_name)}</strong><span class="results-label">${match.players_b}</span></div><div class="roster-team-list">${rosterFor('B')}</div></section>`;

  pageContent.innerHTML = `<div class="detail-header"><button class="back-button" data-action="back-matches" aria-label="Voltar">←</button><div><div class="eyebrow">${interclass ? 'SÚMULA INTERCLASSE' : 'SÚMULA DA PARTIDA'}</div><h1 style="font:800 25px var(--display);margin:0">${interclass ? '3º A × 2º Ano' : 'Partida'} · ${shortDate(match.played_on, true)}<span style="color:var(--red)">.</span></h1></div></div>
    <section class="detail-match-hero ${interclass ? 'detail-interclass' : ''}"><div class="match-card-top"><span><strong>${fullDate(match.played_on)}</strong> · Quadra</span><span class="match-kind ${interclass ? 'interclass' : ''}">${interclass ? `INTERCLASSE · ${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'} do 3º A` : `ENTRE NÓS · ${match.total_players} ${match.total_players === 1 ? 'jogador' : 'jogadores'}`}</span></div><div class="detail-scoreboard"><div class="detail-team"><div class="team-large-icon ${teamIconClass(match, 'A')}">●</div><strong>${esc(match.team_a_name)}</strong><small>${interclass ? `${match.players_a} jogadores escalados` : `${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'}`}</small></div><div><div class="detail-score">${match.score_a}<span>:</span>${match.score_b}</div><div class="detail-result-note">${esc(outcomeLabel(match))}</div></div><div class="detail-team"><div class="team-large-icon ${teamIconClass(match, 'B')}">●</div><strong>${esc(match.team_b_name)}</strong><small>${interclass ? 'Placar total do adversário' : `${match.players_b} ${match.players_b === 1 ? 'jogador' : 'jogadores'}`}</small></div></div></section>
    <div class="detail-columns"><article class="roster-panel"><div class="panel-head"><div><h2 class="panel-title">${interclass ? 'Escalação do 3º A' : 'Jogadores de cada time'}</h2><div class="panel-subtitle">${interclass ? 'Somente os jogadores da nossa turma têm estatísticas individuais' : 'As equipes são montadas novamente em cada partida'}</div></div><span class="goal-count">${match.total_players} jogadores</span></div><div class="team-roster-grid ${interclass ? 'interclass-roster-grid' : ''}">${rosterMarkup}</div></article>
    <article class="goals-panel"><div class="panel-head"><div><h2 class="panel-title">Gols da partida</h2><div class="panel-subtitle">${interclass ? 'Gols individuais do 3º A e total agregado do 2º Ano' : 'Os gols aparecem agrupados por jogador; use − para desfazer um gol'}</div></div><button class="btn btn-primary btn-small" data-action="new-goal">＋ Registrar gols</button></div><div class="goal-timeline">${goals}</div></article></div>
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
  const body = `<form id="playerForm" enctype="multipart/form-data"><div class="modal-body"><div class="form-grid"><div class="form-field full"><label for="playerName">Nome do jogador *</label><input id="playerName" name="name" maxlength="100" required value="${esc(player?.name || '')}" placeholder="Ex.: Gabriel Santos"></div><div class="form-field full"><label>Foto do jogador <span class="optional">(opcional)</span></label><div class="photo-upload"><div class="photo-preview" id="photoPreview">${player?.photo_path ? `<img src="${esc(player.photo_path)}" alt="Foto atual">` : esc(initials(player?.name || 'FS'))}</div><div style="min-width:0;flex:1"><input id="playerPhoto" name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><div class="form-help" style="margin-top:7px">JPG, PNG, WEBP ou GIF · até 5 MB</div></div></div></div></div></div><div class="modal-footer" style="display:none"></div></form>`;
  const footer = `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="playerForm" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Cadastrar jogador'}</button>`;
  modal(editing ? 'Editar jogador' : 'Novo jogador', editing ? 'Atualize o nome ou a foto.' : 'Cadastre somente o nome e, se quiser, uma foto do jogador.', body, footer);
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
  const interclass = form.querySelector('[name="opponent_type"]').value === 'second_year';
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
function openMatchModal() {
  const players = (state.players.length ? state.players : state.dashboard?.players || []).filter(p => p.is_active);
  if (!players.length) {
    toast('Cadastre pelo menos um jogador ativo antes de criar uma partida.', 'warning');
    openPlayerModal();
    return;
  }
  const defaultType = players.length < 2 ? 'second_year' : 'classmates';
  const playerRows = players.map(player => `<label class="participant-row"><input class="participant-check" type="checkbox" value="${player.id}"><span class="participant-player">${avatar(player, 'small')}<span style="min-width:0"><strong>${esc(player.name)}</strong></span></span><select class="participant-side" aria-label="Time de ${esc(player.name)}" disabled><option value="A">Time Vermelho</option><option value="B">Time Branco</option></select></label>`).join('');
  const body = `<form id="matchForm"><div class="modal-body"><div class="section-caption">01 · Tipo e data da partida</div><div class="form-grid"><div class="form-field full"><label for="opponentType">Tipo de partida *</label><select id="opponentType" name="opponent_type"><option value="classmates" ${defaultType === 'classmates' ? 'selected' : ''} ${players.length < 2 ? 'disabled' : ''}>Entre nós · somente 3º A</option><option value="second_year" ${defaultType === 'second_year' ? 'selected' : ''}>Interclasse · contra o 2º Ano (azul)</option></select><div class="form-help">No interclasse, o 2º Ano não precisa ser cadastrado: você registra apenas o total de gols deles.</div></div><div class="form-field full"><label for="matchDate">Data da partida *</label><input id="matchDate" name="played_on" type="date" required max="${todayIso()}" value="${todayIso()}"></div></div>
    <div class="section-caption" id="teamsCaption">02 · Monte as escalações</div><div class="participant-toolbar"><span id="selectedCount">0 selecionados</span><div class="participant-tools"><button type="button" data-action="select-all-players">Selecionar todos</button><button type="button" data-action="clear-players">Limpar</button></div></div><div class="participant-list">${playerRows}</div><div class="team-counts" id="teamCounts"><span><i class="legend-dot" style="background:var(--red)"></i><strong id="teamACount">0 jogadores</strong> no Time Vermelho</span><span><i class="legend-dot" style="background:#60636f"></i><strong id="teamBCount">0 jogadores</strong> no Time Branco</span></div><p class="form-help" style="margin-top:10px">Cada partida tem uma escalação independente. Nas partidas entre nós, os times podem ficar desbalanceados. Contra o 2º Ano, escolha todos os jogadores do 3º A que participaram.</p></div></form>`;
  const footer = `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="matchForm" class="btn btn-primary">Criar partida →</button>`;
  modal('Registrar partida', 'Escolha o tipo de confronto, a data e os jogadores do 3º A.', body, footer, true);
  modalRoot.querySelectorAll('.participant-check').forEach(check => check.addEventListener('change', () => {
    const interclass = document.getElementById('opponentType')?.value === 'second_year';
    const select = check.closest('.participant-row').querySelector('.participant-side');
    select.disabled = interclass || !check.checked;
    updateTeamCounts();
  }));
  modalRoot.querySelectorAll('.participant-side').forEach(select => select.addEventListener('change', updateTeamCounts));
  document.getElementById('opponentType')?.addEventListener('change', updateMatchFormMode);
  updateMatchFormMode();
}
function openGoalModal() {
  const match = state.matchDetail;
  if (!match) return;
  const interclass = match.opponent_type === 'second_year';
  const playersFor = side => match.players.filter(player => player.team_side === side).map(player => `
    <div class="goal-entry-row" data-player-id="${player.id}">
      <div class="goal-entry-player">${avatar(player, 'small')}<strong>${esc(player.name)}</strong></div>
      <label class="goal-count-field"><span>Gols</span><input type="number" min="0" max="99" value="0" data-goal-kind="goals" aria-label="Gols de ${esc(player.name)}"></label>
      <label class="goal-count-field own-goal-field"><span>Contra</span><input type="number" min="0" max="99" value="0" data-goal-kind="own_goals" aria-label="Gols contra de ${esc(player.name)}"></label>
    </div>`).join('') || '<div class="empty-inline">Nenhum jogador nesta equipe.</div>';
  const teamRows = interclass
    ? `<section class="goal-entry-team red-team"><div class="goal-entry-team-heading"><span class="team-color-dot"></span><strong>Jogadores do 3º A</strong></div>${playersFor('A')}</section><section class="goal-entry-team blue-team"><div class="goal-entry-team-heading"><span class="team-color-dot blue"></span><strong>2º Ano · total de gols</strong></div><div class="opponent-goals-input"><p>Informe quantos gols o 2º Ano marcou nesta etapa. Não é necessário cadastrar os jogadores deles.</p><label class="goal-count-field"><span>Gols do 2º Ano</span><input id="opponentGoals" name="opponent_goals" type="number" min="0" max="300" value="0" aria-label="Gols totais do 2º Ano"></label></div></section>`
    : `<section class="goal-entry-team red-team"><div class="goal-entry-team-heading"><span class="team-color-dot"></span><strong>${esc(match.team_a_name)}</strong></div>${playersFor('A')}</section><section class="goal-entry-team white-team"><div class="goal-entry-team-heading"><span class="team-color-dot dark"></span><strong>${esc(match.team_b_name)}</strong></div>${playersFor('B')}</section>`;
  const body = `<form id="goalForm"><div class="modal-body"><div class="goal-score-preview ${interclass ? 'goal-score-interclass' : ''}"><div class="score-side"><strong>${esc(match.team_a_name)}</strong></div><div class="score-big">${match.score_a}<span class="score-separator">:</span>${match.score_b}</div><div class="score-side"><strong>${esc(match.team_b_name)}</strong></div></div><p class="goal-form-instructions">${interclass ? 'Registre os gols de cada jogador do 3º A e informe o total marcado pelo 2º Ano. As quantidades serão somadas ao placar atual.' : 'Informe quantos gols novos cada jogador fez. Os valores são somados ao placar atual; não precisa lançar os gols um por um.'}</p><div class="goal-count-legend"><span>${interclass ? 'Gols individuais do 3º A' : 'Gols feitos pelo jogador'}</span><span>${interclass ? 'Gols totais do 2º Ano' : 'Gol contra (conta para o adversário)'}</span></div><div class="goal-entry-teams ${interclass ? 'goal-entry-interclass' : ''}">${teamRows}</div></div></form>`;
  const footer = `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="goalForm" class="btn btn-primary">Salvar gols</button>`;
  modal('Registrar gols', interclass ? 'Lance os gols do 3º A e o total do 2º Ano.' : 'Lance a quantidade de gols por jogador de uma só vez.', body, footer, true);
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
    own_goals: Number(row.querySelector('[data-goal-kind="own_goals"]').value || 0)
  }));
  const opponentGoals = Number(modalRoot.querySelector('#opponentGoals')?.value || 0);
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Salvando gols...'; }
  try {
    const result = await api(`/api/matches/${state.selectedMatch}/goals`, jsonOptions('POST', { entries, opponent_goals: opponentGoals }));
    toast(result.message || 'Gols registrados.');
    closeModal();
    await renderMatchDetail();
  } catch (error) {
    toast(error.message, 'error');
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Salvar gols'; }
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

// Delegated click actions keep the interface simple as each view is redrawn.
document.addEventListener('click', async event => {
  const navButton = event.target.closest('[data-view]');
  if (navButton) { await navigate(navButton.dataset.view); return; }
  const closeButton = event.target.closest('[data-modal-close]');
  if (closeButton) { closeModal(); return; }
  if (event.target === modalRoot) { closeModal(); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
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
      if (!state.players.length && !state.dashboard) { const r = await api('/api/players'); state.players = r.data; }
      openMatchModal();
    }
    else if (action === 'new-goal') openGoalModal();
    else if (action === 'open-match') { state.selectedMatch = id; state.view = 'matchDetail'; updateChrome(); await renderMatchDetail(); }
    else if (action === 'delete-match') await deleteMatch(id);
    else if (action === 'delete-goal') await deleteGoal(Number(button.dataset.matchId), id);
    else if (action === 'back-matches' || action === 'go-matches') await navigate('matches');
    else if (action === 'go-players') await navigate('players');
    else if (action === 'go-stats') await navigate('stats');
    else if (action === 'retry') await renderCurrent();
    else if (action === 'select-all-players') {
      modalRoot.querySelectorAll('.participant-check').forEach((check, index) => { check.checked = true; const select = check.closest('.participant-row').querySelector('.participant-side'); const interclass = document.getElementById('opponentType')?.value === 'second_year'; select.disabled = interclass ? true : false; select.value = interclass ? 'A' : (index % 2 === 0 ? 'A' : 'B'); }); updateTeamCounts();
    }
    else if (action === 'clear-players') {
      modalRoot.querySelectorAll('.participant-check').forEach(check => { check.checked = false; check.closest('.participant-row').querySelector('.participant-side').disabled = true; }); updateTeamCounts();
    }
  } catch (error) { toast(error.message, 'error'); }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
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
document.getElementById('quickAddPlayer').addEventListener('click', () => openPlayerModal());
document.getElementById('mobileMenu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

// Start by checking that the backend is reachable, then render the dashboard.
(async function boot() {
  try {
    await api('/api/health');
    await renderDashboard();
  } catch (error) {
    pageContent.innerHTML = `<div class="empty-state"><div class="empty-symbol">!</div><h3>Não foi possível conectar ao FutSENAI</h3><p>Confira se o servidor está iniciado com <strong>npm start</strong> e abra o site em <strong>http://localhost:3000</strong>.</p><p style="font-size:10px">Detalhe: ${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Tentar novamente</button></div>`;
  }
})();
