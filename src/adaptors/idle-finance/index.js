const sdk = require('@defillama/sdk');
const axios = require('axios');

const idleTokenAbi = require('./idleTokenAbi.js');
const unitrollerAbi = require('./unitrollerAbi.js');
const idleCdoAbi = require('./idleCdoAbi.js');
const idleLidoStrategyAbi = require('./idleLidoStrategyAbi');
const utils = require('../utils');

const unitroller = '0x275DA8e61ea8E02d51EDd8d0DC5c0E62b4CDB0BE';
const IDLE = '0x875773784af8135ea0ef43b5a374aad105c5d39e';

const tranches = [
  {
    name: 'lido_stETH',
    cdo: '0x34dCd573C5dE4672C8248cd12A99f875Ca112Ad8',
  },
  {
    name: 'lido_stMatic',
    cdo: '0xF87ec7e1Ee467d7d78862089B92dd40497cBa5B8',
  },
  {
    name: 'convex_frax3Crv',
    cdo: '0x4CCaf1392a17203eDAb55a1F2aF3079A8Ac513E7',
  },
  {
    name: 'convex_steCRV',
    cdo: '0x7EcFC031758190eb1cb303D8238D553b1D4Bc8ef',
  },
  {
    name: 'convex_alusd3crv',
    cdo: '0x008C589c471fd0a13ac2B9338B69f5F7a1A843e1',
  },
  {
    name: 'convex_3eur',
    cdo: '0x858F5A3a5C767F8965cF7b77C51FD178C4A92F05',
  },
  {
    name: 'convex_pbtccrv',
    cdo: '0xf324Dca1Dc621FCF118690a9c6baE40fbD8f09b7',
  },
  {
    name: 'euler_eUSDC',
    cdo: '0xF5a3d259bFE7288284Bd41823eC5C8327a314054',
  },
  {
    name: 'euler_eDAI',
    cdo: '0x46c1f702A6aAD1Fd810216A5fF15aaB1C62ca826',
  },
  {
    name: 'euler_eUSDT',
    cdo: '0xD5469DF8CA36E7EaeDB35D428F28E13380eC8ede',
  },
  {
    name: 'euler_eagEUR',
    cdo: '0x2398Bc075fa62Ee88d7fAb6A18Cd30bFf869bDa4',
  },
  {
    name: 'cp_WIN_USDC',
    cdo: '0xDBCEE5AE2E9DAf0F5d93473e08780C9f45DfEb93',
  },
  {
    name: 'cp_FOL_DAI',
    cdo: '0xDcE26B2c78609b983cF91cCcD43E238353653b0E',
  },
];

const getApy = async () => {
  const pools = (await Promise.all([apyTranches()])).flat();
  return pools;
};

