const crypto = require('crypto');

const superagent = require('superagent');

const utils = require('../adaptors/utils');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { sendMessage } = require('../utils/discordWebhook');
const { connect } = require('../utils/dbConnection');
const { getYieldProject, buildInsertYieldQuery } = require('../queries/yield');
const {
  getConfigProject,
  buildInsertConfigQuery,
  getDistinctProjects,
} = require('../queries/config');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log(event);

  // We return failed msg ids,
  // so that only failed messages will be retried by SQS in case of min of 1 error init batch
  // https://www.serverless.com/blog/improved-sqs-batch-error-handling-with-aws-lambda
  const failedMessageIds = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      await main(body);
    } catch (err) {
      console.log(err);
      failedMessageIds.push(record.messageId);
    }
  }
  return {
    batchItemFailures: failedMessageIds.map((id) => {
      return {
        itemIdentifier: id,
      };
    }),
  };
};

// func for running adaptor, storing result to db
const main = async (body) => {
  // ---------- run adaptor
  console.log(body.adaptor);
  const project = require(`../adaptors/${body.adaptor}`);
  let data = await project.apy();
  console.log(data[0]);

  const protocolConfig = (
    await superagent.get('https://api.llama.fi/config/yields?a=1')
  ).body.protocols;

  // ---------- prepare prior insert
  // remove potential null/undefined objects in array
  data = data.filter((p) => p);

  // cast dtypes
  // even though we have tests for datatypes, will need to guard against sudden changes
  // from api responses in terms of data types (eg have seen this on lido stETH) which went from
  // number to string. so in order for the below filters to work proplerly we need to guarantee that the
  // datatypes are correct (on db insert, mongoose checks field types against the schema and the bulk insert
  // will fail if a pools field types doesnt match)
  const strToNum = (val) => (typeof val === 'string' ? Number(val) : val);
  data = data.map((p) => ({
    ...p,
    apy: strToNum(p.apy),
    apyBase: strToNum(p.apyBase),
    apyReward: strToNum(p.apyReward),
    apyBaseBorrow: strToNum(p.apyBaseBorrow),
    apyRewardBorrow: strToNum(p.apyRewardBorrow),
    apyBase7d: strToNum(p.apyBase7d),
    apyRewardFake: strToNum(p.apyRewardFake),
    apyRewardBorrowFake: strToNum(p.apyRewardBorrowFake),
    apyBaseInception: strToNum(p.apyBaseInception),
  }));

  // filter tvl to be btw lb-ub
  data = data.filter(
    (p) =>
      p.tvlUsd >= exclude.boundaries.tvlUsdDB.lb &&
      p.tvlUsd <= exclude.boundaries.tvlUsdDB.ub
  );

  // nullify NaN, undefined or Infinity apy values
  data = data.map((p) => ({
    ...p,
    apy: Number.isFinite(p.apy) ? p.apy : null,
    apyBase: Number.isFinite(p.apyBase) ? p.apyBase : null,
    apyReward: Number.isFinite(p.apyReward) ? p.apyReward : null,
    apyBaseBorrow: Number.isFinite(p.apyBaseBorrow) ? p.apyBaseBorrow : null,
    apyRewardBorrow: Number.isFinite(p.apyRewardBorrow)
      ? p.apyRewardBorrow
      : null,
    apyBase7d: Number.isFinite(p.apyBase7d) ? p.apyBase7d : null,
    apyRewardFake: Number.isFinite(p.apyRewardFake) ? p.apyRewardFake : null,
    apyRewardBorrowFake: Number.isFinite(p.apyRewardBorrowFake)
      ? p.apyRewardBorrowFake
      : null,
    apyBaseInception: Number.isFinite(p.apyBaseInception)
      ? p.apyBaseInception
      : null,
  }));

  // remove pools where all 3 apy related fields are null
  data = data.filter(
    (p) => !(p.apy === null && p.apyBase === null && p.apyReward === null)
  );

  // in case of negative apy values (cause of bug, or else we set those to 0)
  // note: for options apyBase can be negative
  data = data.map((p) => ({
    ...p,
    apy: p.apy < 0 ? 0 : p.apy,
    apyBase:
      protocolConfig[body.adaptor]?.category === 'Options' ||
      ['mellow-protocol', 'sommelier', 'abracadabra'].includes(body.adaptor)
        ? p.apyBase
        : p.apyBase < 0
        ? 0
        : p.apyBase,
    apyReward: p.apyReward < 0 ? 0 : p.apyReward,
    apyBaseBorrow: p.apyBaseBorrow < 0 ? 0 : p.apyBaseBorrow,
    apyRewardBorrow: p.apyRewardBorrow < 0 ? 0 : p.apyRewardBorrow,
    apyBase7d: p.apyBase7d < 0 ? 0 : p.apyBase7d,
    apyRewardFake: p.apyRewardFake < 0 ? 0 : p.apyRewardFake,
    apyRewardBorrowFake: p.apyRewardBorrowFake < 0 ? 0 : p.apyRewardBorrowFake,
  }));

  // derive final total apy field
  data = data.map((p) => ({
    ...p,
    apy:
      // in case all three fields are given (which is redundant cause we calc the sum here),
      // we recalculate the total apy. reason: this takes into account any of the above 0 clips
      // which will result in a different sum than the adaptors output
      // (only applicable if all 3 fields are provided in the adapter
      // and if apBase and or apyReward < 0)
      p.apy !== null && p.apyBase !== null && p.apyReward !== null
        ? p.apyBase + p.apyReward
        : // all other cases for which we compute the sum only if apy is null/undefined
          p.apy ?? p.apyBase + p.apyReward,
  }));

  // remove pools based on apy boundaries
  data = data.filter(
    (p) =>
      p.apy !== null &&
      p.apy >= exclude.boundaries.apy.lb &&
      p.apy <= exclude.boundaries.apy.ub
  );

  // remove exclusion pools
  data = data.filter((p) => !exclude.excludePools.includes(p.pool));

  // format chain symbol
  data = data.map((p) => ({ ...p, chain: utils.formatChain(p.chain) }));
  // change chain `Binance` -> `BSC`
  data = data.map((p) => ({
    ...p,
    chain:
      p.chain === 'Binance'
        ? 'BSC'
        : p.chain === 'Avax'
        ? 'Avalanche'
        : p.chain,
  }));
  console.log(data.length);

  // ---- add IL (only for dexes + pools with underlyingTokens array)
  // need the protocol response to check if adapter.body === 'Dexes' category

  // required conditions to calculate IL field
  const uniV3Forks = [
    'uniswap-v3',
    'hydradex-v3',
    'forge',
    'arbitrum-exchange-v3',
    'maia-v3',
    'ramses-v2',
  ];
  if (
    data[0]?.underlyingTokens?.length &&
    protocolConfig[body.adaptor]?.category === 'Dexes' &&
    !['balancer-v2', 'curve-dex', 'clipper', 'astroport'].includes(
      body.adaptor
    ) &&
    !['elrond', 'near', 'hedera', 'carbon'].includes(
      data[0].chain.toLowerCase()
    )
  ) {
    // extract all unique underlyingTokens
    const uniqueToken = [
      ...new Set(
        data
          .map((p) => p.underlyingTokens?.map((t) => `${p.chain}:${t}`))
          .flat()
      ),
    ].filter(Boolean);

    // prices now
    const priceUrl = 'https://coins.llama.fi/prices';
    const prices = (
      await utils.getData(priceUrl, {
        coins: uniqueToken,
      })
    ).coins;

    const timestamp7daysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    // price endpoint seems to break with too many tokens, splitting it to max 150 per request
    const maxSize = 150;
    const pages = Math.ceil(uniqueToken.length / maxSize);
    let prices7d_ = [];
    let x = '';
    for (const p of [...Array(pages).keys()]) {
      x = uniqueToken.slice(p * maxSize, maxSize * (p + 1)).join(',');
      prices7d_ = [
        ...prices7d_,
        (
          await superagent.get(
            `https://coins.llama.fi/prices/historical/${timestamp7daysAgo}/${x}`
          )
        ).body.coins,
      ];
    }
    // flatten
    let prices7d = {};
    for (const p of prices7d_.flat()) {
      prices7d = { ...prices7d, ...p };
    }
    prices7d = Object.fromEntries(
      Object.entries(prices7d).map(([k, v]) => [k.toLowerCase(), v])
    );

    // calc IL
    data = data.map((p) => {
      if (p?.underlyingTokens === null || p?.underlyingTokens === undefined)
        return { ...p };
      // extract prices
      const token0 = `${p.chain}:${p.underlyingTokens[0]}`.toLowerCase();
      const token1 = `${p.chain}:${p.underlyingTokens[1]}`.toLowerCase();

      // now
      const price0 = prices[token0]?.price;
      const price1 = prices[token1]?.price;

      // 7 days ago
      const price0_7d = prices7d[token0]?.price;
      const price1_7d = prices7d[token1]?.price;

      // relative price changes
      const pctChangeX = (price0 - price0_7d) / price0_7d;
      const pctChangeY = (price1 - price1_7d) / price1_7d;

      // return in case of missing/weird prices
      if (!Number.isFinite(pctChangeX) || !Number.isFinite(pctChangeY))
        return { ...p };

      // d paramter (P1 / P0)
      const d = (1 + pctChangeX) / (1 + pctChangeY);

      // IL(d)
      let il7d = ((2 * Math.sqrt(d)) / (1 + d) - 1) * 100;

      // for uni v3
      if (uniV3Forks.includes(body.adaptor)) {
        const P = price1 / price0;

        // for stablecoin pools, we assume a +/- 0.1% range around current price
        // for non-stablecoin pools -> +/- 30%
        const pct = 0.3;
        const pctStablePool = 0.001;
        const delta = p.poolMeta.includes('stablePool=true')
          ? pctStablePool
          : pct;

        const [p_lb, p_ub] = [P * (1 - delta), P * (1 + delta)];

        // https://medium.com/auditless/impermanent-loss-in-uniswap-v3-6c7161d3b445
        // ilv3 = ilv2 * factor
        const factor =
          1 / (1 - (Math.sqrt(p_lb / P) + d * Math.sqrt(P / p_ub)) / (1 + d));

        // scale IL by factor
        il7d *= factor;
        // if the factor is too large, it may result in IL values >100% which don't make sense
        // -> clip to max -100% IL
        il7d = il7d < 0 ? Math.max(il7d, -100) : il7d;
      }

      return {
        ...p,
        il7d,
      };
    });
  }

  // for PK, FK, read data from config table
  const config = await getConfigProject(body.adaptor);
  const mapping = {};
  for (const c of config) {
    // the pool fields are used to map to the config_id values from the config table
    mapping[c.pool] = c.config_id;
  }

  // we round numerical fields to 5 decimals after the comma
  const precision = 5;
  const timestamp = new Date(Date.now());
  data = data.map((p) => {
    // if pool not in mapping -> its a new pool -> create a new uuid, else keep existing one
    const id = mapping[p.pool] ?? crypto.randomUUID();
    return {
      ...p,
      config_id: id, // config PK field
      configID: id, // yield FK field referencing config_id in config
      symbol: ['USDC+', 'ETH+', 'USDEX+'].some((i) => p.symbol.includes(i))
        ? p.symbol
        : utils.formatSymbol(p.symbol),
      tvlUsd: Math.round(p.tvlUsd), // round tvlUsd to integer and apy fields to n-dec
      apy: +p.apy.toFixed(precision), // round apy fields
      apyBase: p.apyBase !== null ? +p.apyBase.toFixed(precision) : p.apyBase,
      apyReward:
        p.apyReward !== null ? +p.apyReward.toFixed(precision) : p.apyReward,
      url: p.url ?? project.url,
      timestamp,
      apyBaseBorrow:
        p.apyBaseBorrow !== null
          ? +p.apyBaseBorrow.toFixed(precision)
          : p.apyBaseBorrow,
      apyRewardBorrow:
        p.apyRewardBorrow !== null
          ? +p.apyRewardBorrow.toFixed(precision)
          : p.apyRewardBorrow,
      totalSupplyUsd:
        p.totalSupplyUsd === undefined || p.totalSupplyUsd === null
          ? null
          : Math.round(p.totalSupplyUsd),
      totalBorrowUsd:
        p.totalBorrowUsd === undefined || p.totalBorrowUsd === null
          ? null
          : Math.round(p.totalBorrowUsd),
      debtCeilingUsd:
        p.debtCeilingUsd === undefined || p.debtCeilingUsd === null
          ? null
          : Math.round(p.debtCeilingUsd),
      mintedCoin: p.mintedCoin ? utils.formatSymbol(p.mintedCoin) : null,
      poolMeta:
        p.poolMeta === undefined
          ? null
          : uniV3Forks.includes(p.project)
          ? p.poolMeta?.split(',')[0]
          : p.poolMeta,
      il7d: p.il7d ? +p.il7d.toFixed(precision) : null,
      apyBase7d:
        p.apyBase7d !== null ? +p.apyBase7d.toFixed(precision) : p.apyBase7d,
      apyRewardFake:
        p.apyRewardFake !== null
          ? +p.apyRewardFake.toFixed(precision)
          : p.apyRewardFake,
      apyRewardBorrowFake:
        p.apyRewardBorrowFake !== null
          ? +p.apyRewardBorrowFake.toFixed(precision)
          : p.apyRewardBorrowFake,
      volumeUsd1d: p.volumeUsd1d ? +p.volumeUsd1d.toFixed(precision) : null,
      volumeUsd7d: p.volumeUsd7d ? +p.volumeUsd7d.toFixed(precision) : null,
      apyBaseInception: p.apyBaseInception
        ? +p.apyBaseInception.toFixed(precision)
        : null,
    };
  });

  // ---------- tvl spike check
  // prior insert, we run a tvl check to make sure
  // that there haven't been any sudden spikes in tvl compared to the previous insert;
  // insert only if tvl conditions are ok:
  // if tvl
  // - has increased >10x since the last hourly update
  // - and has been updated in the last 5 hours
  // -> block update

  // load last entries for each pool for this sepcific adapter
  const dataInitial = await getYieldProject(body.adaptor);

  const dataDB = [];
  const nHours = 5;
  const tvlDeltaMultiplier = 5;
  const apyDeltaMultiplier = tvlDeltaMultiplier;
  const timedeltaLimit = 60 * 60 * nHours * 1000;
  const droppedPools = [];
  for (const p of data) {
    const x = dataInitial.find((e) => e.configID === p.configID);
    if (x === undefined) {
      dataDB.push(p);
      continue;
    }
    // if existing pool, check conditions
    const timedelta = timestamp - x.timestamp;
    // skip the update if tvl or apy at t is ntimes larger than tvl at t-1 && timedelta condition is met
    if (
      (p.tvlUsd > x.tvlUsd * tvlDeltaMultiplier ||
        p.apy > x.apy * apyDeltaMultiplier) &&
      timedelta < timedeltaLimit
    ) {
      console.log(`removing pool ${p.pool}`);
      droppedPools.push({
        configID: p.configID,
        symbol: p.symbol,
        project: p.project,
        tvlUsd: p.tvlUsd,
        tvlUsdDB: x.tvlUsd,
        tvlMultiplier: p.tvlUsd / x.tvlUsd,
        apy: p.apy,
        apyDB: x.apy,
        apyMultiplier: p.apy / x.apy,
      });
      continue;
    }
    dataDB.push(p);
  }
  // return if dataDB is empty;
  if (!dataDB.length) return;

  // send msg to discord if tvl spikes
  const delta = data.length - dataDB.length;
  if (delta > 0) {
    console.log(`removed ${delta} sample(s) prior to insert`);
    // send discord message
    // we limit sending msg only if the pool's last tvlUsd value is >= $50k
    const filteredPools = droppedPools.filter(
      (p) => p.tvlUsdDB >= 5e4 && p.apyDB >= 10
    );
    if (filteredPools.length) {
      const message = filteredPools
        .map((p) =>
          p.apyMultiplier >= apyDeltaMultiplier
            ? `APY spike for configID: ${
                p.configID
              } from ${p.apyDB.toFixed()} to ${p.apy.toFixed()} (${p.apyMultiplier.toFixed(
                2
              )}x increase) [tvlUsd: ${p.tvlUsd.toFixed()}]
          `
            : `TVL spike for configID: ${
                p.configID
              } from ${p.tvlUsdDB.toFixed()} to ${p.tvlUsd.toFixed()} (${p.tvlMultiplier.toFixed(
                2
              )}x increase)
            `
        )
        .join('\n');
      await sendMessage(message, process.env.TVL_SPIKE_WEBHOOK);
    }
  }

  // ---------- discord bot for newly added projects
  const distinctProjects = await getDistinctProjects();
  if (
    !distinctProjects.includes(body.adaptor) &&
    dataDB.filter(({ tvlUsd }) => tvlUsd > exclude.boundaries.tvlUsdUI.lb)
      .length
  ) {
    const message = `Project ${body.adaptor} yields have been added`;
    await sendMessage(message, process.env.NEW_YIELDS_WEBHOOK);
  }

  // ---------- DB INSERT
  const response = await insertConfigYieldTransaction(dataDB);
  console.log(response);
};

// --------- transaction query
const insertConfigYieldTransaction = async (payload) => {
  const conn = await connect();

  // build queries
  const configQ = buildInsertConfigQuery(payload);
  const yieldQ = buildInsertYieldQuery(payload);

  return conn
    .tx(async (t) => {
      // sequence of queries:
      // 1. config: insert/update
      const q1 = await t.result(configQ);
      // 2. yield: insert
      const q2 = await t.result(yieldQ);

      return [q1, q2];
    })
    .then((response) => {
      // success, COMMIT was executed
      return {
        status: 'success',
        data: response,
      };
    })
    .catch((err) => {
      // failure, ROLLBACK was executed
      console.log(err);
      return new AppError('ConfigYield Transaction failed, rolling back', 404);
    });
};
