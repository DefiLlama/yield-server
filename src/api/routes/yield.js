const express = require('express');
const router = express.Router();
const yieldControllers = require('../controllers/yield');
const asyncHandler = require('../asyncHandler');

router
  .route('/chart/:pool')
  .get(asyncHandler(yieldControllers.getYieldHistory));
router
  .route('/chartLendBorrow/:pool')
  .get(asyncHandler(yieldControllers.getYieldLendBorrowHistory));
router
  .route('/volume/:pool')
  .get(asyncHandler(yieldControllers.getVolumeHistory));

module.exports = router;
