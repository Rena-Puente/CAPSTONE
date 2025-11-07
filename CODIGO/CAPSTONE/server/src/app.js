const express = require('express');
const cors = require('cors');

const { registerHealthRoutes } = require('./routes/health');
const { registerAuthRoutes } = require('./routes/auth');
const { registerProfileRoutes } = require('./routes/profile');
const { registerEducationRoutes } = require('./routes/education');
const { registerExperienceRoutes } = require('./routes/experience');
const { registerSkillRoutes } = require('./routes/skills');
const { registerCompanyRoutes } = require('./routes/companies');
const { registerOfferRoutes } = require('./routes/offers');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerEducationRoutes(app);
  registerExperienceRoutes(app);
  registerSkillRoutes(app);
  registerCompanyRoutes(app);
  registerOfferRoutes(app);

  return app;
}

module.exports = {
  createApp
};
