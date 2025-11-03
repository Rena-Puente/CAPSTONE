const { executeQuery } = require('../db/oracle');

function registerHealthRoutes(app) {
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/test-db', async (req, res) => {
    try {
      const result = await executeQuery('SELECT 1 AS RESULT FROM dual');
      res.json({
        ok: true,
        data: result.rows
      });
    } catch (error) {
      console.error('[DB] Test query failed:', error);
      res.status(500).json({ ok: false, error: 'Database connection failed', details: error.message });
    }
  });
}

module.exports = {
  registerHealthRoutes
};
