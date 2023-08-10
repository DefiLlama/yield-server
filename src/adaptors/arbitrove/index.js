const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abi/abi.json');

const chains = { arbitrum: 'arbitrum' };

const getApy = async () => {
  const { coins: priceData } = await utils.getData(
    `https://coins.llama.fi/prices/current/coingecko:nitro-cartel,coingecko:arbitrove-alp`
  );

  const { alpData } = await utils.getData(
    'https://nitrocartel.finance/api/alpData?chainId=42161'
  );

  const stakingAddress = '0x9d4903f755fc12cded3012686c2064e98b84e6b7';
  const troveAddress = '0x982239D38Af50B0168dA33346d85Fb12929c4c07';
  const alpAddress = '0xb49B6A3Fd1F4bB510Ef776de7A88A9e65904478A';
  const feeOracleAddress = '0x013B8efb8531fd08e47e41f53D633c249D3D73Cf';
  const nullAddress = '0x0000000000000000000000000000000000000000';
  const alpPrice = priceData['coingecko:arbitrove-alp'].price;
  const trovePrice = priceData['coingecko:nitro-cartel'].price;

  const { output: alpStakedAmount } = await sdk.api.abi.call({
    target: alpAddress,
    abi: 'erc20:balanceOf',
    chain: chains['arbitrum'],
    params: [stakingAddress],
  });
  const { output: alpTotalSupply } = await sdk.api.abi.call({
    target: alpAddress,
    abi: abi['totalSupply'],
    chain: chains['arbitrum'],
  });

  const { output: targets } = await sdk.api.abi.call({
    target: feeOracleAddress,
    abi: abi['getTargets'],
    chain: chains['arbitrum'],
  });

  let tvl = 0;

  for (const target of targets) {
    const coin = target.coin;
    if (coin === nullAddress) {
      const { output: balance } = await sdk.api.eth.getBalance({
        target: alpAddress,
        chain: chains['arbitrum'],
      });
      tvl =
        tvl +
        (balance / 1e18) *
          alpData.find(
            (alp) => alp.address.toLowerCase() === coin.toLowerCase()
          ).price;
    } else {
      const { output: tokenBalance } = await sdk.api.abi.call({
        target: alpAddress,
        abi: abi['getAmountAcrossStrategies'],
        chain: chains['arbitrum'],
        params: [coin],
      });
      const { output: decimals } = await sdk.api.abi.call({
        target: coin,
        abi: 'erc20:decimals',
        chain: chains['arbitrum'],
      });
      tvl =
        tvl +
        (tokenBalance / 10 ** decimals) *
          alpData.find(
            (alp) => alp.address.toLowerCase() === coin.toLowerCase()
          ).price;
    }
  }

  const troveRewardPerYear =
    (42900 * 365 * trovePrice * 1e18) / alpStakedAmount / alpPrice;
  const alpTotalSupplyUsd = (alpTotalSupply / 1e18) * alpPrice;

  return [
    {
      pool: stakingAddress,
      chain: utils.formatChain(chains['arbitrum']),
      project: 'arbitrove',
      symbol: 'ALP',
      tvlUsd: tvl,
      apyReward: troveRewardPerYear * 100,
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
