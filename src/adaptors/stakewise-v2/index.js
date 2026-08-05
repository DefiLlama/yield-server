// StakeWise — Ethereum liquid staking (V3). Returns two pools:
//   1. osETH        — the liquid staking token; yield osETH holders accrue.
//   2. Genesis Vault — direct ETH staking in the protocol's main vault.
// Same protocol; the `stakewise-v2` slug is legacy — V3 has been the live
// mainnet protocol since 2023-11-28 (a rename to stakewise-v3 is requested).
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

// osETH holder yield — the liquid staking token (intrinsic source)
const getOsTokenPool = async (osTokenPrice) => {
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
  // no rate events in the window → APY would be NaN; fail instead of emitting it
  if (!lastWeekLogs.length) {
    throw new Error('no AvgRewardPerSecondUpdated events in the last week');
  }
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
    // osETH accrues value vs ETH (trades at a premium), so pricing its supply
    // with the ETH price understated TVL — use the osETH feed (ETH fallback).
    tvlUsd: tvl * osTokenPrice,
    // 1-week average of the on-chain osETH reward rate holders realize
    apyBase: Number(apyBN) / 100,
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    searchTokenOverride: osTokenAddress,
    isIntrinsicSource: true,
  };
};

// Direct ETH staking in the Genesis Vault. Distinct product from the osETH pool
// above — osETH is the token optionally minted against a vault deposit — so
// listing both is intentional, not a double-count.
const getGenesisPool = async (ethPrice) => {
  const query = `{
    vault(id: "${genesisVaultAddress}") {
      apy
      totalAssets
    }
  }`;
  // bound the request — a hang would otherwise block the osETH pool too
  const { data } = await axios.post(subgraphUrl, { query }, { timeout: 10000 });
  if (data?.errors) {
    console.error(
      'stakewise-v2: subgraph errors —',
      JSON.stringify(data.errors)
    );
    return null;
  }
  const vault = data?.data?.vault;
  // null metrics would coerce to 0 and publish a false APY/TVL — skip instead
  if (vault?.apy == null || vault?.totalAssets == null) {
    console.error('stakewise-v2: Genesis vault missing or has null metrics');
    return null;
  }

  const tvl = Number(vault.totalAssets) / wad;

  return {
    pool: `${genesisVaultAddress}-${chain}`,
    chain,
    project: 'stakewise-v2',
    // stakers deposit native ETH; the vault position is ETH-denominated
    symbol: 'ETH',
    tvlUsd: tvl * ethPrice, // vault assets are native ETH
    // subgraph `apy`: percent units, net of the vault fee, unboosted —
    // the minimum-attainable yield (per DefiLlama methodology)
    apyBase: Number(vault.apy),
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    poolMeta: 'Genesis Vault',
    url: `https://app.stakewise.io/vaults/ethereum/${genesisVaultAddress}`,
  };
};

const getApy = async () => {
  // fetch ETH price (Genesis vault assets) and osETH price (appreciating token)
  const ethKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const osTokenKey = `ethereum:${osTokenAddress.toLowerCase()}`;
  const { coins } = await utils.getPriceApiData(
    `/prices/current/${ethKey},${osTokenKey}`
  );
  const ethPrice = coins[ethKey]?.price;
  // without the base ETH price both pools would compute NaN TVL and get
  // silently dropped — fail loudly and let the next run retry instead
  if (!ethPrice) {
    throw new Error('missing ETH price');
  }
  const osTokenPrice = coins[osTokenKey]?.price || ethPrice;

  // osETH pool is the intrinsic source consumed by other adaptors — it must
  // not be dropped if the vault subgraph hiccups, so isolate the Genesis pool.
  const osTokenPool = await getOsTokenPool(osTokenPrice);

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
