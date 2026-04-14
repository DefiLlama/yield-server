const { PgLiteral } = require('node-pg-migrate');

exports.up = (pgm) => {
  // ── canary_position ───────────────────────────────────────────────────────
  // One row per deposited position. Tracks lifecycle from deposit to withdrawal.
  pgm.createTable('canary_position', {
    canary_position_id: {
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
    chain: { type: 'text', notNull: true },
    protocol: { type: 'text', notNull: true },
    wallet_address: { type: 'text', notNull: true },
    vault_address: { type: 'text', notNull: true },
    receipt_token: 'text',
    deposit_token: { type: 'text', notNull: true },
    deposit_token_symbol: { type: 'text', notNull: true },
    deposit_token_decimals: { type: 'smallint', notNull: true },
    detected_type: { type: 'text', notNull: true },

    // Entry state
    deposit_amount: { type: 'numeric', notNull: true },
    deposit_amount_usd: { type: 'numeric', notNull: true },
    shares_received: 'numeric',
    entry_share_price: 'numeric',
    entry_balance: 'numeric',
    entry_fee_pct: { type: 'numeric', default: 0 },

    // Gas costs (no separate table — manual deposits have 1-2 txs)
    deposit_gas_cost_usd: { type: 'numeric', default: 0 },
    withdraw_gas_cost_usd: { type: 'numeric', default: 0 },

    // Lifecycle
    status: { type: 'text', notNull: true, default: "'active'" },
    deposited_at: { type: 'timestamptz', notNull: true },
    closed_at: 'timestamptz',

    // Withdrawal
    withdrawn_amount: 'numeric',
    exit_fee_pct: 'numeric',
    withdrawal_tested: { type: 'boolean', default: false },
    withdrawal_success: 'boolean',
    withdrawal_tested_at: 'timestamptz',
    deposit_tx_hash: 'text',
    withdraw_tx_hash: 'text',

    // Health monitoring (detects $0 balance, frozen vaults, etc.)
    health_status: { type: 'text', notNull: true, default: "'healthy'" },
    health_reason: 'text',

    // Config
    reward_config: 'jsonb',

    // Fast latest-snapshot lookup (updated on each snapshot insert)
    latest_snapshot_at: 'timestamptz',

    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.addConstraint('canary_position', 'canary_position_status_check', {
    check: "status IN ('pending', 'active', 'closed', 'error')",
  });
  pgm.addConstraint('canary_position', 'canary_position_health_status_check', {
    check: "health_status IN ('healthy', 'warning', 'critical', 'unknown')",
  });
  pgm.createIndex('canary_position', ['configID']);
  pgm.createIndex('canary_position', ['status']);

  // ── canary_snapshot ───────────────────────────────────────────────────────
  // Append-only time-series of position state.
  // bigserial PK for better index locality at millions of rows.
  pgm.createTable('canary_snapshot', {
    canary_snapshot_id: { type: 'bigserial', primaryKey: true },
    position_id: {
      type: 'uuid',
      notNull: true,
      references: '"canary_position"',
      onDelete: 'cascade',
    },
    timestamp: { type: 'timestamptz', notNull: true },
    share_balance: { type: 'numeric', notNull: true },
    share_price: { type: 'numeric', notNull: true },
    underlying_balance: { type: 'numeric', notNull: true },
    position_value_usd: { type: 'numeric', notNull: true },
    token_price_usd: { type: 'numeric', notNull: true },
    on_chain_rate_apy: 'numeric',
    on_chain_rate_source: 'text',
    rewards: 'jsonb',
  });

  pgm.createIndex(
    'canary_snapshot',
    [{ name: 'position_id' }, { name: 'timestamp', sort: 'DESC' }],
    { unique: true }
  );
  pgm.createIndex('canary_snapshot', ['timestamp']);

  // ── canary_return ─────────────────────────────────────────────────────────
  // Pre-computed returns per position per time window. Upserted after each snapshot.
  pgm.createTable('canary_return', {
    canary_return_id: {
      type: 'uuid',
      default: new PgLiteral('uuid_generate_v4()'),
      primaryKey: true,
    },
    position_id: {
      type: 'uuid',
      notNull: true,
      references: '"canary_position"',
      onDelete: 'cascade',
    },
    configID: {
      type: 'uuid',
      notNull: true,
      references: '"config"',
      onDelete: 'cascade',
    },
    timestamp: { type: 'timestamptz', notNull: true },
    time_window: { type: 'text', notNull: true },
    days_elapsed: { type: 'numeric', notNull: true },

    // Actual returns (measured from deposits — unique to canary)
    actual_base_roi: 'numeric',
    actual_reward_roi: 'numeric',
    actual_gross_roi: 'numeric',
    actual_base_apy: 'numeric',
    actual_reward_apy: 'numeric',
    actual_total_apy: 'numeric',

    // Net returns (after gas + entry fees)
    net_roi: 'numeric',
    net_apy: 'numeric',

    // Deviations (actual vs reported from yield table, actual vs on-chain contract rate)
    deviation_total_pct: 'numeric',
    deviation_base_pct: 'numeric',
    deviation_vs_onchain: 'numeric',

    // Status (OK/WATCH/FLAG)
    status: 'text',
  });

  pgm.addConstraint('canary_return', 'canary_return_time_window_check', {
    check: "time_window IN ('24h', '7d', '30d', '90d', 'inception')",
  });
  pgm.addConstraint('canary_return', 'canary_return_status_check', {
    check: "status IN ('OK', 'WATCH', 'FLAG')",
  });
  pgm.createIndex('canary_return', ['position_id', 'time_window'], {
    unique: true,
  });
  pgm.createIndex('canary_return', ['configID', 'time_window']);
};

exports.down = (pgm) => {
  pgm.dropTable('canary_return');
  pgm.dropTable('canary_snapshot');
  pgm.dropTable('canary_position');
};
