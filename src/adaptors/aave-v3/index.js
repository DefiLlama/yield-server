const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');
const { aaveStakedTokenDataProviderAbi } = require('./abi');

const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';

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
  etherfi: '0xECdA3F25B73261d1FdFa1E158967660AA29f00cC', // on ethereum
  linea: '0x9eEBf28397D8bECC999472fC8838CBbeF54aebf6',
  sonic: '0x306c124fFba5f2Bc0BcAf40D249cf19D492440b9',
  celo: '0x33b7d355613110b4E842f5f7057Ccd36fb4cee28',
  plasma: '0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F',
};

const getApy = async (market) => {
  const chain = ['lido', 'etherfi'].includes(market) ? 'ethereum' : market;

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

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .concat(`${chain}:${GHO}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const ghoSupply =
    (
      await sdk.api.abi.call({
        target: GHO,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = prices[`${chain}:${pool.tokenAddress}`]?.price;

      const supply = totalSupply[i];
      let totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      let tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

      if (pool.symbol === 'GHO') {
        tvlUsd = 0;
        totalSupplyUsd = tvlUsd;
        totalBorrowUsd = ghoSupply * prices[`${chain}:${GHO}`]?.price;
      } else {
        totalBorrowUsd = totalSupplyUsd - tvlUsd;
      }

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
        debtCeilingUsd: pool.symbol === 'GHO' ? 1e8 : null,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        url,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
        mintedCoin: pool.symbol === 'GHO' ? 'GHO' : null,
        poolMeta: ['lido', 'etherfi'].includes(market)
          ? `${market}-market`
          : null,
      };
    })
    .filter((i) => Boolean(i));
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

  const ghoPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:${GHO}`)
  ).data.coins[`ethereum:${GHO}`].price;

  const pool = {
    pool: `${STKGHO}-ethereum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'aave-v3',
    symbol: 'sGHO',
    tvlUsd: stkghoSupply * ghoPrice,
    apy: stkghoApy,
    url: 'https://app.aave.com/staking',
  };

  return pool;
};

const apy = async () => {
  const pools = await Promise.allSettled(
    Object.keys(protocolDataProviders).map(async (market) => getApy(market))
  );

  const stkghoPool = await stkGho();

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .concat([stkghoPool])
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
};
