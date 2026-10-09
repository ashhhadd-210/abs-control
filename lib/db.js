// Storage backend selector. All stores expose the same interface (see store-memory.js for the smallest one).
//   sqlite  — local / VPS: durable, on-disk (default)
//   memory  — hosted demo (Vercel): in-memory working set, reseeded on each cold start
// ABS_STORE overrides; on Vercel the memory store is chosen automatically.
const mode = process.env.ABS_STORE || (process.env.VERCEL ? 'memory' : 'sqlite');
module.exports = mode === 'memory' ? require('./store-memory') : require('./store-sqlite');
