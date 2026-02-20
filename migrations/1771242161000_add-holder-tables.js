const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  // Holder snapshots — daily time series of holder metrics per pool
  pgm.createTable('holder', {
    holder_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    configID: {
      type: 'uuid',
      notNull: true,
      references: '"config"',
      onDelete: 'cascade',
    },
    timestamp: { type: 'timestamptz', notNull: true },
    holderCount: 'integer',
    avgPositionUsd: 'numeric',
    top10Pct: 'numeric',
    top10Holders: 'jsonb',
    medianPositionUsd: 'numeric',
  });
  pgm.createIndex('holder', ['configID', 'timestamp'], { unique: true });

  // Holder processing state — tracks last-processed block + balance map per pool
  pgm.createTable('holder_state', {
    configID: {
      type: 'uuid',
      primaryKey: true,
      references: '"config"',
      onDelete: 'cascade',
    },
    lastBlock: { type: 'bigint', notNull: true },
    balanceMap: { type: 'jsonb', notNull: true },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('holder_state');
  pgm.dropTable('holder');
};
