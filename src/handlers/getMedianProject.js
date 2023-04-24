const { getMedianProject } = require('../controllers/medianProjectController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const project = event.pathParameters.project;
  return await getMedianProject(project);
};
