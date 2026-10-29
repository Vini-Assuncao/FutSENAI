// Rotas de jogadores: cadastro, edição, arquivamento e exclusão.
const express = require('express');
const dataStore = require('../data-store');
const Stats = require('../stats');
const { httpError, requiredText, validId } = require('../http');
const {
  playerPhotos,
  photoPath,
  stagePlayerPhoto,
  stageExistingPhoto,
  commitStagedPhoto,
  rollbackStagedPhoto,
  finalizeStagedPhoto,
  cleanupStagedPhoto,
  removeUpload
} = require('../uploads');

const router = express.Router();

function playerStatsById(id) {
  const data = dataStore.getData();
  const player = data.players.find(item => item.id === id);
  return player ? Stats.playerStats(player, 'internal', data) : null;
}

function parsePlayerBody(body, existingPhoto = null, existingReservePhoto = null, photo = null, reservePhoto = null, existingQuality = 3) {
  const name = requiredText(body.name, 'nome', 100);
  const quality = Number(body.quality ?? existingQuality);
  if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
    throw httpError(400, 'A qualidade do jogador deve ser um número inteiro de 1 a 5.');
  }
  return {
    name,
    quality,
    photoPath: photo || existingPhoto,
    reservePhotoPath: reservePhoto || existingReservePhoto
  };
}

function stagePhoto(file, existingPath, name, role, playerId, players, stagedPhotos) {
  const staged = file
    ? stagePlayerPhoto(file, name, role, playerId, players)
    : existingPath
      ? stageExistingPhoto(existingPath, name, role, playerId, players)
      : null;
  if (staged) stagedPhotos.push(staged);
  return photoPath(staged, existingPath);
}

function rollbackPhotos(committedPhotos, stagedPhotos, originalError) {
  const rollbackErrors = [];
  for (const committed of committedPhotos.reverse()) {
    try { rollbackStagedPhoto(committed); } catch (error) { rollbackErrors.push(error); }
  }
  for (const staged of stagedPhotos) {
    try { cleanupStagedPhoto(staged); } catch (error) { rollbackErrors.push(error); }
  }
  return rollbackErrors.length
    ? new AggregateError([originalError, ...rollbackErrors], 'A operação falhou e não foi possível restaurar todas as fotos.')
    : originalError;
}

router.get('/', (req, res, next) => {
  try {
    const data = dataStore.getData();
    const scope = Stats.normalizeScope(req.query.scope);
    res.json({ data: Stats.playerList(data, req.query.includeInactive === 'true', scope), scope });
  } catch (error) { next(error); }
});

router.get('/:id/history', (req, res, next) => {
  try {
    const history = Stats.playerHistory(dataStore.getData(), validId(req.params.id));
    if (!history) throw httpError(404, 'Jogador não encontrado.');
    res.json({ data: history });
  } catch (error) { next(error); }
});

router.post('/', playerPhotos, (req, res, next) => {
  const stagedPhotos = [];
  const committedPhotos = [];
  let dataSaved = false;
  try {
    const files = req.files;
    const playerId = dataStore.getData().nextIds.players;
    const players = dataStore.getData().players;
    const name = requiredText(req.body.name, 'nome', 100);
    const stagedPhotoPath = stagePhoto(files?.photo?.[0], null, name, 'photo', playerId, players, stagedPhotos);
    const stagedReservePhotoPath = stagePhoto(files?.reserve_photo?.[0], null, name, 'reserve_photo', playerId, players, stagedPhotos);
    const player = parsePlayerBody(req.body, null, null, stagedPhotoPath, stagedReservePhotoPath);
    for (const staged of stagedPhotos) committedPhotos.push(commitStagedPhoto(staged));
    const id = dataStore.transaction(data => {
      const id = data.nextIds.players++;
      data.players.push({
        id,
        name: player.name,
        photo_path: player.photoPath,
        photo_reserve_path: player.reservePhotoPath,
        quality: player.quality,
        is_active: 1
      });
      return id;
    });
    dataSaved = true;
    for (const committed of committedPhotos) finalizeStagedPhoto(committed);
    res.status(201).json({ message: 'Jogador cadastrado com sucesso.', data: playerStatsById(id) });
  } catch (error) {
    next(dataSaved ? error : rollbackPhotos(committedPhotos, stagedPhotos, error));
  }
});

router.put('/:id', playerPhotos, (req, res, next) => {
  const stagedPhotos = [];
  const committedPhotos = [];
  let dataSaved = false;
  try {
    const id = validId(req.params.id);
    const existing = dataStore.getData().players.find(item => item.id === id);
    if (!existing) throw httpError(404, 'Jogador não encontrado.');
    const files = req.files;
    const uploadedPhoto = files?.photo?.[0];
    const uploadedReservePhoto = files?.reserve_photo?.[0];
    const players = dataStore.getData().players;
    const name = requiredText(req.body.name, 'nome', 100);
    const stagedPhotoPath = stagePhoto(uploadedPhoto, existing.photo_path, name, 'photo', id, players, stagedPhotos);
    const stagedReservePhotoPath = stagePhoto(uploadedReservePhoto, existing.photo_reserve_path, name, 'reserve_photo', id, players, stagedPhotos);
    const player = parsePlayerBody(req.body, existing.photo_path, existing.photo_reserve_path, stagedPhotoPath, stagedReservePhotoPath, existing.quality);
    for (const staged of stagedPhotos) committedPhotos.push(commitStagedPhoto(staged));
    dataStore.transaction(data => {
      const current = data.players.find(item => item.id === id);
      current.name = player.name;
      current.photo_path = player.photoPath;
      current.photo_reserve_path = player.reservePhotoPath;
      current.quality = player.quality;
    });
    dataSaved = true;
    for (const committed of committedPhotos) finalizeStagedPhoto(committed);
    for (const oldPhoto of new Set([existing.photo_path, existing.photo_reserve_path])) {
      if (oldPhoto && oldPhoto !== player.photoPath && oldPhoto !== player.reservePhotoPath) removeUpload(oldPhoto);
    }
    res.json({ message: 'Jogador atualizado com sucesso.', data: playerStatsById(id) });
  } catch (error) {
    next(dataSaved ? error : rollbackPhotos(committedPhotos, stagedPhotos, error));
  }
});

router.patch('/:id/archive', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const player = dataStore.getData().players.find(item => item.id === id);
    if (!player) throw httpError(404, 'Jogador não encontrado.');
    const active = player.is_active ? 0 : 1;
    dataStore.transaction(data => {
      data.players.find(item => item.id === id).is_active = active;
    });
    res.json({ message: active ? 'Jogador reativado.' : 'Jogador arquivado. O histórico foi preservado.', is_active: active });
  } catch (error) { next(error); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = validId(req.params.id);
    const player = dataStore.getData().players.find(item => item.id === id);
    if (!player) throw httpError(404, 'Jogador não encontrado.');
    const appearances = dataStore.getData().match_players.filter(item => item.player_id === id).length;
    if (appearances > 0) {
      dataStore.transaction(data => {
        data.players.find(item => item.id === id).is_active = 0;
      });
      return res.json({ message: 'Este jogador tem partidas no histórico, então foi arquivado para preservar as estatísticas.', archived: true });
    }
    dataStore.transaction(data => {
      data.players = data.players.filter(item => item.id !== id);
      data.goals.forEach(goal => { if (goal.player_id === id) goal.player_id = null; });
    });
    for (const photo of new Set([player.photo_path, player.photo_reserve_path])) removeUpload(photo);
    res.json({ message: 'Jogador excluído com sucesso.', archived: false });
  } catch (error) { next(error); }
});

module.exports = router;
