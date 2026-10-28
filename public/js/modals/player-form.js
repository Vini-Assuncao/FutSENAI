// modals/player-form.js
import { state } from '../state.js';
import { modal, toast } from '../ui.js';
import { esc, initials } from '../utils.js';

export function openPlayerModal(player = null) {
  const editing = Boolean(player);
  const previewImage = (photoPath, alt) => {
    if (!photoPath) return esc(initials(player?.name || 'FS'));
    const imagePath = state.readOnly ? new URL(photoPath.replace(/^\/+/, ''), document.baseURI).href : photoPath;
    return `<img src="${esc(imagePath)}" alt="${alt}">`;
  };
  const body = `<form id="playerForm" enctype="multipart/form-data"><div class="modal-body"><div class="form-grid"><div class="form-field full"><label for="playerName">Nome do jogador *</label><input id="playerName" name="name" maxlength="100" required value="${esc(player?.name || '')}" placeholder="Ex.: Gabriel Santos"></div><div class="form-field full"><div class="form-help">O Overall é calculado automaticamente pela carta Incomum correspondente no FutSENAI Cards.</div></div><div class="form-field full"><label for="playerPhoto">Foto principal <span class="optional">(opcional)</span></label><div class="photo-upload"><div class="photo-preview" id="photoPreview">${previewImage(player?.photo_path, 'Foto principal atual')}</div><div class="photo-upload-input"><input id="playerPhoto" name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><div class="form-help">JPG, PNG, WEBP ou GIF · até 5 MB</div></div></div></div><div class="form-field full"><label for="reservePlayerPhoto">Foto reserva <span class="optional">(modo anti-resenha)</span></label><div class="photo-upload"><div class="photo-preview" id="reservePhotoPreview">${previewImage(player?.photo_reserve_path, 'Foto reserva atual')}</div><div class="photo-upload-input"><input id="reservePlayerPhoto" name="reserve_photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><div class="form-help">Será exibida no modo anti-resenha. JPG, PNG, WEBP ou GIF · até 5 MB</div></div></div></div></div></div><div class="modal-footer" style="display:none"></div></form>`;
  const footer = `<button type="button" class="btn btn-secondary" data-modal-close>Cancelar</button><button type="submit" form="playerForm" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Cadastrar jogador'}</button>`;
  modal(editing ? 'Editar jogador' : 'Novo jogador', editing ? 'Atualize o nome ou as fotos.' : 'Cadastre o nome e as fotos do jogador.', body, footer);
  const setupPhotoPreview = (inputId, previewId, photoPath, alt) => {
    const photoInput = document.getElementById(inputId);
    photoInput?.addEventListener('change', () => {
      const file = photoInput.files?.[0];
      const preview = document.getElementById(previewId);
      if (!preview) return;
      if (!file) { preview.innerHTML = previewImage(photoPath, alt); return; }
      if (file.size > 5 * 1024 * 1024) { photoInput.value = ''; toast('A imagem deve ter no máximo 5 MB.', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => { preview.innerHTML = `<img src="${esc(reader.result)}" alt="Prévia da foto">`; };
      reader.readAsDataURL(file);
    });
  };
  setupPhotoPreview('playerPhoto', 'photoPreview', player?.photo_path, 'Foto principal atual');
  setupPhotoPreview('reservePlayerPhoto', 'reservePhotoPreview', player?.photo_reserve_path, 'Foto reserva atual');
  document.getElementById('playerName')?.addEventListener('input', () => {
    for (const previewId of ['photoPreview', 'reservePhotoPreview']) {
      const preview = document.getElementById(previewId);
      if (preview && !preview.querySelector('img')) preview.textContent = initials(document.getElementById('playerName').value || 'FS');
    }
  });
}
