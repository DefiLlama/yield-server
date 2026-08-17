const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');

const Addresses = {
  lens: '0xeA62e3a2D5FE8D5b66dc8E1bd2405AD23C851f4e',
  ethena: {
    cdo: '0x908B3921aaE4fC17191D382BB61020f2Ee6C0e20',
    srUSDe: '0x3d7d6fdf07EE548B939A80edbc9B2256d0cdc003',
    jrUSDe: '0xC58D044404d8B14e953C115E67823784dEA53d8F',
    underlying: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', // USDe
  },
  neutrl: {
    cdo: '0x7b6c960cf185fb27ECb91c174FAe065978beDd10',
    srNUSD: '0x65a44528e8868166401eA08b549E19552af589dB',
    jrNUSD: '0xFC807058A352b61aEef6A38e2D0fC3990225E772',
    underlying: '0xE556ABa6fe6036275Ec1f87eda296BE72C811BCE', // NUSD
  },
  mhyper: {
    cdo: '0x39C7E67b25fB14eAec8717B20664C2E35327e6cf',
    srmHYPER: '0x627EA69929212916Ec57B1b26d2E1a19F6129B53',
    jrmHYPER: '0xEb205d26E9E605Ec82d1C0d652E00037C278714b',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  },
  mm1usd: {
    cdo: '0x613D1790d9BA381D27B4071C04380Db8ED120E5f',
    srmM1USD: '0xCcEd21d609CaC4A272d0c01a8FF4de9cEBc40d60',
    jrmM1USD: '0xf7eB8dfec75C42D2d2247FE76Ccaedc59f821688',
    underlying: '0xCc5C22C7A6BCC25e66726AeF011dDE74289ED203', // MM1USD
  },
  saturn: {
    cdo: '0xa617763cEB808f43eC9D532cbE8C65819afb846b',
    srUSDat: '0xFaa9a0e1Db9E22AE3A20B2B58a68DC24D053d066',
    jrUSDat: '0x011e55d2b28306458e37Ca7E997C879BB25A455D',
    underlying: '0x23238f20b894f29041f48D88eE91131C395Aaa71', // USDat
  },
  // [NEW] Figure/PRIME market
  figure: {
    cdo: '0xff408b4843CDD4a33CD49EB2aBe057fE8D71C234',
    srPRIME: '0x35bFF778d3fc53a561486BF28e761428499232Eb',
    jrPRIME: '0xF4C91F24E20EE8ed5eda905E501A1136334C2F27',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC (verified on-chain)
  },
  nestopal: {
    cdo: '0xaE212D8515BA65C719f23dBad6bF73B74d4e4edE',
    srNOPAL: '0x8a646Edc4633ADBA5Ec87DedaF3Af958e268FE96',
    jrNOPAL: '0x1b2b8cFEF0b7B1Fad216b55fefeEb0c3349Da141',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    // nOPAL uses zero-projection mode: the AprPairFeed returns (0,0) for
    // accounting, but the provider exposes the real projected APR via
    // getAprPairProjected(). CDOLens only reads the feed, so we read the
    // provider directly when CDOLens returns zeros.
    provider: '0x1FE39BE01BA0AF9f8D61A8a581eb7Df29c0BCe97',
  },
};

const getTotalSupply = async (tokenAddress, chain = 'ethereum') => {
  try {
    const { output } = await sdk.api.abi.call({
      target: tokenAddress,
      abi: 'erc20:totalSupply',
      chain,
    });
    return output / (10 ** 18); 
  } catch (error) {
    console.error(`Error fetching total supply for ${tokenAddress}:`, error);
    throw error;
  }
};

const getTokenPrice = async (tokenAddress) => {
  try {
    const priceKey = `ethereum:${tokenAddress}`;
    const data = await utils.getPriceApiData(`/prices/current/${priceKey}`);
    return data.coins[priceKey]?.price ?? null;
  } catch (error) {
    console.warn(`Price not available for ${tokenAddress}, will use totalAssets fallback`);
    return null;
  }
};

const getTotalAssets = async (tokenAddress, chain = 'ethereum') => {
  const { output } = await sdk.api.abi.call({
    target: tokenAddress,
    abi: 'function totalAssets() view returns (uint256)',
    chain,
  });
  return output;
};

