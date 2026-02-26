const sdk = require('@defillama/sdk');
const utils = require('../utils');

const APYUSD_VAULT = '0x38EEb52F0771140d10c4E9A9a72349A329Fe8a6A';
const APXUSD_TOKEN = '0x98A878b1Cd98131B271883B390f68D2c90674665';
const RATE_VIEW = '0xCABa36EDE2C08e16F3602e8688a8bE94c1B4e484';

const apy = async () => {
  const totalAssets = (
    await sdk.api.abi.call({
      target: APYUSD_VAULT,
      abi: 'function totalAssets() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  const apyResult = (
    await sdk.api.abi.call({
      target: RATE_VIEW,
      abi: 'function apy() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  const tvlUsd = totalAssets / 1e18;
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
