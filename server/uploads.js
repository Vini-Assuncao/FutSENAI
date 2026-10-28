// Upload de fotos dos jogadores: armazenamento, validação de tipo/tamanho e limpeza de arquivos.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { uploadsDirectory, publicDirectory } = require('./config');
const { httpError } = require('./http');

fs.mkdirSync(uploadsDirectory, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDirectory),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(httpError(400, 'Formato inválido. Envie uma imagem JPG, PNG, WEBP ou GIF.'));
    }
    callback(null, true);
  }
});

const playerPhotos = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'reserve_photo', maxCount: 1 }]);

// Remove um arquivo de foto apenas se ele estiver dentro de public/uploads.
function removeUpload(photoPath) {
  if (!photoPath || !photoPath.startsWith('/uploads/')) return;
  const file = path.join(publicDirectory, photoPath.replace(/^\//, ''));
  if (file.startsWith(uploadsDirectory) && fs.existsSync(file)) fs.unlink(file, () => {});
}

function uploadedPlayerPhotos(files) {
  return ['photo', 'reserve_photo'].flatMap(field => files?.[field] || []);
}

module.exports = { playerPhotos, removeUpload, uploadedPlayerPhotos };
