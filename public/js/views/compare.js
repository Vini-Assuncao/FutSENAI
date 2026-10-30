// views/compare.js
import { avatar, teamIconClass } from '../components.js';
import { pageContent, state } from '../state.js';
import { setLoading } from '../ui.js';
import { esc, shortDate } from '../utils.js';
import { api } from '../api.js';
import { getUncommonCard, renderCardHtml, prepareCardAssets } from '../cards/futsenai-cards.js';

const SCOPE_LABELS = {
  internal: 'Entre nós · 3º A',
  interclass: 'Contra o 2º Ano'
};

const ATTRIBUTES = [
  ['pace', 'Velocidade', '➤'],
  ['shooting', 'Chute', '◎'],
  ['passing', 'Passe', '⇆'],
  ['dribbling', 'Drible', '⟳'],
  ['defending', 'Defesa', '▣'],
  ['physical', 'Físico', '◆']
];

const average = values => {
  const numbers = values.filter(value => Number.isFinite(value));
  return numbers.length === values.length && numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
};

// Cada linha de estatística: como ler o valor de cada jogador e quem é melhor nela.
// `better` é 'higher' (mais é melhor), 'lower' (menos é melhor) ou null (sem vencedor).
// `hideWhenZero` esconde a linha quando os dois valores são zero (ex.: empates).
// `scores` indica se o grupo conta para o placar de liderança no topo.
const PERFORMANCE_GROUP = {
  title: 'Desempenho no recorte',
  scores: true,
  rows: [
    { label: '⚑ Partidas', get: ({ stats }) => stats.matches_played, better: 'higher' },
    { label: '✦ Vitórias', get: ({ stats }) => stats.wins, better: 'higher' },
    { label: '＝ Empates', get: ({ stats }) => stats.draws, better: null, hideWhenZero: true },
    { label: '✖ Derrotas', get: ({ stats }) => stats.losses, better: 'lower' },
    { label: '↗ Aproveitamento', get: ({ stats }) => stats.win_rate, better: 'higher', format: v => `${v}%` },
    { label: '⚽︎ Gols', get: ({ stats }) => stats.goals, better: 'higher' },
    { label: '♕ Assistências', get: ({ stats }) => stats.assists, better: 'higher' },
    { label: '✚ Participações em gol', get: ({ stats }) => stats.ga, better: 'higher' },
    { label: '⌀ Gols por partida', get: ({ stats }) => stats.goals_per_match, better: 'higher', format: v => v.toFixed(2) }
  ]
};

const CARD_GROUP = {
  title: 'Carta Incomum',
  subtitle: 'Overall e atributos da versão Incomum de cada jogador',
  scores: false,
  rows: [
    { label: '◈ Overall', get: ({ card }) => card?.overall ?? null, better: 'higher' },
    ...ATTRIBUTES.map(([key, label, symbol]) => ({ label: `${symbol} ${label}`, get: ({ card }) => card?.[key] ?? null, better: 'higher' })),
    {
      label: '∑ Média dos atributos',
      get: ({ card }) => card ? average(ATTRIBUTES.map(([key]) => card[key])) : null,
      better: 'higher',
      format: v => v.toFixed(1)
    }
  ]
};

function winnerOf(valueA, valueB, better) {
  if (!better || valueA === null || valueB === null || valueA === undefined || valueB === undefined) return null;
  if (valueA === valueB) return 'tie';
  const aIsBetter = better === 'higher' ? valueA > valueB : valueA < valueB;
  return aIsBetter ? 'a' : 'b';
}

function displayValue(value, format) {
  if (value === null || value === undefined) return '—';
  return format ? format(value) : esc(value);
}

function statRow(definition, sideA, sideB, scoreBoard) {
  const valueA = definition.get(sideA);
  const valueB = definition.get(sideB);
  if (definition.hideWhenZero && valueA === 0 && valueB === 0) return '';
  const winner = winnerOf(valueA, valueB, definition.better);
  if (scoreBoard && winner && winner !== 'tie') scoreBoard[winner]++;
  const cellClass = side => winner === side ? ' is-best' : '';
  const mark = side => winner === side ? '<span class="best-mark" aria-label="Melhor nesta estatística">★</span>' : '';
  return `<tr>
    <th scope="row">${esc(definition.label)}</th>
    <td class="num${cellClass('a')}">${mark('a')}${displayValue(valueA, definition.format)}</td>
    <td class="num${cellClass('b')}">${mark('b')}${displayValue(valueB, definition.format)}</td>
  </tr>`;
}

