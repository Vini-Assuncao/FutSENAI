// Utilitários HTTP: erros com status, validação de campos e tratamento final de erros.
const { MulterError } = require('multer');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requiredText(value, field, max = 120) {
  const text = String(value ?? '').trim();
  if (!text) throw httpError(400, `Preencha o campo ${field}.`);
  if (text.length > max) throw httpError(400, `O campo ${field} deve ter no máximo ${max} caracteres.`);
  return text;
}

function optionalText(value, max = 500) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw httpError(400, `O texto deve ter no máximo ${max} caracteres.`);
  return text;
}

function validId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Identificador inválido.');
  return id;
}

function errorHandler(error, _req, res, _next) {
  if (error instanceof MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'A imagem deve ter no máximo 5 MB.' : error.message;
    return res.status(400).json({ error: message });
  }
  const status = error.status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? 'Ocorreu um erro interno. Confira o terminal do servidor.' : error.message });
}

module.exports = { httpError, requiredText, optionalText, validId, errorHandler };
