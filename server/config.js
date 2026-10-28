const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const publicDirectory = path.join(projectRoot, 'public');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  publicDirectory,
  uploadsDirectory: path.join(publicDirectory, 'uploads'),
  LOCAL_EDITOR_ORIGINS: new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000'
  ])
};
