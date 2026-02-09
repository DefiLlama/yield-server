const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiLendingPool = require('./abiLendingPool');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');
// const abiChefIncentivesController = require('./abiChefIncentivesController');

const utils = require('../utils');

const RDNT = '0x0c4681e6c0235179ec3d4f4fc4df3d14fdd96017';

// note: disabled rewards completely as they require locking of dLP tokens
// https://docs.radiant.capital/radiant/project-info/dlp/dlp-utility
// const earlyExitPenalty = 1 - 0.9;

const chains = {
  arbitrum: {
    LendingPool: '0xE23B4AE3624fB6f7cDEF29bC8EAD912f1Ede6886',
    ProtocolDataProvider: '0xdd109cb6f2b2aeebce01727a31d99e3149aa7e41',
    url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69',
    // RIZ Isolated Markets
    IsolatedPools: [
      { pool: '0x32F9460386A842E43E3e09fA92Bb77412Aabf42B', provider: '0xFfd5D4606Fc44F80E58F755d3D2198968e293344', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // ZRO/USDC
      { pool: '0x0C19836CcD6eAcb9E21693e1f27bde10218b6701', provider: '0x35DCFeCB7Bcc122766Fc5ed9c5e334377a6402C8', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // RDNT/USDC
      { pool: '0xf3007F6d241EbF00140b94D92849B5ACf0D36133', provider: '0x43C7F97E9A6056C6BA9140DD1e2DDCF5051441Fe', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // rsETH/WETH
      { pool: '0x3fEc9583827431F622A4b188b6c57CfFE8655b8e', provider: '0x368633123723CDbB711da83Fc6Fe7Ed918a4ad7F', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // ezETH/WETH
      { pool: '0x6EF47f768aeAe173712Fe6a662666B1DBB08c66F', provider: '0xc4dA16B15c60952dE0a4CD459f42FC634462b689', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // PT-wstETH/WETH
      { pool: '0x6B712099ab3Eb192F11E4964b35De8BAA7b15299', provider: '0x58a2d3774aDC5C44f8B5DBa943DefB86dD213a35', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // GMX/USDC
      { pool: '0x6B392CeBb1C7f0D93D8CF99a25A21C118b347a16', provider: '0xd2dFe8487feF1361242b295013E29f6cfcA822bA', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // gmARB/USDC
      { pool: '0x16910EC43fe08190aD228910B58656243c675822', provider: '0xf4664E39dB8f0A5812c5C6753BFd5d19863A104E', url: '0xacA72b23081f3786159edbca8e5FD2Ae71171C69' }, // USDY/USDC
    ],
  },
  bsc: {
    LendingPool: '0xCcf31D54C3A94f67b8cEFF8DD771DE5846dA032c',
    ProtocolDataProvider: '0x499e336041202cd4e55a1979e7511b3211033847',
    url: '0x1029a53c7e8e00bf9272533cd1cbec395073a165',
    // RIZ Isolated Markets
    IsolatedPools: [
      { pool: '0x8E4660b30d09C94Ea77795727c55d69799a9Abd1', provider: '0xbE7C10bf9039Ca3F0A3BfA844A6Ee879bc4C0482', url: '0x1029A53C7e8e00Bf9272533CD1cbEc395073A165' }, // CAKE/USDT
      { pool: '0x486a97Dd8341C7590238b583580C78DC9151B8a6', provider: '0xF2e9dD985929Fa37c990F4fae1905023640e36C2', url: '0x1029A53C7e8e00Bf9272533CD1cbEc395073A165' }, // FLOKI/USDT
      { pool: '0xc4a09Dd3DcC7D95e0bD525eff7f2968514dE23b2', provider: '0xe986B0F64D97B0EA31542c2b05216326A00EeAEf', url: '0x1029A53C7e8e00Bf9272533CD1cbEc395073A165' }, // slisBNB/WBNB
    ],
  },
  base: {
    LendingPool: '0x30798cFe2CCa822321ceed7e6085e633aAbC492F',
    ProtocolDataProvider: '0x07d2DC09A1CbDD01e5f6Ca984b060A3Ff31b9EAF',
    url: '0xe7f252d19ab96254144fbb0d94ebc0ff7ea0c541',
    // RIZ Isolated Markets
    IsolatedPools: [
      { pool: '0x260000459E0D1C46ADE027e552ADc911E0742b50', provider: '0x61CBCE4Fc0cD218Dbd187735399CF3ED98139fEb', url: '0x211DD83F6e49fd63c8Db4dbAeA5358256ACfB350' }, // AERO/USDC
      { pool: '0x520411c27a950B731e0D4D5350E0CAEa51b1426F', provider: '0x88d875952a66a7CA396713744517d053Dc4cEf5b', url: '0x211DD83F6e49fd63c8Db4dbAeA5358256ACfB350' }, // wSuperOETHb/WETH
      { pool: '0x17042A220b138b203f67fDF62fA7aDD8cB16ccAa', provider: '0x0496F4c03e810b7F640437Bc767f9B2209E454EF', url: '0x211DD83F6e49fd63c8Db4dbAeA5358256ACfB350' }, // ZRO/USDC
      { pool: '0xD111c7DA1eBDf4D2fF2d234A61a806b03187CEC9', provider: '0xfa584191f50C61f7FC160d3fA1419Ec0c936204F', url: '0x211DD83F6e49fd63c8Db4dbAeA5358256ACfB350' }, // MAVIA/USDC
      { pool: '0x02694DE4B5E0AB3bB9e27Fbd16e4a51E0ECE4cAC', provider: '0x902A2760A0958288093498A74b416eB1C45eC2FE', url: '0x211DD83F6e49fd63c8Db4dbAeA5358256ACfB350' }, // BRETT/USDC
    ],
  },
  ethereum: {
    LendingPool: '0xA950974f64aA33f27F6C5e017eEE93BF7588ED07',
    ProtocolDataProvider: '0x362f3BB63Cff83bd169aE1793979E9e537993813',
    url: '0x70e507f1d20AeC229F435cd1EcaC6A7200119B9F',
  },
};

// Helper function to fetch pools from a specific lending pool
const fetchPoolsFromLendingPool = async (chain, lendingPool, protocolDataProvider, urlSuffix, poolMeta = null) => {
  const reservesList = (
    await sdk.api.abi.call({
      target: lendingPool,
      abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
      chain,
    })
  ).output;

  if (!reservesList || reservesList.length === 0) {
    return [];
  }

  const reserveData = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((i) => ({
        target: lendingPool,
        params: [i],
      })),
      abi: abiLendingPool.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
    ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: reservesList.map((t, i) => ({
          target: t,
          params:
            method === 'erc20:balanceOf'
              ? reserveData[i].aTokenAddress
              : null,
        })),
        chain,
      })
    )
  );

  const liquidity = liquidityRes.output.map((o) => o.output);
  const decimals = decimalsRes.output.map((o) => o.output);
  const symbols = symbolsRes.output.map((o) => o.output);

  const totalBorrow = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:totalSupply',
      calls: reserveData.map((p) => ({
        target: p.variableDebtTokenAddress,
      })),
      chain,
    })
  ).output.map((o) => o.output);

  // Try to get configuration from ProtocolDataProvider first, fallback to LendingPool's getConfiguration
  let reserveConfigurationData;
  try {
    const configResult = await sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({
        target: protocolDataProvider,
        params: t,
      })),
      chain,
      abi: abiProtocolDataProvider.find(
        (n) => n.name === 'getReserveConfigurationData'
      ),
      permitFailure: true,
    });
    
    // Check if all calls failed
    const allFailed = configResult.output.every(o => !o.success || !o.output);
    
    if (allFailed) {
      // Fallback: Use LendingPool's getConfiguration method
      const configFromPool = await sdk.api.abi.multiCall({
        calls: reservesList.map((t) => ({
          target: lendingPool,
          params: [t],
        })),
        chain,
        abi: abiLendingPool.find((n) => n.name === 'getConfiguration'),
      });
      
      // Parse configuration data from the returned tuple
      reserveConfigurationData = configFromPool.output.map((o) => {
        const data = o.output?.data || o.output;
        // Decode the configuration bitmap
        const ltv = Number((BigInt(data) >> BigInt(0)) & BigInt(0xFFFF));
        const liquidationThreshold = Number((BigInt(data) >> BigInt(16)) & BigInt(0xFFFF));
        const liquidationBonus = Number((BigInt(data) >> BigInt(32)) & BigInt(0xFFFF));
        const decimals = Number((BigInt(data) >> BigInt(48)) & BigInt(0xFF));
        const isActive = ((BigInt(data) >> BigInt(56)) & BigInt(1)) === BigInt(1);
        const isFrozen = ((BigInt(data) >> BigInt(57)) & BigInt(1)) === BigInt(1);
        const borrowingEnabled = ((BigInt(data) >> BigInt(58)) & BigInt(1)) === BigInt(1);
        
        return {
          ltv,
          liquidationThreshold,
          liquidationBonus,
          decimals,
          isActive,
          isFrozen,
          borrowingEnabled,
        };
      });
    } else {
      reserveConfigurationData = configResult.output.map((o) => o.output);
    }
  } catch (error) {
    return [];
  }

  const pricesArray = reservesList.map((t) => `${chain}:${t}`);

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).data.coins;

  return reservesList.map((t, i) => {
    const config = reserveConfigurationData[i];
    if (!config.isActive) return null;

    const price = prices[`${chain}:${t}`]?.price;

    const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
    const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
    const totalSupplyUsd = tvlUsd + totalBorrowUsd;

    const apyBase = reserveData[i].currentLiquidityRate / 1e25;
    const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

    const ltv = config.ltv / 1e4;
    const borrowable = config.borrowingEnabled;
    const frozen = config.isFrozen;

    // url for pools
    const url =
      `https://app.radiant.capital/#/asset-detail/${t}-${t}${urlSuffix}`.toLowerCase();

    return {
      pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
      symbol: symbols[i],
      project: 'radiant-v2',
      chain,
      tvlUsd,
      apyBase,
      underlyingTokens: [t],
      // borrow fields
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      ltv,
      borrowable,
      poolMeta: poolMeta || (frozen ? 'frozen' : null),
      url: `${url}-Borrow`,
    };
  });
};

const getApy = async () => {
  const pools = await Promise.allSettled(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];
      
      // Fetch main pool
      const mainPools = await fetchPoolsFromLendingPool(
        chain,
        addresses.LendingPool,
        addresses.ProtocolDataProvider,
        addresses.url
      );
      
      // Fetch isolated pools if they exist
      let isolatedPools = [];
      if (addresses.IsolatedPools && addresses.IsolatedPools.length > 0) {
        const isolatedResults = await Promise.allSettled(
          addresses.IsolatedPools.map(isolated =>
            fetchPoolsFromLendingPool(
              chain,
              isolated.pool,
              isolated.provider,
              isolated.url,
              'isolated'
            )
          )
        );
        
        isolatedPools = isolatedResults
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value)
          .flat();
      }
      
      // Combine main and isolated pools
      return [...mainPools, ...isolatedPools];
    })
  );
  
  // Log any rejected chains for debugging
  pools.forEach((result, i) => {
    const chain = Object.keys(chains)[i];
    if (result.status === 'rejected') {
      console.error(`❌ ${chain} failed:`, result.reason?.message || result.reason);
    } else if (result.value) {
      console.log(`✅ ${chain}: ${result.value.length} pools`);
    }
  });
  
  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => p !== null && utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
};
