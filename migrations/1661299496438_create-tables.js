const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  // add uuid extension
  pgm.createExtension('uuid-ossp', {
    ifNotExists: true,
  });
  // tables
  pgm.createTable('yield', {
    pool_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    pool: { type: 'text', notNull: true },
    timestamp: { type: 'timestamptz', notNull: true },
    tvlUsd: { type: 'numeric', notNull: true },
    apy: 'numeric',
    apyBase: 'numeric',
    apyReward: 'numeric',
  });
  pgm.createTable('meta', {
    meta_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    pool: { type: 'text', notNull: true, unique: true },
    project: { type: 'text', notNull: true },
    chain: { type: 'text', notNull: true },
    symbol: { type: 'text', notNull: true },
    poolMeta: 'text',
    underlyingTokens: { type: 'text[]' },
    rewardTokens: { type: 'text[]' },
    updatedAt: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.createTable('stat', {
    stat_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    pool: { type: 'text', notNull: true, unique: true },
    count: { type: 'integer', notNull: true },
    meanAPY: { type: 'numeric', notNull: true },
    mean2APY: 'numeric',
    meanDR: { type: 'numeric', notNull: true },
    mean2DR: 'numeric',
    productDR: { type: 'numeric', notNull: true },
    updatedAt: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.createTable('median', {
    median_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    uniquePools: { type: 'integer', notNull: true },
    medianAPY: { type: 'numeric', notNull: true },
    timestamp: { type: 'timestamptz', notNull: true },
  });
  pgm.createTable('url', {
    url_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    project: { type: 'text', notNull: true, unique: true },
    url: { type: 'text', notNull: true },
    updatedAt: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.createIndex('yield', 'pool ASC,timestamp DESC');
  pgm.createIndex('meta', 'pool');
  pgm.createIndex('stat', 'pool');
  pgm.createIndex('median', 'timestamp');
  pgm.createIndex('url', 'project');
};
