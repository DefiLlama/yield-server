const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const { merklGet } = require('../merkl/merkl-client');
const poolAbi = require('./poolAbi');
const { aaveStakedTokenDataProviderAbi } = require('./abi');

const {
  AptosProvider,
  UiPoolDataProviderClient,
  DEFAULT_MAINNET_CONFIG,
} = require('@aave/aave-v3-aptos-ts-sdk');

const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';
const SGHO = '0xE1753F2e00940cC31213dd92013cF019DFE4ca1d';
const UMBRELLA_STAKE_TOKENS = [
  '0x6bf183243FdD1e306ad2C4450BC7dcf6f0bf8Aa6',
  '0xA484Ab92fe32B143AEE7019fC1502b1dAA522D31',
  '0xaAFD07D53A7365D3e9fb6F3a3B09EC19676B73Ce',
  '0x4f827A63755855cDf3e8f3bcD20265C833f15033',
];
const CELO_AAVE_MERKL_APR_CORRECTION_POOLS = new Set([
  '0xdee98402a302e4d707fb9bf2bac66faeec31e8df-celo',
  '0xf385280f36e009c157697d25e0b802efabfd789c-celo',
]);

const umbrellaStakeDataProviderAbi =
  'function getStakeData() view returns (tuple(address tokenAddress,string,string,uint256 price,uint256 totalAssets,uint256,address underlyingTokenAddress,string underlyingTokenName,string underlyingTokenSymbol,uint8 underlyingTokenDecimals,uint256,uint256,bool underlyingIsStataToken,tuple(address asset,string assetName,string assetSymbol,address aToken,string aTokenName,string aTokenSymbol) stataTokenData,tuple(address rewardAddress,string,string,uint256,uint8,uint256,uint256,uint256,uint256,uint256 apy)[] rewards)[])';

const protocolDataProviders = {
  ethereum: '0x497a1994c46d4f6C864904A9f1fac6328Cb7C8a6',
  optimism: '0x14496b405D62c24F91f04Cda1c69Dc526D56fDE5',
  arbitrum: '0x14496b405D62c24F91f04Cda1c69Dc526D56fDE5',
  polygon: '0x14496b405D62c24F91f04Cda1c69Dc526D56fDE5',
  avax: '0x14496b405D62c24F91f04Cda1c69Dc526D56fDE5',
  metis: '0xbb4a3B6781be3650B252552dFF6332EfB1162152',
  base: '0xC4Fcf9893072d61Cc2899C0054877Cb752587981',
  xdai: '0xA2d323DBc43F445aD2d8974F17Be5dab32aAD474',
  bsc: '0x1e26247502e90b4fab9D0d17e4775e90085D2A35',
  scroll: '0xDC3c96ef82F861B4a3f10C81d4340c75460209ca',
  era: '0xf79473ea6ef2C9537027bAe2f6E07d67dD9999E0',
  lido: '0x66FeAe868EBEd74A34A7043e88742AAE00D2bC53', // on ethereum
  linea: '0x9eEBf28397D8bECC999472fC8838CBbeF54aebf6',
  sonic: '0x306c124fFba5f2Bc0BcAf40D249cf19D492440b9',
  celo: '0x33b7d355613110b4E842f5f7057Ccd36fb4cee28',
  plasma: '0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F',
  horizon: '0x53519c32f73fE1797d10210c4950fFeBa3b21504', // RWA market on ethereum
  mantle: '0x487c5c669D9eee6057C44973207101276cf73b68',
  megaeth: '0x9588b453A4EE24a420830CB3302195cA7aA3b403',
  xlayer: '0x6C505C31714f14e8af2A03633EB2Cdfb4959138F',
  monad: '0xB65A68B98274ef7D9a60E0C0747dD1BEc3D32fad',
};

const ethereumMarkets = {
  lido: 'Prime Instance',
  horizon: 'Aave Horizon Market',
};

