const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('./abi');
const poolAbi = require('./poolAbi');

const SECONDS_PER_YEAR = 31536000;
const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';

const chainUrlParam = {
  ethereum: 'proto_mainnet_v3',
  polygon: 'proto_polygon_v3',
  avalanche: 'proto_avalanche_v3',
  arbitrum: 'proto_arbitrum_v3',
  fantom: 'proto_fantom_v3',
  harmony: 'proto_harmony_v3',
  optimism: 'proto_optimism_v3',
  metis: 'proto_metis_v3',
  xdai: 'proto_gnosis_v3',
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
};

const API_URLS = {
  optimism: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism',
  avalanche:
    'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-avalanche',
  arbitrum: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
  polygon: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
  fantom: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-fantom',
  metis:
    'https://andromeda.thegraph.metis.io/subgraphs/name/aave/protocol-v3-metis',
  xdai: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-gnosis',
};

const query = gql`
  query ReservesQuery {
    reserves {
      name
      borrowingEnabled
      aToken {
        id
        rewards {
          id
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
          distributionEnd
        }
        underlyingAssetAddress
        underlyingAssetDecimals
      }
      vToken {
        rewards {
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
          distributionEnd
        }
      }
      symbol
      liquidityRate
      variableBorrowRate
      baseLTVasCollateral
      isFrozen
    }
  }
`;

const queryMetis = gql`
  query ReservesQuery {
    reserves(first: 25) {
      name
      borrowingEnabled
      aToken {
        id
        rewards(first: 1) {
          id
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
          distributionEnd
        }
        underlyingAssetAddress
        underlyingAssetDecimals
      }
      vToken {
        rewards(first: 1) {
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
          distributionEnd
        }
      }
      symbol
      liquidityRate
      variableBorrowRate
      baseLTVasCollateral
      isFrozen
    }
  }
`;

