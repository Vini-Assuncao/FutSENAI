// state.js
import { ANTI_RESENHA_STORAGE_KEY } from './config.js';

export function loadAntiResenhaPreference() {
  try {
    return window.localStorage.getItem(ANTI_RESENHA_STORAGE_KEY) === 'true';
  } catch (error) {
    console.warn('Não foi possível carregar a preferência do modo anti-resenha.', error);
    return false;
  }
}

export function saveAntiResenhaPreference(enabled) {
  try {
    window.localStorage.setItem(ANTI_RESENHA_STORAGE_KEY, String(enabled));
    return true;
  } catch (error) {
    console.warn('Não foi possível salvar a preferência do modo anti-resenha.', error);
    return false;
  }
}

export const state = {
  view: 'dashboard',
  previousView: null,
  dashboard: null,
  players: [],
  matches: [],
  stats: null,
  selectedMatch: null,
  selectedPlayerId: null,
  playerProfile: null,
  playerDetailReturnView: 'players',
  playerSearch: '',
  playerStatus: 'active',
  matchSearch: '',
  statsScope: 'internal',
  statsSort: 'goals',
  statsSortDirection: 'desc',
  readOnly: false,
  serverAvailable: false,
  localServer: false,
  antiResenha: loadAntiResenhaPreference(),
  staticData: null
};

export const pageContent = document.getElementById('pageContent');
export const modalRoot = document.getElementById('modalRoot');
export const toastStack = document.getElementById('toastStack');
export function canEdit() {
  return state.serverAvailable && state.localServer && !state.readOnly;
}
export function isLocalServerOrigin() {
  const { hostname, port, protocol } = window.location;
  return protocol === 'http:' && port === '3000'
    && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}
