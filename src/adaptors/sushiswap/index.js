const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const {
  lpTokenABI,
  masterchefABI,
  masterchefV2ABI,
} = require('./abisEthereum');
const { minichefV2 } = require('./abiMinichefV2');
const { rewarderABI } = require('./abiRewarder');

// exchange urls
const baseUrl = 'https://api.thegraph.com/subgraphs/name/sushiswap';
const urlEthereum = `${baseUrl}/exchange`;
const urlArbitrum = `${baseUrl}/arbitrum-exchange`;
const urlPolygon = `${baseUrl}/matic-exchange`;
const urlAvalanche = `${baseUrl}/avalanche-exchange`;

// LM reward urls
const baseUrlLm = 'https://api.thegraph.com/subgraphs/name';
const urlMc1 = `${baseUrlLm}/sushiswap/master-chef`;
const urlMc2 = `${baseUrlLm}/sushiswap/master-chefv2`;
const urlMcArbitrum = `${baseUrlLm}/sushiswap/arbitrum-minichef`;
const urlMcPolygon = `${baseUrlLm}/sushiswap/matic-minichef`;

// sushi token
const SUSHI = {
  ethereum: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
  arbitrum: '0xd4d42F0b6DEF4CE0383636770eF773390d85c61A',
  polygon: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',
};

// masterchef/minichef for arbitrum/polygon
const CHEF = {
  ethereum: {
    // masterchef and masterchefv2
    mc1: '0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd',
    mc2: '0xef0881ec094552b2e128cf945ef17a6752b4ec5d',
  },
  arbitrum: {
    // minichefv2
    mc2: '0xF4d73326C13a4Fc5FD7A064217e12780e9Bd62c3',
  },
  polygon: {
    // minichefv2
    mc2: '0x0769fd68dFb93167989C6f7254cd0D766Fb2841F',
  },
};

const secondsPerDay = 60 * 60 * 24;
const secondsPerBlock = 12;
const blocksPerDay = secondsPerDay / secondsPerBlock;

const query = gql`
  {
    pairs(first: 1000, orderBy: reserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: reserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const queryMc = gql`
  {
    pools(
      first: 1000
      skip: 0
      orderBy: id
      orderDirection: desc
      where: { allocPoint_gt: 0 }
      block: {number: <PLACEHOLDER>}
    ) {
      id
      pair
      allocPoint
      rewarder {
        id
        rewardToken
        rewardPerSecond
      }
    }
  }
