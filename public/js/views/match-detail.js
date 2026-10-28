// views/match-detail.js
import { avatar, teamIconClass } from '../components.js';
import { navigate } from '../router.js';
import { pageContent, state } from '../state.js';
import { setLoading, updateChrome } from '../ui.js';
import { esc, fullDate, goalTypeLabel, outcomeLabel, shortDate } from '../utils.js';

import { api } from '../api.js';

export async function renderMatchDetail() {
  if (!state.selectedMatch) return navigate('matches');
  setLoading('Abrindo a súmula da partida...');
  const result = await api(`/api/matches/${state.selectedMatch}`);
  const match = result.data;
  state.matchDetail = match;
  updateChrome();
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
    const author = aggregateOpponentGoal ? 'Gols totais do 2º Ano' : opponentOwnGoal ? 'Gol contra do 2º Ano' : goal.player_name ? `<button type="button" class="player-profile-link" data-action="open-player-profile" data-id="${goal.player_id}">${esc(goal.player_name)}</button>` : 'Autor não informado';
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
      return `<div class="roster-player">${avatar(player)}<div class="roster-player-info"><button type="button" class="player-profile-link" data-action="open-player-profile" data-id="${player.id}">${esc(player.name)}</button><small class="roster-player-stats">${statText}</small></div></div>`;
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
