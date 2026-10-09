const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, 'futsenai.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}
function columnsOf(name) {
  return tableExists(name) ? db.prepare(`PRAGMA table_info(${name})`).all().map(column => column.name) : [];
}
function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      photo_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      played_on TEXT NOT NULL,
      opponent_type TEXT NOT NULL DEFAULT 'classmates' CHECK (opponent_type IN ('classmates', 'second_year')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS match_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      team_side TEXT NOT NULL CHECK (team_side IN ('A', 'B')),
      UNIQUE(match_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_side TEXT NOT NULL CHECK (team_side IN ('A', 'B')),
      player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
      goal_type TEXT NOT NULL DEFAULT 'normal' CHECK (goal_type IN ('normal', 'own_goal')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);
    CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
    CREATE INDEX IF NOT EXISTS idx_goals_match ON goals(match_id);
    CREATE INDEX IF NOT EXISTS idx_goals_player ON goals(player_id);
  `);
}

// Atualiza bancos da versão anterior sem apagar o histórico de jogadores, partidas ou gols.
// Campos que não fazem parte do uso real (apelido, posição, duração, minutos, etc.) deixam de existir.
const playerColumns = columnsOf('players');
const matchColumns = columnsOf('matches');
const isLegacyDatabase = playerColumns.includes('nickname') || matchColumns.includes('team_a_name') || columnsOf('goals').includes('minute');

if (isLegacyDatabase) {
  const migrate = db.transaction(() => {
    // Renomeia as tabelas antigas para manter os dados disponíveis durante a migração.
    if (tableExists('goals')) db.exec('ALTER TABLE goals RENAME TO goals_legacy');
    if (tableExists('match_players')) db.exec('ALTER TABLE match_players RENAME TO match_players_legacy');
    if (tableExists('matches')) db.exec('ALTER TABLE matches RENAME TO matches_legacy');
    if (tableExists('players')) db.exec('ALTER TABLE players RENAME TO players_legacy');

    // Os índices antigos mantêm seus nomes após a renomeação; removê-los libera os nomes para o novo esquema.
    db.exec(`
      DROP INDEX IF EXISTS idx_match_players_player;
      DROP INDEX IF EXISTS idx_match_players_match;
      DROP INDEX IF EXISTS idx_goals_match;
      DROP INDEX IF EXISTS idx_goals_player;
    `);
    createSchema();

    if (tableExists('players_legacy')) {
      db.exec(`INSERT INTO players (id, name, photo_path, is_active, created_at)
        SELECT id, name, photo_path, COALESCE(is_active, 1), COALESCE(created_at, datetime('now', 'localtime')) FROM players_legacy`);
    }
    if (tableExists('matches_legacy')) {
      db.exec(`INSERT INTO matches (id, played_on, created_at)
        SELECT id, played_on, COALESCE(created_at, datetime('now', 'localtime')) FROM matches_legacy`);
    }
    if (tableExists('match_players_legacy')) {
      db.exec(`INSERT INTO match_players (id, match_id, player_id, team_side)
        SELECT id, match_id, player_id, team_side FROM match_players_legacy`);
    }
    if (tableExists('goals_legacy')) {
      db.exec(`INSERT INTO goals (id, match_id, team_side, player_id, goal_type, created_at)
        SELECT id, match_id, team_side, player_id,
          CASE WHEN goal_type = 'own_goal' THEN 'own_goal' ELSE 'normal' END,
          COALESCE(created_at, datetime('now', 'localtime'))
        FROM goals_legacy`);
    }

    db.exec(`
      DROP TABLE IF EXISTS goals_legacy;
      DROP TABLE IF EXISTS match_players_legacy;
      DROP TABLE IF EXISTS matches_legacy;
      DROP TABLE IF EXISTS players_legacy;
    `);
  });
  migrate();
} else {
  createSchema();
}

// A versão anterior simplificada ainda não tinha o tipo de adversário. Adiciona a
// coluna em bancos existentes sem recriar tabelas ou perder o histórico.
if (tableExists('matches') && !columnsOf('matches').includes('opponent_type')) {
  db.exec("ALTER TABLE matches ADD COLUMN opponent_type TEXT NOT NULL DEFAULT 'classmates'");
}

db.pragma('foreign_keys = ON');

module.exports = db;
