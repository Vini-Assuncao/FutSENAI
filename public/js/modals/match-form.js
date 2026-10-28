// modals/match-form.js
import { avatar } from '../components.js';
import { openPlayerModal } from './player-form.js';
import { modalRoot, state } from '../state.js';
import { modal, toast } from '../ui.js';
import { esc, todayIso } from '../utils.js';

export function updateTeamCounts() {
  const selected = [...document.querySelectorAll('.participant-check:checked')];
  const form = document.getElementById('matchForm');
  const interclass = form?.querySelector('[name="opponent_type"]')?.value === 'second_year';
  form?.querySelectorAll('.participant-row').forEach(row => {
    const checked = row.querySelector('.participant-check').checked;
    const side = row.querySelector('.participant-side').value;
    row.classList.toggle('is-team-a', checked && side === 'A');
    row.classList.toggle('is-team-b', checked && side === 'B');
  });
  const a = selected.filter(box => box.closest('.participant-row').querySelector('.participant-side').value === 'A').length;
  const b = selected.filter(box => box.closest('.participant-row').querySelector('.participant-side').value === 'B').length;
  const ca = document.getElementById('teamACount');
  const cb = document.getElementById('teamBCount');
  if (ca) ca.textContent = `${a} ${a === 1 ? 'jogador' : 'jogadores'}`;
  if (cb) cb.textContent = `${b} ${b === 1 ? 'jogador' : 'jogadores'}`;
  const total = document.getElementById('selectedCount');
  if (total) total.textContent = interclass ? `${selected.length} jogadores do 3º A selecionados` : `${selected.length} selecionados`;
  const counts = document.getElementById('teamCounts');
  if (counts) {
    counts.classList.toggle('interclass-counts', interclass);
    if (interclass) counts.innerHTML = `<span class="interclass-count-note"><i class="legend-dot" style="background:var(--red)"></i><strong>${selected.length} ${selected.length === 1 ? 'jogador' : 'jogadores'}</strong> do 3º A selecionados. O 2º Ano será registrado apenas pelo placar total.</span>`;
    else counts.innerHTML = `<span><i class="legend-dot" style="background:var(--red)"></i><strong id="teamACount">${a} jogadores</strong> no Time Vermelho</span><span><i class="legend-dot" style="background:#60636f"></i><strong id="teamBCount">${b} jogadores</strong> no Time Branco</span>`;
  }
}
export function updateMatchFormMode() {
  const form = document.getElementById('matchForm');
  if (!form) return;
  clearTeamDraw();
  const wasInterclass = form.dataset.interclassMode === 'true';
  const interclass = form.querySelector('[name="opponent_type"]')?.value === 'second_year';
  form.classList.toggle('interclass-mode', interclass);
  form.querySelectorAll('.participant-row').forEach(row => {
    const select = row.querySelector('.participant-side');
    if (interclass) select.value = 'A';
    else if (wasInterclass) select.value = '';
    select.disabled = interclass || !row.querySelector('.participant-check').checked;
  });
  form.dataset.interclassMode = String(interclass);
  const caption = document.getElementById('teamsCaption');
  if (caption) caption.textContent = interclass ? '02 · Escolha quem jogou pelo 3º A' : '02 · Monte as escalações';
  updateTeamCounts();
}
export function clearTeamDraw() {
  const results = document.getElementById('teamDrawResults');
  if (results) {
    results.hidden = true;
    results.innerHTML = '';
    delete results.dataset.revealedCount;
  }
}
export function openMatchModal(testOnly = false) {
  const players = (state.players.length ? state.players : state.dashboard?.players || []).filter(p => p.is_active);
  if (!players.length) {
    if (testOnly) {
      toast('Não há jogadores ativos para testar o sorteio.', 'warning');
      return;
    }
    toast('Cadastre pelo menos um jogador ativo antes de criar uma partida.', 'warning');
    openPlayerModal();
    return;
  }
  const defaultType = players.length < 2 ? 'second_year' : 'classmates';
  const playerRows = players.map(player => `<label class="participant-row"><input class="participant-check" type="checkbox" value="${player.id}"><span class="participant-player">${avatar(player, 'small')}<span style="min-width:0"><strong>${esc(player.name)}</strong></span></span><select class="participant-side" aria-label="Time de ${esc(player.name)}" disabled><option value="" selected>Escolha o time</option><option value="A">Time Vermelho</option><option value="B">Time Branco</option></select></label>`).join('');
  const formWrapper = testOnly ? 'div' : 'form';
  const matchSetup = testOnly ? '' : `<div class="section-caption">01 · Tipo e data da partida</div><div class="form-grid"><div class="form-field full"><label for="opponentType">Tipo de partida *</label><select id="opponentType" name="opponent_type"><option value="classmates" ${defaultType === 'classmates' ? 'selected' : ''} ${players.length < 2 ? 'disabled' : ''}>Entre nós · somente 3º A</option><option value="second_year" ${defaultType === 'second_year' ? 'selected' : ''}>Interclasse · contra o 2º Ano (azul)</option></select><div class="form-help">No interclasse, o 2º Ano não precisa ser cadastrado: você registra apenas o total de gols deles.</div></div><div class="form-field full"><label for="matchDate">Data da partida *</label><input id="matchDate" name="played_on" type="date" required max="${todayIso()}" value="${todayIso()}"></div></div>`;
  const modeNotice = testOnly ? '<div class="draw-test-notice" role="status"><strong>Modo de teste</strong><span>O sorteio é apenas uma prévia: nenhuma partida será criada ou salva.</span></div>' : '';
  const caption = testOnly ? 'Selecione jogadores para testar o sorteio' : '02 · Monte as escalações';
  const helper = testOnly ? 'A prévia usa o Overall da carta Incomum de cada jogador. Fechar esta janela descarta o resultado.' : 'Cada partida tem uma escalação independente. Nas partidas entre nós, os times podem ficar desbalanceados. Contra o 2º Ano, escolha todos os jogadores do 3º A que participaram.';
  const body = `<${formWrapper} id="matchForm" class="${testOnly ? 'team-draw-test-mode' : ''}"><div class="modal-body">${modeNotice}${matchSetup}<div class="section-caption" id="teamsCaption">${caption}</div><div class="participant-toolbar"><span id="selectedCount">0 selecionados</span><div class="participant-tools"><button type="button" data-action="select-all-players">Selecionar todos</button><button type="button" data-action="clear-players">Limpar</button><button type="button" class="draw-teams-button" data-action="draw-teams">⚄ Sortear times</button></div></div><div class="participant-list">${playerRows}</div><div class="team-draw-results" id="teamDrawResults" aria-live="polite" hidden></div><div class="team-counts" id="teamCounts"><span><i class="legend-dot" style="background:var(--red)"></i><strong id="teamACount">0 jogadores</strong> no Time Vermelho</span><span><i class="legend-dot" style="background:#60636f"></i><strong id="teamBCount">0 jogadores</strong> no Time Branco</span></div><p class="form-help" style="margin-top:10px">${helper}</p></div></${formWrapper}>`;
  const footer = testOnly ? '<button type="button" class="btn btn-secondary" data-modal-close>Fechar teste</button>' : `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="matchForm" class="btn btn-primary">Criar partida →</button>`;
  modal(testOnly ? 'Testar sorteio de times' : 'Registrar partida', testOnly ? 'Escolha jogadores ativos e veja uma prévia do sorteio.' : 'Escolha o tipo de confronto, a data e os jogadores do 3º A.', body, footer, true);
  modalRoot.querySelectorAll('.participant-check').forEach(check => check.addEventListener('change', () => {
    clearTeamDraw();
    const interclass = document.getElementById('opponentType')?.value === 'second_year';
    const select = check.closest('.participant-row').querySelector('.participant-side');
    select.disabled = interclass || !check.checked;
    updateTeamCounts();
  }));
  modalRoot.querySelectorAll('.participant-side').forEach(select => select.addEventListener('change', () => {
    clearTeamDraw();
    updateTeamCounts();
  }));
  document.getElementById('opponentType')?.addEventListener('change', updateMatchFormMode);
  updateMatchFormMode();
}
