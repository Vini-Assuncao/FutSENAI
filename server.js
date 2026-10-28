// Ponto de entrada: inicia o servidor HTTP do FutSENAI.
const { createApp } = require('./server/app');
const { PORT } = require('./server/config');
const dataStore = require('./server/data-store');

createApp().listen(PORT, () => {
  console.log(`\n⚽ FutSENAI rodando em http://localhost:${PORT}`);
  console.log(`Dados JSON: ${dataStore.dataFile}\n`);
});
