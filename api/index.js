// Vercel serverless entry: every non-static route is rewritten here (see vercel.json).
const app = require('../lib/app');
module.exports = async (req, res) => { await app.boot(); await app.handle(req, res); };