`;

const topLvl = async (chainString, urlExchange, urlRewards, chainId) => {
  try {
    const [block, blockPrior] = await utils.getBlocks(chainString, null, [
      urlExchange,
      urlRewards,
    ]);

    const [_, blockPrior7d] = await utils.getBlocks(
      chainString,
      null,
      [urlExchange, urlRewards],
      604800
    );

    // calc base apy
    let data = (
      await request(urlExchange, query.replace('<PLACEHOLDER>', block))
    ).pairs;
    let queryPriorC = queryPrior;
    queryPriorC = queryPriorC.replace('<PLACEHOLDER>', blockPrior);
    const dataPrior = (await request(urlExchange, queryPriorC)).pairs;

    // 7d offset
    const dataPrior7d = (
      await request(
        urlExchange,
        queryPrior.replace('<PLACEHOLDER>', blockPrior7d)
      )
    ).pairs;

    data = await utils.tvl(data, chainString);
    data = data.map((p) => utils.apy(p, dataPrior, dataPrior7d, 'v2'));
    data = data.map((p) => ({
      ...p,
      totalValueLockedUSDlp: p.totalValueLockedUSD,
    }));

    if (chainString === 'avalanche') {
      return data.map((p) => ({
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'sushiswap',
        symbol: utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`),
        tvlUsd: p.totalValueLockedUSDlp,
        apyBase: Number(p.apy1d),
        apyBase7d: Number(p.apy7d),
        underlyingTokens: [p.token0.id, p.token1.id],
        volumeUsd1d: p.volumeUSD1d,
        volumeUsd7d: p.volumeUSD7d,
        url: `https://www.sushi.com/earn/${chainId}:${p.id}`,
      }));
    }

    let sushiPerSecond;

    let poolsLengthMC1;
    let totalAllocPointMC1;
    let sushiPerBlockMC1;

    let poolsLengthMC2;
    let totalAllocPointMC2;
    let sushiPerBlockMC2;

    let poolsInfoMC1;
    let poolsInfoMC2;
    let lpTokensMC2;

    let rewarderMC2;
    let rewardTokenMC2;
    let rewardPerSecondMC2;

    if (chainString === 'arbitrum' || chainString === 'polygon') {
      [poolsLengthMC2, totalAllocPointMC2, sushiPerSecond] = (
        await Promise.all(
          ['poolLength', 'totalAllocPoint', 'sushiPerSecond'].map((method) =>
            sdk.api.abi.call({
              target: CHEF[chainString].mc2,
              abi: minichefV2.find(({ name }) => name === method),
              chain: chainString,
            })
          )
        )
      ).map((res) => res.output);
      sushiPerSecond /= 1e18;

      [poolsInfoMC2, lpTokensMC2, rewarderMC2] = await Promise.all(
        ['poolInfo', 'lpToken', 'rewarder'].map((method) =>
          sdk.api.abi.multiCall({
            calls: [...Array(Number(poolsLengthMC2 - 1)).keys()].map((i) => ({
              target: CHEF[chainString].mc2,
              params: i,
            })),
            abi: minichefV2.find(({ name }) => name === method),
            chain: chainString,
          })
        )
      );
      poolsInfoMC2 = poolsInfoMC2.output.map((res) => res.output);
      lpTokensMC2 = lpTokensMC2.output.map((res) => res.output);
      rewarderMC2 = rewarderMC2.output.map((res) => res.output);

      [rewardPerSecondMC2, rewardTokenMC2] = await Promise.all(
        ['rewardPerSecond', 'rewardToken'].map((method) =>
          sdk.api.abi.multiCall({
            abi: rewarderABI.find(({ name }) => name === method),
            calls: [...Array(Number(poolsLengthMC2 - 1)).keys()].map((i) => ({
              target: rewarderMC2[i],
            })),
            chain: chainString,
          })
        )
      );
      rewardPerSecondMC2 = rewardPerSecondMC2.output.map((res) => res.output);
      rewardTokenMC2 = rewardTokenMC2.output.map((res) => res.output);

      poolsInfoMC2.forEach((p, i) => {
        p['lpToken'] = lpTokensMC2[i];
        p['rewardToken'] = rewardTokenMC2[i]?.toLowerCase();
        p['rewardPerSecond'] = rewardPerSecondMC2[i];
      });
    } else if (chainString === 'ethereum') {
      //////////////////// MC1 (pools with sushi rewards)
      [poolsLengthMC1, totalAllocPointMC1, sushiPerBlockMC1] = (
        await Promise.all(
          ['poolLength', 'totalAllocPoint', 'sushiPerBlock'].map((method) =>
            sdk.api.abi.call({
              target: CHEF[chainString].mc1,
              abi: masterchefABI.find(({ name }) => name === method),
              chain: chainString,
            })
          )
        )
      ).map((res) => res.output);
      sushiPerBlockMC1 /= 1e18;

      poolsInfoMC1 = await sdk.api.abi.multiCall({
        abi: masterchefABI.find(({ name }) => name === 'poolInfo'),
        calls: [...Array(Number(poolsLengthMC1 - 1)).keys()].map((i) => ({
          target: CHEF[chainString].mc1,
          params: i,
        })),
        chain: chainString,
      });
      poolsInfoMC1 = poolsInfoMC1.output.map((res) => res.output);

      //////////////////// MC2 (pools with sushi and extra rewards)
      [poolsLengthMC2, totalAllocPointMC2, sushiPerBlockMC2] = (
        await Promise.all(
          ['poolLength', 'totalAllocPoint', 'sushiPerBlock'].map((method) =>
            sdk.api.abi.call({
              target: CHEF[chainString].mc2,
              abi: masterchefV2ABI.find(({ name }) => name === method),
              chain: chainString,
            })
          )
        )
      ).map((res) => res.output);
      sushiPerBlockMC2 /= 1e18;

      [poolsInfoMC2, lpTokensMC2] = await Promise.all(
        ['poolInfo', 'lpToken'].map((method) =>
          sdk.api.abi.multiCall({
            abi: masterchefV2ABI.find(({ name }) => name === method),
            calls: [...Array(Number(poolsLengthMC2 - 1)).keys()].map((i) => ({
              target: CHEF[chainString].mc2,
              params: i,
            })),
            chain: chainString,
          })
        )
      );
      poolsInfoMC2 = poolsInfoMC2.output.map((res) => res.output);
      lpTokensMC2 = lpTokensMC2.output.map((res) => res.output);
      poolsInfoMC2.forEach((p, i) => {
        p['lpToken'] = lpTokensMC2[i];
      });
    }

    // scale tvl by reservesRatio
    // need to loop over them separately and call mc1 for sushiAllocation and mc2 for extraAlloctaion
    const Z =
      chainString === 'ethereum'
        ? { mc1: poolsInfoMC1, mc2: poolsInfoMC2 }
        : { mc2: poolsInfoMC2 };

    for (const [k, alloc] of Object.entries(Z)) {
      const lpTokens = alloc.map((p) => p.lpToken);
      let [supplyData, masterChefBalData] = await Promise.all(
        ['totalSupply', 'balanceOf'].map((method) =>
          sdk.api.abi.multiCall({
            calls: lpTokens.map((address) => ({
              target: address,
              params: method === 'balanceOf' ? [CHEF[chainString][k]] : null,
            })),
            abi: lpTokenABI.find(({ name }) => name === method),
            chain: chainString,
          })
        )
      );
      supplyData = supplyData.output.map((res) => res.output);
      masterChefBalData = masterChefBalData.output.map((res) => res.output);

      const reserveRatios = {};
      lpTokens.forEach((lp, i) => {
        reserveRatios[lp.toLowerCase()] = masterChefBalData[i] / supplyData[i];
      });
      for (const p of data) {
        const rr = reserveRatios[p.id.toLowerCase()];
        if (rr === undefined) continue;
        p['totalValueLockedUSD'] *= rr;
      }
    }

    // calculate sushi and extra token reward apy for ethereum
    // note: wanted to pull via contracts, but a large variety of different reward token related abis
    // and function names (eg `rewardPerSecond`, `tokenPerBlock`, `rewardPerToken`)
    // using the subgraph to pull rewards instead
    if (chainString === 'ethereum') {
      const poolsRewardMC2 = (
        await request(urlRewards, queryMc.replace('<PLACEHOLDER>', block))
      ).pools;
      for (const p of poolsInfoMC2) {
        const x = poolsRewardMC2.find(
          (x) => x.pair.toLowerCase() === p.lpToken.toLowerCase()
        );
        const rewarder = x?.rewarder;
        p['rewardPerSecond'] =
          // ALCX reward token returns tokenPerBlock but subgraph doesn't distinguish
          // see: (https://etherscan.io/address/0x7519C93fC5073E15d89131fD38118D73A72370F8#readContract)
          p.lpToken.toLowerCase() ===
          '0xc3f279090a47e80990fe3a9c30d24cb117ef91a8'
            ? Number(rewarder?.rewardPerSecond / secondsPerBlock)
            : // CVX rewards are 0
            p.lpToken.toLowerCase() ===
              '0x05767d9ef41dc40689678ffca0608878fb3de906'
            ? 0
            : Number(rewarder?.rewardPerSecond);
        p['rewardToken'] =
          rewarder !== undefined
            ? rewarder.rewardToken.toLowerCase()
            : rewarder;
      }
    }

    // get reward token prices
    let coins = [
      ...new Set(poolsInfoMC2.map((p) => p.rewardToken).filter((p) => p)),
    ].map((t) => `${chainString}:${t}`);
    const sushi = `${chainString}:${SUSHI[chainString].toLowerCase()}`;
    coins = [...coins, sushi];
    const tokensUsd = (
      await superagent.get(
        `https://coins.llama.fi/prices/current/${coins.join(',').toLowerCase()}`
      )
    ).body.coins;

    // for mc1: calc sushi per year in usd
    if (chainString === 'ethereum') {
      for (const p of poolsInfoMC1) {
        p['sushiPerYearUsd'] =
          (Number(p.allocPoint) / Number(totalAllocPointMC1)) *
          sushiPerBlockMC1 *
          blocksPerDay *
          365 *
          tokensUsd[sushi].price;
      }
    }
    // for mc2: calc sushi and extra reward per year in usd
    for (const p of poolsInfoMC2) {
      priceUnit =
        chainString === 'ethereum'
          ? sushiPerBlockMC2 * blocksPerDay
          : sushiPerSecond * secondsPerDay;

      p['sushiPerYearUsd'] =
        (Number(p.allocPoint) / Number(totalAllocPointMC2)) *
        priceUnit *
        365 *
        tokensUsd[sushi].price;

      const coin = tokensUsd[`${chainString}:${p.rewardToken}`];
      p['rewardPerYearUsd'] =
        (Number(p.rewardPerSecond) / 10 ** coin?.decimals) *
        secondsPerDay *
        365 *
        coin?.price;
    }

    const dataLM =
      chainString === 'ethereum'
        ? [...poolsInfoMC1, poolsInfoMC2].flat()
        : poolsInfoMC2;

    data = data.map((p) => {
      const lm = dataLM.find(
        (x) => x.lpToken.toLowerCase() === p.id.toLowerCase()
      );

      let apySushi =
        (lm?.sushiPerYearUsd / Number(p.totalValueLockedUSD)) * 100;
      let apyExtra =
        (lm?.rewardPerYearUsd / Number(p.totalValueLockedUSD)) * 100;
      let rewardToken = lm?.rewardToken ?? [];

      apySushi = isNaN(apySushi) ? 0 : apySushi;
      const apyExtraRewards = isNaN(apyExtra) ? 0 : apyExtra;
      const apyReward = apySushi + apyExtraRewards;

      const rewardTokens =
        apySushi > 0 && apyExtraRewards > 0
          ? [SUSHI[chainString], rewardToken]
          : apySushi > 0
          ? [SUSHI[chainString]]
          : apyExtraRewards > 0
          ? [rewardToken]
          : [];

      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'sushiswap',
        symbol: utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`),
        tvlUsd: p.totalValueLockedUSDlp,
        apyBase: Number(p.apy1d),
        apyBase7d: Number(p.apy7d),
        apyReward,
        rewardTokens,
        underlyingTokens: [p.token0.id, p.token1.id],
        volumeUsd1d: p.volumeUSD1d,
        volumeUsd7d: p.volumeUSD7d,
        url: `https://www.sushi.com/earn/${chainId}:${p.id}`,
      };
    });

    return data;
  } catch (e) {
    if (e.message.includes('Stale subgraph')) return [];
    else throw e;
  }
};

const main = async () => {
  let data = await Promise.all([
    topLvl('ethereum', urlEthereum, urlMc2, 1),
    topLvl('arbitrum', urlArbitrum, urlMcArbitrum, 42161),
    topLvl('polygon', urlPolygon, urlMcPolygon, 137),
    topLvl('avalanche', urlAvalanche, null, 43114),
  ]);

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
