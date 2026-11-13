const express = require('express');
const router = express.Router();
const config = require('../controllers/config');

router.route('/url').get(config.getUrl);
router.route('/distinctID').get(config.getDistinctID);

module.exports = router;
