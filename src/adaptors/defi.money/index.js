const sdk = require('@defillama/sdk');
const utils = require('../utils');
const BigNumber = require('bignumber.js');

const SMONEY_CONTRACT = '0x4626C0D31c52991573DDd4dF8F2bB1Bc5101284F';
const MONEY_CONTRACT = '0x69420f9E38a4e60a62224C489be4BF7a94402496';

const abi = {
  rewardsPerSecond: {
    "inputs": [],
    "name": "rewardsPerSecond",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  totalStoredAssets: {
    "inputs": [],
    "name": "totalStoredAssets",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  totalStoredAssets: {
    "inputs": [],
    "name": "totalStoredAssets",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  totalCooldownAssets: {
    "inputs": [],
    "name": "totalCooldownAssets",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
};

const fetchSmoneyAPI = async () => {
  const chain = 'optimism';

  const [
    rewardsPerSecond,
    totalStoredAssets,
    totalCooldownAssets,
  ] = await Promise.all([
    sdk.api.abi.call({
      target: SMONEY_CONTRACT,
      abi: abi.rewardsPerSecond,
      chain: chain,
    }),
    sdk.api.abi.call({
      target: SMONEY_CONTRACT,
      abi: abi.totalStoredAssets,
      chain: chain,
    }),
    sdk.api.abi.call({
      target: SMONEY_CONTRACT,
    abi: abi.totalCooldownAssets,
      chain: chain,
    }),
  ]);

  const apy = BigNumber(rewardsPerSecond.output)
    .times(86400)
    .times(365)
    .div(totalStoredAssets.output)
    .times(100)
    .toNumber()

  const tvlUsd = BigNumber(totalStoredAssets.output)
    .plus(totalCooldownAssets.output)
    .div(1e18)
    .toNumber();

  const sMoneyPool = {
    pool: `${SMONEY_CONTRACT}-${chain}`,
    chain: utils.formatChain(chain),
    project: 'defi.money',
    symbol: utils.formatSymbol('sMONEY'),
    tvlUsd,
    apyBase: apy,
    underlyingTokens: [MONEY_CONTRACT],
    poolMeta: '7 day withdrawal cooldown',
    url: `https://app.defi.money/earn/${chain}`,
  };

  return [sMoneyPool];
};

module.exports = {
  timetravel: false,
  apy: fetchSmoneyAPI,
  url: 'https://app.defi.money/earn/optimism',
};