const getApy = async (market) => {
  const chain = ethereumMarkets[market] ? 'ethereum' : market;

  const protocolDataProvider = protocolDataProviders[market];
  const reserveTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReserveCaps = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = [
    ...new Set(
      reserveTokens
        .map((t) => `${chain}:${t.tokenAddress}`)
        .concat(`ethereum:${GHO}`)
    ),
  ].join(',');
  const prices = (await utils.getPriceApiData(`/prices/current/${priceKeys}`)).coins;
  const ghoPrice = prices[`ethereum:${GHO}`]?.price;

  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const isGho = pool.symbol === 'GHO';
      const isEthereumGhoFacilitator = isGho && market === 'ethereum';
      const borrowable = poolsReservesConfigurationData[i].borrowingEnabled;
      const price =
        prices[`${chain}:${pool.tokenAddress}`]?.price ??
        (isGho ? ghoPrice : undefined);
      const decimals = Number(underlyingDecimals[i]);

      const supply = isGho ? p.totalAToken : totalSupply[i];
      const totalSupplyUsd = (supply / 10 ** decimals) * price;

      const currentSupply = underlyingBalances[i];
      const reserveLiquidityUsd = (currentSupply / 10 ** decimals) * price;
      const totalBorrowUsd =
        ((Number(p.totalStableDebt) + Number(p.totalVariableDebt)) /
          10 ** decimals) *
        price;
      const borrowCapUsd = Number(poolsReserveCaps[i].borrowCap) * price;
      const hasBorrowCap = Number(poolsReserveCaps[i].borrowCap) > 0;
      // Core Ethereum GHO is minted by the Aave facilitator, so available
      // liquidity is constrained by remaining borrow cap, not reserve cash.
      let availableBorrowUsd = null;
      if (isEthereumGhoFacilitator) {
        availableBorrowUsd = Math.max(borrowCapUsd - totalBorrowUsd, 0);
      } else {
        availableBorrowUsd = hasBorrowCap
          ? Math.max(
              Math.min(reserveLiquidityUsd, borrowCapUsd - totalBorrowUsd),
              0
            )
          : reserveLiquidityUsd;
      }
      const tvlUsd = isEthereumGhoFacilitator
        ? availableBorrowUsd
        : reserveLiquidityUsd;

      const marketUrlParam =
        market === 'ethereum'
          ? 'mainnet'
          : market === 'avax'
          ? 'avalanche'
          : market === 'xdai'
          ? 'gnosis'
          : market === 'bsc'
          ? 'bnb'
          : market;

      const url = `https://app.aave.com/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_${marketUrlParam}_v3`;

      return {
        pool: `${aTokens[i].tokenAddress}-${
          market === 'avax' ? 'avalanche' : market
        }`.toLowerCase(),
        chain,
        project: 'aave-v3',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        borrowToken: pool.tokenAddress,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        url,
        borrowable,
        // TODO: Remove mintedCoin/debtCeiling once v2 is live
        ...(isEthereumGhoFacilitator && {
          debtCeilingUsd: borrowCapUsd,
          mintedCoin: 'GHO',
        }),
        poolMeta: ethereumMarkets[market] ?? null,
        routeGroupKey: protocolDataProvider.toLowerCase(),
      };
    })
    .filter((i) => Boolean(i));
};

const RAY = 10n ** 27n;

const getApyAptos = async () => {
  const provider = AptosProvider.fromConfig(DEFAULT_MAINNET_CONFIG);
  const client = new UiPoolDataProviderClient(provider);
  const { reservesData, baseCurrencyData } = await client.getReservesData();

  const marketRefDecimals = baseCurrencyData.marketReferenceCurrencyDecimals;
  const marketRefPriceUsd =
    Number(baseCurrencyData.marketReferenceCurrencyPriceInUsd) /
    10 ** baseCurrencyData.networkBaseTokenPriceDecimals;

  return reservesData
    .filter((r) => !r.isFrozen && r.isActive && !r.isPaused)
    .map((r) => {
      const priceUsd =
        (Number(r.priceInMarketReferenceCurrency) / marketRefDecimals) *
        marketRefPriceUsd;
      if (!priceUsd) return null;

      const availableLiquidity =
        Number(r.availableLiquidity) / 10 ** r.decimals;
      const totalVariableDebt =
        Number((r.totalScaledVariableDebt * r.variableBorrowIndex) / RAY) /
        10 ** r.decimals;

      const totalSupplyUsd = (availableLiquidity + totalVariableDebt) * priceUsd;
      const totalBorrowUsd = totalVariableDebt * priceUsd;
      const tvlUsd = totalSupplyUsd - totalBorrowUsd;
      const borrowCapUsd = Number(r.borrowCap) * priceUsd;
      const hasBorrowCap = Number(r.borrowCap) > 0;
      const availableBorrowUsd = hasBorrowCap
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;

      return {
        pool: `${r.aTokenAddress}-aptos`.toLowerCase(),
        chain: 'Aptos',
        project: 'aave-v3',
        symbol: r.symbol,
        tvlUsd,
        apyBase: (Number(r.liquidityRate) / 10 ** 27) * 100,
        underlyingTokens: [r.underlyingAsset],
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd,
        apyBaseBorrow: Number(r.variableBorrowRate) / 1e25,
        borrowToken: r.underlyingAsset,
        ltv: Number(r.baseLTVasCollateral) / 10000,
        url: `https://aptos.aave.com/reserve-overview/?underlyingAsset=${r.underlyingAsset}&marketName=aptos`,
        borrowable: r.borrowingEnabled,
      };
    })
    .filter(Boolean);
};

