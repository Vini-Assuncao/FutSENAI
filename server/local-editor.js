// Edição só é permitida para o servidor local em http://localhost:3000.
const { PORT, LOCAL_EDITOR_ORIGINS } = require('./config');

function isLoopbackAddress(address) {
  return address === '::1' || address === '127.0.0.1' || address?.startsWith('::ffff:127.');
}

function requireLocalEditor(req, res, next) {
  const host = req.get('host')?.toLowerCase();
  const origin = req.get('origin');
  if (PORT !== 3000 || !isLoopbackAddress(req.socket.remoteAddress)
    || !LOCAL_EDITOR_ORIGINS.has(origin) || !LOCAL_EDITOR_ORIGINS.has(`http://${host}`)) {
    return res.status(403).json({ error: 'Edição disponível somente no servidor local em http://localhost:3000.' });
  }
  next();
}

module.exports = { requireLocalEditor };
