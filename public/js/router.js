// router.js
import { pageContent, state } from './state.js';
import { setSidebarOpen, updateChrome } from './ui.js';
import { esc } from './utils.js';
import { renderDashboard } from './views/dashboard.js';
import { renderMatchDetail } from './views/match-detail.js';
import { renderMatches } from './views/matches.js';
import { renderPlayerDetail } from './views/player-detail.js';
import { renderPlayers } from './views/players.js';
import { renderStats } from './views/stats.js';
import { renderCompare } from './views/compare.js';

export async function navigate(view) {
  if (state.view !== view) state.previousView = state.view;
  state.view = view;
  state.selectedMatch = null;
  setSidebarOpen(false);
  updateChrome();
  await renderCurrent();
}
export async function renderCurrent() {
  updateChrome();
  try {
    if (state.view === 'dashboard') return await renderDashboard();
    if (state.view === 'players') return await renderPlayers();
    if (state.view === 'matches') return await renderMatches();
    if (state.view === 'stats') return await renderStats();
    if (state.view === 'compare') return await renderCompare();
    if (state.view === 'matchDetail') return await renderMatchDetail();
    if (state.view === 'playerDetail') return await renderPlayerDetail();
  } catch (error) {
    pageContent.innerHTML = `<div class="empty-state"><div class="empty-symbol">!</div><h3>Não foi possível carregar esta página</h3><p>${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Tentar novamente</button></div>`;
  }
}
