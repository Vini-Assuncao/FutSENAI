// views/dashboard.js
import { renderMatchRow, rivalryPanel, scopeFilterHtml, scorerRow, statCard } from '../components.js';
import { canEdit, pageContent, state } from '../state.js';
import { setLoading, updateChrome } from '../ui.js';

import { api } from '../api.js';

export async function renderDashboard() {
  setLoading('Atualizando o placar da turma...');
  const result = await api(`/api/dashboard?scope=${state.statsScope}`);
  state.dashboard = result;
  state.players = result.players;
  updateChrome();
  const s = result.summary;
  const matchActionLabel = canEdit() ? 'Registrar partida' : 'Testar sorteio';
  const scorerHtml = result.topScorers.length ? result.topScorers.map(scorerRow).join('') : `<div class="empty-inline"><strong>Nenhuma estatística neste filtro</strong>Registre gols ou selecione outro tipo de partida.</div>`;
  const recentHtml = result.recentMatches.length ? result.recentMatches.map(renderMatchRow).join('') : `<div class="empty-inline"><strong>Nenhuma partida neste filtro</strong>Registre um jogo para ver o placar por aqui.</div>`;
  pageContent.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow">BEM-VINDO À QUADRA</div><h1>O jogo começa aqui<span style="color:var(--red)">.</span></h1><p>Organize a resenha, guarde os resultados e descubra quem está brilhando na quadra.</p></div><div class="heading-actions">${canEdit() ? '<button class="btn btn-secondary" data-action="new-player">＋ Novo jogador</button>' : ''}<button class="btn btn-primary" data-action="new-match">＋ ${matchActionLabel}</button></div></section>
    <div class="scope-filter-row">${scopeFilterHtml()}</div>
    <section class="stats-grid">
      ${statCard('Jogadores ativos', s.activePlayers, '♟', 'Elenco disponível do 3º A')}
      ${statCard('Partidas consideradas', s.totalMatches, '⚑', 'De acordo com o filtro acima')}
      ${statCard('Gols marcados', s.totalGoals, '⚽︎', 'Placar dos jogos selecionados')}
      ${statCard('Média de gols / jogo', s.averageGoals, '↗', 'Gols divididos pelas partidas filtradas')}
    </section>
    ${rivalryPanel(result.secondYearRivalry)}
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Últimas partidas</h2><div class="panel-subtitle">${state.statsScope === 'interclass' ? 'Somente jogos contra o 2º Ano' : 'Somente jogos entre jogadores do 3º A'}</div></div><button class="text-action" data-action="go-matches">Ver todas →</button></div><div class="match-list">${recentHtml}</div></article>
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Artilharia da turma</h2><div class="panel-subtitle">Gols</div></div><button class="text-action" data-action="go-stats">Ranking →</button></div><div class="scorer-list">${scorerHtml}</div></article>
    </section>
    <section class="dashboard-bottom ${state.antiResenha ? 'anti-resenha-dashboard' : ''}">
      ${state.antiResenha ? '' : '<article class="panel dashboard-ad-panel"><div class="panel-head"><div><h2 class="panel-title">Publicidade</h2><div class="panel-subtitle">Espaço publicitário do FutSENAI</div></div><span class="dashboard-ad-badge">ANÚNCIO</span></div><div class="dashboard-ad-content"><a href="https://www.tiktok.com/@falatuu.nyk" target="_blank" rel="noopener noreferrer" aria-label="Acessar o TikTok do NS13"><img src="assets/anuncio_ns13.png" alt="Publicidade NS13 — Ouça as novas músicas do NS13" loading="lazy"></a></div></article>'}
      <article class="panel quick-panel"><div class="panel-head"><div><h2 class="panel-title">Atalhos rápidos</h2><div class="panel-subtitle">Mais praticidade para organizar o jogo</div></div></div><div class="quick-actions">
        <button class="quick-action" data-action="new-match"><span class="quick-action-icon">⚑︎</span><span><strong>${canEdit() ? 'Nova partida' : 'Testar sorteio'}</strong><span>${canEdit() ? 'Monte os times e registre' : 'Prévia sem criar partida'}</span></span></button>
        <button class="quick-action" data-action="new-player"><span class="quick-action-icon">♟︎</span><span><strong>Novo jogador</strong><span>Adicione um amigo</span></span></button>
        <button class="quick-action" data-action="go-players"><span class="quick-action-icon">☷︎</span><span><strong>Elenco completo</strong><span>Fotos e dados da turma</span></span></button>
        <button class="quick-action" data-action="go-stats"><span class="quick-action-icon">↗︎</span><span><strong>Ver estatísticas</strong><span>Compare os números</span></span></button>
      </div></article>
    </section>`;
}
