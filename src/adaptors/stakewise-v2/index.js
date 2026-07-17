const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const axios = require('axios');
const utils = require('../utils');

const secondsInYear = 31536000;
const secondsInWeek = 7 * 60 * 60 * 24;
const maxPercent = 10000; // 100.00 %
const wad = 1e18;

const osTokenAddress = '0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38';
const osTokenCtrlAddress = '0x2A261e60FB14586B474C208b1B7AC6D0f5000306';
const chain = 'ethereum';

// StakeWise V3 subgraph (public) — source for vault-level staking APY
const subgraphUrl =
  'https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod';
// Genesis Vault: the protocol's primary public vault (~40% of TVL)
const genesisVaultAddress = '0xac0f906e433d58fa868f936e8a43230473652885';

const EVENTS = {
  AvgRewardPerSecondUpdated:
    'event AvgRewardPerSecondUpdated(uint256 avgRewardPerSecond)',
};

// osETH holder yield — the liquid staking token (unchanged, intrinsic source)
const getOsTokenPool = async (ethPrice) => {
  const currentBlock = await sdk.api.util.getLatestBlock(chain);
  const toBlock = currentBlock.number;
  const timestampWeekAgo = currentBlock.timestamp - secondsInWeek;
  const [fromBlock] = await utils.getBlocksByTime([timestampWeekAgo], chain);

  const logs = await sdk.getEventLogs({
    target: osTokenCtrlAddress,
    eventAbi: EVENTS.AvgRewardPerSecondUpdated,
    fromBlock,
    toBlock,
    chain,
  });

  // get last 14 events (1-week average)
  const lastWeekLogs = logs.slice(-14);
  const osEthRewardPerSecondSum = lastWeekLogs
    .map((log) => {
      return new BigNumber(log.args.avgRewardPerSecond.toString());
    })
    .reduce((a, b) => a.plus(b), new BigNumber('0'));

  // calculate APY
  const apyBN = osEthRewardPerSecondSum
    .times(new BigNumber(secondsInYear.toString()))
    .times(new BigNumber(maxPercent.toString()))
    .dividedBy(new BigNumber(lastWeekLogs.length.toString()))
    .dividedBy(new BigNumber(wad.toString()));
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: osTokenAddress })).output / 1e18;

  return {
    pool: osTokenAddress,
    chain,
    project: 'stakewise-v2',
    symbol: 'osETH',
    tvlUsd: tvl * ethPrice,
    apyBase: Number(apyBN) / 100,
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    searchTokenOverride: osTokenAddress,
    isIntrinsicSource: true,
  };
};

// Direct staking in the Genesis Vault — net, unboosted (lower bound) APY
const getGenesisPool = async (ethPrice) => {
  const query = `{
    vault(id: "${genesisVaultAddress}") {
      apy
      totalAssets
    }
  }`;
  const { data } = await axios.post(subgraphUrl, { query });
  const vault = data?.data?.vault;
  if (!vault) return null;

  const tvl = Number(vault.totalAssets) / wad;

  return {
    pool: `${genesisVaultAddress}-${chain}`,
    chain,
    project: 'stakewise-v2',
    symbol: 'ETH',
    tvlUsd: tvl * ethPrice,
    apyBase: Number(vault.apy),
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    poolMeta: 'Genesis Vault',
    url: `https://app.stakewise.io/vaults/ethereum/${genesisVaultAddress}`,
  };
};

const getApy = async () => {
  // fetch ETH price
  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await utils.getPriceApiData(`/prices/current/${priceKey}`))
    .coins[priceKey]?.price;

  // osETH pool is the intrinsic source consumed by other adaptors — it must
  // not be dropped if the vault subgraph hiccups, so isolate the Genesis pool.
  const osTokenPool = await getOsTokenPool(ethPrice);

  let genesisPool = null;
  try {
    genesisPool = await getGenesisPool(ethPrice);
  } catch (err) {
    console.error('stakewise-v2: Genesis vault pool skipped —', err.message);
  }

  return [osTokenPool, genesisPool].filter(Boolean);
};

module.exports = {
  protocolId: '277',
  timetravel: false,
  apy: getApy,
  url: 'https://app.stakewise.io/',
};
