const express = require('express');
const router = express.Router();
const config = require('../controllers/config');

router.route('/url').get(config.getUrl);
router.route('/distinctID').get(config.getDistinctID);
router.route('/configPool/:configID').get(config.getConfigPool);

module.exports = router;
