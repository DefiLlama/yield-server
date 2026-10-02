const sdk = require('@defillama/sdk');
const { request } = require('graphql-request');
const utils = require('../utils');
const { feeApr, rewardApr, latestFarmings } = require('./math');

const CHAIN = 'bsc';
const DAY = 86400;
const ZERO = '0x0000000000000000000000000000000000000000';
const POOLS = sdk.graph.modifyEndpoint(
  'BoHp9H2rGzVFPiqc56PJ1Gw7EPDaiHMcupsUuksMGp2K'
);
const FARMING = sdk.graph.modifyEndpoint(
  'eTT8C92PwJiquV8S7oCkAzXToG3XJkkZnm4pBFtrSmc'
);
const BLACKLIST = new Set(['0x39e3ca118ddfea3edc426b306b87f43da3251b4a']);

async function meta(url, block) {
  const { _meta } = await request(
    url,
    `{
    _meta${block ? `(block: {number: ${block}})` : ''} {
      block { number timestamp } hasIndexingErrors
    }
  }`
  );
  if (_meta.hasIndexingErrors)
    throw new Error('THENA Integral: subgraph indexing error');
  return _meta.block;
}

async function paginate(url, entity, fields, block) {
  const rows = [];
  let cursor = '';
  while (true) {
    const data = await request(
      url,
      `{
      ${entity}(first: 1000, orderBy: id, orderDirection: asc,
        where: {id_gt: "${cursor}"}, block: {number: ${block}}) { ${fields} }
    }`
    );
    const page = data[entity];
    rows.push(...page);
    if (page.length < 1000) return rows;
    const next = page[page.length - 1].id;
    if (next <= cursor)
      throw new Error('THENA Integral: pagination did not advance');
    cursor = next;
  }
}

async function multi(abi, calls, block) {
  const { output } = await sdk.api.abi.multiCall({
    chain: CHAIN,
    block,
    abi,
    calls,
    permitFailure: true,
  });
  return output.map((r) => (r.success ? r.output : null));
}

async function pricesFor(tokens) {
  const addresses = [...new Set(tokens)].filter((t) => t !== ZERO);
  let prices = {};
  for (let i = 0; i < addresses.length; i += 50) {
    const keys = addresses.slice(i, i + 50).map((t) => `${CHAIN}:${t}`);
    const { coins } = await utils.getPriceApiData(
      `/prices/current/${keys.join(',')}`
    );
    prices = { ...prices, ...coins };
  }
  return prices;
}

