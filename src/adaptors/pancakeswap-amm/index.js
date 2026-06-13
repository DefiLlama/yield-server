const { Web3 } = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');

const PROJECT = 'pancakeswap-amm';
const RPC_URL = 'https://bsc-dataseed1.binance.org/';
const MASTERCHEF_ADDRESS = '0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652';
const CAKE = '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82';

const BSC_BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = (60 / BSC_BLOCK_TIME) * 60 * 24 * 365;

const web3 = new Web3(RPC_URL);

const CHAINS = ['bsc', 'base', 'ethereum', 'linea', 'zksync', 'arbitrum', 'opbnb', 'monad']
const EXPLORER_API = 'https://explorer.pancakeswap.com/api/cached';

async function fetchExplorerJson(url, { retries = 3, timeoutMs = 15000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(url, { timeout: timeoutMs });
      return data;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

async function fetchExplorerPools(chain) {
  return fetchExplorerJson(`${EXPLORER_API}/pools/v2/${chain}/list/top`);
}

async function fetchExplorerPool(chain, lpAddress) {
  try {
    return await fetchExplorerJson(
      `${EXPLORER_API}/pools/v2/${chain}/${lpAddress}`,
      { retries: 2, timeoutMs: 10000 }
    );
  } catch (e) {
    return null;
  }
}

async function fetchExplorerPoolsByAddress(chain, lpAddresses, concurrency = 10) {
  const results = new Array(lpAddresses.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= lpAddresses.length) return;
      results[i] = await fetchExplorerPool(chain, lpAddresses[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const computeFeeApr = (p) => {
  const tvl = Number(p.tvlUSD);
  if (!tvl) return undefined;
  const apr = (Number(p.volumeUSD24h) * 0.0025 * 365 * 100) / tvl;
  return Number.isFinite(apr) ? apr : undefined;
};

function buildPoolFromExplorer(p, chain) {
  if (!p || !p.id) return null;
  if (!p.token0?.id || !p.token1?.id || !p.token0?.symbol || !p.token1?.symbol) return null;
  const tvlUsd = Number(p.tvlUSD);
  if (!tvlUsd) return null;

  const feeUsd7d = Number(p.volumeUSD7d) * 0.0025;
  return {
    pool: utils.formatAddress(p.id),
    chain: utils.formatChain(chain),
    project: PROJECT,
    symbol: p.token0.symbol + '-' + p.token1.symbol,
    tvlUsd,
    apyBase: computeFeeApr(p),
    apyBase7d: (feeUsd7d * 365 * 100) / 7 / tvlUsd,
    volumeUsd1d: Number(p.volumeUSD24h),
    volumeUsd7d: Number(p.volumeUSD7d),
    underlyingTokens: [p.token0.id, p.token1.id],
  };
}

async function getPoolsApy(chain) {
  let data;
  try {
    data = await fetchExplorerPools(chain);
  } catch (e) {
    console.error(`pancakeswap-amm: failed to fetch ${chain} pools after retries: ${e.message}`);
    return [];
  }
  if (!Array.isArray(data)) {
    console.error(
      `pancakeswap-amm: unexpected ${chain} pools payload shape (expected array, got ${
        data === null ? 'null' : typeof data
      }): ${JSON.stringify(data)?.slice(0, 200)}`
    );
    return [];
  }
  return data.map((p) => buildPoolFromExplorer(p, chain)).filter(Boolean);
}

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  cakePerBlock,
  cakePrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / Number(totalAllocPoint);
  const cakePerYear = BLOCKS_PER_YEAR * Number(cakePerBlock);

  return ((poolWeight * cakePerYear * cakePrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  pairName,
  reserves,
  reservesRatio,
  bnbPrice,
  cakePrice,
  ethPrice,
  token0decimals,
  token1decimals
) => {
  const [token0, token1] = pairName.split('-');
  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1decimals));

  if (token0.includes('USD')) return reserve0.times(2);
  if (token0.includes('BNB')) return reserve0.times(bnbPrice).times(2);
  if (token0.includes('Cake')) return reserve0.times(cakePrice).times(2);
  if (token0.includes('ETH')) return reserve0.times(ethPrice).times(2);
  if (token1.includes('USD')) return reserve1.times(2);
  if (token1.includes('BNB')) return reserve1.times(bnbPrice).times(2);
  if (token1.includes('Cake')) return reserve1.times(cakePrice).times(2);
  if (token1.includes('ETH')) return reserve1.times(ethPrice).times(2);
};

const getBaseTokensPrice = async () => {
  const priceKeys = {
    bnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    eth: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    cake: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  };
  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${Object.values(priceKeys).map(
        (t) => `bsc:${t}`
      )}`
    )
  ).coins;

  const cakePrice = prices[`bsc:${priceKeys.cake}`].price;
  const ethPrice = prices[`bsc:${priceKeys.eth}`].price;
  const bnbPrice = prices[`bsc:${priceKeys.bnb}`].price;

  return { cakePrice, ethPrice, bnbPrice };
};

const getPoolsBsc = async () => {
  const { cakePrice, ethPrice, bnbPrice } = await getBaseTokensPrice();
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);

  const poolsCount = await masterChef.methods.poolLength().call();
  const totalAllocPoint = await masterChef.methods
    .totalRegularAllocPoint()
    .call();
  const cakeRateToRegularFarm = await masterChef.methods
    .cakePerBlock(true)
    .call();
  const normalizedCakePerBlock = cakeRateToRegularFarm / BigInt(1e18);

  const [poolsRes, lpTokensRes] = await Promise.all(
    ['poolInfo', 'lpToken'].map((method) =>
      sdk.api.abi.multiCall({
        abi: masterChefABI.filter(({ name }) => name === method)[0],
        calls: [...Array(Number(poolsCount) - 1).keys()].map((i) => ({
          target: MASTERCHEF_ADDRESS,
          params: i,
        })),
        chain: 'bsc',
        permitFailure: true,
      })
    )
  );
  const poolsInfo = poolsRes.output.map((res) => res.output);
  const lpTokens = lpTokensRes.output.map((res) => res.output);

  const explorerPools = await fetchExplorerPools('bsc').catch(() => []);
  const feeAprByLp = {};
  for (const p of explorerPools) {
    const apr = computeFeeApr(p);
    if (apr !== undefined) feeAprByLp[p.id.toLowerCase()] = apr;
  }
  const missingLps = Array.from(
    new Set(
      lpTokens
        .filter((lp) => lp)
        .map((lp) => lp.toLowerCase())
        .filter((lp) => !(lp in feeAprByLp))
    )
  );
  const fallback = await fetchExplorerPoolsByAddress('bsc', missingLps);
  fallback.forEach((p, i) => {
    if (!p) return;
    const apr = computeFeeApr(p);
    if (apr !== undefined) feeAprByLp[missingLps[i]] = apr;
  });

  // note: exchange subgraph is broken giving duplicated ids on pairs
  // reading token info data from contracts instead
  const [reservesRes, supplyRes, masterChefBalancesRes, token0Res, token1Res] =
    await Promise.all(
      ['getReserves', 'totalSupply', 'balanceOf', 'token0', 'token1'].map(
        (method) =>
          sdk.api.abi.multiCall({
            abi: lpTokenABI.filter(({ name }) => name === method)[0],
            calls: lpTokens.map((address) => ({
              target: address,
              params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
            })),
            chain: 'bsc',
            permitFailure: true,
          })
      )
    );
  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res) => res.output
  );
  const token0 = token0Res.output.map((res) => res.output);
  const token1 = token1Res.output.map((res) => res.output);

  const symbol0 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: token0.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const symbol1 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: token1.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  // decimals
  const decimals0 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: token0.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);
  const decimals1 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: token1.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  let pools = await Promise.all(
    poolsInfo.map((pool, i) => {
      // the first two pools are for lotteries, etc.
      if (i < 2) return;
      if (!reservesData[i]) return;
      if (!symbol0[i] || !symbol1[i]) return null;

      const symbol = symbol0[i] + '-' + symbol1[i];
      const poolInfo = poolsInfo[i];
      const reserves = reservesData[i];

      const supply = supplyData[i];
      const masterChefBalance = masterChefBalData[i];

      const reserveUSD = calculateReservesUSD(
        symbol,
        reserves,
        masterChefBalance / supply,
        bnbPrice,
        cakePrice,
        ethPrice,
        decimals0[i],
        decimals1[i]
      )
        .div(1e18)
        .toString();
      const apyReward = calculateApy(
        poolInfo,
        totalAllocPoint,
        normalizedCakePerBlock,
        cakePrice,
        reserveUSD
      );
      return {
        pool: lpTokens[i].toLowerCase(),
        chain: utils.formatChain('binance'),
        project: PROJECT,
        symbol,
        tvlUsd: Number(reserveUSD),
        apyBase: feeAprByLp[lpTokens[i].toLowerCase()],
        apyReward,
        rewardTokens: apyReward > 0 ? [CAKE] : [],
        underlyingTokens: [token0[i], token1[i]],
      };
    })
  );

  // rmv null elements
  return pools.filter(Boolean).filter((i) => utils.keepFinite(i));
};

async function main(timestamp = null) {
  let yieldPools = []

  for (const chain of CHAINS) {
    if (chain === 'bsc') {
      yieldPools = yieldPools.concat(await getPoolsBsc());
    } else {
      yieldPools = yieldPools.concat(await getPoolsApy(chain));
    }
  }

  return yieldPools;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://pancakeswap.finance/farms',
};
