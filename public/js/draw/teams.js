// draw/teams.js
import { avatar } from '../components.js';
import { MAX_DRAW_OVERALL_AVERAGE_GAP_TENTHS } from '../config.js';
import { updateTeamCounts } from '../modals/match-form.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import { esc, playerOverall } from '../utils.js';

export function drawTeams() {
  if (document.getElementById('opponentType')?.value === 'second_year') {
    toast('O sorteio de dois times está disponível nas partidas entre nós.', 'warning');
    return;
  }
  const selected = [...modalRoot.querySelectorAll('.participant-check:checked')];
  if (selected.length < 2) {
    toast('Selecione pelo menos dois jogadores para sortear os times.', 'warning');
    return;
  }

  const chosenPlayers = selected.map(check => {
    const player = state.players.find(item => item.id === Number(check.value))
      || state.dashboard?.players.find(item => item.id === Number(check.value));
    if (!player) return { player: null, check, overall: null };
    return { player, check, overall: playerOverall(player.name) };
  });
  const unavailablePlayers = chosenPlayers.filter(item => !item.player || !Number.isInteger(item.overall));
  if (unavailablePlayers.length) {
    const names = unavailablePlayers.map(item => item.player?.name || 'jogador selecionado').join(', ');
    toast(`Não foi possível calcular o Overall da carta Incomum para: ${names}. Confira se esses jogadores têm cards no FutSENAI Cards e tente novamente.`, 'error');
    return;
  }
  const counts = { A: Math.ceil(chosenPlayers.length / 2), B: Math.floor(chosenPlayers.length / 2) };
  const isJonas = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR') === 'jonas';
  const jonas = chosenPlayers.find(item => isJonas(item.player.name));
  const jonasMustBeShorter = chosenPlayers.length % 2 === 1 && jonas;
  const movablePlayers = chosenPlayers.filter(item => item !== jonas || !jonasMustBeShorter);
  const candidateBuckets = Array.from(
    { length: MAX_DRAW_OVERALL_AVERAGE_GAP_TENTHS + 1 },
    () => ({ count: 0, teams: null })
  );
  const getDifference = (overallA, overallB) => {
    const averageA = overallA / counts.A;
    const averageB = overallB / counts.B;
    const gap = counts.A === counts.B ? Math.abs(averageA - averageB) : averageB - averageA;
    if (gap < 0) return -Math.max(1, Math.round(-gap * 10));
    return Math.round(gap * 10);
  };
  const isValidDifference = difference => difference >= 0 && difference <= MAX_DRAW_OVERALL_AVERAGE_GAP_TENTHS;
  const considerTeams = (playersA, playersB) => {
    const overallA = playersA.reduce((sum, item) => sum + item.overall, 0);
    const overallB = playersB.reduce((sum, item) => sum + item.overall, 0);
    const difference = getDifference(overallA, overallB);
    if (!Number.isInteger(difference) || !isValidDifference(difference)) return;
    const bucket = candidateBuckets[difference];
    bucket.count++;
    if (Math.random() < 1 / bucket.count) {
      bucket.teams = {
        A: { side: 'A', name: 'Time Vermelho', players: [...playersA], overall: overallA },
        B: { side: 'B', name: 'Time Branco', players: [...playersB], overall: overallB }
      };
    }
  };

  if (movablePlayers.length <= 16) {
    const playersA = [];
    const playersB = jonasMustBeShorter ? [jonas] : [];
    const selectTeams = index => {
      if (playersA.length > counts.A || playersB.length > counts.B) return;
      if (index === movablePlayers.length) {
        if (playersA.length === counts.A && playersB.length === counts.B) considerTeams(playersA, playersB);
        return;
      }
      const item = movablePlayers[index];
      if (playersA.length < counts.A) {
        playersA.push(item);
        selectTeams(index + 1);
        playersA.pop();
      }
      if (playersB.length < counts.B) {
        playersB.push(item);
        selectTeams(index + 1);
        playersB.pop();
      }
    };
    selectTeams(0);
  } else {
    const getDistanceFromRange = difference => difference < 0
      ? -difference
      : Math.max(0, difference - MAX_DRAW_OVERALL_AVERAGE_GAP_TENTHS);
    for (let attempt = 0; attempt < 3000; attempt++) {
      const teams = {
        A: { side: 'A', name: 'Time Vermelho', players: [], overall: 0 },
        B: { side: 'B', name: 'Time Branco', players: [], overall: 0 }
      };
      if (jonasMustBeShorter) {
        teams.B.players.push(jonas);
        teams.B.overall += jonas.overall;
      }
      const shuffled = [...movablePlayers];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
      }
      shuffled.sort((left, right) => right.overall - left.overall);
      for (const item of shuffled) {
        const available = ['A', 'B'].filter(side => teams[side].players.length < counts[side]);
        const target = available.length === 1
          ? available[0]
          : teams.A.overall === teams.B.overall
            ? (Math.random() < 0.5 ? 'A' : 'B')
            : teams.A.overall < teams.B.overall ? 'A' : 'B';
        teams[target].players.push(item);
        teams[target].overall += item.overall;
      }

      let currentDifference = getDifference(teams.A.overall, teams.B.overall);
      let currentDistance = getDistanceFromRange(currentDifference);
      let improved = true;
      while (improved && currentDistance > 0) {
        improved = false;
        let bestSwap;
        let bestDistance = currentDistance;
        for (const red of teams.A.players) {
          for (const white of teams.B.players) {
            if (jonasMustBeShorter && white === jonas) continue;
            const overallA = teams.A.overall - red.overall + white.overall;
            const overallB = teams.B.overall - white.overall + red.overall;
            const distance = getDistanceFromRange(getDifference(overallA, overallB));
            if (distance < bestDistance) {
              bestDistance = distance;
              bestSwap = [red, white, overallA, overallB];
            }
          }
        }
        if (bestSwap) {
          const [red, white, overallA, overallB] = bestSwap;
          teams.A.players[teams.A.players.indexOf(red)] = white;
          teams.B.players[teams.B.players.indexOf(white)] = red;
          teams.A.overall = overallA;
          teams.B.overall = overallB;
          currentDifference = getDifference(overallA, overallB);
          currentDistance = bestDistance;
          improved = true;
        }
      }
      considerTeams(teams.A.players, teams.B.players);
    }
  }

  const availableBuckets = candidateBuckets.filter(bucket => bucket.teams);
  if (!availableBuckets.length) {
    toast('Não há uma divisão possível com diferença de Overall médio entre 0 e 6,1 sem deixar a média do time menor abaixo da do time maior.', 'warning');
    return;
  }
  const selectedBucket = availableBuckets[Math.floor(Math.random() * availableBuckets.length)];
  const sortedTeams = [selectedBucket.teams.A, selectedBucket.teams.B];
  sortedTeams.forEach(team => team.players.forEach(check => {
    const select = check.check.closest('.participant-row').querySelector('.participant-side');
    select.value = team.side;
    select.disabled = false;
  }));
  updateTeamCounts();

  const results = document.getElementById('teamDrawResults');
  let cardIndex = 0;
  const maxTeamSize = Math.max(...sortedTeams.map(team => team.players.length));
  const cardIndexByPlayer = new Map();
  for (let playerIndex = 0; playerIndex < maxTeamSize; playerIndex++) {
    sortedTeams.forEach(team => {
      const entry = team.players[playerIndex];
      if (entry) cardIndexByPlayer.set(entry, cardIndex++);
    });
  }
  const deckHeader = `<div class="draw-stage-heading"><div class="draw-stage-title"><span class="draw-stage-kicker"><i class="draw-stage-pulse"></i>SORTEIO DE CARTAS</span><strong>Revele os jogadores</strong><small>Clique no baralho para revelar uma carta por vez.</small><span class="draw-stage-progress" id="drawStageProgress" role="status">0 de ${cardIndex} jogadores revelados</span></div><div class="draw-stage-actions"><button type="button" class="btn btn-secondary draw-reroll-button" data-action="reroll-teams">↻ Re-sortear times</button><button type="button" class="draw-deck" data-action="reveal-next-player" aria-label="Revelar próximo jogador"><span class="draw-deck-cards" aria-hidden="true"><span class="draw-deck-card draw-deck-card-shadow"></span><span class="draw-deck-card draw-deck-card-mid">⚽︎</span><span class="draw-deck-card draw-deck-card-top"><b>FS</b><i>✦</i></span></span><span class="draw-deck-hint">CLIQUE PARA REVELAR</span></button></div></div>`;
  results.dataset.revealedCount = '0';
  results.classList.remove('is-complete');
  results.innerHTML = deckHeader + sortedTeams.map(team => {
    const cardSuits = [
      { symbol: '♥', name: 'copas', color: 'red' },
      { symbol: '♦', name: 'ouros', color: 'red' },
      { symbol: '♣', name: 'paus', color: 'black' },
      { symbol: '♠', name: 'espadas', color: 'black' }
    ];
    const cards = team.players.map(entry => {
      const { player, overall } = entry;
      const index = cardIndexByPlayer.get(entry);
      const dealX = team.side === 'A' ? '82px' : '-82px';
      const teamLabel = team.side === 'A' ? 'TIME VERMELHO' : 'TIME BRANCO';
      const suit = cardSuits[Math.floor(Math.random() * cardSuits.length)];
      const corner = `draw-playing-card-corner draw-suit-${team.side === 'A' ? 'red' : 'blue'}`;
      const cornerMarkup = className => `<span class="${className}" aria-hidden="true"><b>${overall}</b><i>${suit.symbol}</i></span>`;
      return `<div class="draw-player-card" data-card-index="${index}" style="--deal-x:${dealX}" aria-label="Carta ainda não revelada, ${esc(team.name)}"><div class="draw-player-card-inner"><div class="draw-card-face draw-card-back"><span class="draw-card-back-emblem">⚽︎</span><small>${teamLabel}</small></div><div class="draw-card-face draw-card-front" aria-hidden="true">${cornerMarkup(corner)}<span class="draw-card-team-label"><i></i>${teamLabel}</span><div class="draw-card-player-row">${avatar(player, 'small')}<span class="draw-card-player-copy"><strong>${esc(player.name)}</strong></span></div>${cornerMarkup(`${corner} draw-playing-card-corner-bottom`)}</div></div></div>`;
    }).join('');
    const averageOverall = team.overall / team.players.length;
    const formattedAverage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(averageOverall);
    return `<section class="draw-team draw-team-${team.side.toLowerCase()}"><div class="draw-team-heading"><div><span>${team.name}</span><strong>${team.players.length} ${team.players.length === 1 ? 'jogador' : 'jogadores'} · Overall médio ${formattedAverage}</strong></div><span class="draw-team-ball">⚽︎</span></div><div class="draw-team-cards">${cards}</div></section>`;
  }).join('');
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'center' });
  results.querySelector('.draw-deck').focus({ preventScroll: true });
}
export function spawnRevealBurst(card, side) {
  const front = card.querySelector('.draw-card-front');
  if (!front) return;
  const burst = document.createElement('span');
  burst.className = `reveal-burst reveal-burst-${side}`;
  burst.setAttribute('aria-hidden', 'true');
  const count = 14;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('i');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
    const distance = 36 + Math.random() * 30;
    spark.style.setProperty('--sx', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--sy', `${Math.sin(angle) * distance}px`);
    spark.style.setProperty('--sd', `${Math.round(Math.random() * 90)}ms`);
    burst.appendChild(spark);
  }
  front.appendChild(burst);
  window.setTimeout(() => burst.remove(), 1100);
}
export function celebrateDraw(results) {
  const colors = ['#d7193f', '#ae1131', '#f5b942', '#20212a', '#ff8fa5', '#2866d8', '#8fa9d9'];
  const layer = document.createElement('div');
  layer.className = 'draw-confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 52; i++) {
    const piece = document.createElement('i');
    piece.className = 'draw-confetti-piece';
    piece.style.setProperty('--cx', `${Math.round(Math.random() * 100)}%`);
    piece.style.setProperty('--cd', `${Math.round(Math.random() * 500)}ms`);
    piece.style.setProperty('--cr', `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.setProperty('--cs', (0.8 + Math.random() * 0.8).toFixed(2));
    piece.style.background = colors[i % colors.length];
    layer.appendChild(piece);
  }
  results.appendChild(layer);
  window.setTimeout(() => layer.remove(), 2800);
}
export function revealNextPlayer(button) {
  const results = document.getElementById('teamDrawResults');
  if (!results || results.hidden) return;
  const revealedCount = Number(results.dataset.revealedCount || 0);
  const card = results.querySelector(`.draw-player-card[data-card-index="${revealedCount}"]`);
  if (!card) return;

  card.classList.add('is-revealed');
  card.querySelector('.draw-card-front').removeAttribute('aria-hidden');
  spawnRevealBurst(card, card.closest('.draw-team')?.classList.contains('draw-team-b') ? 'b' : 'a');
  button.classList.remove('is-shuffling');
  void button.offsetWidth;
  button.classList.add('is-shuffling');
  const nextCount = revealedCount + 1;
  results.dataset.revealedCount = String(nextCount);
  const total = results.querySelectorAll('.draw-player-card').length;
  const progress = document.getElementById('drawStageProgress');
  const complete = nextCount === total;
  if (progress) progress.textContent = complete
    ? `Sorteio concluído · ${total} ${total === 1 ? 'jogador revelado' : 'jogadores revelados'}`
    : `${nextCount} de ${total} jogadores revelados`;
  if (complete) {
    results.classList.add('is-complete');
    celebrateDraw(results);
    button.disabled = true;
    button.setAttribute('aria-label', 'Todos os jogadores foram revelados');
    button.querySelector('.draw-deck-hint').textContent = 'SORTEIO CONCLUÍDO';
  }
}
