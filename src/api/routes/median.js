const express = require('express');
const router = express.Router();
const median = require('../controllers/median');

router.route('/median').get(median.getMedian);
router.route('/median/:project').get(median.getMedianProject);

module.exports = router;