const ethV3Pools = async () => {
  const AaveProtocolDataProviderV3Mainnet =
    '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3';
  const reserveTokens = (
    await sdk.api.abi.call({
      target: AaveProtocolDataProviderV3Mainnet,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain: 'ethereum',
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: AaveProtocolDataProviderV3Mainnet,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain: 'ethereum',
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: AaveProtocolDataProviderV3Mainnet,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: AaveProtocolDataProviderV3Mainnet,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const totalSupplyEthereum = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalancesEthereum = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimalsEthereum = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `ethereum:${t.tokenAddress}`)
    .concat(`ethereum:${GHO}`)
    .join(',');
  const pricesEthereum = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  const ghoSupply =
    (
      await sdk.api.abi.call({
        target: GHO,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  return reserveTokens.map((pool, i) => {
    const p = poolsReserveData[i];
    const price = pricesEthereum[`ethereum:${pool.tokenAddress}`]?.price;

    const supply = totalSupplyEthereum[i];
    let totalSupplyUsd = (supply / 10 ** underlyingDecimalsEthereum[i]) * price;

    const currentSupply = underlyingBalancesEthereum[i];
    let tvlUsd = (currentSupply / 10 ** underlyingDecimalsEthereum[i]) * price;

    if (pool.symbol === 'GHO') {
      tvlUsd = 0;
      totalSupplyUsd = tvlUsd;
      totalBorrowUsd = ghoSupply * pricesEthereum[`ethereum:${GHO}`]?.price;
    } else {
      totalBorrowUsd = totalSupplyUsd - tvlUsd;
    }

    return {
      pool: `${aTokens[i].tokenAddress}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'aave-v3',
      symbol: pool.symbol,
      tvlUsd,
      apyBase: (p.liquidityRate / 10 ** 27) * 100,
      underlyingTokens: [pool.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd,
      debtCeilingUsd: pool.symbol === 'GHO' ? 1e8 : null,
      apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
      ltv: poolsReservesConfigurationData[i].ltv / 10000,
      url: `https://app.aave.com/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_mainnet_v3`,
      borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
    };
  });
};

const apy = async () => {
  let data = await Promise.all(
    Object.entries(API_URLS).map(async ([chain, url]) => [
      chain,
      (await request(url, chain === 'metis' ? queryMetis : query)).reserves,
    ])
  );

  data = data.map(([chain, reserves]) => [
    chain,
    reserves.filter((p) => !p.isFrozen),
  ]);

  const totalSupply = await Promise.all(
    data.map(async ([chain, reserves]) =>
      (
        await sdk.api.abi.multiCall({
          chain: chain === 'avalanche' ? 'avax' : chain,
          abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
          calls: reserves.map((reserve) => ({
            target: reserve.aToken.id,
          })),
        })
      ).output.map(({ output }) => output)
    )
  );

  const underlyingBalances = await Promise.all(
    data.map(async ([chain, reserves]) =>
      (
        await sdk.api.abi.multiCall({
          chain: chain === 'avalanche' ? 'avax' : chain,
          abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
          calls: reserves.map((reserve, i) => ({
            target: reserve.aToken.underlyingAssetAddress,
            params: [reserve.aToken.id],
          })),
        })
      ).output.map(({ output }) => output)
    )
  );

  const underlyingTokens = data.map(([chain, reserves]) =>
    reserves.map(
      (pool) =>
        `${chain === 'avalanche' ? 'avax' : chain}:${
          pool.aToken.underlyingAssetAddress
        }`
    )
  );

  const rewardTokens = data.map(([chain, reserves]) =>
    reserves.map((pool) =>
      pool.aToken.rewards.map(
        (rew) => `${chain === 'avalanche' ? 'avax' : chain}:${rew.rewardToken}`
      )
    )
  );

  const { pricesByAddress, pricesBySymbol } = await getPrices(
    underlyingTokens.flat().concat(rewardTokens.flat(Infinity))
  );

  const pools = data.map(([chain, markets], i) => {
    const chainPools = markets.map((pool, idx) => {
      const supply = totalSupply[i][idx];
      const currentSupply = underlyingBalances[i][idx];
      const totalSupplyUsd =
        (supply / 10 ** pool.aToken.underlyingAssetDecimals) *
        (pricesByAddress[pool.aToken.underlyingAssetAddress] ||
          pricesBySymbol[pool.symbol]);
      const tvlUsd =
        (currentSupply / 10 ** pool.aToken.underlyingAssetDecimals) *
        (pricesByAddress[pool.aToken.underlyingAssetAddress] ||
          pricesBySymbol[pool.symbol]);
      const { rewards } = pool.aToken;

      const rewardPerYear = rewards.reduce(
        (acc, rew) =>
          acc +
          (rew.emissionsPerSecond / 10 ** rew.rewardTokenDecimals) *
            SECONDS_PER_YEAR *
            (pricesByAddress[rew.rewardToken] ||
              pricesBySymbol[rew.rewardTokenSymbol]),
        0
      );

      const { rewards: rewardsBorrow } = pool.vToken;
      const rewardPerYearBorrow = rewardsBorrow.reduce(
        (acc, rew) =>
          acc +
          (rew.emissionsPerSecond / 10 ** rew.rewardTokenDecimals) *
            SECONDS_PER_YEAR *
            (pricesByAddress[rew.rewardToken] ||
              pricesBySymbol[rew.rewardTokenSymbol]),
        0
      );
      let totalBorrowUsd = totalSupplyUsd - tvlUsd;
      totalBorrowUsd = totalBorrowUsd < 0 ? 0 : totalBorrowUsd;

      const supplyRewardEnd = pool.aToken.rewards[0]?.distributionEnd;
      const borrowRewardEnd = pool.vToken.rewards[0]?.distributionEnd;

      return {
        pool: `${pool.aToken.id}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'aave-v3',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (pool.liquidityRate / 10 ** 27) * 100,
        apyReward:
          supplyRewardEnd * 1000 > new Date()
            ? (rewardPerYear / totalSupplyUsd) * 100
            : null,
        rewardTokens:
          supplyRewardEnd * 1000 > new Date()
            ? rewards.map((rew) => rew.rewardToken)
            : null,
        underlyingTokens: [pool.aToken.underlyingAssetAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.variableBorrowRate) / 1e25,
        apyRewardBorrow:
          borrowRewardEnd * 1000 > new Date()
            ? (rewardPerYearBorrow / totalBorrowUsd) * 100
            : null,
        ltv: Number(pool.baseLTVasCollateral) / 10000,
        url: `https://app.aave.com/reserve-overview/?underlyingAsset=${pool.aToken.underlyingAssetAddress}&marketName=${chainUrlParam[chain]}`,
        borrowable: pool.borrowingEnabled,
      };
    });

    return chainPools;
  });

  const ethPools = await ethV3Pools();

  return pools
    .flat()
    .concat(ethPools)
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: apy,
};
