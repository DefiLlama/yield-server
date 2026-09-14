const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

// Motoswap Vampire Attack farms on Ethereum mainnet.
// VampChef is a MasterChef-style contract with a flat per-second emission
// over a fixed window (emissionStart -> emissionEnd). Rewards are paid in MOTO.
// Half of every harvest is liquid, the other half streams over 180 days
// through RewardVestingEscrow; only the liquid half is counted in apyReward.

const CHAIN = 'ethereum';
const CHEF = '0x51e648f08a9a08A724591938d9cbc483C809aCA4';
const MOTO = '0xBd965230588EAA536dE6aA45E8ebbc01638535e0';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MOTO_WETH_LP = '0xAD1a21F61d653c6101b92c335f61140459C81C79';
const FARM_URL = 'https://motoswap.org/farm';

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
// Share of each harvest paid out liquid at harvest time. The remaining share is
// escrowed and streamed linearly over 180 days, so it is excluded from apyReward.
const LIQUID_REWARD_SHARE = 0.5;

const chefAbi = {
  poolLength: 'uint256:poolLength',
  totalAllocPoint: 'uint256:totalAllocPoint',
  rewardPerSecond: 'uint256:rewardPerSecond',
  emissionStart: 'uint64:emissionStart',
  emissionEnd: 'uint64:emissionEnd',
  rewardToken: 'address:rewardToken',
  poolInfo:
    'function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardTime, uint256 accRewardPerShare, uint256 lpSupply)',
};

const pairAbi = {
  token0: 'address:token0',
  token1: 'address:token1',
  getReserves:
    'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
  totalSupply: 'uint256:totalSupply',
};

const call = async (target, abi, params) =>
  (await sdk.api.abi.call({ target, abi, params, chain: CHAIN })).output;

const multiCall = async (abi, calls, permitFailure = false) =>
  (
    await sdk.api.abi.multiCall({
      abi,
      calls,
      chain: CHAIN,
      permitFailure,
    })
  ).output.map((r) => r.output);

