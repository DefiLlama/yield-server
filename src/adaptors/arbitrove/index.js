const utils = require('../utils');
const sdk = require('@defillama/sdk');
const alpAbi = require('./abi/ALP.json');

const chains = { arbitrum: 'arbitrum' };

const getApy = async () => {
  const { coins: priceData } = await utils.getData(
    `https://coins.llama.fi/prices/current/coingecko:nitro-cartel,coingecko:arbitrove-alp`
  );

  const stakingAddress = '0x9d4903f755fc12cded3012686c2064e98b84e6b7';
  const troveAddress = '0x982239D38Af50B0168dA33346d85Fb12929c4c07';
  const alpAddress = '0xb49B6A3Fd1F4bB510Ef776de7A88A9e65904478A';
  const alpPrice = priceData['coingecko:arbitrove-alp'].price;
  const trovePrice = priceData['coingecko:nitro-cartel'].price;
  const { tvl } = await utils.getData(
    'https://nitrocartel.finance/api/alpData?chainId=42161'
  );

  const { output: alpStakedAmount } = await sdk.api.abi.call({
    target: alpAddress,
    abi: 'erc20:balanceOf',
    chain: chains['arbitrum'],
    params: [stakingAddress],
  });
  const { output: alpTotalSupply } = await sdk.api.abi.call({
    target: alpAddress,
    abi: alpAbi['totalSupply'],
    chain: chains['arbitrum'],
  });

  const troveRewardPerYear =
    (42900 * 365 * trovePrice * alpStakedAmount) / 1e18 / alpPrice;
  const aprReward = (trovePrice * troveRewardPerYear * 1e18) / alpTotalSupply;
  const alpTotalSupplyUsd = (alpTotalSupply / 1e18) * alpPrice;

  return [
    {
      pool: stakingAddress,
      chain: utils.formatChain(chains['arbitrum']),
      project: 'arbitrove',
      symbol: 'ALP',
      tvlUsd: tvl / 1e18,
      apyReward: aprReward,
      totalSupplyUsd: alpTotalSupplyUsd,
      poolMeta: 'ALP',
      rewardTokens: [troveAddress],
      underlyingTokens: [alpAddress], // ALP
      url: 'https://nitrocartel.finance/',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
