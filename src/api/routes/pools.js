const express = require('express');
const router = express.Router();
const pools = require('../controllers/pools');

router.route('/pools').get(pools.getPools);
router.route('/lendBorrow').get(pools.getLendBorrow);

module.exports = router;
