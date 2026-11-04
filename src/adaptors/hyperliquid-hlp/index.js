const utils = require('../utils');

const PROJECT = 'hyperliquid-hlp';
const CHAIN = 'hyperliquid';
const INFO_API = 'https://api.hyperliquid.xyz/info';
const HLP_VAULT = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
const USDC = '0xb88339CB7199b77E23DB6E890353E22632Ba630f';

const main = async () => {
  const vault = await utils.withRetry(() =>
    utils.getData(INFO_API, { type: 'vaultDetails', vaultAddress: HLP_VAULT })
  );
  const month = Object.fromEntries(vault.portfolio).month;

  return [
    {
      pool: `${HLP_VAULT}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'USDC',
      tvlUsd: Number(month.accountValueHistory.at(-1)[1]),
      apyBase: Number(vault.apr) * 100,
      underlyingTokens: [USDC],
      token: null,
      poolMeta: '4-day lockup',
      url: `https://app.hyperliquid.xyz/vaults/${HLP_VAULT}`,
    },
  ].filter(utils.keepFinite);
};

module.exports = {
  protocolId: '5448',
  apyWindowDays: 30,
  timetravel: false,
  apy: main,
  url: `https://app.hyperliquid.xyz/vaults/${HLP_VAULT}`,
};
