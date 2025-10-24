const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');
const { aaveStakedTokenDataProviderAbi } = require('./abi');

const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';

const protocolDataProviders = {
  base: '0x7dcb86dC49543E14A98F80597696fe5f444f58bC',
  arbitrum: '0x0F65a7fBCb69074cF8BE8De1E01Ef573da34bD59',
  polygon: '0x6A9b632010226F9bBbf2B6cb8B6990bE3F90cb0e',
  katana: '0x4DC446e349bDA9516033E11D63f1851d6B5Fd492',
  plasma: '0x9C48A6D3e859ab124A8873D73b2678354D0B4c0A',
  hemi: '0x0F65a7fBCb69074cF8BE8De1E01Ef573da34bD59',
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

      const url = `https://app.ploutos.money/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_${marketUrlParam}_v3`;

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
    url: 'https://app.aave.com/staking', // TODO for USDC merit link https://app.ploutos.money/reserve-overview/?underlyingAsset=0xad11a8beb98bbf61dbb1aa0f6d6f2ecd87b35afa&marketName=proto_hemi_v3
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
