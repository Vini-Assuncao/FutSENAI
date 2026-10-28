// utils.js
import { getUncommonOverall } from './cards/futsenai-cards.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
export function playerOverall(playerName) {
  const overall = getUncommonOverall(playerName);
  return Number.isInteger(overall) ? overall : null;
}
export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}
export function shortDate(dateValue, withYear = false) {
  if (!dateValue) return 'Data não informada';
  const parts = String(dateValue).slice(0, 10).split('-');
  if (parts.length !== 3) return esc(dateValue);
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(date).replace('.', '');
}
export function numericDate(dateValue) {
  const parts = String(dateValue || '').slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : esc(dateValue || 'Data não informada');
}
export function fullDate(dateValue) {
  if (!dateValue) return 'Data não informada';
  const parts = String(dateValue).slice(0, 10).split('-');
  if (parts.length !== 3) return esc(dateValue);
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}
export function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function safeText(value, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : esc(value); }
export function goalTypeLabel(type) {
  return type === 'own_goal' ? 'Gol contra' : 'Gol';
}
export function outcomeLabel(match) {
  if (match.outcome === 'draw') return 'Empate';
  return match.outcome === 'A' ? `${match.team_a_name} venceu` : `${match.team_b_name} venceu`;
}
export function jsonOptions(method, payload) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}
