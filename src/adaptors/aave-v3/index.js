const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');
const { aaveStakedTokenDataProviderAbi } = require('./abi');

const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';

const protocolDataProviders = {
  ethereum: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
  optimism: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  arbitrum: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  polygon: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  fantom: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  avax: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  metis: '0x99411FC17Ad1B56f49719E3850B2CDcc0f9bBFd8',
  base: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
  xdai: '0x501B4c19dd9C2e06E94dA7b6D5Ed4ddA013EC741',
  bsc: '0x41585C50524fb8c3899B43D7D797d9486AAc94DB',
  scroll: '0xa99F4E69acF23C6838DE90dD1B5c02EA928A53ee',
};

const getApy = async (chain) => {
  const protocolDataProvider = protocolDataProviders[chain];
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

  return reserveTokens.map((pool, i) => {
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

    const chainUrlParam =
      chain === 'ethereum'
        ? 'mainnet'
        : chain === 'avax'
        ? 'avalanche'
        : chain === 'xdai'
        ? 'gnosis'
        : chain === 'bsc'
        ? 'bnb'
        : chain;

    const url = `https://app.aave.com/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_${chainUrlParam}_v3`;

    return {
      pool: `${aTokens[i].tokenAddress}-${
        chain === 'avax' ? 'avalanche' : chain
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
    };
  });
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
  ).data.currentAPR.actionsAPR.stkgho;

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
    symbol: 'GHO',
    tvlUsd: stkghoSupply * ghoPrice,
    apy: stkghoApy,
    url: 'https://app.aave.com/staking',
  };

  return pool;
};

const apy = async () => {
  const pools = await Promise.all(
    Object.keys(protocolDataProviders).map(async (chain) => getApy(chain))
  );

  const stkghoPool = await stkGho();

  return pools
    .flat()
    .concat([stkghoPool])
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
};
