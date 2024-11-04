const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');
const { aaveStakedTokenDataProviderAbi } = require('./abi');

const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';

const protocolDataProviders = {
  ethereum: '0x41393e5e337606dc3821075Af65AeE84D7688CBD',
  optimism: '0x7F23D86Ee20D869112572136221e173428DD740B',
  arbitrum: '0x7F23D86Ee20D869112572136221e173428DD740B',
  polygon: '0x7F23D86Ee20D869112572136221e173428DD740B',
  fantom: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  avax: '0x374a2592f0265b3bb802d75809e61b1b5BbD85B7',
  metis: '0xC01372469A17b6716A38F00c277533917B6859c0',
  base: '0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad',
  xdai: '0x57038C3e3Fe0a170BB72DE2fD56E98e4d1a69717',
  bsc: '0x23dF2a19384231aFD114b036C14b6b03324D79BC',
  scroll: '0xe2108b60623C6Dcf7bBd535bD15a451fd0811f7b',
  era: '0x5F2A704cE47B373c908fE8A29514249469b52b99',
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
      mintedCoin: pool.symbol === 'GHO' ? 'GHO' : null,
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
    await axios.get('https://apps.aavechan.com/api/merit/base-aprs')
  ).data.actionsAPR['ethereum-stkgho'];

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
  const pools = await Promise.allSettled(
    Object.keys(protocolDataProviders).map(async (chain) => getApy(chain))
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
