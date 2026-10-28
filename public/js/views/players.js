// views/players.js
import { playerCard, scopeFilterHtml } from '../components.js';
import { pageContent, state } from '../state.js';
import { setLoading, updateChrome } from '../ui.js';
import { esc } from '../utils.js';

import { api } from '../api.js';

export async function renderPlayers() {
  setLoading('Carregando elenco...');
  const result = await api(`/api/players?includeInactive=${state.playerStatus === 'all'}&scope=${state.statsScope}`);
  state.players = result.data;
  if (state.dashboard) state.dashboard.summary.activePlayers = state.players.filter(p => p.is_active).length;
  updateChrome();
  const active = state.players.filter(p => p.is_active).length;
  const filtered = state.players.filter(p => `${p.name}`.toLowerCase().includes(state.playerSearch.toLowerCase()));
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">ELENCO</div><h1>Jogadores<span style="color:var(--red)">.</span></h1><p>Overall da carta Incomum, foto e estatísticas de cada jogador — tudo em um só lugar.</p></div><div class="heading-actions"><button class="btn btn-primary" data-action="new-player">＋ Cadastrar jogador</button></div></section>
    <div class="toolbar"><label class="searchbox"><span>⌕</span><input id="playerSearch" type="search" placeholder="Buscar jogador pelo nome..." value="${esc(state.playerSearch)}" autocomplete="off"></label>${scopeFilterHtml()}<select class="filter-select" id="playerStatus"><option value="active" ${state.playerStatus === 'active' ? 'selected' : ''}>Jogadores ativos</option><option value="all" ${state.playerStatus === 'all' ? 'selected' : ''}>Incluir arquivados</option></select><span class="results-label" id="playerResultsLabel">${filtered.length} encontrados · ${active} ativos</span></div>
    <div class="player-grid" id="playerGrid">${filtered.length ? filtered.map(playerCard).join('') : `<div class="empty-state"><div class="empty-symbol">♟</div><h3>${state.playerSearch ? 'Nenhum jogador encontrado' : 'Seu elenco começa com um nome'}</h3><p>${state.playerSearch ? 'Tente buscar por outro nome.' : 'Cadastre seus amigos, coloque uma foto e comece a montar os times.'}</p>${state.playerSearch ? '' : '<button class="btn btn-primary" data-action="new-player">＋ Cadastrar primeiro jogador</button>'}</div>`}</div>`;
}
export function renderPlayerGridOnly() {
  const grid = document.getElementById('playerGrid');
  if (!grid) return;
  const filtered = state.players.filter(p => `${p.name}`.toLowerCase().includes(state.playerSearch.toLowerCase()));
  grid.innerHTML = filtered.length ? filtered.map(playerCard).join('') : `<div class="empty-state"><div class="empty-symbol">⌕</div><h3>Nenhum jogador encontrado</h3><p>Tente buscar por outro nome.</p></div>`;
  const active = state.players.filter(p => p.is_active).length;
  const label = document.getElementById('playerResultsLabel');
  if (label) label.textContent = `${filtered.length} encontrados · ${active} ativos`;
}
