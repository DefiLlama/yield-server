const utils = require('../utils');
const logger = require("../../utils/logger");

const poolsFunction = async () => {
  const poolData = await utils.getData(
    'https://api-external.ghostmarket.io/defillama/yield'
  );
  logger.info(poolData)
  return [poolData]
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://ghostmarket.io/incentives/gfund'
};