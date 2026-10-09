const express = require('express');
const router = express.Router();
const config = require('../controllers/config');
const asyncHandler = require('../asyncHandler');

router.route('/url').get(asyncHandler(config.getUrl));
router.route('/distinctID').get(asyncHandler(config.getDistinctID));
router.route('/configPool/:configID').get(asyncHandler(config.getConfigPool));
router.route('/allPools').get(asyncHandler(config.getAllPools));

module.exports = router;
