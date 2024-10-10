const express = require('express');
const router = express.Router();
const risk = require('../controllers/risk');

router.route('/risk').get(risk.getRiskRating);

module.exports = router;
