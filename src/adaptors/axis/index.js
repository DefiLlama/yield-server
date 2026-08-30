const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'axis';
const CHAIN = 'ethereum';
const URL = 'https://app.axis.to';

const SUSDX = '0xEB892628D1E58BC475A6dCB7F5dBC4F591632AA4';
const USDX = '0xa1fA7777974312f7d801A8880714a218F76233f8';

const DAY = 24 * 60 * 60;
const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) view returns (uint256 assets)';

const apy = async (timestamp = Math.floor(Date.now() / 1e3)) => {
  const [blockYesterday] = await utils.getBlocksByTime(
    [timestamp - DAY],
    CHAIN
  );

  const [asset, shareDecimals, assetDecimals, totalAssets, assetsNow, prices] =
    await Promise.all([
      sdk.api.abi.call({ target: SUSDX, abi: 'address:asset', chain: CHAIN }),
      sdk.api.abi.call({ target: SUSDX, abi: 'uint8:decimals', chain: CHAIN }),
      sdk.api.abi.call({ target: USDX, abi: 'uint8:decimals', chain: CHAIN }),
      sdk.api.abi.call({ target: SUSDX, abi: 'uint256:totalAssets', chain: CHAIN }),
      sdk.api.abi.call({
        target: SUSDX,
        abi: CONVERT_TO_ASSETS_ABI,
        params: ['1000000000000000000'],
        chain: CHAIN,
      }),
      utils.getPrices([USDX], CHAIN),
    ]);

  if (asset.output.toLowerCase() !== USDX.toLowerCase()) {
    throw new Error(`sUSDx asset is ${asset.output}, expected ${USDX}`);
  }

  const shareUnit = (10n ** BigInt(shareDecimals.output)).toString();
  const assetsYesterday = await sdk.api.abi.call({
    target: SUSDX,
    abi: CONVERT_TO_ASSETS_ABI,
    params: [shareUnit],
    chain: CHAIN,
    block: blockYesterday,
  });

  // Re-read the current exchange rate with the actual on-chain share unit when
  // the vault does not use 18 share decimals.
  const currentAssets =
    shareUnit === '1000000000000000000'
      ? assetsNow
      : await sdk.api.abi.call({
          target: SUSDX,
          abi: CONVERT_TO_ASSETS_ABI,
          params: [shareUnit],
          chain: CHAIN,
        });

  const currentRate = Number(currentAssets.output);
  const priorRate = Number(assetsYesterday.output);
  const apyBase = ((currentRate / priorRate) ** 365 - 1) * 100;
  const assetUnit = 10 ** Number(assetDecimals.output);
  const pricePerShare = currentRate / assetUnit;
  const usdxPrice = prices.pricesByAddress[USDX.toLowerCase()];

  if (!Number.isFinite(usdxPrice) || usdxPrice <= 0) {
    throw new Error(`Invalid USDx price: ${usdxPrice}`);
  }

  const tvlUsd = (Number(totalAssets.output) / assetUnit) * usdxPrice;

  if (
    !(currentRate > 0) ||
    !(priorRate > 0) ||
    !Number.isFinite(apyBase) ||
    !Number.isFinite(pricePerShare) ||
    !Number.isFinite(tvlUsd) ||
    tvlUsd < 0
  ) {
    throw new Error('Invalid sUSDx ERC-4626 state');
  }

  return [
    {
      pool: `${SUSDX}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'sUSDx',
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: [USDX],
      token: SUSDX,
      isIntrinsicSource: true,
      url: URL,
    },
  ];
};

module.exports = {
  protocolId: '8466',
  timetravel: false,
  apy,
  url: URL,
};
