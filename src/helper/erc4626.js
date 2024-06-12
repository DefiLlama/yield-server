const sdk = require('@defillama/sdk');
const utils = require('../adaptors/utils');

const DAY = 24 * 3600;

async function getERC4626Info(
  address,
  chain,
  timestamp = Math.floor(Date.now() / 1e3),
  {
    assetUnit = '100000000000000000',
    totalAssetsAbi = 'uint:totalAssets',
    convertToAssetsAbi = 'function convertToAssets(uint256 shares) external view returns (uint256)',
  } = {}
) {
  const [blockNow, blockYesterday] = await Promise.all(
    [timestamp, timestamp - DAY].map((time) =>
      utils
        .getData(`https://coins.llama.fi/block/${chain}/${time}`)
        .then((r) => r.height)
    )
  );
  const [tvl, priceNow, priceYesterday] = await Promise.all([
    sdk.api.abi.call({
      target: address,
      block: blockNow,
      abi: totalAssetsAbi,
    }),
    sdk.api.abi.call({
      target: address,
      block: blockNow,
      abi: convertToAssetsAbi,
      params: [assetUnit],
    }),
    sdk.api.abi.call({
      target: address,
      block: blockYesterday,
      abi: convertToAssetsAbi,
      params: [assetUnit],
    }),
  ]);
  const apy = (priceNow.output / priceYesterday.output) ** 365 * 100 - 100;
  return {
    pool: address,
    chain: utils.formatChain(chain),
    tvl: tvl.output,
    apyBase: apy,
  };
}

module.exports = {
  getERC4626Info,
};
