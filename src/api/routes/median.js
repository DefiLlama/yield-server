const express = require('express');
const router = express.Router();
const median = require('../controllers/median');
const asyncHandler = require('../asyncHandler');

router.route('/median').get(asyncHandler(median.getMedian));
router
  .route('/medianProject/:project')
  .get(asyncHandler(median.getMedianProject));

module.exports = router;
