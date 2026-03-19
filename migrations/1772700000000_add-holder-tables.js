const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  // Holder snapshots — daily time series of holder metrics per pool
  pgm.createTable('holder_daily', {
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
  });
  pgm.createIndex('holder_daily', ['configID', { name: 'timestamp', sort: 'DESC' }], { unique: true });
  pgm.createIndex('holder_daily', ['timestamp', 'configID'], { name: 'idx_holder_daily_timestamp_configid' });
};

exports.down = (pgm) => {
  pgm.dropTable('holder_daily');
};