const apy = async () => {
  const [
    poolLength,
    totalAllocPoint,
    rewardPerSecond,
    emissionStart,
    emissionEnd,
    rewardToken,
  ] = await Promise.all([
    call(CHEF, chefAbi.poolLength),
    call(CHEF, chefAbi.totalAllocPoint),
    call(CHEF, chefAbi.rewardPerSecond),
    call(CHEF, chefAbi.emissionStart),
    call(CHEF, chefAbi.emissionEnd),
    call(CHEF, chefAbi.rewardToken),
  ]);

  const poolInfos = await multiCall(
    chefAbi.poolInfo,
    [...Array(Number(poolLength)).keys()].map((pid) => ({
      target: CHEF,
      params: [pid],
    }))
  );

  // Only pools with a non-zero weight earn rewards; the rest are staged.
  const pools = poolInfos
    .map((info, pid) => ({
      pid,
      lpToken: info.lpToken,
      allocPoint: Number(info.allocPoint),
      lpSupply: info.lpSupply,
    }))
    .filter((p) => p.allocPoint > 0);

  if (pools.length === 0) return [];

  // Uniswap V2 pair reads. A single-sided pool holds the MOTO token itself,
  // which has no token0(), so those calls are allowed to fail.
  const lpCalls = pools.map((p) => ({ target: p.lpToken }));
  const [token0s, token1s, reserves, lpTotalSupplies] = await Promise.all([
    multiCall(pairAbi.token0, lpCalls, true),
    multiCall(pairAbi.token1, lpCalls, true),
    multiCall(pairAbi.getReserves, lpCalls, true),
    multiCall(pairAbi.totalSupply, lpCalls, true),
  ]);

  const isPair = pools.map((_, i) =>
    Boolean(token0s[i] && token1s[i] && reserves[i])
  );

  const underlying = new Set([MOTO.toLowerCase(), WETH.toLowerCase()]);
  pools.forEach((p, i) => {
    if (isPair[i]) {
      underlying.add(token0s[i].toLowerCase());
      underlying.add(token1s[i].toLowerCase());
    } else {
      underlying.add(p.lpToken.toLowerCase());
    }
  });
  const underlyingList = [...underlying];

  const [symbols, decimals] = await Promise.all([
    multiCall(
      'erc20:symbol',
      underlyingList.map((t) => ({ target: t }))
    ),
    multiCall(
      'erc20:decimals',
      underlyingList.map((t) => ({ target: t }))
    ),
  ]);
  const meta = {};
  underlyingList.forEach((t, i) => {
    meta[t] = { symbol: symbols[i], decimals: Number(decimals[i]) };
  });

  // Prices: WETH and the stable quote tokens from the DefiLlama coins API.
  // MOTO is priced from the MOTO/WETH Uniswap V2 pool reserves.
  const { pricesByAddress } = await utils.getPrices(
    underlyingList.filter((t) => t !== MOTO.toLowerCase()),
    CHAIN
  );
  const prices = { ...pricesByAddress };

  const [motoWethToken0, motoWethReserves] = await Promise.all([
    call(MOTO_WETH_LP, pairAbi.token0),
    call(MOTO_WETH_LP, pairAbi.getReserves),
  ]);
  const motoIsToken0 = motoWethToken0.toLowerCase() === MOTO.toLowerCase();
  const motoReserve = new BigNumber(
    motoIsToken0 ? motoWethReserves._reserve0 : motoWethReserves._reserve1
  ).div(1e18);
  const wethReserve = new BigNumber(
    motoIsToken0 ? motoWethReserves._reserve1 : motoWethReserves._reserve0
  ).div(1e18);
  const wethPrice = prices[WETH.toLowerCase()];
  if (!wethPrice || motoReserve.isZero()) return [];
  const motoPrice = wethReserve.div(motoReserve).times(wethPrice).toNumber();
  prices[MOTO.toLowerCase()] = motoPrice;

  const now = Math.floor(Date.now() / 1000);
  const emissionLive =
    Number(emissionStart) > 0 &&
    now >= Number(emissionStart) &&
    now < Number(emissionEnd);
  const rewardPerYear = emissionLive
    ? new BigNumber(rewardPerSecond).div(1e18).times(SECONDS_PER_YEAR)
    : new BigNumber(0);
  const rewardPrice = prices[rewardToken.toLowerCase()] ?? motoPrice;

  return pools
    .map((p, i) => {
      let tvlUsd;
      let symbol;
      let underlyingTokens;

      if (isPair[i]) {
        const t0 = token0s[i].toLowerCase();
        const t1 = token1s[i].toLowerCase();
        const r0 = new BigNumber(reserves[i]._reserve0).div(
          10 ** meta[t0].decimals
        );
        const r1 = new BigNumber(reserves[i]._reserve1).div(
          10 ** meta[t1].decimals
        );
        const p0 = prices[t0];
        const p1 = prices[t1];
        let pairUsd;
        if (p0 && p1) pairUsd = r0.times(p0).plus(r1.times(p1));
        else if (p0) pairUsd = r0.times(p0).times(2);
        else if (p1) pairUsd = r1.times(p1).times(2);
        else return null;
        const supply = new BigNumber(lpTotalSupplies[i]);
        const stakedShare = supply.isZero()
          ? new BigNumber(0)
          : new BigNumber(p.lpSupply).div(supply);
        tvlUsd = pairUsd.times(stakedShare).toNumber();
        symbol = `${meta[t0].symbol}-${meta[t1].symbol}`;
        underlyingTokens = [token0s[i], token1s[i]];
      } else {
        const t = p.lpToken.toLowerCase();
        const price = prices[t];
        if (!price) return null;
        tvlUsd = new BigNumber(p.lpSupply)
          .div(10 ** meta[t].decimals)
          .times(price)
          .toNumber();
        symbol = meta[t].symbol;
        underlyingTokens = [p.lpToken];
      }

      const poolRewardUsdPerYear = rewardPerYear
        .times(p.allocPoint)
        .div(Number(totalAllocPoint))
        .times(rewardPrice)
        .times(LIQUID_REWARD_SHARE);
      const apyReward =
        tvlUsd > 0 ? poolRewardUsdPerYear.div(tvlUsd).times(100).toNumber() : 0;

      return {
        pool: `${CHEF}-${p.pid}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'motoswap',
        symbol,
        tvlUsd,
        apyReward,
        rewardTokens: [rewardToken],
        underlyingTokens,
        token: p.lpToken.toLowerCase(),
        poolMeta: isPair[i]
          ? 'Vampire Attack farm'
          : 'Vampire Attack single-sided',
        url: FARM_URL,
      };
    })
    .filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  // Placeholder until the DefiLlama-Adapters listing assigns Motoswap a protocol id.
  protocolId: '0',
  timetravel: false,
  apy,
  url: FARM_URL,
};
