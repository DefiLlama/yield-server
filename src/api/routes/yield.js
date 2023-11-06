const express = require('express');
const router = express.Router();
const yield = require('../controllers/yield');

router.route('/chart/:pool').get(yield.getYieldHistory);
router.route('/chartHourly/:pool').get(yield.getYieldHistoryHourly);
router.route('/chartLendBorrow/:pool').get(yield.getYieldLendBorrowHistory);

module.exports = router;