const getAprs = async (cdoAddress, chain = 'ethereum', trancheConfig = {}) => {
  try {
    const { output } = await sdk.api.abi.call({
      target: Addresses.lens,
      abi: 'function getAPRs(address cdo) external view returns (int64 base, int64 target, int64 jrt, int64 srt)',
      params: [cdoAddress],
      chain,
      block: 'latest',
    });
    let [base, target, jrt, srt] = output;

    // If CDOLens returns all zeros and a provider is configured, read the
    // projected APR directly from the provider's getAprPairProjected().
    // This is needed for markets using zero-projection mode (e.g. nOPAL)
    // where the feed intentionally returns (0,0) for accounting while the
    // real base APR is exposed via the provider.
    if (Number(jrt) === 0 && Number(srt) === 0 && trancheConfig.provider) {
      const [{ output: projected }, { output: breakdown }, { output: reserveBpsRaw }] = await Promise.all([
        sdk.api.abi.call({
          target: trancheConfig.provider,
          abi: 'function getAprPairProjected() external view returns (int64 aprTarget, int64 aprBase, uint64 updatedAt)',
          chain,
        }),
        sdk.api.abi.call({
          target: Addresses.lens,
          abi: 'function getAPRsBreakdown(address cdo) external view returns (int64 base, int64 target, int64 jrt, int64 srt, uint256 tvlRatioSrt, uint256 riskPremium)',
          params: [cdoAddress],
          chain,
        }),
        sdk.api.abi.call({
          target: trancheConfig.cdo,
          abi: 'function accounting() view returns (address)',
          chain,
        }).then(({ output: acct }) =>
          sdk.api.abi.call({
            target: acct,
            abi: 'function reserveBps() view returns (uint256)',
            chain,
          })
        ),
      ]);

      const aprBase = Number(projected.aprBase) / 1e10;
      const aprTarget = Number(projected.aprTarget) / 1e10;
      const tvlRatioSrt = Number(breakdown.tvlRatioSrt) / 1e18;
      const tvlRatioJrt = 1 - tvlRatioSrt;
      const risk = Number(breakdown.riskPremium) / 1e18;
      const reserveBps = Number(reserveBpsRaw) / 1e18;

      // Replicate CDOLens formula: aprSrt = max(aprTarget, aprBase * (1 - risk))
      const aprSrt = Math.max(aprTarget, aprBase * (1 - risk));
      // Net base after performance fee
      const netBase = aprBase > 0 && reserveBps > 0 ? aprBase * (1 - reserveBps) : aprBase;
      // JRT gets the residual: aprJrt = netBase + (netBase - aprSrt) * ratioSrt / ratioJrt
      const aprJrt = tvlRatioJrt > 0
        ? netBase + (netBase - aprSrt) * tvlRatioSrt / tvlRatioJrt
        : netBase;

      return { jrt: aprJrt, srt: aprSrt };
    }

    return {
      jrt: Number(jrt) / 1e10,
      srt: Number(srt) / 1e10,
    };
  } catch (error) {
    console.error(`Error fetching APRs for ${cdoAddress}:`, error);
    throw error;
  }
};

async function loadPool(tranche, symbol, overrides = {}) {
  const cdo = Addresses[tranche].cdo;
  const vault = Addresses[tranche][symbol];
  const underlying = Addresses[tranche].underlying;

  const [totalSupply, price, aprs, totalAssetsRaw, underlyingPrice] = await Promise.all([
    getTotalSupply(vault, 'ethereum'),
    getTokenPrice(vault),
    getAprs(cdo, 'ethereum', Addresses[tranche]),
    getTotalAssets(vault, 'ethereum'),
    getTokenPrice(underlying),
  ]);

  // Use vault token price if available, otherwise fall back to
  // totalAssets * underlying price (accurate for ERC4626 stablecoin vaults)
  const decimals = ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xCc5C22C7A6BCC25e66726AeF011dDE74289ED203'].includes(underlying) ? 6 : 18;
  const tvlUsd = price
    ? totalSupply * price
    : (totalAssetsRaw / (10 ** decimals)) * (underlyingPrice ?? 1);

  const apy = utils.aprToApy(symbol.startsWith('sr') ? aprs.srt : aprs.jrt);
  return {
    pool: vault.toLowerCase(),
    symbol: symbol,
    chain: 'ethereum',
    project: 'strata-markets',
    tvlUsd,
    apyBase: apy,
    underlyingTokens: [underlying],
    ...overrides,
  };
}

const apy = async () => {
  try {
    return await Promise.all([
      loadPool('ethena', 'srUSDe'),
      loadPool('ethena', 'jrUSDe'),
      loadPool('neutrl', 'srNUSD'),
      loadPool('neutrl', 'jrNUSD'),
      loadPool('mhyper', 'srmHYPER'),
      loadPool('mhyper', 'jrmHYPER'),
      loadPool('mm1usd', 'srmM1USD'),
      loadPool('mm1usd', 'jrmM1USD'),
      loadPool('saturn', 'srUSDat', { poolMeta: 'fixed-rate' }),// [FIX] constant APY by design
      loadPool('saturn', 'jrUSDat'),
      loadPool('figure', 'srPRIME'),
      loadPool('figure', 'jrPRIME'),
      loadPool('nestopal', 'srNOPAL'),
      loadPool('nestopal', 'jrNOPAL'),
    ]);
  } catch (error) {
    console.error('Error fetching APYs:', error);
    throw error;
  }
};

module.exports = {
  protocolId: '6873',
  apy,
  url: 'https://strata.markets/',
};
