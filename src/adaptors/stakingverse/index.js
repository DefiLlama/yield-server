const axios = require('axios');
const utils = require('../utils');

const VAULT = '0x8a93a876912c9f03f88bc9114847cf5b63c89f56';
const ETH = '0x0000000000000000000000000000000000000000';
const SUBGRAPH =
  'https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod';
const URL = `https://app.stakewise.io/vault/mainnet/${VAULT}`;

const toNumber = (value, label) => {
  if (
    !['string', 'number'].includes(typeof value) ||
    String(value).trim() === '' ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error(`Stakingverse: invalid ${label}`);
  }
  return Number(value);
};

const getApy = async () => {
  const { data } = await axios.post(
    SUBGRAPH,
    { query: `{ vault(id: "${VAULT}") { apy totalAssets } }` },
    { timeout: 60000 }
  );
  if (data?.errors?.length || !data?.data?.vault) {
    throw new Error('Stakingverse: missing vault or subgraph error');
  }

  const vault = data.data.vault;
  // StakeWise reports APY in percent, already net of the vault fee.
  const apyBase = toNumber(vault.apy, 'APY');
  const totalAssets = toNumber(vault.totalAssets, 'total assets');
  const key = `ethereum:${ETH}`;
  const { coins } = await utils.getPriceApiData(`/prices/current/${key}`);
  const ethPrice = toNumber(coins?.[key]?.price, 'ETH price');
  // Gross vault assets are denominated in wei; osETH debt is not deducted.
  const tvlUsd = (totalAssets / 1e18) * ethPrice;
  if (totalAssets < 0 || ethPrice <= 0 || !Number.isFinite(tvlUsd)) {
    throw new Error('Stakingverse: invalid TVL');
  }

  return [
    {
      pool: `${VAULT}-ethereum`,
      chain: 'Ethereum',
      project: 'stakingverse',
      symbol: 'ETH',
      tvlUsd,
      apyBase,
      underlyingTokens: [ETH],
      // No transferable receipt token; suppress the vault-address fallback.
      token: null,
      url: URL,
    },
  ];
};

module.exports = {
  protocolId: '6082',
  timetravel: false,
  apy: getApy,
  url: URL,
};