function statTable(group, sideA, sideB, scoreBoard, playerA, playerB) {
  return `<div class="table-wrap">
    <table class="stats-table compare-table">
      <thead><tr><th>Estatística</th><th class="num">${esc(playerA.name)}</th><th class="num">${esc(playerB.name)}</th></tr></thead>
      <tbody>${group.rows.map(row => statRow(row, sideA, sideB, group.scores ? scoreBoard : null)).join('')}</tbody>
    </table>
  </div>`;
}

function formChips(results) {
  if (!results.length) return '<span class="compare-muted">Sem partidas no recorte</span>';
  return results.map(result => {
    const label = result === 'W' ? 'V' : result === 'D' ? 'E' : 'D';
    const title = result === 'W' ? 'Vitória' : result === 'D' ? 'Empate' : 'Derrota';
    return `<span class="form-chip form-${result.toLowerCase()}" title="${title}">${label}</span>`;
  }).join('');
}

const resultLabel = result => result === 'W' ? 'Vitória' : result === 'D' ? 'Empate' : 'Derrota';

// Junta as partes do texto, deixando de fora o empate quando ele não aconteceu.
function joinParts(parts) {
  return parts.filter(Boolean).join(' · ');
}

function duelSummaryText(totals, playerA, playerB) {
  return {
    together: joinParts([
      `${totals.together.wins} vitória(s) juntos`,
      totals.together.draws ? `${totals.together.draws} empate(s)` : null,
      `${totals.together.losses} derrota(s)`
    ]),
    opposed: joinParts([
      `${esc(playerA.name)} venceu ${totals.opposed.a_wins}`,
      `${esc(playerB.name)} venceu ${totals.opposed.b_wins}`,
      totals.opposed.draws ? `${totals.opposed.draws} empate(s)` : null
    ])
  };
}

// Quem venceu a partida do ponto de vista de cada jogador e, quando há vencedor, a foto dele.
function duelWinnerBadge(match, playerA, playerB) {
  if (match.together) {
    if (match.a.result === 'W') return `<div class="duel-winner is-together-win">${avatar(playerA, 'duel-winner-avatar')}${avatar(playerB, 'duel-winner-avatar')}<span>Vitória juntos</span></div>`;
    if (match.a.result === 'D') return '<div class="duel-winner is-draw"><span>Empate juntos</span></div>';
    return '<div class="duel-winner is-loss"><span>Derrota juntos</span></div>';
  }
  if (match.a.result === 'W') return `<div class="duel-winner">${avatar(playerA, 'duel-winner-avatar')}<span>Venceu: <strong>${esc(playerA.name)}</strong></span></div>`;
  if (match.b.result === 'W') return `<div class="duel-winner">${avatar(playerB, 'duel-winner-avatar')}<span>Venceu: <strong>${esc(playerB.name)}</strong></span></div>`;
  return '<div class="duel-winner is-draw"><span>Empate</span></div>';
}

// Cartão de confronto no mesmo formato dos últimos jogos da visão geral; clicar abre a súmula.
function duelCard(match, playerA, playerB) {
  const tag = match.together ? 'Mesmo time' : 'Confronto direto';
  const playerLine = (player, side) => `<div class="duel-player is-${side.result.toLowerCase()}">
      <span class="duel-name">${esc(player.name)}</span>
      <em class="result-${side.result.toLowerCase()}">${resultLabel(side.result)}</em>
      <small>⚽︎ ${side.goals} · ♕ ${side.assists}</small>
    </div>`;
  return `<article class="duel-card ${match.together ? 'is-together' : 'is-opposed'}" data-action="open-match" data-id="${match.id}" tabindex="0" aria-label="Abrir súmula da partida de ${shortDate(match.played_on, true)}">
    <div class="duel-card-top">
      <span class="duel-date">${shortDate(match.played_on, true)}</span>
      <span class="duel-tag">${tag}</span>
    </div>
    <div class="duel-card-score">
      <div class="duel-team"><span class="team-badge ${teamIconClass(match, 'A')}">●</span><strong>${esc(match.team_a_name)}</strong></div>
      <div class="match-score">${match.score_a}<span class="dash">:</span>${match.score_b}</div>
      <div class="duel-team"><span class="team-badge ${teamIconClass(match, 'B')}">●</span><strong>${esc(match.team_b_name)}</strong></div>
    </div>
    <div class="duel-card-players">
      ${playerLine(playerA, match.a)}
      ${playerLine(playerB, match.b)}
    </div>
    <div class="duel-card-foot">${duelWinnerBadge(match, playerA, playerB)}<span class="duel-open">Ver súmula ↗</span></div>
  </article>`;
}

