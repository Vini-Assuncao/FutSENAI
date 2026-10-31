// events.js
import { deleteAssist, deleteGoal, deleteMatch, deletePlayer, submitGoalForm, submitMatchForm, submitPlayerForm } from './actions.js';
import { readOnlyActions } from './config.js';
import { drawTeams, revealNextPlayer } from './draw/teams.js';
import { openGoalModal } from './modals/goal-form.js';
import { openPlayerImagePreview } from './modals/image-preview.js';
import { clearTeamDraw, openMatchModal, updateTeamCounts } from './modals/match-form.js';
import { openPlayerModal } from './modals/player-form.js';
import { navigate, renderCurrent } from './router.js';
import { canEdit, modalRoot, saveAntiResenhaPreference, state } from './state.js';
import { closeModal, modal, setSidebarOpen, toast, updateChrome } from './ui.js';
import { renderMatchDetail } from './views/match-detail.js';
import { renderMatchCardsOnly } from './views/matches.js';
import { renderPlayerDetail } from './views/player-detail.js';
import { renderPlayerGridOnly, renderPlayers } from './views/players.js';
import { renderStatsContent } from './views/stats.js';

import { api } from './api.js';

export let brandClickCount = 0;
export let brandClickTimer = null;


// Registra os ouvintes globais (cliques delegados, teclado, formulários e busca).
export function bindGlobalEvents() {
  document.addEventListener('click', async event => {
    const brand = event.target.closest('.brand, .mobile-brand');
    if (brand) {
      event.preventDefault();
      brandClickCount++;
      if (brandClickTimer !== null) window.clearTimeout(brandClickTimer);
      brandClickTimer = window.setTimeout(() => { brandClickCount = 0; brandClickTimer = null; }, 1600);
      if (brandClickCount >= 5) {
        event.preventDefault();
        brandClickCount = 0;
        window.clearTimeout(brandClickTimer);
        brandClickTimer = null;
        state.antiResenha = !state.antiResenha;
        const preferenceSaved = saveAntiResenhaPreference(state.antiResenha);
        updateChrome();
        if (!preferenceSaved) toast('A preferência do modo anti-resenha não pôde ser salva neste navegador.', 'warning');
        await renderCurrent();
        return;
      }
      if (state.view !== 'dashboard') await navigate('dashboard');
      return;
    }
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
    const imagePreview = event.target.closest('[data-player-image-lightbox]');
    if (imagePreview && (event.target === imagePreview || event.target.closest('[data-image-preview-close]'))) {
      closeModal();
      return;
    }
    const playerImage = event.target.closest('[data-player-image]');
    if (playerImage) {
      const image = playerImage.querySelector('img');
      if (image) openPlayerImagePreview(image, image.alt);
      return;
    }
    const breadcrumbButton = event.target.closest('[data-crumb-view]');
    if (breadcrumbButton && breadcrumbButton.dataset.crumbView) {
      await navigate(breadcrumbButton.dataset.crumbView);
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
    if (!canEdit() && readOnlyActions.has(action)) {
      toast('Edição disponível somente no servidor local em http://localhost:3000.', 'error');
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
        openMatchModal(!canEdit());
      }
      else if (action === 'new-goal') openGoalModal();
      else if (action === 'open-match') { state.previousView = state.view; state.matchDetail = null; state.selectedMatch = id; state.view = 'matchDetail'; updateChrome(); await renderMatchDetail(); }
      else if (action === 'delete-match') await deleteMatch(id);
      else if (action === 'delete-goal') await deleteGoal(Number(button.dataset.matchId), id);
      else if (action === 'delete-assist') await deleteAssist(Number(button.dataset.matchId), id);
      else if (action === 'back-matches' || action === 'go-matches') await navigate('matches');
      else if (action === 'go-players') await navigate('players');
      else if (action === 'go-stats') await navigate('stats');
      else if (action === 'scroll-team') document.getElementById('teamSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (action === 'compare-player') {
        // Abre a comparação já com este jogador no primeiro espaço; o segundo fica para ser escolhido.
        state.compare = { a: id, b: state.compare.b === id ? null : state.compare.b };
        await navigate('compare');
      }
      else if (action === 'open-player-profile') {
        state.playerDetailReturnView = state.view === 'matchDetail' || state.view === 'playerDetail' ? 'matches' : state.view;
        state.previousView = state.view;
        state.selectedPlayerId = id;
        state.playerProfile = null;
        state.view = 'playerDetail';
        setSidebarOpen(false);
        updateChrome();
        await renderPlayerDetail();
      }
      else if (action === 'back-player-profile') await navigate(state.playerDetailReturnView || 'players');
      else if (action === 'retry') await renderCurrent();
      else if (action === 'select-all-players') {
        modalRoot.querySelectorAll('.participant-check').forEach((check, index) => { check.checked = true; const select = check.closest('.participant-row').querySelector('.participant-side'); const interclass = document.getElementById('opponentType')?.value === 'second_year'; select.disabled = interclass ? true : false; select.value = interclass ? 'A' : (index % 2 === 0 ? 'A' : 'B'); }); clearTeamDraw(); updateTeamCounts();
      }
      else if (action === 'clear-players') {
        modalRoot.querySelectorAll('.participant-check').forEach(check => { check.checked = false; check.closest('.participant-row').querySelector('.participant-side').disabled = true; }); clearTeamDraw(); updateTeamCounts();
      }
      else if (action === 'draw-teams' || action === 'reroll-teams') drawTeams();
      else if (action === 'reveal-next-player') revealNextPlayer(button);
    } catch (error) { toast(error.message, 'error'); }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalRoot.querySelector('[data-player-image-lightbox]')) {
      closeModal();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('[data-player-image]')) {
      event.preventDefault();
      const image = event.target.closest('[data-player-image]').querySelector('img');
      if (image) openPlayerImagePreview(image, image.alt);
      return;
    }
    const clickableRow = event.target.closest?.([
      '.player-card[data-action="open-player-profile"]',
      '.scorer-row[data-action="open-player-profile"]',
      '.stats-table tr[data-action="open-player-profile"]',
      '.match-row[data-action="open-match"]',
      '.match-card[data-action="open-match"]',
      '.record-row[data-action]'
    ].join(','));
    if (clickableRow && event.target === clickableRow && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      clickableRow.click();
    }
  });

  document.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    if (!canEdit()) {
      toast('Edição disponível somente no servidor local em http://localhost:3000.', 'error');
      return;
    }
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
    if (event.target.id === 'compareScope') { state.compareScope = event.target.value; await renderCurrent(); }
    if (event.target.id === 'compareA' || event.target.id === 'compareB') {
      state.compare[event.target.id === 'compareA' ? 'a' : 'b'] = Number(event.target.value) || null;
      await renderCurrent();
    }
  });
  document.getElementById('mobileMenu').addEventListener('click', () => {
    setSidebarOpen(!document.getElementById('sidebar').classList.contains('open'));
  });

  // Atualiza o card do jornal sem bloquear o carregamento do painel.
}
