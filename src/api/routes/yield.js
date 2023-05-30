const express = require('express');
const router = express.Router();
const yield = require('../controllers/yield');

router.route('/chart/:configID').get(yield.getYieldHistory);
router.route('/lendBorrow').get(yield.getYieldLendBorrow);
router.route('/chartLendBorrow/:configID').get(yield.getYieldLendBorrowHistory);

module.exports = router;
