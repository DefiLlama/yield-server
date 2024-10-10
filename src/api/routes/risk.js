const express = require('express');
const router = express.Router();
const risk = require('../controllers/risk');

router.route('/risk').post(risk.getRiskRating);

module.exports = router;