async function apy() {
  const heads = await Promise.all([meta(POOLS), meta(FARMING)]);
  // Graph Node may return null timestamps for _meta at an explicit block.
  // Use the timestamp from the lagging indexer's live head instead.
  const snapshot = heads.reduce((a, b) => (a.number < b.number ? a : b));
  const block = snapshot.number;
  const timestamp = Number(snapshot.timestamp);
  const lag = Date.now() / 1000 - timestamp;
  if (!Number.isFinite(timestamp) || lag > 1800 || lag < -60)
    throw new Error('THENA Integral: stale or invalid subgraph timestamp');
  const priorSnapshot = await utils.getPriceApiData(
    `/block/${CHAIN}/${timestamp - DAY}`
  );
  const priorBlock = priorSnapshot.height;
  const elapsed = timestamp - Number(priorSnapshot.timestamp);
  if (Math.abs(elapsed - DAY) > 60)
    throw new Error('THENA Integral: invalid 24-hour block window');

  const [allPools, priorPools, allFarmings] = await Promise.all([
    paginate(
      POOLS,
      'pools',
      `id type createdAtTimestamp plugin
      token0 { id symbol decimals } token1 { id symbol decimals }
      communityFee0 communityFee1 feesUSD volumeUSD`,
      block
    ),
    paginate(
      POOLS,
      'pools',
      'id feesUSD volumeUSD communityFee0 communityFee1',
      priorBlock
    ),
    paginate(
      FARMING,
      'eternalFarmings',
      'id pool nonce virtualPool rewardToken bonusRewardToken isDeactivated',
      block
    ),
  ]);
  const pools = allPools.filter(
    (p) =>
      ['Farming', 'Fees'].includes(p.type) &&
      ![p.token0.id, p.token1.id].some((t) => BLACKLIST.has(t))
  );
  const farmByPool = latestFarmings(allFarmings);
  const farmings = pools
    .filter((p) => p.type === 'Farming' && farmByPool.has(p.id))
    .map((p) => ({ ...farmByPool.get(p.id), plugin: p.plugin }));
  const calls = farmings.map((f) => ({ target: f.virtualPool }));
  const balanceCalls = pools.flatMap((p) =>
    [p.token0, p.token1].map((t) => ({ target: t.id, params: [p.id] }))
  );
  const [
    balances,
    prices,
    rates,
    reserves,
    deactivated,
    prevTimestamp,
    liquidity,
    incentives,
  ] = await Promise.all([
    multi('erc20:balanceOf', balanceCalls, block),
    pricesFor(
      pools
        .flatMap((p) => [p.token0.id, p.token1.id])
        .concat(farmings.flatMap((f) => [f.rewardToken, f.bonusRewardToken]))
    ),
    multi(
      'function rewardRates() view returns (uint128,uint128)',
      calls,
      block
    ),
    multi(
      'function rewardReserves() view returns (uint128,uint128)',
      calls,
      block
    ),
    multi('bool:deactivated', calls, block),
    multi('uint32:prevTimestamp', calls, block),
    multi('uint128:currentLiquidity', calls, block),
    multi(
      'address:incentive',
      farmings.map((f) => ({ target: f.plugin })),
      block
    ),
  ]);
  const priorByPool = new Map(priorPools.map((p) => [p.id, p]));
  const rewardByPool = new Map(
    farmings.map((f, i) => [
      f.pool,
      {
        ...f,
        rates: rates[i],
        reserves: reserves[i],
        deactivated: deactivated[i],
        prevTimestamp: prevTimestamp[i],
        liquidity: liquidity[i],
        incentive: incentives[i],
      },
    ])
  );
  const now = Math.floor(Date.now() / 1000);
  const price = (token) => {
    const p = prices[`${CHAIN}:${token}`];
    return p &&
      Number.isFinite(p.price) &&
      p.price > 0 &&
      Number.isFinite(p.timestamp) &&
      Math.abs(now - p.timestamp) <= 6 * 3600 &&
      (p.confidence === undefined || p.confidence >= 0.5)
      ? p
      : null;
  };

  return pools.flatMap((p, i) => {
    const tokens = [p.token0, p.token1];
    const values = tokens.map((t, j) => {
      const balance = balances[2 * i + j];
      const quote = price(t.id);
      return balance !== null && quote
        ? (Number(balance) / 10 ** Number(t.decimals)) * quote.price
        : NaN;
    });
    const tvlUsd = values[0] + values[1];
    if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) return [];
    const prior = priorByPool.get(p.id);
    const base =
      p.type === 'Fees'
        ? feeApr(p, prior, tvlUsd, elapsed, Number(priorSnapshot.timestamp))
        : undefined;
    const reward =
      p.type === 'Farming'
        ? rewardApr(rewardByPool.get(p.id), timestamp, tvlUsd, price)
        : undefined;
    // Missing reads/prices are not zero yield. Keep only known observations.
    if (base === undefined && reward === undefined) return [];
    const volume = prior
      ? Number(p.volumeUSD) - Number(prior.volumeUSD)
      : undefined;
    return [
      {
        pool: `${p.id}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: 'thena-integral',
        symbol: utils.formatSymbol(tokens.map((t) => t.symbol).join('-')),
        tvlUsd,
        ...(base === undefined ? {} : { apyBase: base }),
        ...(reward === undefined
          ? {}
          : { apyReward: reward.apr, rewardTokens: reward.tokens }),
        underlyingTokens: tokens.map((t) => t.id),
        token: null, // Direct CL positions are NFTs, not transferable ERC-20 pool shares.
        poolMeta: `Integral - ${
          p.type === 'Fees' ? 'Earn Fees' : 'Earn THE'
        } - pool-wide APR`,
        url: 'https://thena.fi/liquidity',
        ...(Number.isFinite(volume) && volume >= 0
          ? { volumeUsd1d: volume }
          : {}),
      },
    ];
  });
}

module.exports = {
  protocolId: '6179',
  timetravel: false,
  apy,
};
