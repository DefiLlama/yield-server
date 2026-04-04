const utils = require('../utils');
const { default: axios } = require('axios');

const PROJECT = 'zensats';
const CHAIN = 'ethereum';

const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
const XAUT = '0x68749665FF8D2d112Fa859AA293F07A622782F38';

const vaults = [
  {
    address: '0x617A6877f0a55D1eF2B64b5861A2bB5Fe6FEB739',
    symbol: 'zenWBTC-pmUSDcrvUSDStake',
    underlyingToken: WBTC,
    url: 'https://zensats.app/vault/wbtc-pmusd',
  },
  {
    address: '0xbaEc8343B610A5ee7Ca2c5b93507AC7def98E2B1',
    symbol: 'zenWstETH-pmUSDcrvUSDStake',
    underlyingToken: WSTETH,
    url: 'https://zensats.app/vault/wsteth-pmusd',
  },
  {
    address: '0x7d5281D590Fb0647aDc7d8494a2c8Fb8C2B23cBD',
    symbol: 'zenXAUT-pmUSDcrvUSDStake',
    underlyingToken: XAUT,
    url: 'https://zensats.app/vault/xaut-pmusd',
  },
];

const main = async () => {
  const priceKeys = vaults.map((v) => `${CHAIN}:${v.underlyingToken}`).join(',');
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKeys}`,
    { timeout: 10_000 }
  );
  const prices = data?.coins ?? {};

  const infos = await Promise.all(
    vaults.map((v) => utils.getERC4626Info(v.address, CHAIN))
  );

  return infos
    .map((info, i) => {
      const v = vaults[i];
      const priceEntry = prices[`${CHAIN}:${v.underlyingToken}`];
      if (!priceEntry || priceEntry.price == null || priceEntry.decimals == null) {
        return null;
      }
      return {
        pool: info.pool,
        chain: CHAIN,
        project: PROJECT,
        symbol: v.symbol,
        tvlUsd: (Number(info.tvl) / 10 ** priceEntry.decimals) * priceEntry.price,
        apyBase: info.apyBase,
        underlyingTokens: [v.underlyingToken],
        url: v.url,
      };
    })
    .filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: main,
};
