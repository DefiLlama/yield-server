const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

// Motoswap farms on Ethereum mainnet.
// MasterChef stakes Motoswap LP tokens (Uniswap v2 math pairs from the Motoswap factory) and pays MOTO on a
// halving schedule. Half of every harvest is liquid, the other half streams over 180 days through
// RewardVestingEscrow; only the liquid half is counted in apyReward.
// apyBase is the pair's LP fee (factory swapFeeBps) earned over the last 24 hours, from the pair Swap events.
// The launch farming campaign (VampChef 0x51e648f08a9a08A724591938d9cbc483C809aCA4) ended on 2026-09-28.

const CHAIN = 'ethereum';
const CHEF = '0x939f348b6658cE4DB7CDe088341b00DE341Fe085';
const FACTORY = '0x81C9CBC47d700dA1777aBd831D8dA3f526DfAe24';
const MOTO = '0xBd965230588EAA536dE6aA45E8ebbc01638535e0';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MOTO_WETH_PAIR = '0x302C53B6176F750e5547D775645dc8778524fCc1'; // Motoswap MOTO/WETH pair
const FARM_URL = 'https://motoswap.org/farm';

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;
// Share of each harvest paid out liquid. This is a constant in the contract with no getter:
// MasterChef._safeRewardTransfer sends `_amount / 2` to RewardVestingEscrow (180 day stream) and the rest liquid.
const LIQUID_REWARD_SHARE = 0.5;

const chefAbi = {
  poolLength: 'uint256:poolLength',
  totalAllocPoint: 'uint256:totalAllocPoint',
  currentRewardPerSecond: 'uint256:currentRewardPerSecond',
  rewardToken: 'address:rewardToken',
  poolInfo:
    'function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardTime, uint256 accRewardPerShare, uint256 lpSupply, uint16 depositFeeBps)',
};

const pairAbi = {
  token0: 'address:token0',
  token1: 'address:token1',
  getReserves:
    'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
  totalSupply: 'uint256:totalSupply',
};

const SWAP_EVENT =
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)';

const call = async (target, abi, params) =>
  (await sdk.api.abi.call({ target, abi, params, chain: CHAIN })).output;

const multiCall = async (abi, calls) =>
  (
    await sdk.api.abi.multiCall({
      abi,
      calls,
      chain: CHAIN,
    })
  ).output.map((r) => r.output);

// MOTO from the DefiLlama coins API. If the coins API has no MOTO price, MOTO is priced from the
// Motoswap MOTO/WETH pair reserves, where its liquidity sits.
const getMotoPrice = async (prices) => {
  const motoPrice = prices[MOTO.toLowerCase()];
  if (motoPrice) return motoPrice;
  const wethPrice = prices[WETH.toLowerCase()];
  if (!wethPrice) return undefined;
  const [token0, reserves] = await Promise.all([
    call(MOTO_WETH_PAIR, pairAbi.token0),
    call(MOTO_WETH_PAIR, pairAbi.getReserves),
  ]);
  const motoIs0 = token0.toLowerCase() === MOTO.toLowerCase();
  const motoReserve = new BigNumber(motoIs0 ? reserves._reserve0 : reserves._reserve1);
  const wethReserve = new BigNumber(motoIs0 ? reserves._reserve1 : reserves._reserve0);
  if (motoReserve.isZero()) return undefined;
  return wethReserve.div(motoReserve).times(wethPrice).toNumber(); // both 18 decimals
};

