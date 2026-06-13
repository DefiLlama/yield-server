const express = require('express');
const router = express.Router();
const tokenAddress = require('../controllers/tokenAddress');

router.route('/tokenAddress').get(tokenAddress.getTokenAddress);

module.exports = router;
