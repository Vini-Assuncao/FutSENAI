// views/stats.js
import { avatar, rivalryPanel, scopeFilterHtml, statCard, statsSortHeader } from '../components.js';
import { pageContent, state } from '../state.js';
import { setLoading } from '../ui.js';
import { esc, initials, shortDate } from '../utils.js';

import { api } from '../api.js';

export async function renderStats() {
  setLoading('Calculando as estatísticas da turma...');
  const result = await api(`/api/stats?scope=${state.statsScope}`);
  state.stats = result;
  renderStatsContent();
}

// Marcos históricos: cada recorde leva à partida (ou ao jogador, nas sequências).
// Foto do jogador respeitando o modo anti-resenha e o modo somente leitura.
function holderPhotoSrc(holder) {
  const selected = state.antiResenha ? holder.photoReservePath || holder.photoPath : holder.photoPath;
  if (!selected) return null;
  return state.readOnly ? new URL(selected.replace(/^\/+/, ''), document.baseURI).href : selected;
}
const firstLetter = name => String(name || '?').trim().charAt(0).toUpperCase();
// "Heitor e Dutra" para dois; "Heitor, Dutra e Pietro" para três ou mais.
function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
// Ícone do marco: ícone padrão, foto de um jogador, duas fotos em diagonal ou as iniciais dos empatados.
function recordIconMarkup(item) {
  const holders = item.holders || [];
  if (!holders.length) return `<span class="record-icon" aria-hidden="true">${esc(item.icon)}</span>`;
  if (holders.length === 1) {
    const src = holderPhotoSrc(holders[0]);
    return `<span class="record-icon record-player-icon" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="">` : esc(initials(holders[0].playerName))}</span>`;
  }
  if (holders.length === 2) {
    const half = holder => {
      const src = holderPhotoSrc(holder);
      return src ? `<img src="${esc(src)}" alt="">` : `<span class="duo-initial">${esc(firstLetter(holder.playerName))}</span>`;
    };
    return `<span class="record-icon record-duo" aria-hidden="true"><span class="duo-half duo-top">${half(holders[0])}</span><span class="duo-half duo-bottom">${half(holders[1])}</span></span>`;
  }
  const letters = holders.map(holder => firstLetter(holder.playerName)).join(' ');
  return `<span class="record-icon record-trio" aria-hidden="true">${esc(letters)}</span>`;
}

// Marcos históricos: cada recorde leva à partida (ou ao jogador, nas sequências).
function recordRow(item) {
  const isPlayer = item.kind === 'player';
  const holders = item.holders || [];
  const names = joinNames(holders.map(holder => holder.playerName));
  const action = isPlayer
    ? `data-action="open-player-profile" data-id="${item.playerId}" aria-label="Abrir perfil de ${esc(names)}"`
    : `data-action="open-match" data-id="${item.matchId}" aria-label="Abrir a partida"`;
  let holder;
  let detail;
  if (isPlayer) {
    holder = `<strong class="record-names">${esc(names)}</strong>`;
    detail = item.from && item.to ? `${shortDate(item.from)} a ${shortDate(item.to)}` : `Sequência empatada`;
  } else {
    const m = item.match;
    const kind = m.opponent_type === 'second_year' ? 'Interclasse' : 'Entre nós';
    if (holders.length) {
      holder = `<strong class="record-names">${esc(names)}</strong>`;
      detail = `${shortDate(m.played_on, true)} · ${esc(m.team_a_name)} ${m.score_a}:${m.score_b} ${esc(m.team_b_name)}`;
    } else {
      holder = `<strong class="record-score-line">${esc(m.team_a_name)} ${m.score_a} : ${m.score_b} ${esc(m.team_b_name)}</strong>`;
      detail = `${shortDate(m.played_on, true)} · ${kind}`;
    }
  }
  const ties = !isPlayer && !holders.length && item.ties ? ` · +${item.ties} empatado(s)` : '';
  return `<div class="record-row" role="button" tabindex="0" ${action}>
    ${recordIconMarkup(item)}
    <div class="record-copy">
      <span class="record-title">${esc(item.title)}</span>
      ${holder}
      <small>${detail}${ties}</small>
    </div>
    <div class="record-value"><strong>${item.value}</strong><span>${esc(item.unit)}</span></div>
  </div>`;
}
function recordsPanel(records) {
  const items = records?.items || [];
  const body = items.length
    ? items.map(recordRow).join('')
    : '<div class="empty-inline"><strong>Sem marcos neste recorte</strong>Quando houver partidas registradas nesse filtro, os recordes aparecem aqui.</div>';
  return `<article class="panel records-panel" style="margin-top:17px"><div class="panel-head"><div><h2 class="panel-title">Marcos históricos</h2><div class="panel-subtitle">Recordes da turma · clique para ver a partida ou o jogador</div></div></div><div class="records-list">${body}</div></article>`;
}

export function renderStatsContent() {
  const result = state.stats;
  if (!result) return;
  const a = result.aggregate;
  const ranking = [...result.players].sort((left, right) => {
    const value = player => state.statsSort === 'ga' ? player.goals + player.assists : Number(player[state.statsSort]) || 0;
    const difference = value(left) - value(right);
    if (difference) return difference * (state.statsSortDirection === 'desc' ? -1 : 1);
    if (state.statsSort === 'goals') {
      const assistDifference = right.assists - left.assists;
      if (assistDifference) return assistDifference;
      const winDifference = right.wins - left.wins;
      if (winDifference) return winDifference;
    } else if (state.statsSort === 'ga') {
      const goalDifference = right.goals - left.goals;
      if (goalDifference) return goalDifference;
      const assistDifference = right.assists - left.assists;
      if (assistDifference) return assistDifference;
      const winDifference = right.wins - left.wins;
      if (winDifference) return winDifference;
    }
    return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
  });
  const tableRows = ranking.length ? ranking.map((p, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const numericCell = (key, value) => `<td class="num${state.statsSort === key ? ' is-sorted' : ''}">${value}</td>`;
    return `<tr class="${rankClass ? `rank-${rankClass}` : ''}" data-action="open-player-profile" data-id="${p.id}" tabindex="0" aria-label="Abrir detalhes de ${esc(p.name)}"><td><div class="player-cell"><span class="rank-number ${rankClass}">${i + 1}</span>${avatar(p)}<button type="button" class="player-profile-link" data-action="open-player-profile" data-id="${p.id}">${esc(p.name)}</button></div></td>${numericCell('matches_played', p.matches_played)}${numericCell('goals', p.goals)}${numericCell('assists', p.assists)}${numericCell('wins', p.wins)}${numericCell('losses', p.losses)}${numericCell('ga', p.goals + p.assists)}</tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty-inline"><strong>Sem estatísticas neste filtro</strong>Registre partidas e gols, ou selecione outro tipo de partida.</div></td></tr>`;
  const top = [...result.players].filter(player => player.goals > 0)
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists || right.wins - left.wins || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }))[0];
  const topWaiter = [...result.players].filter(player => player.assists > 0)
    .sort((left, right) => right.assists - left.assists || right.goals - left.goals || right.wins - left.wins || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }))[0];
  pageContent.innerHTML = `<section class="page-heading"><div><div class="eyebrow">NÚMEROS DO JOGO</div><h1>Estatísticas<span style="color:var(--red)">.</span></h1><p>Veja a evolução da turma, quem decide e como cada jogador contribui.</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="go-matches">Ver partidas</button></div></section>
    <div class="scope-filter-row">${scopeFilterHtml()}</div>
    <section class="stats-grid">${statCard('Partidas', a.matches, '⚑', 'De acordo com o filtro')}${statCard('Gols', a.goals, '⚽︎', 'Todos os gols desses jogos')}${statCard('Média por partida', a.averageGoals, '↗', 'Gols por jogo considerado')}${statCard('Empates', a.draws, '＝', 'Jogos que terminaram iguais')}</section>
    ${rivalryPanel(a.secondYearRivalry)}
    <div class="stats-page-grid"><article class="panel"><div class="panel-head"><div><h2 class="panel-title">Ranking dos jogadores</h2><div class="panel-subtitle">Gols, assistências e desempenho, clique nas colunas para ordenar</div></div></div><div class="table-wrap"><table class="stats-table"><colgroup><col class="stats-player-column"><col span="2" class="stats-number-column"><col class="stats-assists-column"><col span="3" class="stats-number-column"></colgroup><thead><tr><th>Jogador</th>${statsSortHeader('Jogos', 'matches_played')}${statsSortHeader('Gols', 'goals')}${statsSortHeader('Assistências', 'assists')}${statsSortHeader('Vitórias', 'wins')}${statsSortHeader('Derrotas', 'losses')}${statsSortHeader('G/A', 'ga')}</tr></thead><tbody>${tableRows}</tbody></table></div></article>
    <div><article class="stat-hero top-scorer-hero"><div class="stat-hero-copy"><div class="eyebrow">ARTILHEIRO</div><strong>${top ? `${esc(top.name)} - ${top.goals} ${top.goals === 1 ? 'gol' : 'gols'}` : '—'}</strong><p>${top ? `${esc(top.name)} lidera a artilharia.` : 'Quando houver gols nesse recorte, o destaque aparece aqui.'}</p></div>${top ? avatar(top, 'stat-hero-avatar') : ''}</article><article class="stat-hero top-waiter-hero"><div class="stat-hero-copy"><div class="eyebrow">GARÇOM</div><strong>${topWaiter ? `${esc(topWaiter.name)} - ${topWaiter.assists} ${topWaiter.assists === 1 ? 'assistência' : 'assistências'}` : '—'}</strong><p>${topWaiter ? `${esc(topWaiter.name)} lidera as assistências.` : 'Quando houver assistências nesse recorte, o destaque aparece aqui.'}</p></div>${topWaiter ? avatar(topWaiter, 'stat-hero-avatar') : ''}</article>${recordsPanel(result.records)}</div></div>`;
}
