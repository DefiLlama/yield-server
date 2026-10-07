const sdk = require('@defillama/sdk');
const utils = require('../utils');

const API_URL = 'https://api.arrowfarm.io/rpc/vaults';
const CHAIN_ID = 4663;
const CHAIN = 'robinhood';

// The vault factory is permissionless, so a vault counts only if it came from
// this factory and its strategy came from Arrowfarm's strategy factory. This
// mirrors the TVL adapter in DefiLlama-Adapters.
const VAULT_FACTORY = '0x086d837E84A59aB0E91861A773c8130ce4265440';
const VAULT_FACTORY_FROM_BLOCK = 67633904;
const STRATEGY_FACTORY = '0xd626504db63FBe10Ea98a99f52717c5315e9eD46';
const STRATEGY_FACTORY_FROM_BLOCK = 67634274;
const LOG_BLOCK_RANGE = 500000;
// Stay short of the tip: nodes behind the block index reject newer blocks.
const LOG_HEAD_BUFFER_BLOCKS = 20;

// ARROWFARM, emitted by ArrowChef to staked vault shares. It is the only reward
// token paid out; the UP gauge emission on UP33 vaults is harvested and
// compounded back into the position, so it is part of apyBase.
const ARROWFARM = '0x416D0C4B431Cfa33b4A4974e3DfC9f5089137148';

// Vaults below this TVL are seed-sized and hidden on the app.
const MIN_TVL_USD = 1000;

const STRATEGY_META = {
  'uniswap-v3': 'Uniswap V3',
  'velodrome-slipstream': 'UP33',
};

const bpsToPercent = (bps) =>
  bps === null || bps === undefined ? null : bps / 100;

const lower = (a) => String(a).toLowerCase();

// Returns Map<lowercased vault, [token0, token1]> for genuine vaults only.
const getGenuineVaults = async () => {
  const api = new sdk.ChainApi({ chain: CHAIN });
  const latest = await sdk.api.util.getLatestBlock(CHAIN);
  const toBlock = latest.number - LOG_HEAD_BUFFER_BLOCKS;
  const getProxies = (target, eventAbi, fromBlock) =>
    sdk.getEventLogs({
      chain: CHAIN,
      target,
      eventAbi,
      fromBlock,
      toBlock,
      onlyArgs: true,
      maxBlockRange: LOG_BLOCK_RANGE,
    });

  const [vaultLogs, strategyLogs] = await Promise.all([
    getProxies(
      VAULT_FACTORY,
      'event ProxyCreated(address proxy)',
      VAULT_FACTORY_FROM_BLOCK
    ),
    getProxies(
      STRATEGY_FACTORY,
      'event ProxyCreated(string strategyName, address proxy)',
      STRATEGY_FACTORY_FROM_BLOCK
    ),
  ]);
  const strategies = new Set(strategyLogs.map((l) => lower(l.proxy)));
  const created = vaultLogs.map((l) => l.proxy);

  const vaultStrategies = await api.multiCall({
    abi: 'address:strategy',
    calls: created,
    permitFailure: true,
  });
  const genuine = created.filter(
    (_, i) => vaultStrategies[i] && strategies.has(lower(vaultStrategies[i]))
  );
  const wants = await api.multiCall({
    abi: 'function wants() view returns (address token0, address token1)',
    calls: genuine,
  });
  return new Map(
    genuine.map((v, i) => [lower(v), [wants[i].token0, wants[i].token1]])
  );
};

const apy = async () => {
  // Fail closed: if the on-chain read throws, no pools are published.
  const genuine = await getGenuineVaults();
  // Arrowfarm's API serves the per-vault APR components it computes from chain
  // reads (24h trading-fee APR, UP gauge APY, ArrowChef emission APR), all in bps.
  const res = await utils.getData(API_URL, { json: { chainId: CHAIN_ID } });
  const vaults = res.json.data;

  return vaults
    .filter((v) => v.chainId === CHAIN_ID && v.status === 'active')
    .filter((v) => genuine.has(lower(v.address)))
    .filter((v) => Number(v.tvlUsd) >= MIN_TVL_USD)
    .map((v) => {
      // apyBps is the trading-fee APR for uniswap-v3 vaults and the compounded
      // UP gauge APY for velodrome-slipstream vaults; it excludes ARROWFARM.
      const apyBase = bpsToPercent(v.apyBps);
      const apyReward = bpsToPercent(v.arrowAprBps);
      const hasReward = apyReward !== null && apyReward > 0;

      return {
        pool: `${v.address}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'arrowfarm',
        symbol: `${v.token0.symbol}-${v.token1.symbol}`,
        tvlUsd: Number(v.tvlUsd),
        apyBase,
        ...(hasReward && { apyReward, rewardTokens: [ARROWFARM] }),
        underlyingTokens: genuine.get(lower(v.address)),
        token: v.address,
        poolMeta: STRATEGY_META[v.strategyType],
        url: 'https://www.arrowfarm.io',
      };
    })
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '8852',
  timetravel: false,
  apy,
  url: 'https://www.arrowfarm.io',
};
