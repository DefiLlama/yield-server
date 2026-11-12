const sdk = require('@defillama/sdk');
const utils = require('../utils');

const DAY = 24 * 3600;

const config = {
  monad: [
    {
      vault: '0xC2ddc1004CA0d6cC4bFd1dCD03Dcf855bED8E670', // blbAUSD
      url: 'https://app.blueberry.garden/earn/blbausd',
    },
    {
      vault: '0x215394B5677Cb7a18B6fA8cc2cD155C024ee6b2E', // blbUSDC
      url: 'https://app.blueberry.garden/earn/blbusdc',
    },
  ],
};

const getPoolsForChain = async (chain, vaults) => {
  const targets = vaults.map((v) => v.vault);
  const now = Math.floor(Date.now() / 1e3);
  const [block1d, block7d] = await utils.getBlocksByTime(
    [now - DAY, now - 7 * DAY],
    chain
  );

  const multiCall = (abi, block, params) =>
    sdk.api.abi
      .multiCall({
        calls: targets.map((target) => ({ target, params })),
        abi,
        chain,
        block,
        permitFailure: true,
      })
      .then((r) => r.output.map((o) => o.output));

  const [assets, symbols, decimals, totalAssets] = await Promise.all([
    multiCall('address:asset'),
    multiCall('string:symbol'),
    multiCall('uint8:decimals'),
    multiCall('uint256:totalAssets'),
  ]);

  const convertToAssetsAbi =
    'function convertToAssets(uint256 shares) view returns (uint256)';
  const unit = (i) => String(10 ** Number(decimals[i]));
  const ppsAt = (block) =>
    Promise.all(
      targets.map((target, i) =>
        sdk.api.abi
          .call({
            target,
            abi: convertToAssetsAbi,
            params: [unit(i)],
            chain,
            block,
          })
          .then((r) => Number(r.output))
          .catch(() => null)
      )
    );
  const [ppsNow, pps1d, pps7d] = await Promise.all([
    ppsAt(),
    ppsAt(block1d),
    ppsAt(block7d),
  ]);

  const { pricesByAddress } = await utils.getPrices(assets, chain);

  const assetDecimals = await sdk.api.abi
    .multiCall({
      calls: assets.map((target) => ({ target })),
      abi: 'erc20:decimals',
      chain,
    })
    .then((r) => r.output.map((o) => Number(o.output)));

  const annualize = (now, prev, days) =>
    now && prev ? ((now / prev) ** (365 / days) - 1) * 100 : null;

  return vaults
    .map(({ vault, url }, i) => {
      const asset = assets[i];
      const price = pricesByAddress[asset?.toLowerCase()];
      if (!asset || !price) return null;

      const tvlUsd =
        (Number(totalAssets[i]) / 10 ** assetDecimals[i]) * price;
      const apyBase = annualize(ppsNow[i], pps1d[i], 1);
      const apyBase7d = annualize(ppsNow[i], pps7d[i], 7);

      return {
        pool: `${vault}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'blueberry',
        symbol: utils.formatSymbol(symbols[i].replace(/^blb/, '')),
        tvlUsd,
        apyBase,
        ...(apyBase7d !== null && { apyBase7d }),
        underlyingTokens: [asset],
        token: vault,
        pricePerShare:
          ppsNow[i] / 10 ** assetDecimals[i],
        poolMeta: symbols[i],
        url,
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
};

const apy = async () => {
  const pools = await Promise.all(
    Object.entries(config).map(([chain, vaults]) =>
      getPoolsForChain(chain, vaults)
    )
  );
  return pools.flat();
};

module.exports = {
  protocolId: '4080',
  timetravel: false,
  apy,
  url: 'https://app.blueberry.garden',
};