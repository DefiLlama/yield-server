const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');

const VAULT = '0xd53B68fB4eb907c3c1E348CD7d7bEDE34f763805';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const VAULT_DEPLOY_BLOCK = 24181000;

const ABI = [
  'function sharePrice() view returns (uint256)',
  'function totalAssets() view returns (uint256)',
];

const apy = async () => {
  const provider = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com');
  const vault = new ethers.Contract(VAULT, ABI, provider);

  const latestBlock = await provider.getBlockNumber();
  const blocksPerDay = 7200;

  const currentSharePrice = (await vault.sharePrice()) / 1e6;
  const totalAssets = (await vault.totalAssets()) / 1e6;

  let apyBase = 0;
  let historicalBlock = latestBlock - blocksPerDay * 7;
  let daysForCalc = 7;

  if (historicalBlock < VAULT_DEPLOY_BLOCK) {
    historicalBlock = latestBlock - blocksPerDay;
    daysForCalc = 1;
  }

  if (historicalBlock >= VAULT_DEPLOY_BLOCK) {
    const historicalSharePrice = (await vault.sharePrice({ blockTag: historicalBlock })) / 1e6;
    const priceChange = (currentSharePrice - historicalSharePrice) / historicalSharePrice;
    apyBase = (priceChange / daysForCalc) * 365 * 100;
  }

  return [{
    pool: `${VAULT}-ethereum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'lazyusd',
    symbol: 'USDC',
    tvlUsd: totalAssets,
    apyBase,
    underlyingTokens: [USDC],
    url: 'https://getlazy.xyz',
  }];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://getlazy.xyz',
};
