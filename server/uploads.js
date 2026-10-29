// Upload de fotos dos jogadores: nomes estáveis, validação de tipo/tamanho e limpeza.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { uploadsDirectory, publicDirectory } = require('./config');
const { httpError } = require('./http');

fs.mkdirSync(uploadsDirectory, { recursive: true });

const MIME_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!MIME_EXTENSIONS.has(file.mimetype)) {
      return callback(httpError(400, 'Formato inválido. Envie uma imagem JPG, PNG, WEBP ou GIF.'));
    }
    callback(null, true);
  }
});

const playerPhotos = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'reserve_photo', maxCount: 1 }]);

function playerSlug(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'jogador';
}

function photoFilename(name, role, extension, playerId, players) {
  const slug = playerSlug(name);
  const duplicateName = players.some(player => player.id !== playerId && playerSlug(player.name) === slug);
  const uniqueSuffix = duplicateName ? `_${playerId}` : '';
  const reserveSuffix = role === 'reserve_photo' ? '_reserva' : '';
  return `foto_${slug}${uniqueSuffix}${reserveSuffix}${extension}`;
}

function uploadPath(photoPath) {
  if (typeof photoPath !== 'string' || !photoPath.startsWith('/uploads/')) return null;
  const file = path.resolve(publicDirectory, photoPath.slice(1));
  const relative = path.relative(uploadsDirectory, file);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null;
  return file;
}

function stageFile(buffer, filename) {
  const temporaryFile = path.join(uploadsDirectory, `.upload-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporaryFile, buffer, { flag: 'wx' });
  return {
    temporaryFile,
    targetFile: path.join(uploadsDirectory, filename),
    photoPath: `/uploads/${filename}`
  };
}

function stagePlayerPhoto(file, name, role, playerId, players) {
  const extension = MIME_EXTENSIONS.get(file.mimetype);
  if (!extension) throw httpError(400, 'Formato inválido. Envie uma imagem JPG, PNG, WEBP ou GIF.');
  return stageFile(file.buffer, photoFilename(name, role, extension, playerId, players));
}

function stageExistingPhoto(photoPath, name, role, playerId, players) {
  const sourceFile = uploadPath(photoPath);
  if (!sourceFile || !fs.existsSync(sourceFile)) {
    throw new Error(`Não foi possível encontrar a foto atual: ${photoPath}`);
  }
  const extension = path.extname(sourceFile).toLowerCase();
  if (![...MIME_EXTENSIONS.values()].includes(extension)) {
    throw new Error(`Formato inválido para a foto atual: ${photoPath}`);
  }
  const filename = photoFilename(name, role, extension, playerId, players);
  const desiredPath = `/uploads/${filename}`;
  if (desiredPath === photoPath) return null;
  return stageFile(fs.readFileSync(sourceFile), filename);
}

function commitStagedPhoto(staged) {
  let backupFile = null;
  if (fs.existsSync(staged.targetFile)) {
    backupFile = `${staged.targetFile}.${crypto.randomUUID()}.bak`;
    fs.renameSync(staged.targetFile, backupFile);
  }
  try {
    fs.renameSync(staged.temporaryFile, staged.targetFile);
  } catch (error) {
    if (backupFile) fs.renameSync(backupFile, staged.targetFile);
    throw error;
  }
  return { ...staged, backupFile };
}

function rollbackStagedPhoto(committed) {
  if (fs.existsSync(committed.targetFile)) fs.unlinkSync(committed.targetFile);
  if (committed.backupFile && fs.existsSync(committed.backupFile)) {
    fs.renameSync(committed.backupFile, committed.targetFile);
  }
}

function finalizeStagedPhoto(committed) {
  if (committed.backupFile && fs.existsSync(committed.backupFile)) fs.unlinkSync(committed.backupFile);
}

function cleanupStagedPhoto(staged) {
  if (staged && fs.existsSync(staged.temporaryFile)) fs.unlinkSync(staged.temporaryFile);
}

function removeUpload(photoPath) {
  const file = uploadPath(photoPath);
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = {
  playerPhotos,
  photoPath: (staged, existingPath = null) => staged?.photoPath || existingPath,
  stagePlayerPhoto,
  stageExistingPhoto,
  commitStagedPhoto,
  rollbackStagedPhoto,
  finalizeStagedPhoto,
  cleanupStagedPhoto,
  removeUpload
};
