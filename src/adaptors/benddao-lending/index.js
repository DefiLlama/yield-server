const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const BigNumber = require('bignumber.js');

const AddressMap = {
  ethereum: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    UiPoolDataProvider: '0x5250cCE48E43AB930e45Cc8E71C87Ca4B51244cf',
    LendPoolAddressProvider: '0x24451F47CaF13B24f4b5034e1dF6c0E401ec0e46',
    Bend: '0x0d02755a5700414B26FF040e1dE35D337DF56218',
    BendProtocolIncentivesController:
      '0x26FC1f11E612366d3367fc0cbFfF9e819da91C8d',
    UniswapV2PairWETH: '0x336ef4e633b1117dca08c1a57f4139c62c32c935',
    StakedBUNI: '0x647C509AF2A2b2294bB79fCE12DaEc8e7cf938f7',
  },
};

const ChainName = {
  ethereum: 'Ethereum',
};

const projectSlug = 'benddao-lending';

async function apy() {
  const pools = await Promise.all(
    ['ethereum'].map(async (chain) => {
      const [prices, { output: reserveList }] = await Promise.all([
        (async () => {
          const coins = [
            `${chain}:${AddressMap[chain].WETH}`,
            `${chain}:${AddressMap[chain].Bend}`,
          ]
            .join(',')
            .toLowerCase();

          const ret = await superagent.get(
            `https://coins.llama.fi/prices/current/${coins}`
          );
          return ret.body.coins;
        })(),
        sdk.api.abi.call({
          target: AddressMap[chain].UiPoolDataProvider,
          abi: 'function getSimpleReservesData(address provider) view returns (tuple(address underlyingAsset, string name, string symbol, uint256 decimals, uint256 reserveFactor, bool borrowingEnabled, bool isActive, bool isFrozen, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 liquidityRate, uint128 variableBorrowRate, uint40 lastUpdateTimestamp, address bTokenAddress, address debtTokenAddress, address interestRateAddress, uint256 availableLiquidity, uint256 totalVariableDebt, uint256 priceInEth, uint256 variableRateSlope1, uint256 variableRateSlope2)[])',
          params: [AddressMap[chain].LendPoolAddressProvider],
          chain,
        }),
      ]);

      const ethPriceUsd =
        prices[`${chain}:${AddressMap[chain].WETH}`.toLowerCase()].price;
      const bendPriceUsd =
        prices[`${chain}:${AddressMap[chain].Bend}`.toLowerCase()].price;

      return (
        await Promise.all(
          // Lend Pool
          [
            Promise.all(
              reserveList.map(async (reserve) => {
                const [
                  {
                    output: [
                      { output: bTokenAsset },
                      { output: debtTokenAsset },
                    ],
                  },

                  {
                    output: [
                      { output: bTokenTotalSupply },
                      { output: debtTokenTotalSupply },
                    ],
                  },
                ] = await Promise.all([
                  sdk.api.abi.multiCall({
                    target: AddressMap[chain].BendProtocolIncentivesController,
                    abi: 'function assets(address) view returns (uint128 emissionPerSecond, uint128 lastUpdateTimestamp, uint256 index)',
                    calls: [
                      { params: [reserve.bTokenAddress] },
                      { params: [reserve.debtTokenAddress] },
                    ],
                    chain,
                  }),
                  sdk.api.abi.multiCall({
                    abi: 'erc20:totalSupply',
                    calls: [
                      { target: reserve.bTokenAddress },
                      { target: reserve.debtTokenAddress },
                    ],
                  }),
                ]);

                const usdPrice = new BigNumber(reserve.priceInEth)
                  .multipliedBy(ethPriceUsd)
                  .shiftedBy(-18)
                  .shiftedBy(0 - reserve.decimals);

                const availableLiquidityUsd = new BigNumber(
                  reserve.availableLiquidity
                ).multipliedBy(usdPrice);
                const totalVariableDebtUsd = new BigNumber(
                  reserve.totalVariableDebt
                ).multipliedBy(usdPrice);

                return {
                  pool: `${reserve.bTokenAddress}-${chain}`,
                  chain: ChainName[chain],
                  project: projectSlug,
                  symbol: reserve.symbol,
                  tvlUsd: availableLiquidityUsd.toNumber(),
                  apyBase: new BigNumber(reserve.liquidityRate)
                    .shiftedBy(-27)
                    .multipliedBy(100)
                    .toNumber(),
                  apyReward: new BigNumber(bTokenAsset.emissionPerSecond)
                    .multipliedBy(365 * 24 * 60 * 60)
                    .multipliedBy(bendPriceUsd)
                    .dividedBy(bTokenTotalSupply)
                    .dividedBy(ethPriceUsd)
                    .multipliedBy(100)
                    .toNumber(),
                  rewardTokens: [AddressMap[chain].Bend],
                  underlyingTokens: [reserve.underlyingAsset],
                  url: 'https://benddao.xyz',
                  apyBaseBorrow: new BigNumber(reserve.variableBorrowRate)
                    .shiftedBy(-27)
                    .multipliedBy(100)
                    .toNumber(),
                  apyRewardBorrow: new BigNumber(
                    debtTokenAsset.emissionPerSecond
                  )
                    .multipliedBy(365 * 24 * 60 * 60)
                    .multipliedBy(bendPriceUsd)
                    .dividedBy(debtTokenTotalSupply)
                    .dividedBy(ethPriceUsd)
                    .multipliedBy(100)
                    .toNumber(),
                  totalSupplyUsd: availableLiquidityUsd
                    .plus(totalVariableDebtUsd)
                    .toNumber(),
                  totalBorrowUsd: totalVariableDebtUsd.toNumber(),
                  borrowable: reserve.borrowingEnabled,
                };
              })
            ),

            // Liquidity Pool
            (async () => {
              const [
                { output: apr },
                {
                  output: [{ output: wethBalance }, { output: bendBalance }],
                },
              ] = await Promise.all([
                sdk.api.abi.call({
                  target: AddressMap[chain].StakedBUNI,
                  abi: 'uint256:apr',
                  chain,
                }),
                sdk.api.abi.multiCall({
                  abi: 'erc20:balanceOf',
                  chain,
                  calls: [
                    {
                      target: AddressMap[chain].WETH,
                      params: [AddressMap[chain].UniswapV2PairWETH],
                    },
                    {
                      target: AddressMap[chain].Bend,
                      params: [AddressMap[chain].UniswapV2PairWETH],
                    },
                  ],
                }),
              ]);

              return {
                pool: `${AddressMap[chain].UniswapV2PairWETH}-${chain}`,
                chain: ChainName[chain],
                project: projectSlug,
                symbol: 'BEND-WETH',
                tvlUsd: new BigNumber(
                  new BigNumber(wethBalance)
                    .shiftedBy(-18)
                    .multipliedBy(ethPriceUsd)
                )
                  .plus(
                    new BigNumber(bendBalance)
                      .shiftedBy(-18)
                      .multipliedBy(bendPriceUsd)
                  )
                  .toNumber(),
                apyBase: new BigNumber(apr)
                  .shiftedBy(-18)
                  .multipliedBy(100)
                  .toNumber(),
                rewardTokens: [AddressMap[chain].Bend],
                underlyingTokens: [
                  AddressMap[chain].Bend,
                  AddressMap[chain].WETH,
                ],
                url: 'https://benddao.xyz',
              };
            })(),
          ]
        )
      ).flat();
    })
  );

  return pools.flat();
}

module.exports = {
  timetravel: false,
  apy: apy,
};
