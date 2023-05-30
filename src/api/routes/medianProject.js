const express = require('express');
const router = express.Router();
const medianProject = require('../controllers/medianProject');

router.route('/median/:project').get(medianProject.getMedianProject);

module.exports = router;
