// views/matches.js
import { matchCard, scopeFilterHtml } from '../components.js';
import { canEdit, pageContent, state } from '../state.js';
import { setLoading } from '../ui.js';
import { esc } from '../utils.js';

import { api } from '../api.js';

export async function renderMatches() {
  setLoading('Buscando o histórico das partidas...');
  const result = await api(`/api/matches?scope=${state.statsScope}`);
  state.matches = result.data;
  const filtered = state.matches.filter(m => `${m.played_on}`.toLowerCase().includes(state.matchSearch.toLowerCase()));
  const matchActionLabel = canEdit() ? 'Registrar partida' : 'Testar sorteio';
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">HISTÓRICO</div><h1>Partidas<span style="color:var(--red)">.</span></h1><p>Cada jogo tem sua escalação, seu placar e sua própria história.</p></div><div class="heading-actions"><button class="btn btn-primary" data-action="new-match">＋ ${matchActionLabel}</button></div></section><div class="toolbar"><label class="searchbox"><span>⌕</span><input id="matchSearch" type="search" placeholder="Buscar por data (AAAA-MM-DD)..." value="${esc(state.matchSearch)}" autocomplete="off"></label>${scopeFilterHtml()}<span class="results-label" id="matchResultsLabel">${filtered.length} partidas encontradas</span></div><div class="match-cards" id="matchCards">${filtered.length ? filtered.map(matchCard).join('') : `<div class="empty-state"><div class="empty-symbol">⚑</div><h3>${state.matchSearch ? 'Nenhuma partida encontrada' : 'O apito inicial está esperando'}</h3><p>${state.matchSearch ? 'Tente outra data ou limpe a busca.' : canEdit() ? 'Registre uma partida, distribua os jogadores entre os times e anote cada gol.' : 'Teste o sorteio de times com os jogadores ativos sem criar uma partida.'}</p>${state.matchSearch ? '' : `<button class="btn btn-primary" data-action="new-match">＋ ${matchActionLabel}</button>`}</div>`}</div>`;
}
export function renderMatchCardsOnly() {
  const container = document.getElementById('matchCards');
  if (!container) return;
  const filtered = state.matches.filter(m => `${m.played_on}`.toLowerCase().includes(state.matchSearch.toLowerCase()));
  container.innerHTML = filtered.length ? filtered.map(matchCard).join('') : `<div class="empty-state"><div class="empty-symbol">⌕</div><h3>Nenhuma partida encontrada</h3><p>Tente outra data ou limpe a busca.</p></div>`;
  const label = document.getElementById('matchResultsLabel');
  if (label) label.textContent = `${filtered.length} partidas encontradas`;
}
