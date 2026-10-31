/*
 * Cálculos puros do FutSENAI Score, compartilhados entre o servidor (Node) e o
 * modo somente leitura do navegador. Recebem o objeto de dados completo
 * (players, matches, match_players, goals) e nunca alteram esse objeto.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FutSENAIStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const PT_BR = 'pt-BR';
  const SCOPE_OPPONENT = { internal: 'classmates', interclass: 'second_year' };

  const byName = (left, right) => left.name.localeCompare(right.name, PT_BR, { sensitivity: 'base' });
  const byDateDesc = (left, right) => right.played_on.localeCompare(left.played_on) || right.id - left.id;

  function normalizeScope(value) {
    return value === 'interclass' ? 'interclass' : 'internal';
  }

  // Escopo nulo/omitido significa "todas as partidas".
  function matchInScope(match, scope) {
    return !scope || match.opponent_type === SCOPE_OPPONENT[scope];
  }

  function scoresOf(matchId, data) {
    return data.goals.reduce((scores, goal) => {
      if (goal.match_id === matchId) scores[goal.team_side]++;
      return scores;
    }, { A: 0, B: 0 });
  }

  function matchSummary(match, data) {
    const scores = scoresOf(match.id, data);
    const isSecondYear = match.opponent_type === 'second_year';
    const counts = { A: 0, B: 0 };
    data.match_players.filter(participant => participant.match_id === match.id)
      .forEach(participant => { counts[participant.team_side]++; });
    let outcome = 'draw';
    if (scores.A > scores.B) outcome = 'A';
    if (scores.B > scores.A) outcome = 'B';
    return {
      ...match,
      location: 'Quadra',
      team_a_name: isSecondYear ? '3º A' : 'Time Vermelho',
      team_b_name: isSecondYear ? '2º Ano' : 'Time Branco',
      score_a: scores.A,
      score_b: scores.B,
      players_a: counts.A,
      players_b: isSecondYear ? 0 : counts.B,
      total_players: counts.A + (isSecondYear ? 0 : counts.B),
      total_goals: scores.A + scores.B,
      outcome
    };
  }

  function matchList(data, scope = 'internal', limit = null) {
    const rows = data.matches
      .filter(match => matchInScope(match, scope))
      .sort(byDateDesc)
      .map(match => matchSummary(match, data));
    return Number.isInteger(limit) ? rows.slice(0, limit) : rows;
  }

  function rivalry(data) {
    const matches = matchList(data, 'interclass');
    return {
      matches: matches.length,
      wins: matches.filter(match => match.score_a > match.score_b).length,
      draws: matches.filter(match => match.score_a === match.score_b).length,
      losses: matches.filter(match => match.score_a < match.score_b).length,
      goalsFor: matches.reduce((sum, match) => sum + match.score_a, 0),
      goalsAgainst: matches.reduce((sum, match) => sum + match.score_b, 0)
    };
  }

  // Estatísticas de um jogador (objeto) no escopo informado.
  function playerStats(player, scope, data) {
    const matchesById = new Map(data.matches.map(match => [match.id, match]));
    const played = data.match_players
      .filter(participant => participant.player_id === player.id)
      .map(participant => ({ ...participant, match: matchesById.get(participant.match_id) }))
      .filter(appearance => appearance.match && matchInScope(appearance.match, scope))
      .sort((left, right) => byDateDesc(left.match, right.match));
    let wins = 0, draws = 0, losses = 0;
    for (const appearance of played) {
      const score = scoresOf(appearance.match_id, data);
      const own = appearance.team_side === 'A' ? score.A : score.B;
      const rival = appearance.team_side === 'A' ? score.B : score.A;
      if (own > rival) wins++;
      else if (own === rival) draws++;
      else losses++;
    }
    const goals = data.goals.filter(goal => {
      if (goal.player_id !== player.id || goal.goal_type !== 'normal') return false;
      const match = matchesById.get(goal.match_id);
      return match && matchInScope(match, scope);
    }).length;
    const assists = played.reduce((sum, appearance) => sum + (Number(appearance.assists) || 0), 0);
    return {
      ...player,
      matches_played: played.length,
      goals,
      assists,
      wins,
      draws,
      losses,
      win_rate: played.length ? Math.round((wins / played.length) * 100) : 0,
      goals_per_match: played.length ? Number((goals / played.length).toFixed(2)) : 0
    };
  }

  function playerList(data, includeInactive = false, scope = 'internal') {
    return data.players
      .filter(player => includeInactive || player.is_active)
      .sort((left, right) => right.is_active - left.is_active || byName(left, right))
      .map(player => playerStats(player, scope, data));
  }

  function playerHistory(data, playerId) {
    const player = data.players.find(item => item.id === playerId);
    if (!player) return null;
    const matchesById = new Map(data.matches.map(match => [match.id, match]));
    const appearances = data.match_players
      .filter(participant => participant.player_id === playerId)
      .map(participant => ({ participant, match: matchesById.get(participant.match_id) }))
      .filter(appearance => appearance.match)
      .sort((left, right) => byDateDesc(left.match, right.match))
      .slice(0, 10)
      .map(({ participant, match }) => {
        const summary = matchSummary(match, data);
        const scores = scoresOf(match.id, data);
        const playerScore = participant.team_side === 'A' ? scores.A : scores.B;
        const opponentScore = participant.team_side === 'A' ? scores.B : scores.A;
        return {
          ...summary,
          team_side: participant.team_side,
          result: playerScore > opponentScore ? 'win' : playerScore < opponentScore ? 'loss' : 'draw',
          goals: data.goals.filter(goal => goal.match_id === match.id && goal.player_id === playerId && goal.goal_type === 'normal').length,
          own_goals: data.goals.filter(goal => goal.match_id === match.id && goal.player_id === playerId && goal.goal_type === 'own_goal').length,
          assists: Number(participant.assists) || 0
        };
      });
    return {
      player,
      stats: {
        internal: playerStats(player, 'internal', data),
        interclass: playerStats(player, 'interclass', data)
      },
      matches: appearances
    };
  }

  function matchDetail(data, matchId) {
    const match = data.matches.find(item => item.id === matchId);
    if (!match) return null;
    const summary = matchSummary(match, data);
    const playersById = new Map(data.players.map(player => [player.id, player]));
    const players = data.match_players
      .filter(participant => participant.match_id === matchId)
      .map(participant => {
        const player = playersById.get(participant.player_id);
        return {
          id: player.id,
          name: player.name,
          photo_path: player.photo_path,
          photo_reserve_path: player.photo_reserve_path,
          is_active: player.is_active,
          team_side: participant.team_side,
          assists: Number(participant.assists) || 0
        };
      })
      .sort((left, right) => left.team_side.localeCompare(right.team_side) || byName(left, right));
    const goals = data.goals.filter(goal => goal.match_id === matchId)
      .sort((left, right) => left.id - right.id)
      .map(goal => {
        const player = playersById.get(goal.player_id);
        return {
          ...goal,
          player_name: player?.name ?? null,
          player_photo: player?.photo_path ?? null,
          player_reserve_photo: player?.photo_reserve_path ?? null
        };
      });
    return { ...summary, players, goals };
  }

  // Resposta de /api/dashboard.
  function dashboard(data, scope = 'internal') {
    const filteredMatches = matchList(data, scope);
    const totalMatches = filteredMatches.length;
    const totalGoals = filteredMatches.reduce((sum, match) => sum + match.total_goals, 0);
    const allPlayers = playerList(data, false, scope);
    const eligibleScorers = allPlayers.filter(player => player.goals > 0 || player.matches_played > 0);
    const topScorers = [...eligibleScorers]
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.wins - a.wins || byName(a, b))
      .slice(0, 5);
    return {
      scope,
      summary: {
        activePlayers: data.players.filter(player => player.is_active).length,
        totalMatches,
        totalGoals,
        averageGoals: totalMatches ? Number((totalGoals / totalMatches).toFixed(1)) : 0
      },
      recentMatches: filteredMatches.slice(0, 5),
      topScorers,
      players: allPlayers,
      secondYearRivalry: rivalry(data)
    };
  }

  // Resposta de /api/stats.
  // Marcos históricos da turma. Recordes por partida seguem o filtro escolhido;
  // as sequências de cada jogador usam todas as partidas, independente do filtro.
  // Empates entre jogadores listam todos os empatados (holders); empates entre partidas
  // são desempatados pelos gols do time vencedor (para a partida com menos gols, o menor).
  function records(data, scope = 'internal') {
    const normalized = normalizeScope(scope);
    const chronological = data.matches.slice().sort((left, right) => left.played_on.localeCompare(right.played_on) || left.id - right.id);
    const scopedDesc = chronological.filter(match => matchInScope(match, normalized)).sort(byDateDesc);
    const summaries = new Map(scopedDesc.map(match => [match.id, matchSummary(match, data)]));
    const playersById = new Map(data.players.map(player => [player.id, player]));
    const holderOf = playerId => {
      const player = playersById.get(playerId);
      return { playerId, playerName: player.name, photoPath: player.photo_path || null, photoReservePath: player.photo_reserve_path || null };
    };
    const normalGoals = new Map();
    data.goals.forEach(goal => {
      if (goal.goal_type !== 'normal') return;
      const key = `${goal.match_id}:${goal.player_id}`;
      normalGoals.set(key, (normalGoals.get(key) || 0) + 1);
    });

    // Participações individuais em partidas do filtro, da mais recente para a mais antiga.
    const lines = data.match_players
      .filter(participant => summaries.has(participant.match_id) && playersById.has(participant.player_id))
      .map(participant => {
        const goals = normalGoals.get(`${participant.match_id}:${participant.player_id}`) || 0;
        const assists = Number(participant.assists) || 0;
        return { playerId: participant.player_id, matchId: participant.match_id, goals, assists, ga: goals + assists, playedOn: summaries.get(participant.match_id).played_on, id: participant.match_id };
      })
      .sort((left, right) => right.playedOn.localeCompare(left.playedOn) || right.id - left.id);

    // Maior valor individual em uma partida; todos os jogadores que empatam entram na lista.
    function bestLine(key) {
      let bestValue = 0;
      for (const line of lines) if (line[key] > bestValue) bestValue = line[key];
      if (!bestValue) return null;
      const tied = lines.filter(line => line[key] === bestValue);
      const holders = [];
      tied.forEach(line => { if (!holders.some(holder => holder.playerId === line.playerId)) holders.push(holderOf(line.playerId)); });
      return { value: bestValue, representative: tied[0], holders, ties: tied.length - 1 };
    }

    // Melhor partida pela métrica; a tabela de desempate compara os gols do vencedor.
    // isBetter decide entre duas partidas; a mais recente fica em caso de empate total.
    function bestMatch(metric, { direction = 'max', tiebreak = null, tiebreakDirection = 'max' } = {}) {
      let best = null, bestValue = null, bestTb = null, ties = 0;
      for (const match of scopedDesc) {
        const summary = summaries.get(match.id);
        const value = metric(summary);
        if (value === null || value === undefined) continue;
        if (direction === 'max' && value <= 0) continue;
        const tb = tiebreak ? tiebreak(summary) : 0;
        const valueBetter = direction === 'max' ? value > bestValue : value < bestValue;
        const tbBetter = tiebreakDirection === 'max' ? tb > bestTb : tb < bestTb;
        if (best === null || valueBetter || (value === bestValue && tbBetter)) {
          best = summary; bestValue = value; bestTb = tb; ties = 0;
        } else if (value === bestValue && tb === bestTb) {
          ties++;
        }
      }
      return best ? { match: best, value: bestValue, ties } : null;
    }
    const winnerGoals = summary => Math.max(summary.score_a, summary.score_b);

    // Sequências por jogador, em ordem cronológica, em todas as partidas.
    const sidesByMatch = new Map();
    data.match_players.forEach(participant => {
      if (!sidesByMatch.has(participant.match_id)) sidesByMatch.set(participant.match_id, new Map());
      sidesByMatch.get(participant.match_id).set(participant.player_id, participant.team_side);
    });
    const resultsByPlayer = new Map();
    chronological.forEach(match => {
      const score = scoresOf(match.id, data);
      (sidesByMatch.get(match.id) || new Map()).forEach((side, playerId) => {
        const own = side === 'A' ? score.A : score.B;
        const rival = side === 'A' ? score.B : score.A;
        const result = own > rival ? 'W' : own === rival ? 'D' : 'L';
        if (!resultsByPlayer.has(playerId)) resultsByPlayer.set(playerId, []);
        resultsByPlayer.get(playerId).push({ matchId: match.id, playedOn: match.played_on, result });
      });
    });

    // Maior sequência de itens consecutivos que atendem ao critério.
    function longestRun(items, ok) {
      let best = null, run = null;
      for (const item of items) {
        if (!ok(item)) { run = null; continue; }
        if (!run) run = { length: 0, first: item, last: item };
        run.length++;
        run.last = item;
        if (!best || run.length > best.length) best = { ...run };
      }
      return best;
    }
    // Todos os jogadores com a maior sequência entram na lista de empatados.
    function bestStreak(ok, items = null) {
      let bestLength = 0;
      const runs = [];
      for (const player of data.players.slice().sort(byName)) {
        const source = items ? items(player.id) : (resultsByPlayer.get(player.id) || []);
        const run = longestRun(source, ok);
        if (!run || run.length === 0) continue;
        runs.push({ player, run });
        if (run.length > bestLength) bestLength = run.length;
      }
      if (!bestLength) return null;
      const tied = runs.filter(entry => entry.run.length === bestLength);
      return {
        length: bestLength,
        holders: tied.map(entry => holderOf(entry.player.id)),
        from: tied[0].run.first,
        to: tied[0].run.last,
        single: tied.length === 1 ? { from: tied[0].run.first.playedOn, to: tied[0].run.last.playedOn } : null
      };
    }

    const streakWins = bestStreak(item => item.result === 'W');
    const attended = new Map();
    data.match_players.forEach(participant => {
      if (!attended.has(participant.player_id)) attended.set(participant.player_id, new Set());
      attended.get(participant.player_id).add(participant.match_id);
    });
    const streakPresence = bestStreak(
      item => attended.get(item.playerId)?.has(item.matchId),
      playerId => chronological.map(match => ({ playerId, matchId: match.id, playedOn: match.played_on, result: 'P' }))
    );

    const items = [];
    const matchItem = (key, title, icon, unit, record) => {
      if (!record) return;
      items.push({ key, title, icon, unit, kind: 'match', value: record.value, ties: record.ties, matchId: record.match.id, match: record.match, holders: [] });
    };
    const playerMatchItem = (key, title, icon, unit, record) => {
      if (!record) return;
      const rep = record.representative;
      items.push({
        key, title, icon, unit, kind: 'match', value: record.value, ties: 0,
        matchId: rep.matchId,
        match: summaries.get(rep.matchId),
        holders: record.holders,
        playerId: record.holders[0].playerId,
        playerName: record.holders[0].playerName
      });
    };
    const playerStreakItem = (key, title, icon, unit, streak) => {
      if (!streak) return;
      items.push({
        key, title, icon, unit, kind: 'player', value: streak.length,
        holders: streak.holders,
        playerId: streak.holders[0].playerId,
        playerName: streak.holders[0].playerName,
        from: streak.single ? streak.single.from : null,
        to: streak.single ? streak.single.to : null
      });
    };

    playerMatchItem('most-goals-game', 'Mais gols em uma partida', '⚽︎', 'gols', bestLine('goals'));
    playerMatchItem('most-assists-game', 'Mais assistências em uma partida', '♕', 'assistências', bestLine('assists'));
    playerMatchItem('most-ga-game', 'Mais participações em uma partida', '✚', 'participações', bestLine('ga'));
    matchItem('biggest-draw', 'Empate com mais gols', '＝', 'gols no total', bestMatch(summary => (summary.score_a === summary.score_b ? summary.total_goals : 0)));
    if (normalized === 'interclass') {
      matchItem('second-year-best', 'Maior placar do 2º Ano', '2º', 'gols', bestMatch(summary => summary.score_b));
    }
    playerStreakItem('win-streak', 'Maior sequência de vitórias', '✦', 'vitórias seguidas', streakWins);
    playerStreakItem('presence-streak', 'Maior sequência de presenças', '◷', 'partidas seguidas', streakPresence);
    matchItem('biggest-rout', 'Maior goleada', '⇅', 'de diferença',
      bestMatch(summary => Math.abs(summary.score_a - summary.score_b), { tiebreak: winnerGoals, tiebreakDirection: 'max' }));
    matchItem('most-goals-match', 'Partida com mais gols', '✚', 'gols no total',
      bestMatch(summary => summary.total_goals, { tiebreak: winnerGoals, tiebreakDirection: 'max' }));
    matchItem('fewest-goals-match', 'Partida com menos gols', '━', 'gols no total',
      bestMatch(summary => summary.total_goals, { direction: 'min', tiebreak: winnerGoals, tiebreakDirection: 'min' }));

    return { scope: normalized, items };
  }

  function statistics(data, scope = 'internal') {
    const players = playerList(data, true, scope)
      .filter(player => player.matches_played > 0 || player.goals > 0 || player.assists > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.wins - a.wins || byName(a, b));
    const matches = matchList(data, scope);
    const totalGoals = matches.reduce((sum, match) => sum + match.total_goals, 0);
    return {
      scope,
      aggregate: {
        matches: matches.length,
        goals: totalGoals,
        averageGoals: matches.length ? Number((totalGoals / matches.length).toFixed(1)) : 0,
        draws: matches.filter(m => m.outcome === 'draw').length,
        wins: matches.filter(m => m.outcome === 'A').length,
        losses: matches.filter(m => m.outcome === 'B').length,
        mostRecent: matches[0] || null,
        secondYearRivalry: rivalry(data)
      },
      players,
      records: records(data, scope)
    };
  }

  // Partidas de um jogador no escopo, da mais recente para a mais antiga, com o resultado do ponto de vista dele.
  function appearanceRows(player, scope, data) {
    const matchesById = new Map(data.matches.map(match => [match.id, match]));
    return data.match_players
      .filter(participant => participant.player_id === player.id)
      .map(participant => ({ participant, match: matchesById.get(participant.match_id) }))
      .filter(row => row.match && matchInScope(row.match, scope))
      .sort((left, right) => byDateDesc(left.match, right.match))
      .map(({ participant, match }) => {
        const score = scoresOf(match.id, data);
        const own = participant.team_side === 'A' ? score.A : score.B;
        const rival = participant.team_side === 'A' ? score.B : score.A;
        const goals = data.goals.filter(goal => goal.match_id === match.id && goal.player_id === player.id && goal.goal_type === 'normal').length;
        return {
          matchId: match.id,
          match,
          side: participant.team_side,
          result: own > rival ? 'W' : own === rival ? 'D' : 'L',
          goals,
          assists: Number(participant.assists) || 0
        };
      });
  }

  function sideSummary(player, scope, data) {
    const rows = appearanceRows(player, scope, data);
    const base = playerStats(player, scope, data);
    const recent = rows.slice(0, 5);
    return {
      ...base,
      ga: base.goals + base.assists,
      goals_in_wins: rows.filter(row => row.result === 'W').reduce((sum, row) => sum + row.goals, 0),
      form: recent.map(row => row.result),
      form_points: recent.reduce((sum, row) => sum + (row.result === 'W' ? 3 : row.result === 'D' ? 1 : 0), 0),
      rows
    };
  }

  // Comparação entre dois jogadores no mesmo escopo (3º A ou 2º Ano), com confrontos diretos.
  function compare(data, playerIdA, playerIdB, scope = 'internal') {
    const normalized = normalizeScope(scope);
    const playerA = data.players.find(player => player.id === playerIdA);
    const playerB = data.players.find(player => player.id === playerIdB);
    if (!playerA || !playerB || playerIdA === playerIdB) return null;

    const sideA = sideSummary(playerA, normalized, data);
    const sideB = sideSummary(playerB, normalized, data);
    const rowsB = new Map(sideB.rows.map(row => [row.matchId, row]));

    const headToHead = [];
    for (const rowA of sideA.rows) {
      const rowB = rowsB.get(rowA.matchId);
      if (!rowB) continue;
      headToHead.push({
        ...matchSummary(rowA.match, data),
        together: rowA.side === rowB.side,
        a: { side: rowA.side, result: rowA.result, goals: rowA.goals, assists: rowA.assists },
        b: { side: rowB.side, result: rowB.result, goals: rowB.goals, assists: rowB.assists }
      });
    }
    headToHead.sort((left, right) => byDateDesc(left, right));

    const together = headToHead.filter(row => row.together);
    const opposed = headToHead.filter(row => !row.together);
    const strip = ({ rows, ...rest }) => rest;

    return {
      scope: normalized,
      a: strip(sideA),
      b: strip(sideB),
      headToHead: {
        totals: {
          together: {
            matches: together.length,
            wins: together.filter(row => row.a.result === 'W').length,
            draws: together.filter(row => row.a.result === 'D').length,
            losses: together.filter(row => row.a.result === 'L').length
          },
          opposed: {
            matches: opposed.length,
            a_wins: opposed.filter(row => row.a.result === 'W').length,
            b_wins: opposed.filter(row => row.b.result === 'W').length,
            draws: opposed.filter(row => row.a.result === 'D').length
          }
        },
        matches: headToHead
      }
    };
  }

  return {
    normalizeScope,
    matchList,
    matchSummary,
    scoresOf,
    rivalry,
    playerStats,
    playerList,
    playerHistory,
    matchDetail,
    dashboard,
    statistics,
    records,
    compare
  };
});
