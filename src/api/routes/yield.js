const express = require('express');
const router = express.Router();
const yieldControllers = require('../controllers/yield');

router.route('/chart/:pool').get(yieldControllers.getYieldHistory);
router.route('/chartHourly/:pool').get(yieldControllers.getYieldHistoryHourly);
router.route('/chartLendBorrow/:pool').get(yieldControllers.getYieldLendBorrowHistory);
router.route('/volume/:pool').get(yieldControllers.getVolumeHistory);

module.exports = router;
