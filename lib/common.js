// Helpers shared by every storage backend.
const crypto = require('crypto');

const now = () => new Date().toISOString();
const uid = () => crypto.randomBytes(9).toString('base64url');

function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function checkPass(pw, stored) {
  if (!stored) return false;
  const [s, h] = stored.split(':');
  const calc = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 32);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}

module.exports = { now, uid, hashPass, checkPass };
