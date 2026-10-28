// actions.js
import { renderCurrent } from './router.js';
import { modalRoot, state } from './state.js';
import { closeModal, toast, updateChrome } from './ui.js';
import { jsonOptions } from './utils.js';
import { renderDashboard } from './views/dashboard.js';
import { renderMatchDetail } from './views/match-detail.js';
import { renderMatches } from './views/matches.js';
import { renderPlayers } from './views/players.js';
import { renderStats } from './views/stats.js';

import { api } from './api.js';

export async function refreshForCurrent() {
  closeModal();
  await renderCurrent();
}
export async function submitPlayerForm(form) {
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
export async function submitMatchForm(form) {
  const submitButton = modalRoot.querySelector('button[form="matchForm"][type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  const interclass = payload.opponent_type === 'second_year';
  const selectedPlayers = [...modalRoot.querySelectorAll('.participant-check:checked')];
  if (!interclass && selectedPlayers.some(check => !check.closest('.participant-row').querySelector('.participant-side').value)) {
    toast('Escolha um time para cada jogador selecionado.', 'warning');
    return;
  }
  const participants = selectedPlayers.map(check => ({ player_id: Number(check.value), team_side: interclass ? 'A' : check.closest('.participant-row').querySelector('.participant-side').value }));
  payload.participants = participants;
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Criando partida...'; }
  try {
    const result = await api('/api/matches', jsonOptions('POST', payload));
    toast(result.message || 'Partida criada.');
    closeModal();
    state.previousView = state.view;
    state.selectedMatch = result.data.id;
    state.view = 'matchDetail';
    updateChrome();
    await renderMatchDetail();
  } catch (error) {
    toast(error.message, 'error');
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Criar partida →'; }
  }
}
export async function submitGoalForm(form) {
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
export async function deletePlayer(id, archive = false) {
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
export async function deleteMatch(id) {
  if (!window.confirm('Excluir esta partida e todos os gols registrados nela? Essa ação não pode ser desfeita.')) return;
  try {
    const result = await api(`/api/matches/${id}`, { method: 'DELETE' });
    toast(result.message || 'Partida excluída.');
    state.selectedMatch = null;
    if (state.view === 'matchDetail') { state.view = 'matches'; updateChrome(); }
    await renderCurrent();
  } catch (error) { toast(error.message, 'error'); }
}
export async function deleteGoal(matchId, goalId) {
  if (!window.confirm('Remover este gol do placar?')) return;
  try {
    const result = await api(`/api/matches/${matchId}/goals/${goalId}`, { method: 'DELETE' });
    toast('Gol removido.');
    await renderMatchDetail();
  } catch (error) { toast(error.message, 'error'); }
}
export async function deleteAssist(matchId, playerId) {
  try {
    const result = await api(`/api/matches/${matchId}/assists/${playerId}`, { method: 'DELETE' });
    toast(result.message || 'Assistência removida.');
    await renderMatchDetail();
  } catch (error) { toast(error.message, 'error'); }
}
