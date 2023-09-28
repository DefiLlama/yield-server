const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  pgm.createTable('perpetual', {
    perp_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    timestamp: {
      type: 'timestamptz',
      notNull: true,
    },
    marketPlace: { type: 'string', notNull: true },
    market: { type: 'string', notNull: true },
    baseAsset: { type: 'string', notNull: true },
    fundingRate: { type: 'numeric', notNull: true },
    openInterest: { type: 'numeric', notNull: true },
    indexPrice: { type: 'numeric', notNull: true },
  });
};