const apyTranches = async () => {
  const AATranche = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t) => ({
        target: t.cdo,
      })),
      abi: idleCdoAbi.find((m) => m.name === 'AATranche'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const BBTranche = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t) => ({
        target: t.cdo,
      })),
      abi: idleCdoAbi.find((m) => m.name === 'BBTranche'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const FULL_ALLOC = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t) => ({
        target: t.cdo,
      })),
      abi: idleCdoAbi.find((m) => m.name === 'FULL_ALLOC'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const currentAARatio = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t) => ({
        target: t.cdo,
      })),
      abi: idleCdoAbi.find((m) => m.name === 'getCurrentAARatio'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const strategyTokens = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t) => ({
        target: t.cdo,
      })),
      abi: idleCdoAbi.find((m) => m.name === 'strategyToken'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const underlyingTokens = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t) => ({
        target: t.cdo,
      })),
      abi: idleCdoAbi.find((m) => m.name === 'token'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const balances = (
    await sdk.api.abi.multiCall({
      calls: strategyTokens.map((t, i) => ({
        target: t,
        params: tranches[i].cdo,
      })),
      abi: 'erc20:balanceOf',
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: strategyTokens.map((t) => ({
        target: t,
      })),
      abi: 'erc20:decimals',
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const underlyingPrices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${underlyingTokens
        .map((t) => `ethereum:${t}`)
        .join(',')}`
    )
  ).data.coins;

  const aprAA = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t, i) => ({
        target: t.cdo,
        params: AATranche[i],
      })),
      abi: idleCdoAbi.find((m) => m.name === 'getApr'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const aprBB = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t, i) => ({
        target: t.cdo,
        params: BBTranche[i],
      })),
      abi: idleCdoAbi.find((m) => m.name === 'getApr'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const strategies = (
    await sdk.api.abi.multiCall({
      calls: Object.values(tranches).map((t) => ({
        target: t.cdo,
      })),
      abi: idleCdoAbi.find((m) => m.name === 'strategy'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const strategyApr = (
    await sdk.api.abi.multiCall({
      calls: strategies.map((t) => ({
        target: t,
      })),
      abi: idleLidoStrategyAbi.find((m) => m.name === 'getApr'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const pools = [];
  for (const [i, t] of tranches.entries()) {
    const tvlUsd =
      (balances[i] / 10 ** decimals[i]) *
      underlyingPrices[`ethereum:${underlyingTokens[i]}`]?.price;

    // AA tranche
    pools.push({
      pool: t.cdo,
      symbol: t.name,
      apyBase: (Number(aprAA[i]) + Number(strategyApr[i])) / 1e18,
      tvlUsd: (tvlUsd * Number(currentAARatio[i])) / Number(FULL_ALLOC[i]),
      project: 'idle-finance',
      chain: 'ethereum',
      poolMeta: 'Senior Tranche',
    });

    // AA tranche
    pools.push({
      pool: t.cdo,
      symbol: t.name,
      apyBase: (Number(aprBB[i]) + Number(strategyApr[i])) / 1e18,
      tvlUsd:
        (tvlUsd * (1 - Number(currentAARatio[i]))) / Number(FULL_ALLOC[i]),
      project: 'idle-finance',
      chain: 'ethereum',
      poolMeta: 'Junior Tranche',
    });
  }

  return pools;
};

const apyBestYield = async () => {
  const markets = (
    await sdk.api.abi.call({
      target: unitroller,
      abi: unitrollerAbi.find((m) => m.name === 'getAllMarkets'),
      chain: 'ethereum',
    })
  ).output;

  const underlyingTokens = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'token'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const underlyingPrices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${underlyingTokens
        .map((t) => `ethereum:${t}`)
        .join(',')}`
    )
  ).data.coins;

  const avgAPRs = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'getAvgAPR'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const names = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'name'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const totalSupplys = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'totalSupply'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const idleTokenPrices = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'tokenPrice'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const blockTime = 12;
  const blocksPerYear = (60 * 60 * 24 * 365) / blockTime;

  const idleSpeeds = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: unitroller, params: [m] })),
      abi: unitrollerAbi.find((m) => m.name === 'idleSpeeds'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const idlePrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:${IDLE}`)
  ).data.coins;

  return markets
    .map((p, i) => {
      // risk adjusted pools are no longer supported
      if (names[i].toLowerCase().includes('risk adjusted')) return null;
      const tvlUsd =
        (((totalSupplys[i] / 1e18) * idleTokenPrices[i]) /
          10 ** underlyingPrices[`ethereum:${underlyingTokens[i]}`]?.decimals) *
        underlyingPrices[`ethereum:${underlyingTokens[i]}`]?.price;

      const idlePerDay = ((idleSpeeds[i] / 1e18) * 86400) / 13.5;
      const apyReward =
        ((idlePerDay * 365 * idlePrice[`ethereum:${IDLE}`].price) / tvlUsd) *
        100;

      return {
        pool: p,
        apyBase: utils.aprToApy(avgAPRs[i] / 1e18, blocksPerYear),
        apyReward,
        rewardTokens: apyReward > 0 ? [IDLE] : [],
        symbol: underlyingPrices[`ethereum:${underlyingTokens[i]}`].symbol,
        tvlUsd,
        chain: 'ethereum',
        project: 'idle-finance',
        underlyingTokens: [underlyingTokens[i]],
        poolMeta: names[i].includes('Best') ? 'Best Yield' : 'Risk adjusted',
      };
    })
    .filter((p) => p !== null);
};

module.exports = {
  apy: getApy,
  timetravel: false,
  url: 'test',
};
