const express = require('express');
const router = express.Router();
const perp = require('../controllers/perp');

router.route('/perps').get(perp.getPerp);

module.exports = router;
