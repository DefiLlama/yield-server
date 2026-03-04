const express = require('express');
const router = express.Router();
const volatility = require('../controllers/volatility');

router.route('/volatility').get(volatility.getVolatility);

module.exports = router;
