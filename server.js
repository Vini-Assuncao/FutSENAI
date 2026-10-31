// Ponto de entrada: inicia o servidor HTTP do FutSENAI Score.
const { createApp } = require('./server/app');
const { PORT } = require('./server/config');
const dataStore = require('./server/data-store');

createApp().listen(PORT, () => {
  console.log(`\n⚽ FutSENAI Score rodando em http://localhost:${PORT}`);
  console.log(`Dados JSON: ${dataStore.dataFile}\n`);
});
