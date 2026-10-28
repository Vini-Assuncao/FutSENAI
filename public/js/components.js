// components.js
import { state } from './state.js';
import { esc, initials, numericDate, playerOverall, shortDate } from './utils.js';

export function overallMarkup(overall, compact = false) {
  const value = Number.isInteger(overall) ? overall : '—';
  return `<span class="player-overall">${compact ? '<span class="player-overall-full">Overall</span><span class="player-overall-short" aria-hidden="true">Over</span>' : 'Overall'} <strong>${value}</strong></span>`;
}
export function avatar(person, extraClass = '') {
  const classes = `player-avatar ${extraClass}`.trim();
  const selectedPhoto = state.antiResenha
    ? person?.photo_reserve_path || person?.photo_path
    : person?.photo_path;
  const photoPath = selectedPhoto && state.readOnly
    ? new URL(selectedPhoto.replace(/^\/+/, ''), document.baseURI).href
    : selectedPhoto;
  const image = photoPath ? `<img src="${esc(photoPath)}" alt="Foto de ${esc(person.name)}" loading="lazy">` : esc(initials(person?.nickname || person?.name));
  const previewAttributes = photoPath ? ` role="button" tabindex="0" data-player-image aria-label="Ampliar foto de ${esc(person.name)}"` : '';
  return `<div class="${classes}"${previewAttributes}>${image}</div>`;
}
export function statCard(label, value, icon, foot) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
}
export function scopeFilterHtml() {
  return `<label class="scope-filter"><span>Partidas consideradas</span><select id="statsScope"><option value="internal" ${state.statsScope === 'internal' ? 'selected' : ''}>Somente entre nós · 3º A</option><option value="interclass" ${state.statsScope === 'interclass' ? 'selected' : ''}>Somente contra o 2º Ano</option></select></label>`;
}
export function rivalryPanel(rivalry) {
  const r = rivalry || { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
  return `<section class="rivalry-panel"><div class="rivalry-title"><div><div class="eyebrow">CONFRONTO INTERCLASSE</div><h2>3º A <span>×</span> 2º Ano</h2><p>Placar histórico entre as turmas, independente do filtro das estatísticas gerais.</p></div><div class="rivalry-blue-mark">2º</div></div><div class="rivalry-metrics"><div class="rivalry-metric red-metric"><span>Vitórias do 3º A</span><strong>${r.wins}</strong></div><div class="rivalry-metric"><span>Empates</span><strong>${r.draws}</strong></div><div class="rivalry-metric blue-metric"><span>Vitórias do 2º Ano</span><strong>${r.losses}</strong></div><div class="rivalry-metric"><span>Gols · 3º A : 2º Ano</span><strong>${r.goalsFor} : ${r.goalsAgainst}</strong></div></div><div class="rivalry-foot">${r.matches} ${r.matches === 1 ? 'partida interclasse registrada' : 'partidas interclasse registradas'}</div></section>`;
}
export function teamIconClass(match, side) {
  if (match.opponent_type === 'second_year') return side === 'A' ? 'red' : 'blue';
  return side === 'A' ? 'red' : 'dark';
}
export function renderMatchRow(match) {
  const opponent = match.opponent_type === 'second_year';
  const playersText = opponent ? `${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'} do 3º A` : `${match.total_players} ${match.total_players === 1 ? 'jogador' : 'jogadores'}`;
  return `<div class="match-row" data-action="open-match" data-id="${match.id}" tabindex="0" aria-label="Abrir detalhes da partida de ${shortDate(match.played_on, true)}"><div><div class="match-meta"><span class="match-date"><span class="match-date-full">${shortDate(match.played_on, true)}</span><span class="match-date-mobile">${numericDate(match.played_on)}</span></span><span>•</span><span>${playersText}</span><span>•</span><span>Quadra</span><span class="match-kind ${opponent ? 'interclass' : ''}">${opponent ? 'INTERCLASSE' : 'ENTRE NÓS'}</span></div><div class="match-teams"><div class="team-mini"><span class="team-badge ${teamIconClass(match, 'A')}">●</span><span>${esc(match.team_a_name)}</span></div><span class="versus">×</span><div class="team-mini"><span class="team-badge ${teamIconClass(match, 'B')}">●</span><span>${esc(match.team_b_name)}</span></div></div></div><div class="match-score">${match.score_a}<span class="dash">:</span>${match.score_b}</div></div>`;
}
export function scorerRow(player, index) {
  const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
  return `<div class="scorer-row ${rankClass ? `rank-${rankClass}` : ''}" data-action="open-player-profile" data-id="${player.id}" tabindex="0" aria-label="Abrir detalhes de ${esc(player.nickname || player.name)}"><div class="rank-number ${rankClass}">${String(index + 1).padStart(2, '0')}</div>${avatar(player, 'small')}<div class="scorer-info"><button type="button" class="player-profile-link" data-action="open-player-profile" data-id="${player.id}">${esc(player.nickname || player.name)}</button><span>${player.matches_played} partidas · ${player.wins} vitórias</span></div><div class="goal-count">${player.goals} gols</div></div>`;
}
export function playerCard(player) {
  const archived = !player.is_active;
  const overall = playerOverall(player.name);
  return `<article class="player-card" data-action="open-player-profile" data-id="${player.id}" role="group" tabindex="0" aria-label="Abrir detalhes de ${esc(player.name)}"><div class="player-card-head">${avatar(player)}<div class="player-card-name"><h3><button type="button" class="player-profile-link" data-action="open-player-profile" data-id="${player.id}">${esc(player.name)}</button>${archived ? '<span class="archived-label">ARQUIVADO</span>' : ''}</h3><p>${player.matches_played} ${player.matches_played === 1 ? 'partida disputada' : 'partidas disputadas'}</p>${overallMarkup(overall, true)}</div></div><div class="player-mini-stats"><div><strong>${player.matches_played}</strong><span>PARTIDAS</span></div><div><strong>${player.goals}</strong><span>GOLS</span></div><div><strong>${player.wins}</strong><span>VITÓRIAS</span></div></div><div class="player-card-actions"><button class="btn btn-secondary btn-small" data-action="edit-player" data-id="${player.id}">✎ Editar</button>${archived ? `<button class="btn btn-secondary btn-small" data-action="reactivate-player" data-id="${player.id}">Reativar</button>` : `<button class="btn btn-danger btn-small" data-action="archive-player" data-id="${player.id}">Arquivar</button>`}</div></article>`;
}
export function matchCard(match) {
  const interclass = match.opponent_type === 'second_year';
  const players = interclass ? `${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'} do 3º A` : `${match.total_players} ${match.total_players === 1 ? 'jogador' : 'jogadores'}`;
  const teamA = interclass ? '3º A' : 'Time Vermelho';
  const teamB = interclass ? '2º Ano' : 'Time Branco';
  return `<article class="match-card ${interclass ? 'match-card-interclass' : ''}" data-action="open-match" data-id="${match.id}" tabindex="0" aria-label="Abrir detalhes da partida de ${shortDate(match.played_on, true)}"><div class="match-card-top"><span><strong>${shortDate(match.played_on, true)}</strong> · Quadra <em class="match-kind ${interclass ? 'interclass' : ''}">${interclass ? 'INTERCLASSE' : 'ENTRE NÓS'}</em></span><span>${players}</span></div><div class="match-card-scoreboard"><div class="match-team-box"><div class="team-large-icon ${teamIconClass(match, 'A')}">●</div><strong title="${esc(teamA)}">${esc(teamA)}</strong><small>${match.players_a} ${match.players_a === 1 ? 'jogador' : 'jogadores'}</small></div><div class="scoreboard-score">${match.score_a}<span>:</span>${match.score_b}</div><div class="match-team-box"><div class="team-large-icon ${teamIconClass(match, 'B')}">●</div><strong title="${esc(teamB)}">${esc(teamB)}</strong><small>${interclass ? 'Placar total do adversário' : `${match.players_b} ${match.players_b === 1 ? 'jogador' : 'jogadores'}`}</small></div></div><div class="match-card-bottom"><span class="participants-label"><b>${match.total_goals}</b> gols · ${players}</span><div class="match-card-actions"><button data-action="open-match" data-id="${match.id}">Detalhes ↗</button><button data-action="delete-match" data-id="${match.id}">Excluir</button></div></div></article>`;
}
export function playerModeStats(title, subtitle, playerStats) {
  const stats = playerStats || { matches_played: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, win_rate: 0 };
  const values = [
    ['Partidas', stats.matches_played],
    ['Gols', stats.goals],
    ['Assistências', stats.assists],
    ['Vitórias', stats.wins],
    ['Empates', stats.draws],
    ['Derrotas', stats.losses]
  ];
  return `<section class="panel player-mode-panel"><div class="panel-head"><div><h2 class="panel-title">${title}</h2><div class="panel-subtitle">${subtitle}</div></div><span class="player-win-rate">${stats.win_rate}% vitórias</span></div><div class="player-mode-stats">${values.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div></section>`;
}
export function statsSortHeader(label, key) {
  const sorted = state.statsSort === key;
  const direction = sorted ? state.statsSortDirection : 'desc';
  const indicator = sorted ? (direction === 'desc' ? ' ↓' : ' ↑') : '';
  return `<th aria-sort="${sorted ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}"><button class="stats-sort-button${sorted ? ' active' : ''}" data-stats-sort="${key}" aria-label="Ordenar por ${label.toLowerCase()}${sorted ? ` em ordem ${direction === 'desc' ? 'decrescente' : 'crescente'}` : ''}">${label}${indicator}</button></th>`;
}
