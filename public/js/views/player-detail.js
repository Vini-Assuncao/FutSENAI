// views/player-detail.js
import { avatar, overallMarkup, playerModeStats } from '../components.js';
import { navigate } from '../router.js';
import { pageContent, state } from '../state.js';
import { setLoading, updateChrome } from '../ui.js';
import { esc, playerOverall, shortDate } from '../utils.js';

import { api } from '../api.js';

export async function renderPlayerDetail() {
  if (!state.selectedPlayerId) return navigate('players');
  setLoading('Carregando desempenho do jogador...');
  const result = await api(`/api/players/${state.selectedPlayerId}/history`);
  state.playerProfile = result.data;
  updateChrome();
  const { player, stats, matches } = result.data;
  const matchHistory = matches.length ? matches.map(match => {
    const interclass = match.opponent_type === 'second_year';
    const resultLabel = match.result === 'win' ? 'Vitória' : match.result === 'loss' ? 'Derrota' : 'Empate';
    const resultIcon = match.result === 'win' ? '✓' : match.result === 'loss' ? '↘' : '=';
    const resultClass = match.result === 'win' ? 'is-win' : match.result === 'loss' ? 'is-loss' : 'is-draw';
    const playerTeam = interclass ? '3º A' : match.team_side === 'A' ? 'Time Vermelho' : 'Time Branco';
    const gameType = interclass ? '⚔ CONTRA O 2º ANO' : '⚽ ENTRE NÓS · 3º A';
    return `<article class="player-history-match"><div class="player-history-match-date">${shortDate(match.played_on, true)}<span class="match-kind ${interclass ? 'interclass' : ''}">${gameType}</span></div><div class="player-history-match-score"><strong>${match.score_a}</strong><span>:</span><strong>${match.score_b}</strong></div><div class="player-history-match-detail"><span>${playerTeam}</span><span class="player-history-result ${resultClass}"><b aria-hidden="true">${resultIcon}</b> ${resultLabel}</span></div><div class="player-history-contributions"><span class="player-history-contribution is-goals"><span aria-hidden="true">⚽</span><strong class="${match.goals > 0 ? 'is-positive' : ''}">${match.goals}</strong><small>${match.goals === 1 ? 'gol' : 'gols'}</small></span><span class="player-history-contribution is-assists"><span aria-hidden="true">🎯</span><strong class="${match.assists > 0 ? 'is-positive' : ''}">${match.assists}</strong><small>assist.</small></span>${match.own_goals ? `<span class="player-history-contribution is-own-goals"><span aria-hidden="true">↩</span><strong>${match.own_goals}</strong><small>contra</small></span>` : ''}</div><button type="button" class="btn btn-secondary btn-small" data-action="open-match" data-id="${match.id}">Súmula ↗</button></article>`;
  }).join('') : '<div class="empty-inline"><strong>Nenhuma partida no histórico</strong>Quando o jogador participar de uma partida, o desempenho aparecerá aqui.</div>';
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">DESEMPENHO INDIVIDUAL</div><h1>Histórico do jogador<span style="color:var(--red)">.</span></h1><p>Estatísticas separadas por modo de jogo e partidas recentes em uma única linha do tempo.</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="back-player-profile">← Voltar</button><button class="btn btn-primary" data-action="compare-player" data-id="${player.id}">⚖ Comparar</button></div></section><section class="panel player-profile-hero"><div class="player-profile-identity">${avatar(player, 'player-profile-avatar')}<div><span class="eyebrow">${player.is_active ? 'JOGADOR ATIVO' : 'JOGADOR ARQUIVADO'}</span><h2>${esc(player.name)}</h2>${overallMarkup(playerOverall(player.name))}</div></div></section><div class="player-mode-grid">${playerModeStats('Entre nós · 3º A', 'Partidas entre jogadores da turma', stats.internal)}${playerModeStats('Interclasse · 2º Ano', 'Partidas contra o 2º Ano', stats.interclass)}</div><section class="panel player-history-panel"><div class="panel-head"><div><h2 class="panel-title">Últimas partidas</h2><div class="panel-subtitle">Os dois modos de jogo, em ordem da mais recente</div></div><span class="results-label">${matches.length} ${matches.length === 1 ? 'partida' : 'partidas'}</span></div><div class="player-history-list">${matchHistory}</div></section>`;
}
