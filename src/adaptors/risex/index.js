const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'rise';
// XLP: RISEx's market-making vault (Yearn v3). Depositors earn trading fees
// and the PnL of the vault's market making, realised into pricePerShare.
const XLP_VAULT = '0xBCf7A882B6A95827B4996055a5018FdC3B95D40c';
const DAY = 86400;

const call = (abi, block) =>
  sdk.api.abi
    .call({ target: XLP_VAULT, abi, chain: CHAIN, block })
    .then((r) => r.output);

// pricePerShare growth over `days`, compounded to a yearly rate in %
const ppsApy = (ppsNow, ppsPrior, days) =>
  ((ppsNow / ppsPrior) ** (365 / days) - 1) * 100;

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const [block1d, block7d] = await Promise.all([
    sdk.blocks.getBlock(CHAIN, now - DAY),
    sdk.blocks.getBlock(CHAIN, now - 7 * DAY),
  ]);

  const [asset, totalAssets, ppsNow, pps1d, pps7d] = await Promise.all([
    call('address:asset'),
    call('uint256:totalAssets'),
    call('uint256:pricePerShare'),
    call('uint256:pricePerShare', block1d.block),
    call('uint256:pricePerShare', block7d.block),
  ]);

  const [symbol, decimals, { pricesByAddress }] = await Promise.all([
    sdk.api.abi
      .call({ target: asset, abi: 'erc20:symbol', chain: CHAIN })
      .then((r) => r.output),
    sdk.api.abi
      .call({ target: asset, abi: 'erc20:decimals', chain: CHAIN })
      .then((r) => r.output),
    utils.getPrices([asset], CHAIN),
  ]);

  const tvlUsd =
    (totalAssets / 10 ** decimals) * pricesByAddress[asset.toLowerCase()];

  return [
    {
      pool: `${XLP_VAULT}-${CHAIN}`.toLowerCase(),
      chain: 'RISE',
      project: 'risex',
      symbol: utils.formatSymbol(symbol),
      poolMeta: 'XLP Vault',
      tvlUsd,
      apyBase: ppsApy(ppsNow, pps1d, 1),
      apyBase7d: ppsApy(ppsNow, pps7d, 7),
      underlyingTokens: [asset],
      url: 'https://www.rise.trade/en/vault',
    },
  ];
};

module.exports = {
  protocolId: '7806',
  timetravel: false,
  apy,
  url: 'https://www.rise.trade/en/vault',
};
