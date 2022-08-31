const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  pgm.createTable('enriched', {
    enriched_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    pool: { type: 'text', notNull: true },
    project: { type: 'text', notNull: true },
    chain: { type: 'text', notNull: true },
    symbol: { type: 'text', notNull: true },
    tvlUsd: { type: 'bigint', notNull: true },
    apy: { type: 'numeric', notNull: true },
    apyBase: 'numeric',
    apyReward: 'numeric',
    poolMeta: 'text',
    underlyingTokens: { type: 'text[]', notNull: true },
    rewardTokens: { type: 'text[]', notNull: true },
    timestamp: { type: 'timestamptz', notNull: true },
    apyPct1D: 'numeric',
    apyPct7D: 'numeric',
    apyPct30D: 'numeric',
    stablecoin: { type: 'boolean', notNull: true },
    ilRisk: { type: 'text', notNull: true },
    exposure: { type: 'text', notNull: true },
    predictions: { type: 'jsonb', notNull: true },
    mu: { type: 'numeric', notNull: true },
    sigma: { type: 'numeric', notNull: true },
    count: { type: 'smallint', notNull: true },
    outlier: { type: 'boolean', notNull: true },
    return: { type: 'numeric', notNull: true },
    apyMeanExpanding: { type: 'numeric', notNull: true },
    apyStdExpanding: { type: 'numeric', notNull: true },
    chain_factorized: { type: 'smallint', notNull: true },
    project_factorized: { type: 'smallint', notNull: true },
  });
  pgm.createIndex('enriched', 'pool');
};
