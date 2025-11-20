const { config } = require('./src/config');
const { createApp } = require('./src/app');
const { initPool, closePool } = require('./src/db/oracle');

const app = createApp();

async function start() {
  await initPool();

  const server = app.listen(config.port, () => {
    console.log(`[Server] Listening on port ${config.port}`);
  });

  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});

module.exports = {
  app
};

app.get('/', (req, res) => {
  res.send('API InfoTex corriendo ✅'+'CHUPALO SEBA');
});