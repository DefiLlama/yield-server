const sdk = require('@defillama/sdk');
const { secondsInYear } = require('date-fns');
const ethers = require('ethers');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const superagent = require('superagent');
const { rewardTokens } = require('../sommelier/config');

const config = {
  ethereum: { fromBlock: 18782116 },
  optimism: { fromBlock: 113464669 },
  base: { fromBlock: 7869252 },
  arbitrum: { fromBlock: 159919891 },
  linea: {
    factory: '0x00000000333288eBA83426245D144B966Fd7e82E',
    volatilityOracle: '0x00000000570385b76719a95Fdf27B9c7fB5Ff299',
    lenderLens: '0xFc39498Edd3E18d5296E6584847f2580ad0e770B',
    fromBlock: 3982456,
  },
};

const ALOE_II_MAX_LEVERAGE = 1 / 200;
const ALOE_II_LIQUIDATION_INCENTIVE = 1 / 20;

function computeLTV(iv, nSigma) {
  const ltv =
    1 /
    ((1 + ALOE_II_MAX_LEVERAGE + ALOE_II_LIQUIDATION_INCENTIVE) *
      Math.exp(iv * nSigma));
  return Math.max(0.1, Math.min(ltv, 0.9));
}

async function getLTVs(chain, factory, volatilityOracle, uniswapPools) {
  const parameters = await sdk.api2.abi.multiCall({
    calls: uniswapPools.map((uniswapPool) => ({
      target: factory,
      params: [uniswapPool],
    })),
    abi: 'function getParameters(address uniswapPool) view returns (uint208 ante,uint8 nSigma,uint8 manipulationThresholdDivisor,uint32 pausedUntilTime)',
    chain,
  });

  const consults = await sdk.api2.abi.multiCall({
    calls: uniswapPools.map((uniswapPool) => ({
      target: volatilityOracle,
      params: [uniswapPool, '0x100000000'],
    })),
    abi: 'function consult(address pool,uint40 seed) view returns (uint56 metric,uint160 sqrtMeanPriceX96,uint256 iv)',
    chain,
  });

  return parameters.map((p, i) =>
    computeLTV(Number(consults[i].iv) / 1e12, Number(p.nSigma) / 10)
  );
}

async function getPrices(chain, addresses) {
  const priceKeys = [...new Set(addresses)].map(
    (address) => `${chain}:${address}`
  );
  return (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${priceKeys
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;
}

async function getPoolsFor(chain) {
  const {
    factory = '0x000000009efdB26b970bCc0085E126C9dfc16ee8',
    volatilityOracle = '0x0000000030d51e39a2dDDb5Db50F9d74a289DFc3',
    lenderLens = '0x1f36838Ac6e3922dD26f1222d75af86185f2b798',
    fromBlock,
  } = config[chain];

  const currentBlock = await sdk.api.util.getLatestBlock(chain);

  const iface = new ethers.utils.Interface([
    'event CreateMarket(address indexed pool, address lender0, address lender1)',
  ]);
  const createMarketEvents = (
    await sdk.api2.util.getLogs({
      target: factory,
      topic: '',
      fromBlock,
      toBlock: currentBlock.number,
      keys: [],
      topics: [iface.getEventTopic('CreateMarket')],
      chain,
    })
  ).output
    .filter((ev) => !ev.removed)
    .map((ev) => iface.parseLog(ev).args);

  const lenders = createMarketEvents.flatMap((ev, idx) => [
    { address: ev.lender0, peer: ev.lender1, peerIdx: idx * 2 + 1 },
    { address: ev.lender1, peer: ev.lender0, peerIdx: idx * 2 },
  ]);

  const uniswapPools = createMarketEvents.map((ev) => ev.pool);
  const ltvs = await getLTVs(chain, factory, volatilityOracle, uniswapPools);

  const basics = await sdk.api2.abi.multiCall({
    calls: lenders.map((lender) => ({
      target: lenderLens,
      params: [lender.address],
    })),
    abi: 'function readBasics(address lender) view returns (address asset,uint256 interestRate,uint256 utilization,uint256 inventory,uint256 totalBorrows,uint256 totalSupply,uint8 reserveFactor,uint64 rewardsRate)',
    chain,
  });

  const prices = await getPrices(
    chain,
    basics.map((info) => info.asset)
  );

  return basics
    .map((info, i) => {
      const reserveFraction = 1 / info.reserveFactor;
      const userFraction = 1 - reserveFraction;

      const aprBaseBorrow = new BigNumber(info.interestRate).times(
        secondsInYear
      );
      const aprBaseLend = aprBaseBorrow
        .times(info.utilization)
        .times(userFraction)
        .div('1e18');

      const apyBaseBorrow =
        utils.aprToApy(
          aprBaseBorrow.div('1e7').toNumber() / 1e3,
          secondsInYear
        ) / 100;
      const apyBaseLend =
        utils.aprToApy(aprBaseLend.div('1e7').toNumber() / 1e3, secondsInYear) /
        100;

      const priceKey = `${chain}:${info.asset}`.toLowerCase();
      if (!(priceKey in prices)) {
        return undefined;
      }
      const { decimals = 18, symbol, price } = prices[priceKey];

      const totalSupply =
        new BigNumber(info.inventory)
          .times('1e8')
          .div(`1e${decimals}`)
          .toNumber() / 1e8;
      const totalBorrow =
        new BigNumber(info.totalBorrows)
          .times('1e8')
          .div(`1e${decimals}`)
          .toNumber() / 1e8;
      const tvl = totalSupply - totalBorrow;

      const lender = lenders[i];
      const peerAssetAddress = basics[lender.peerIdx].asset;
      const peerPriceKey = `${chain}:${peerAssetAddress}`.toLowerCase();
      const { symbol: peerSymbol } =
        peerPriceKey in prices
          ? prices[peerPriceKey]
          : { symbol: peerAssetAddress };

      return {
        pool: `${lender.address}-${chain}`.toLowerCase(),
        chain,
        project: 'aloe',
        symbol: symbol.toUpperCase(),
        tvlUsd: tvl * price,
        apyBase: apyBaseLend * 100,
        underlyingTokens: [info.asset],
        poolMeta: `${peerSymbol.toUpperCase()}-pool`,
        apyBaseBorrow: apyBaseBorrow * 100,
        totalSupplyUsd: totalSupply * price,
        totalBorrowUsd: totalBorrow * price,
        ltv: ltvs[Math.floor(i / 2)],
      };
    })
    .filter((pool) => pool !== undefined);
}

async function apy() {
  return (
    await Promise.all(Object.keys(config).map((chain) => getPoolsFor(chain)))
  ).flat();
}

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.aloe.capital/markets',
};
