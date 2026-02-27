const sdk = require('@defillama/sdk');
const utils = require('../utils');

const VAULTS = [
  {
    address: '0x03067bbD0d41E3Fe4A0bb6ca67c99e7352Da4CAE',
    underlying: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  },
  {
    address: '0x25d90ABd6c1E8DCCD40932D2fdD2Cd381bfc832D',
    underlying: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // USDT
  },
];

const CHAIN = 'base';

const convertToAssetsAbi =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const SHARE_UNIT = (10n ** 18n).toString();
const DAY = 24 * 3600;

async function apy() {
  const timestamp = Math.floor(Date.now() / 1000);

  const [{ height: blockNow }, { height: blockPrev }] = await Promise.all([
    utils.getData(`https://coins.llama.fi/block/${CHAIN}/${timestamp}`),
    utils.getData(`https://coins.llama.fi/block/${CHAIN}/${timestamp - DAY}`),
  ]);

  const addresses = VAULTS.map((v) => v.address);
  const calls = addresses.map((target) => ({ target }));
  const shareCalls = addresses.map((target) => ({
    target,
    params: [SHARE_UNIT],
  }));

  const [symbols, decimals, totalAssets, rateNow, ratePrev] = await Promise.all(
    [
      sdk.api.abi.multiCall({ abi: 'erc20:symbol', calls, chain: CHAIN }),
      sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls, chain: CHAIN }),
      sdk.api.abi.multiCall({
        abi: 'uint:totalAssets',
        calls,
        chain: CHAIN,
        block: blockNow,
      }),
      sdk.api.abi.multiCall({
        abi: convertToAssetsAbi,
        calls: shareCalls,
        chain: CHAIN,
        block: blockNow,
      }),
      sdk.api.abi.multiCall({
        abi: convertToAssetsAbi,
        calls: shareCalls,
        chain: CHAIN,
        block: blockPrev,
      }),
    ]
  );

  const underlyings = VAULTS.map((v) => v.underlying);
  const { pricesByAddress } = await utils.getPrices(underlyings, CHAIN);

  const pools = VAULTS.map((vault, i) => {
    const dec = Number(decimals.output[i].output);
    const symbol = symbols.output[i].output;
    const total = Number(totalAssets.output[i].output);
    const rNow = Number(rateNow.output[i].output);
    const rPrev = Number(ratePrev.output[i].output);
    const price = pricesByAddress[vault.underlying.toLowerCase()] || 0;

    const tvlUsd = (total / 10 ** dec) * price;

    let apyBase = 0;
    if (rPrev > 0 && rNow > 0) {
      apyBase = (rNow / rPrev) ** 365 * 100 - 100;
    }

    return {
      pool: `${vault.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'zircuit-finance',
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.underlying],
      url: 'https://finance.zircuit.com',
    };
  });

  return pools.filter(utils.keepFinite);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://finance.zircuit.com',
};
