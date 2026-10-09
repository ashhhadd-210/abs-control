// ABS Control — local / VPS launcher. Run: node server.js   (Node 22.5+, no dependencies)
const http = require('http');
const app = require('./lib/app');
const PORT = Number(process.env.PORT || 4800);
app.boot().then(() => {
  http.createServer(app.handle).listen(PORT, () => console.log(`ABS Control running → http://localhost:${PORT}`));
});
