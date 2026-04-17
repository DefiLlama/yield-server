const tableName = 'token_metadata';

exports.up = (pgm) => {
  pgm.createTable(tableName, {
    chain: { type: 'text', notNull: true },
    address: { type: 'text', notNull: true },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    symbol: 'text',
    name: 'text',
    decimals: 'smallint',
    last_attempt_at: 'timestamptz',
  });

  pgm.createIndex(tableName, ['chain', 'address'], {
    unique: true,
  });

  pgm.createTrigger(tableName, 'update_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTable(tableName);
};
