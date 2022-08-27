const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  // EXTENSION
  pgm.createExtension('uuid-ossp', {
    ifNotExists: true,
  });
  // TABLES
  pgm.createTable('yield', {
    pool_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    pool: { type: 'text', notNull: true },
    timestamp: { type: 'timestamptz', notNull: true },
    tvlUsd: { type: 'bigint', notNull: true },
    apy: { type: 'numeric', notNull: true },
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
    updated_at: {
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
    count: { type: 'smallint', notNull: true },
    meanAPY: { type: 'numeric', notNull: true },
    mean2APY: 'numeric',
    meanDR: { type: 'numeric', notNull: true },
    mean2DR: 'numeric',
    productDR: { type: 'numeric', notNull: true },
    updated_at: {
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
    timestamp: { type: 'timestamptz', notNull: true, unique: true },
  });
  pgm.createTable('url', {
    url_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    project: { type: 'text', notNull: true, unique: true },
    link: { type: 'text', notNull: true },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  // INDICES
  pgm.createIndex('yield', 'pool ASC,timestamp DESC');
  // FUNCTIONS
  pgm.createFunction(
    'update_updated_at',
    [], // no params
    // options
    {
      language: 'plpgsql',
      returns: 'TRIGGER',
      replace: true,
    },
    // function body
    `
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END
    `
  );
  // TRIGGERS;
  pgm.createTrigger('meta', 'update_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at',
    level: 'ROW',
  });
  pgm.createTrigger('stat', 'update_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at',
    level: 'ROW',
  });
  pgm.createTrigger('url', 'update_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at',
    level: 'ROW',
  });
};
