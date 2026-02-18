const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const VAULT = '0x2eA493384F42d7Ea78564F3EF4C86986eAB4a890';
const USDm = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7';
const CHAIN = 'megaeth';
const DAY = 24 * 3600;
const WEEK = 7 * DAY;
const CONVERT_ABI =
  'function convertToAssets(uint256) external view returns (uint256)';
const UNIT = '1000000000000000000';

const apy = async (timestamp = Math.floor(Date.now() / 1e3)) => {
  const [blockNow, blockYesterday, blockWeekAgo] = await Promise.all(
    [timestamp, timestamp - DAY, timestamp - WEEK].map((t) =>
      axios
        .get(`https://coins.llama.fi/block/${CHAIN}/${t}`)
        .then((r) => r.data.height)
    )
  );

  const call = (abi, block, params) =>
    sdk.api.abi.call({ target: VAULT, abi, chain: CHAIN, block, params });

  const [totalAssets, priceNow, priceYesterday, priceWeekAgo, tokenPrice] =
    await Promise.all([
      call('uint256:totalAssets', blockNow),
      call(CONVERT_ABI, blockNow, [UNIT]),
      call(CONVERT_ABI, blockYesterday, [UNIT]),
      call(CONVERT_ABI, blockWeekAgo, [UNIT]),
      axios
        .get(`https://coins.llama.fi/prices/current/${CHAIN}:${USDm}`)
        .then((r) => r.data.coins[`${CHAIN}:${USDm}`].price),
    ]);

  const apyBase =
    (priceNow.output / priceYesterday.output) ** 365 * 100 - 100;
  const apyBase7d =
    (priceNow.output / priceWeekAgo.output) ** (365 / 7) * 100 - 100;

  return [
    {
      pool: `${VAULT}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'avon-megavault',
      symbol: 'USDm',
      tvlUsd: (totalAssets.output / 1e18) * tokenPrice,
      apyBase,
      apyBase7d,
      underlyingTokens: [USDm],
      url: 'https://bootstrap.avon.xyz/megavault/4326',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://bootstrap.avon.xyz/megavault/4326',
};
