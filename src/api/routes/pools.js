const express = require('express');
const router = express.Router();
const pools = require('../controllers/pools');
const sunsetNotice = require('../sunsetNotice');

router.route('/pools').get(sunsetNotice('/yields/v1/pools'), pools.getPools);

module.exports = router;