const sGho = async () => {
  const [sghoTotalAssets, sghoTargetRate, ghoPrice] = await Promise.all([
    sdk.api.abi.call({
      target: SGHO,
      abi: 'function totalAssets() view returns (uint256)',
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: SGHO,
      abi: 'function targetRate() view returns (uint256)',
      chain: 'ethereum',
    }),
    axios.get(utils.getPriceApiUrl(`/prices/current/ethereum:${GHO}`)),
  ]);

  return {
    pool: `${SGHO}-ethereum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'aave-v3',
    symbol: 'sGHO',
    tvlUsd:
      (sghoTotalAssets.output / 1e18) *
      ghoPrice.data.coins[`ethereum:${GHO}`].price,
    apyBase: Number(sghoTargetRate.output) / 100,
    url: 'https://app.aave.com/sgho',
    underlyingTokens: [GHO],
  };
};

const stkGho = async () => {
  const convertStakedTokenApy = (rawApy) => {
    const rawApyStringified = rawApy.toString();
    const lastTwoDigits = rawApyStringified.slice(-2);
    const remainingDigits = rawApyStringified.slice(0, -2);
    const result = `${remainingDigits}.${lastTwoDigits}`;
    return Number(result);
  };

  const STKGHO = '0x1a88Df1cFe15Af22B3c4c783D4e6F7F9e0C1885d';
  const stkGhoTokenOracle = '0x3f12643d3f6f874d39c2a4c9f2cd6f2dbac877fc';
  const aaveStakedTokenDataProviderAddress =
    '0xb12e82DF057BF16ecFa89D7D089dc7E5C1Dc057B';

  const stkghoData = (
    await sdk.api.abi.call({
      target: aaveStakedTokenDataProviderAddress,
      abi: aaveStakedTokenDataProviderAbi.find(
        (m) => m.name === 'getStakedAssetData'
      ),
      params: [STKGHO, stkGhoTokenOracle],
      chain: 'ethereum',
    })
  ).output;

  const stkghoNativeApyRaw = stkghoData[6]; // 6th index of the tuple is the APY
  const stkghoNativeApy = convertStakedTokenApy(stkghoNativeApyRaw);

  const stkghoMeritApy = (
    await axios.get('https://apps.aavechan.com/api/merit/aprs')
  ).data.currentAPR.actionsAPR['ethereum-stkgho'];

  const stkghoApy = stkghoNativeApy + stkghoMeritApy;

  const stkghoSupply =
    (
      await sdk.api.abi.call({
        target: STKGHO,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const ghoPrice = (await utils.getPriceApiData(`/prices/current/ethereum:${GHO}`)).coins[`ethereum:${GHO}`].price;

  const pool = {
    pool: `${STKGHO}-ethereum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'aave-v3',
    symbol: 'sGHO',
    tvlUsd: stkghoSupply * ghoPrice,
    apyReward: stkghoApy,
    rewardTokens: [GHO],
    url: 'https://app.aave.com/sgho/',
    underlyingTokens: [GHO],
    poolMeta: 'Legacy',
  };

  return pool;
};

