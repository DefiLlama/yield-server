const express = require('express');
const router = express.Router();
const config = require('../controllers/config');

router.route('/url').get(config.getUrl);
router.route('/distinctID').get(config.getDistinctID);
router.route('/pools/:poolID').get(config.getConfigPool);
router.route('/pools').get(config.getAllPools);

module.exports = router;
