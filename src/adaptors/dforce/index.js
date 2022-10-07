const sdk = require('@defillama/sdk');

const utils = require('../utils');
const abi = require('./abi.json');

const getApiUrl = (chain) =>
  `https://app.dforce.network/general/markets?network=${chain}`;

const NETWORKS = {
  ethereum: {
    name: 'mainnet',
    controller: '0x8B53Ab2c0Df3230EA327017C91Eb909f815Ad113',
  },
  binance: {
    name: 'bsc',
    controller: '0x0b53E608bD058Bb54748C35148484fD627E6dc0A',
  },
  polygon: {
    name: 'Polygon',
    controller: '0x52eaCd19E38D501D006D2023C813d7E37F025f37',
  },
  arbitrum: {
    name: 'ArbitrumOne',
    controller: '0x8E7e9eA9023B81457Ae7E6D2a51b003D421E5408',
  },
  optimism: {
    name: 'Optimism',
    controller: '0xA300A84D8970718Dac32f54F61Bd568142d8BCF4',
  },
};

const getApy = async () => {
  const markets = await Promise.all(
    Object.keys(NETWORKS).map(async (network) => {
      return {
        network,
        data: await utils.getData(getApiUrl(NETWORKS[network].name)),
      };
    })
  );

  const pools = await Promise.all(
    markets.map(
      async ({ network, data: { supplyMarkets, underlyingToken } }) => {
        // get iTokens
        const iTokens = (
          await sdk.api.abi.call({
            chain: network === 'binance' ? 'bsc' : network,
            target: NETWORKS[network].controller,
            abi: abi.find((n) => n.name === 'getAlliTokens'),
          })
        ).output;

        // get LTV per iToken
        const markets = (
          await sdk.api.abi.multiCall({
            chain: network === 'binance' ? 'bsc' : network,
            abi: abi.find((n) => n.name === 'markets'),
            calls: iTokens.map((t) => ({
              target: NETWORKS[network].controller,
              params: [t],
            })),
          })
        ).output.map((o) => o.output);

        const ltvs = markets.map((m, i) => ({
          iToken: iTokens[i],
          ltv: m.collateralFactorMantissa,
        }));

        return supplyMarkets.map((market) => ({
          pool: `${market.address}-${network}`,
          chain: utils.formatChain(network),
          project: 'dforce',
          symbol: market.underlying_symbol,
          tvlUsd:
            (Number(market.supplyValue) - Number(market.borrowValue)) / 1e18,
          // 1e16 = apy / 1e18 * 100%
          apyBase: Number(market.supplyAPY) / 1e16,
          apyReward: Number(market.rewardSupplyApy) / 1e16,
          rewardTokens: ['0x431ad2ff6a9c365805ebad47ee021148d6f7dbe0'],
          underlyingTokens: [
            underlyingToken.find((x) => x.symbol === market.underlying_symbol)
              .underlying,
          ],
          // borrow fields
          apyBaseBorrow: Number(market.borrowAPY) / 1e16,
          apyRewardBorrow: Number(market.rewardBorrowApy) / 1e16,
          totalSupplyUsd: Number(market.supplyValue) / 1e18,
          totalBorrowUsd: Number(market.borrowValue) / 1e18,
          ltv:
            Number(ltvs.find((m) => m.iToken === market.address)?.ltv) / 1e18,
        }));
      }
    )
  );

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.dforce.network/#/lending?AssetsType=Lend&currentPool=general',
};