const apy = async () => {
  const [poolLength, totalAllocPoint, rewardPerSecond, rewardToken, swapFeeBps] =
    await Promise.all([
      call(CHEF, chefAbi.poolLength),
      call(CHEF, chefAbi.totalAllocPoint),
      call(CHEF, chefAbi.currentRewardPerSecond),
      call(CHEF, chefAbi.rewardToken),
      call(FACTORY, 'uint256:swapFeeBps'),
    ]);

  const poolInfos = await multiCall(
    chefAbi.poolInfo,
    [...Array(Number(poolLength)).keys()].map((pid) => ({
      target: CHEF,
      params: [pid],
    }))
  );

  // Only pools with a non-zero weight are farms; the rest are staged.
  const pools = poolInfos
    .map((info, pid) => ({
      pid,
      lpToken: info.lpToken,
      allocPoint: Number(info.allocPoint),
      lpSupply: info.lpSupply,
    }))
    .filter((p) => p.allocPoint > 0);

  if (pools.length === 0) return [];

  const lpCalls = pools.map((p) => ({ target: p.lpToken }));
  const [token0s, token1s, reserves, lpTotalSupplies] = await Promise.all([
    multiCall(pairAbi.token0, lpCalls),
    multiCall(pairAbi.token1, lpCalls),
    multiCall(pairAbi.getReserves, lpCalls),
    multiCall(pairAbi.totalSupply, lpCalls),
  ]);

  const tokens = [
    ...new Set([
      MOTO.toLowerCase(),
      WETH.toLowerCase(),
      ...token0s.map((t) => t.toLowerCase()),
      ...token1s.map((t) => t.toLowerCase()),
    ]),
  ];
  const [symbols, decimals] = await Promise.all([
    multiCall('erc20:symbol', tokens.map((t) => ({ target: t }))),
    multiCall('erc20:decimals', tokens.map((t) => ({ target: t }))),
  ]);
  const meta = {};
  tokens.forEach((t, i) => {
    meta[t] = { symbol: symbols[i], decimals: Number(decimals[i]) };
  });

  const { pricesByAddress } = await utils.getPrices(tokens, CHAIN);
  const prices = { ...pricesByAddress };
  const motoPrice = await getMotoPrice(prices);
  if (!motoPrice) return [];
  prices[MOTO.toLowerCase()] = motoPrice;

  // LP fees over the last 24 hours, from the pair Swap events (the fee is taken on the input token).
  const now = Math.floor(Date.now() / 1000);
  const [fromBlock, toBlock] = await utils.getBlocksByTime([now - DAY, now], CHAIN);
  const swapLogs = await Promise.all(
    pools.map((p) =>
      sdk.getEventLogs({
        target: p.lpToken,
        eventAbi: SWAP_EVENT,
        fromBlock,
        toBlock,
        chain: CHAIN,
        onlyArgs: true,
      })
    )
  );
  const lpFeeRate = Number(swapFeeBps) / 10000;

  const rewardPerYear = new BigNumber(rewardPerSecond)
    .div(10 ** (meta[rewardToken.toLowerCase()]?.decimals ?? 18))
    .times(SECONDS_PER_YEAR);
  const rewardPrice = prices[rewardToken.toLowerCase()];

  return pools
    .map((p, i) => {
      const t0 = token0s[i].toLowerCase();
      const t1 = token1s[i].toLowerCase();
      const p0 = prices[t0];
      const p1 = prices[t1];
      if (!p0 || !p1) return null;
      const d0 = 10 ** meta[t0].decimals;
      const d1 = 10 ** meta[t1].decimals;

      const tvlUsd = new BigNumber(reserves[i]._reserve0)
        .div(d0)
        .times(p0)
        .plus(new BigNumber(reserves[i]._reserve1).div(d1).times(p1))
        .toNumber();

      const volumeInUsd = swapLogs[i].reduce(
        (sum, log) =>
          sum
            .plus(new BigNumber(log.amount0In.toString()).div(d0).times(p0))
            .plus(new BigNumber(log.amount1In.toString()).div(d1).times(p1)),
        new BigNumber(0)
      );
      const feesUsd24h = volumeInUsd.times(lpFeeRate).toNumber();
      const apyBase = tvlUsd > 0 ? (feesUsd24h * 365 * 100) / tvlUsd : 0;

      const supply = new BigNumber(lpTotalSupplies[i]);
      const stakedUsd = supply.isZero()
        ? 0
        : new BigNumber(p.lpSupply).div(supply).times(tvlUsd).toNumber();
      const poolRewardUsdPerYear = rewardPrice
        ? rewardPerYear
            .times(p.allocPoint)
            .div(Number(totalAllocPoint))
            .times(rewardPrice)
            .times(LIQUID_REWARD_SHARE)
            .toNumber()
        : 0;
      const apyReward =
        stakedUsd > 0 ? (poolRewardUsdPerYear / stakedUsd) * 100 : 0;

      return {
        pool: `${CHEF}-${p.pid}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'motoswap-farm',
        symbol: `${meta[t0].symbol}-${meta[t1].symbol}`,
        tvlUsd,
        apyBase,
        apyReward,
        rewardTokens: apyReward > 0 ? [rewardToken] : [],
        underlyingTokens: [token0s[i], token1s[i]],
        token: p.lpToken.toLowerCase(),
        poolMeta: 'Motoswap farm',
        url: FARM_URL,
      };
    })
    .filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  // DefiLlama listing id for slug motoswap-farm (DefiLlama-Adapters PR 21035, listed 2026-09-16).
  protocolId: '8653',
  timetravel: false,
  apy,
  url: FARM_URL,
};