const umbrella = async (aavePools) => {
  const umbrellaStakeDataProvider = '0x6321ba6b41fbddb6b678cd80db067f20a8770879';

  const stakeData = (
    await sdk.api.abi.call({
      target: umbrellaStakeDataProvider,
      abi: umbrellaStakeDataProviderAbi,
      chain: 'ethereum',
    })
  ).output;

  return UMBRELLA_STAKE_TOKENS.map((stakeToken) => {
    const stakePool = stakeData.find(
      (pool) => pool.tokenAddress.toLowerCase() === stakeToken.toLowerCase()
    );
    const aaveUnderlyingToken = stakePool.underlyingIsStataToken
      ? stakePool.stataTokenData.asset
      : stakePool.underlyingTokenAddress;
    const aavePool =
      stakePool.underlyingIsStataToken &&
      aavePools.find(
        (pool) =>
          pool.chain === 'ethereum' &&
          !pool.poolMeta &&
          pool.underlyingTokens[0].toLowerCase() === aaveUnderlyingToken.toLowerCase()
      );

    return {
      pool: `${stakeToken}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'aave-v3',
      symbol: stakePool.underlyingIsStataToken
        ? stakePool.stataTokenData.assetSymbol
        : stakePool.underlyingTokenSymbol,
      tvlUsd:
        (Number(stakePool.totalAssets) /
          10 ** Number(stakePool.underlyingTokenDecimals)) *
        (Number(stakePool.price) / 1e8),
      ...(aavePool ? { apyBase: aavePool.apyBase } : {}),
      apyReward: stakePool.rewards.reduce(
        (acc, reward) => acc + Number(reward.apy) / 100,
        0
      ),
      rewardTokens: [
        ...new Set(stakePool.rewards.map((reward) => reward.rewardAddress)),
      ],
      url: 'https://app.aave.com/staking/',
      underlyingTokens: [stakePool.underlyingTokenAddress],
      poolMeta: 'Umbrella',
    };
  });
};

const correctCeloAaveMerklRewards = async (pools) => {
  const shouldCorrect = (pool) =>
    CELO_AAVE_MERKL_APR_CORRECTION_POOLS.has(pool.pool) &&
    pool.apyReward > 100 &&
    Number(pool.totalSupplyUsd) > 0;

  if (!pools.some(shouldCorrect)) return pools;
  try {
    const dailyRewardsByPool = Object.fromEntries(
      (
        await merklGet('/v4/opportunities', {
          params: {
            mainProtocolId: 'aave',
            chainId: 42220,
            status: 'LIVE',
            items: 100,
            page: 0,
          },
        })
      )
        .flatMap((merklPool) =>
          (merklPool.tokens || []).map((token) => [
            `${token.address?.toLowerCase()}-celo`,
            Number(merklPool.dailyRewards),
          ])
        )
        .filter(([pool]) => CELO_AAVE_MERKL_APR_CORRECTION_POOLS.has(pool))
    );

    return pools.map((pool) => {
      const dailyRewards = dailyRewardsByPool[pool.pool];
      if (!dailyRewards || !shouldCorrect(pool)) {
        return pool;
      }

      return {
        ...pool,
        apyReward: (dailyRewards * 365 * 100) / pool.totalSupplyUsd,
      };
    });
  } catch (err) {
    console.log(`failed to correct Celo Aave Merkl rewards: ${err}`);
    return pools;
  }
};

const apy = async () => {
  const pools = await Promise.allSettled(
    Object.keys(protocolDataProviders)
      .map(async (market) => getApy(market))
      .concat([getApyAptos()])
  );

  const aavePools = pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat();

  const [sghoPool, stkghoPool, umbrellaPools] = await Promise.all([
    sGho(),
    stkGho(),
    umbrella(aavePools),
  ]);

  const result = aavePools
    .concat([sghoPool, stkghoPool, ...umbrellaPools])
    .filter((p) => utils.keepFinite(p));

  const withMerklRewards = await addMerklRewardApy(
    result,
    'aave',
    (p) => p.pool.split('-')[0]
  );

  return correctCeloAaveMerklRewards(withMerklRewards);
};

module.exports = {
  protocolId: '1599',
  apy,
};
