const superagent = require('superagent');
const utils = require('../utils');
const BigNumber = require('bignumber.js');
const sdk = require('@defillama/sdk');
const address = require('./address');
const abi = require('./abi');
const { calculateAPY } = require('./utils');

const chains = ['ethereum', 'arbitrum'];

const isEthereum = (chain) => chain.toLowerCase() === 'ethereum';

const apy = async () => {
  const pools = await Promise.all(
    chains.map(async (chain) => {
      const { UiPoolDataProvider: uiPool, PoolAddressProvider } =
        address[chain];

      const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      const ethPriceUSD = isEthereum(chain)
        ? (await superagent.get(`https://coins.llama.fi/prices/current/${key}`))
            .body.coins[key].price
        : 1;
      const marketReferenceCurrencyDecimal = isEthereum(chain) ? 18 : 8;

      const [reservesData] = (
        await sdk.api.abi.call({
          target: uiPool,
          abi: abi[chain].UiPoolDataProvider.getReservesData,
          params: PoolAddressProvider,
          chain,
        })
      ).output;

      const pools = reservesData
        .filter(
          (reserve) =>
            reserve.assetType === '0' &&
            reserve.underlyingAsset !==
              '0x0000000000000000000000000000000000000001'
        )
        .map((reserve, index) => {
          const tvlUsd = new BigNumber(reserve.availableLiquidity)
            .multipliedBy(reserve.priceInMarketReferenceCurrency)
            .multipliedBy(ethPriceUSD)
            .shiftedBy(
              -(marketReferenceCurrencyDecimal + Number(reserve.decimals))
            )
            .toNumber();
          const totalBorrowUsd = new BigNumber(reserve.totalScaledVariableDebt)
            .multipliedBy(reserve.variableBorrowIndex)
            .multipliedBy(reserve.priceInMarketReferenceCurrency)
            .multipliedBy(ethPriceUSD)
            .shiftedBy(
              -(marketReferenceCurrencyDecimal + 27 + Number(reserve.decimals))
            )
            .toNumber();
          const totalSupplyUsd = tvlUsd + totalBorrowUsd;
          return {
            pool: `${reserve.xTokenAddress}-${chain}`.toLowerCase(),
            chain: utils.formatChain(chain),
            project: 'paraspace-lending',
            symbol: reserve.symbol,
            tvlUsd,
            apyBase: calculateAPY(reserve.liquidityRate).toNumber() * 100,
            underlyingTokens: [reserve.underlyingAsset],
            totalSupplyUsd,
            totalBorrowUsd,
            apyBaseBorrow:
              calculateAPY(reserve.variableBorrowRate).toNumber() * 100,
            ltv: reserve.baseLTVasCollateral / 10000,
            url: `https://app.para.space/`,
            borrowable: reserve.borrowingEnabled,
          };
        });

      return pools;
    })
  );
  return pools.flat();
};
module.exports = {
  timetravel: false,
  apy: apy,
};
