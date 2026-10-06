const express = require('express');
const router = express.Router();
const pools = require('../controllers/pools');
const asyncHandler = require('../asyncHandler');

router.route('/pools').get(asyncHandler(pools.getPools));
router.route('/lendBorrow').get(asyncHandler(pools.getLendBorrow));

module.exports = router;
