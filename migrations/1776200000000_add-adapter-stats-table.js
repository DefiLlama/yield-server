exports.up = (pgm) => {
  pgm.createTable('adapter_stats', {
    adapter: {
      type: 'text',
      primaryKey: true,
    },
    last_run_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    last_duration_ms: {
      type: 'integer',
      notNull: true,
    },
    last_status: {
      type: 'text',
      notNull: true,
    },
    last_error: 'text',
  });
};
