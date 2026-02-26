const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const VAULTS = {
  base: [
    '0xe83EF4375d806c02387069f1b753b2ab76ab1dc5',
    '0x1A48Cec817Bcb5436EFE99BAb6dDe228Cc37e1Cc',
  ],
  ethereum: [
    '0x28966Ce36d0F25858dc5d10DfC2829F05C332C49',
    '0x6424c7548e214f89B64Ea5981c5A0c5Ec22b6e38',
  ],
};

const convertToAssetsAbi =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const SHARE_UNIT = (10n ** 18n).toString();
const DAY = 24 * 3600;

async function getChainPools(chain, vaults) {
  const timestamp = Math.floor(Date.now() / 1000);

  const [{ height: blockNow }, { height: blockPrev }] = await Promise.all([
    utils.getData(`https://coins.llama.fi/block/${chain}/${timestamp}`),
    utils.getData(`https://coins.llama.fi/block/${chain}/${timestamp - DAY}`),
  ]);

  const calls = vaults.map((target) => ({ target }));
  const shareCalls = vaults.map((target) => ({
    target,
    params: [SHARE_UNIT],
  }));

  const [assets, symbols, totalAssets, rateNow, ratePrev] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'function asset() view returns (address)',
      calls,
      chain,
    }),
    sdk.api.abi.multiCall({ abi: 'erc20:symbol', calls, chain }),
    sdk.api.abi.multiCall({
      abi: 'uint:totalAssets',
      calls,
      chain,
      block: blockNow,
    }),
    sdk.api.abi.multiCall({
      abi: convertToAssetsAbi,
      calls: shareCalls,
      chain,
      block: blockNow,
    }),
    sdk.api.abi.multiCall({
      abi: convertToAssetsAbi,
      calls: shareCalls,
      chain,
      block: blockPrev,
    }),
  ]);

  const underlyings = assets.output.map((o) => o.output);
  const priceKeys = underlyings
    .map((t) => `${chain}:${t}`)
    .join(',')
    .toLowerCase();
  const { data: priceData } = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  return vaults.map((vault, i) => {
    const underlying = underlyings[i];
    const key = `${chain}:${underlying}`.toLowerCase();
    const coin = priceData.coins[key] || {};
    const price = coin.price || 0;
    const dec = coin.decimals || 18;
    const symbol = symbols.output[i].output;
    const total = Number(totalAssets.output[i].output);
    const rNow = Number(rateNow.output[i].output);
    const rPrev = Number(ratePrev.output[i].output);

    const tvlUsd = (total / 10 ** dec) * price;

    let apyBase = 0;
    if (rPrev > 0 && rNow > 0) {
      apyBase = (rNow / rPrev) ** 365 * 100 - 100;
    }

    return {
      pool: `${vault}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'zircuit-finance',
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyBase,
      underlyingTokens: [underlying],
      url: 'https://finance.zircuit.com',
    };
  });
}

async function apy() {
  const pools = await Promise.all(
    Object.entries(VAULTS).map(([chain, vaults]) =>
      getChainPools(chain, vaults)
    )
  );
  return pools.flat().filter(utils.keepFinite);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://finance.zircuit.com',
};
