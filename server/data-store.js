const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dataFile = path.join(__dirname, '..', 'public', 'data', 'futsenai.json');
const emptyData = {
  schemaVersion: 1,
  nextIds: { players: 1, matches: 1, match_players: 1, goals: 1 },
  players: [],
  matches: [],
  match_players: [],
  goals: []
};

fs.mkdirSync(path.dirname(dataFile), { recursive: true });

function validateData(data) {
  if (!data || data.schemaVersion !== 1 || !data.nextIds) {
    throw new Error(`Formato inválido no arquivo de dados: ${dataFile}`);
  }
  for (const collection of ['players', 'matches', 'match_players', 'goals']) {
    if (!Array.isArray(data[collection]) || !Number.isInteger(data.nextIds[collection]) || data.nextIds[collection] < 1) {
      throw new Error(`Coleção ${collection} inválida no arquivo de dados: ${dataFile}`);
    }
    const ids = new Set();
    let maxId = 0;
    for (const record of data[collection]) {
      if (!Number.isInteger(record.id) || record.id < 1 || ids.has(record.id)) {
        throw new Error(`Identificadores inválidos na coleção ${collection}: ${dataFile}`);
      }
      ids.add(record.id);
      maxId = Math.max(maxId, record.id);
    }
    if (data.nextIds[collection] <= maxId) {
      throw new Error(`Próximo identificador inválido na coleção ${collection}: ${dataFile}`);
    }
  }
  if (data.players.some(player => !Number.isInteger(player.quality) || player.quality < 1 || player.quality > 5 || ![0, 1].includes(player.is_active))) {
    throw new Error(`Cadastro de jogador inválido no arquivo de dados: ${dataFile}`);
  }
  if (data.matches.some(match => !['classmates', 'second_year'].includes(match.opponent_type))) {
    throw new Error(`Tipo de partida inválido no arquivo de dados: ${dataFile}`);
  }
  const playerIds = new Set(data.players.map(player => player.id));
  const matchIds = new Set(data.matches.map(match => match.id));
  const participantKeys = new Set();
  for (const participant of data.match_players) {
    const key = `${participant.match_id}:${participant.player_id}`;
    if (!matchIds.has(participant.match_id) || !playerIds.has(participant.player_id) || !['A', 'B'].includes(participant.team_side) || participantKeys.has(key)
      || (participant.assists !== undefined && (!Number.isInteger(participant.assists) || participant.assists < 0))) {
      throw new Error(`Escalação com referência inválida no arquivo de dados: ${dataFile}`);
    }
    participantKeys.add(key);
  }
  for (const goal of data.goals) {
    if (!matchIds.has(goal.match_id) || !['A', 'B'].includes(goal.team_side) || !['normal', 'own_goal'].includes(goal.goal_type) || (goal.player_id !== null && !playerIds.has(goal.player_id))) {
      throw new Error(`Gol com referência inválida no arquivo de dados: ${dataFile}`);
    }
  }
}

function writeData(data) {
  const temporaryFile = `${dataFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const content = `${JSON.stringify(data, null, 2)}\n`;
  try {
    fs.writeFileSync(temporaryFile, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryFile, dataFile);
  } catch (error) {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    throw error;
  }
}

function readData() {
  if (!fs.existsSync(dataFile)) {
    writeData(emptyData);
    return structuredClone(emptyData);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    throw new Error(`Não foi possível ler o arquivo JSON ${dataFile}: ${error.message}`, { cause: error });
  }
  validateData(data);
  return data;
}

let currentData = readData();

function transaction(update) {
  const nextData = structuredClone(currentData);
  const result = update(nextData);
  validateData(nextData);
  writeData(nextData);
  currentData = nextData;
  return result;
}

module.exports = {
  getData: () => currentData,
  transaction,
  dataFile
};