function duelList(matches, playerA, playerB) {
  if (!matches.length) return `<div class="empty-inline"><strong>Nenhum confronto direto</strong>${esc(playerA.name)} e ${esc(playerB.name)} não jogaram a mesma partida neste recorte.</div>`;
  return `<div class="duel-grid">${matches.map(match => duelCard(match, playerA, playerB)).join('')}</div>`;
}

// Quem lidera um recorte: a foto do jogador que venceu mais vezes; sem foto quando empatam.
function leaderBadge(totals, playerA, playerB, aCount, bCount) {
  if (aCount === bCount) return '';
  return avatar(aCount > bCount ? playerA : playerB, 'leader-avatar');
}

function cardSlot(player, card) {
  return card
    ? `<div class="compare-card-slot">${renderCardHtml(card)}</div>`
    : `<div class="compare-card-slot"><div class="fsc-empty compare-no-card"><strong>${esc(player.name)} ainda não tem carta Incomum</strong>Nenhum jogador do FutSENAI Cards corresponde a este nome.</div></div>`;
}

function headerPlayer(player, side) {
  return `<div class="compare-head-player side-${side}">
    ${avatar(player, 'compare-avatar')}
    <strong>${esc(player.name)}</strong>
  </div>`;
}

function renderResult(result, playerA, playerB, cardA, cardB) {
  const scoreBoard = { a: 0, b: 0 };
  const sideA = { scope: result.scope, stats: result.a, player: result.a, card: cardA };
  const sideB = { scope: result.scope, stats: result.b, player: result.b, card: cardB };
  const performanceTable = statTable(PERFORMANCE_GROUP, sideA, sideB, scoreBoard, playerA, playerB);
  const cardTable = statTable(CARD_GROUP, sideA, sideB, null, playerA, playerB);

  const totals = result.headToHead.totals;
  const text = duelSummaryText(totals, playerA, playerB);
  const leader = scoreBoard.a === scoreBoard.b
    ? 'Empate'
    : scoreBoard.a > scoreBoard.b ? `${esc(playerA.name)} lidera` : `${esc(playerB.name)} lidera`;
  const leaderPhoto = leaderBadge(totals, playerA, playerB, scoreBoard.a, scoreBoard.b);
  const duelLeaderPhoto = leaderBadge(totals, playerA, playerB, totals.opposed.a_wins, totals.opposed.b_wins);
  const scoreboard = `<div class="compare-scoreboard">
    <div class="compare-score-side side-a"><span>${esc(playerA.name)}</span><strong>${scoreBoard.a}</strong><small>estatísticas que lidera</small></div>
    <div class="compare-score-mid">${leaderPhoto}<span>${leader}</span></div>
    <div class="compare-score-side side-b"><span>${esc(playerB.name)}</span><strong>${scoreBoard.b}</strong><small>estatísticas que lidera</small></div>
  </div>`;

  pageContent.innerHTML = `
    <section class="page-heading">
      <div>
        <div class="eyebrow">CONFRONTO ENTRE JOGADORES</div>
        <h1>Comparar<span style="color:var(--red)">.</span></h1>
        <p>${esc(SCOPE_LABELS[result.scope])} · ${result.scope === 'interclass' ? 'partidas contra o 2º Ano' : 'partidas entre jogadores do 3º A'}</p>
      </div>
    </section>
    ${pickerHtml(playerA.id, playerB.id)}
    <section class="compare-hero panel">
      ${headerPlayer(playerA, 'a')}
      <div class="compare-vs">×</div>
      ${headerPlayer(playerB, 'b')}
    </section>
    ${scoreboard}
    <section class="compare-duel-panel panel">
      <div class="panel-head">
        <div><h2 class="panel-title">Confronto direto</h2><div class="panel-subtitle">Partidas em que os dois jogaram no mesmo recorte</div></div>
        <span class="results-label">${result.headToHead.matches.length} ${result.headToHead.matches.length === 1 ? 'partida' : 'partidas'}</span>
      </div>
      <div class="duel-summary">
        <div class="duel-stat duel-stat-together"><span>Mesmo time</span><strong>${totals.together.matches}</strong><small>${text.together}</small></div>
        <div class="duel-stat duel-stat-opposed"><span>Confrontos diretos</span><strong>${totals.opposed.matches}</strong><small>${text.opposed}</small>${duelLeaderPhoto ? `<div class="duel-stat-leader">${duelLeaderPhoto}</div>` : ''}</div>
      </div>
      <div class="duel-list">${duelList(result.headToHead.matches, playerA, playerB)}</div>
    </section>
    <section class="compare-form-panel panel">
      <div class="panel-head"><div><h2 class="panel-title">Forma recente</h2><div class="panel-subtitle">Últimas 5 partidas no recorte, da mais recente para a mais antiga</div></div></div>
      <div class="form-row"><span>${esc(playerA.name)}</span><div>${formChips(result.a.form)}</div></div>
      <div class="form-row"><span>${esc(playerB.name)}</span><div>${formChips(result.b.form)}</div></div>
    </section>
    <article class="panel compare-section">
      <div class="panel-head"><div><h2 class="panel-title">Desempenho no recorte</h2><div class="panel-subtitle">${esc(SCOPE_LABELS[result.scope])}</div></div></div>
      ${performanceTable}
    </article>
    <article class="panel compare-section compare-section-cards">
      <div class="panel-head"><div><h2 class="panel-title">${esc(CARD_GROUP.title)}</h2><div class="panel-subtitle">${esc(CARD_GROUP.subtitle)}</div></div></div>
      <div class="compare-card-layout">
        <div class="compare-card-stats">${cardTable}</div>
        <div class="compare-cards">
          ${cardSlot(playerA, cardA)}
          ${cardSlot(playerB, cardB)}
        </div>
      </div>
    </article>`;

  pageContent.querySelectorAll('.fsc-photo').forEach(img => {
    img.addEventListener('error', () => img.classList.add('is-missing'), { once: true });
  });
}

