const sdk = require('@defillama/sdk');
const utils = require('../utils');

const APYUSD_VAULT = '0x38EEb52F0771140d10c4E9A9a72349A329Fe8a6A';
const APXUSD_TOKEN = '0x98A878b1Cd98131B271883B390f68D2c90674665';
const RATE_VIEW = '0xCABa36EDE2C08e16F3602e8688a8bE94c1B4e484';

const apy = async () => {
  const [totalAssetsRes, apyRes, { pricesByAddress }] = await Promise.all([
    sdk.api.abi.call({
      target: APYUSD_VAULT,
      abi: 'function totalAssets() view returns (uint256)',
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: RATE_VIEW,
      abi: 'function apy() view returns (uint256)',
      chain: 'ethereum',
    }),
    utils.getPrices([APXUSD_TOKEN], 'ethereum'),
  ]);

  const totalAssets = totalAssetsRes.output;
  const apyResult = apyRes.output;
  const tokenPrice = pricesByAddress[APXUSD_TOKEN.toLowerCase()];
  if (!Number.isFinite(tokenPrice)) {
    throw new Error(`apxUSD price unavailable from coins.llama.fi`);
  }

  // Multiply by token price so TVL stays accurate if apxUSD depegs
  const tvlUsd = (totalAssets / 1e18) * tokenPrice;
  const apyBase = apyResult / 1e16;

  return [
    {
      pool: `${APYUSD_VAULT}-ethereum`.toLowerCase(),
      chain: utils.formatChain('ethereum'),
      project: 'apyx-protocol',
      symbol: 'apxUSD',
      tvlUsd,
      apyBase,
      underlyingTokens: [APXUSD_TOKEN],
      poolMeta: 'apyUSD vault',
      url: 'https://apyx.fi',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://apyx.fi',
};
