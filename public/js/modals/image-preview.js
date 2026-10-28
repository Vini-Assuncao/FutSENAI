// modals/image-preview.js
import { modalRoot } from '../state.js';
import { modal } from '../ui.js';

export function openPlayerImagePreview(image, alt) {
  const overlay = document.createElement('div');
  overlay.className = 'player-image-lightbox';
  overlay.dataset.playerImageLightbox = '';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', alt);

  const closeButton = document.createElement('button');
  closeButton.className = 'player-image-lightbox-close';
  closeButton.type = 'button';
  closeButton.dataset.imagePreviewClose = '';
  closeButton.setAttribute('aria-label', 'Fechar foto');
  closeButton.textContent = '×';

  const enlargedImage = document.createElement('img');
  enlargedImage.src = image.currentSrc || image.src;
  enlargedImage.alt = alt;

  overlay.append(closeButton, enlargedImage);
  modalRoot.replaceChildren(overlay);
  modalRoot.dataset.open = 'true';
  document.body.style.overflow = 'hidden';
  closeButton.focus();
}
