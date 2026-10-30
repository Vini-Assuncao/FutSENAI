// Rotas por hash, compatíveis com hospedagem estática.
import { state } from './state.js';

const VIEW_PATHS = {
  dashboard: '',
  players: 'jogadores',
  matches: 'partidas',
  stats: 'estatisticas',
  compare: 'comparar'
};

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

export function playerSlug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function dateToSlug(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return match ? `${match[3]}${match[2]}${match[1]}` : '';
}

function dateFromSlug(value) {
  const match = /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}

const legacyViews = {
  dashboard: 'dashboard',
  players: 'players',
  matches: 'matches',
  stats: 'stats',
  compare: 'compare'
};

export function parseRoute(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [rawName, rawIdentifier] = path.split('/');
  const name = decodeSegment(rawName || '');
  const identifier = decodeSegment(rawIdentifier || '');
  const params = new URLSearchParams(query);

  if (!name || name === 'inicio') return { view: 'dashboard' };
  if (name === 'comparar') {
    return {
      view: 'compare',
      playerSlugA: params.get('jogador1') || null,
      playerSlugB: params.get('jogador2') || null,
      a: Number(params.get('a')) || null,
      b: Number(params.get('b')) || null
    };
  }
  if (name === 'compare') {
    return { view: 'compare', a: Number(params.get('a')) || null, b: Number(params.get('b')) || null };
  }
  if (legacyViews[name]) return { view: legacyViews[name] };
  if (name === 'jogadores') return { view: 'players' };
  if (name === 'partidas') return { view: 'matches' };
  if (name === 'estatisticas') return { view: 'stats' };
  if (name === 'jogador' && identifier) {
    const id = Number(identifier);
    return Number.isInteger(id) && id > 0
      ? { view: 'playerDetail', id }
      : { view: 'playerDetail', playerSlug: playerSlug(identifier) };
  }
  if (name === 'partida' && identifier) {
    if (/^\d{8}$/.test(identifier)) {
      const date = dateFromSlug(identifier);
      return date ? { view: 'matchDetail', date } : { view: 'dashboard' };
    }
    const id = Number(identifier);
    return Number.isInteger(id) && id > 0 ? { view: 'matchDetail', id } : { view: 'dashboard' };
  }
  if (name === 'player' && Number.isInteger(Number(identifier)) && Number(identifier) > 0) {
    return { view: 'playerDetail', id: Number(identifier) };
  }
  if (name === 'player' && identifier) return { view: 'playerDetail', playerSlug: playerSlug(identifier) };
  if (name === 'match' && Number.isInteger(Number(identifier)) && Number(identifier) > 0) {
    return { view: 'matchDetail', id: Number(identifier) };
  }
  return { view: 'dashboard' };
}

export function resolveRoute(route, { players = [], matches = [] } = {}) {
  const resolved = { ...route };
  if (resolved.playerSlug) {
    const player = players.find(item => playerSlug(item.name) === resolved.playerSlug);
    if (player) resolved.id = player.id;
    else return { view: 'players' };
    delete resolved.playerSlug;
  }
  if (resolved.date) {
    const matching = matches
      .filter(match => match.played_on === resolved.date)
      .sort((left, right) => right.id - left.id);
    if (matching.length) resolved.id = matching[0].id;
    else return { view: 'matches' };
    delete resolved.date;
  }
  if (resolved.view === 'compare') {
    if (resolved.playerSlugA) resolved.a = players.find(item => playerSlug(item.name) === resolved.playerSlugA)?.id || null;
    if (resolved.playerSlugB) resolved.b = players.find(item => playerSlug(item.name) === resolved.playerSlugB)?.id || null;
    delete resolved.playerSlugA;
    delete resolved.playerSlugB;
  }
  return resolved;
}

export function applyRoute(route) {
  state.selectedMatch = route.view === 'matchDetail' ? route.id || null : null;
  state.matchDetail = null;
  state.selectedPlayerId = route.view === 'playerDetail' ? route.id || null : null;
  state.playerProfile = null;
  if (route.view === 'compare') state.compare = { a: route.a || null, b: route.b || null };
  state.view = route.view;
}

function cachedPlayer(id) {
  const candidates = [
    ...(state.players || []),
    ...(state.comparePlayers || []),
    ...(state.dashboard?.players || []),
    ...(state.matchDetail?.players || []),
    state.playerProfile?.player
  ];
  return candidates.find(player => player?.id === id);
}

function cachedMatch(id) {
  const candidates = [
    ...(state.matches || []),
    ...(state.dashboard?.recentMatches || []),
    ...(state.playerProfile?.matches || []),
    state.matchDetail
  ];
  return candidates.find(match => match?.id === id);
}

function deferUntilDataIsLoaded() {
  return window.location.hash || '#/';
}

export function routeHash() {
  if (state.routeResolving) return deferUntilDataIsLoaded();
  switch (state.view) {
    case 'dashboard': return '#/';
    case 'players': return '#/jogadores';
    case 'matches': return '#/partidas';
    case 'stats': return '#/estatisticas';
    case 'matchDetail': {
      const match = cachedMatch(state.selectedMatch);
      const date = dateToSlug(match?.played_on);
      return date ? `#/partida/${date}` : deferUntilDataIsLoaded();
    }
    case 'playerDetail': {
      const player = cachedPlayer(state.selectedPlayerId);
      const slug = playerSlug(player?.name);
      return slug ? `#/jogador/${encodeURIComponent(slug)}` : deferUntilDataIsLoaded();
    }
    case 'compare': {
      const playerA = cachedPlayer(state.compare.a);
      const playerB = cachedPlayer(state.compare.b);
      if ((state.compare.a && !playerA) || (state.compare.b && !playerB)) return deferUntilDataIsLoaded();
      const params = new URLSearchParams();
      if (playerA) params.set('jogador1', playerSlug(playerA.name));
      if (playerB) params.set('jogador2', playerSlug(playerB.name));
      const query = params.toString();
      return `#/comparar${query ? `?${query}` : ''}`;
    }
    default: return `#/${VIEW_PATHS[state.view] || ''}`;
  }
}

let historyReady = false;

export function enableHistory() {
  historyReady = true;
}

export function syncHistory({ replace = false } = {}) {
  if (!historyReady) return;
  const next = routeHash();
  const current = window.location.hash || '#/';
  if (current === next) return;
  const samePath = current.split('?')[0] === next.split('?')[0];
  const sameView = parseRoute(current).view === state.view;
  if (replace || samePath || sameView) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
}
