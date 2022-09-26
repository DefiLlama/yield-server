const sdk = require('@defillama/sdk');

const utils = require('../utils');
const abi = require('./abi.json');
const pools = require('./pools.json');

const url = 'https://api.geist.finance/api/lendingPoolRewards';

const main = async () => {
  // total supply for each pool + reward apr for both lend and borrow side
  const rewardAPRs = (await utils.getData(url)).data.poolAPRs;

  const reserveDataRes = await sdk.api.abi.multiCall({
    abi: abi.find((a) => a.name === 'getReserveData'),
    chain: 'fantom',
    calls: pools.map((a) => ({
      target: '0x9FAD24f572045c7869117160A571B2e50b10d068',
      params: [a.underlyingAsset],
    })),
  });
  const reserveData = reserveDataRes.output.map((o) => o.output);

  const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
    ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: pools.map((a) => ({
          target: a.underlyingAsset,
          params: method === 'erc20:balanceOf' ? [a.interestBearing] : null,
        })),
        chain: 'fantom',
      })
    )
  );
  const liquidityData = liquidityRes.output.map((o) => o.output);
  const decimalsData = decimalsRes.output.map((o) => o.output);
  const symbolsData = symbolsRes.output.map((o) => o.output);

  return reserveData.map((p, i) => {
    const interest = rewardAPRs.find(
      (el) => el.tokenAddress === p.aTokenAddress
    );
    const debt = rewardAPRs.find(
      (el) => el.tokenAddress === p.variableDebtTokenAddress
    );

    return {
      pool: p.aTokenAddress,
      chain: 'Fantom',
      project: 'geist-finance',
      symbol: utils.formatSymbol(symbolsData[i]),
      // note(!) this is total supply instead of available liquidity, will need to update
      tvlUsd: interest.poolValue,
      apyBase: p.currentLiquidityRate / 1e25,
      apyReward: interest.apy * 100,
      underlyingTokens: [interest.underlyingAsset],
      rewardTokens: ['0xd8321aa83fb0a4ecd6348d4577431310a6e0814d'], // Geist
      // borrow fields
      apyBaseBorrow: p.currentVariableBorrowRate / 1e25,
      apyRewardBorrow: debt.apy * 100,
      totalSupplyUsd: interest.poolValue,
      totalBorrowUsd:
        interest.poolValue -
        (liquidityData[i] / 10 ** decimalsData[i]) * interest.assetPrice,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://geist.finance/markets',
};
