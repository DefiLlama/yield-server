const sdk = require('@defillama/sdk');
const utils = require('../utils');

const VAULTS = [
  {
    address: '0x469201fA49DB171C0F95371533C2D3Ad5aE60400',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    symbol: 'USDC',
  },
];

const CHAIN = 'ethereum';

const convertToAssetsAbi =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const SHARE_UNIT = (10n ** 6n).toString();
const DAY = 24 * 3600;

async function apy() {
  const timestamp = Math.floor(Date.now() / 1000);

  const [{ height: blockNow }, { height: blockPrev }] = await Promise.all([
    utils.getPriceApiData(`/block/${CHAIN}/${timestamp}`),
    utils.getPriceApiData(`/block/${CHAIN}/${timestamp - DAY}`),
  ]);

  const addresses = VAULTS.map((v) => v.address);
  const calls = addresses.map((target) => ({ target }));
  const shareCalls = addresses.map((target) => ({
    target,
    params: [SHARE_UNIT],
  }));

  const [decimals, totalAssets, rateNow, ratePrev] = await Promise.all([
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
  ]);

  const underlyings = VAULTS.map((v) => v.underlying);
  const { pricesByAddress } = await utils.getPrices(underlyings, CHAIN);

  const pools = VAULTS.map((vault, i) => {
    const dec = Number(decimals.output[i].output);
    const total = Number(totalAssets.output[i].output);
    const rNow = Number(rateNow.output[i].output);
    const rPrev = Number(ratePrev.output[i].output);
    const price = pricesByAddress[vault.underlying.toLowerCase()] || 0;

    const tvlUsd = (total / 10 ** dec) * price;

    let apyBase = 0;
    if (rPrev > 0 && rNow > 0) {
      apyBase = ((rNow / rPrev) ** 365 - 1) * 100;
    }

    return {
      pool: `${vault.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'aihedge-finance',
      symbol: vault.symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.underlying],
      url: `https://dapp.aihedge.finance/#/yield/1/${vault.address}`,
    };
  });

  return pools.filter(utils.keepFinite);
}

module.exports = {
  timetravel: true,
  apy,
  url: 'https://dapp.aihedge.finance',
};
