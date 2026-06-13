const express = require('express');

const router = express.Router();
const holderControllers = require('../controllers/holders');

router.route('/holders').get(holderControllers.getHolders);
router.route('/holders/:pool').get(holderControllers.getHolderHistory);

module.exports = router;