function pickerHtml(selectedA, selectedB) {
  const players = state.comparePlayers || [];
  const options = selectedId => players.map(player => `<option value="${player.id}" ${player.id === selectedId ? 'selected' : ''}>${esc(player.name)}</option>`).join('');
  return `<section class="compare-picker panel">
    <label class="compare-field"><span>Partidas consideradas</span>
      <select id="compareScope">
        <option value="internal" ${state.compareScope === 'internal' ? 'selected' : ''}>Entre nós · 3º A</option>
        <option value="interclass" ${state.compareScope === 'interclass' ? 'selected' : ''}>Contra o 2º Ano</option>
      </select>
    </label>
    <label class="compare-field"><span>Jogador 1</span>
      <select id="compareA"><option value="">Escolha um jogador</option>${options(selectedA)}</select>
    </label>
    <div class="compare-vs compare-vs-picker">×</div>
    <label class="compare-field"><span>Jogador 2</span>
      <select id="compareB"><option value="">Escolha um jogador</option>${options(selectedB)}</select>
    </label>
  </section>`;
}

export async function renderCompare() {
  setLoading('Carregando jogadores...');
  prepareCardAssets();
  const list = await api('/api/players');
  state.comparePlayers = list.data
    .filter(player => player.is_active)
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
  const { a, b } = state.compare;
  const playerA = state.comparePlayers.find(player => player.id === a);
  const playerB = state.comparePlayers.find(player => player.id === b);

  if (!playerA || !playerB || playerA.id === playerB.id) {
    const hint = playerA && playerB && playerA.id === playerB.id
      ? 'Escolha dois jogadores diferentes.'
      : 'Escolha dois jogadores para ver o confronto, as estatísticas e as cartas Incomum.';
    pageContent.innerHTML = `
      <section class="page-heading">
        <div><div class="eyebrow">CONFRONTO ENTRE JOGADORES</div><h1>Comparar<span style="color:var(--red)">.</span></h1><p>Coloque dois jogadores frente a frente, no 3º A ou contra o 2º Ano.</p></div>
      </section>
      ${pickerHtml(a, b)}
      <div class="empty-state compare-empty"><div class="empty-symbol">⚖</div><h3>${esc(hint)}</h3></div>`;
    return;
  }

  const result = await api(`/api/compare?a=${playerA.id}&b=${playerB.id}&scope=${state.compareScope}`);
  const cardA = getUncommonCard(playerA.name);
  const cardB = getUncommonCard(playerB.name);
  renderResult(result, playerA, playerB, cardA, cardB);
}
