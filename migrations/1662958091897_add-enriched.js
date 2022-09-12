const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  // --- enriched
  // table with enriched columns such as stablecoin, ilRisk, exposure, ML predictions etc.
  pgm.createTable('enriched', {
    enriched_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    // configID is a FK in this table and references the PK (config_id) in config
    configID: {
      type: 'uuid',
      notNull: true,
      references: '"config"',
      onDelete: 'cascade',
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    apyPct1D: 'numeric',
    apyPct7D: 'numeric',
    apyPct30D: 'numeric',
    stablecoin: { type: 'boolean', notNull: true },
    ilRisk: { type: 'text', notNull: true },
    exposure: { type: 'text', notNull: true },
    mu: { type: 'numeric', notNull: true },
    sigma: { type: 'numeric', notNull: true },
    outlier: { type: 'boolean', notNull: true },
    predictedClass: 'text',
    predictedProbability: 'smallint',
    binnedConfidence: 'smallint',
  });
};
