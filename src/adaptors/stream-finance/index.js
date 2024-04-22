const utils = require('../utils');
const axios = require('axios');


const getTokenPrice = async (priceKey, amount) => {
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;
  return Number(price) * amount;
};


const main = async () => {
  const data = await utils.getData('https://api.streamprotocol.money/vaults');

  const pools = [];
  
  for (const entry of data) {

    for (const chain of entry.chains) {
      if (chain.name !== "ethereum") continue;
      pools.push({
        pool: `${chain.vault_token_address}-${chain.name}`,
        chain: utils.formatChain(chain.name),
        project: 'stream-finance',
        symbol: utils.formatSymbol(entry.vault_token.ticker),
        tvlUsd: await getTokenPrice(`ethereum:${chain.underlying_token_address}`, Number(entry.lockedValue)),
        apy: entry.apy,
      });
    }
   
  }

  return pools.filter((pool) => {
    return utils.keepFinite(pool);
  });

}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.streamprotocol.money',
}; 
