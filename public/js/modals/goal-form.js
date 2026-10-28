// modals/goal-form.js
import { avatar } from '../components.js';
import { state } from '../state.js';
import { modal } from '../ui.js';
import { esc } from '../utils.js';

export function openGoalModal() {
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
