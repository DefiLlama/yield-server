const express = require('express');
const router = express.Router();
const yieldControllers = require('../controllers/yield');
const sunsetNotice = require('../sunsetNotice');

router
  .route('/chart/:pool')
  .get(sunsetNotice('/yields/v1/chart/{pool}'), yieldControllers.getYieldHistory);
router
  .route('/chartLendBorrow/:pool')
  .get(
    sunsetNotice('/yields/v1/chartLendBorrow/{pool}'),
    yieldControllers.getYieldLendBorrowHistory
  );
router.route('/volume/:pool').get(yieldControllers.getVolumeHistory);

module.exports = router;
