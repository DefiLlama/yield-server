const { pgp, connect } = require('../utils/dbConnection');

const table = 'token_metadata';
const RETRY_COOLDOWN_DAYS = 7;

const getPendingTokenMetadataCandidates = async (lookbackDays = 7) => {
  const conn = await connect();

  const query = `
    WITH recent_config AS (
      SELECT
        chain,
        lower(token) AS token,
        "underlyingTokens"
      FROM config
      WHERE updated_at >= NOW() - ($<lookbackDays> * INTERVAL '1 day')
    ),
    candidate_tokens AS (
      SELECT
        chain,
        token AS address,
        true AS fetch_name
      FROM recent_config
      WHERE token IS NOT NULL

      UNION

      SELECT
        rc.chain,
        lower(ut.address) AS address,
        false AS fetch_name
      FROM recent_config rc
      CROSS JOIN LATERAL unnest(
        COALESCE(rc."underlyingTokens", ARRAY[]::text[])
      ) AS ut(address)
    ),
    deduped AS (
      SELECT
        chain,
        address,
        bool_or(fetch_name) AS fetch_name
      FROM candidate_tokens
      WHERE address ~ '^0x[0-9a-f]{40}$'
        AND address <> '0x0000000000000000000000000000000000000000'
      GROUP BY chain, address
    )
    SELECT
      d.chain,
      d.address,
      d.fetch_name
    FROM deduped d
    LEFT JOIN token_metadata tm
      ON tm.chain = d.chain
     AND tm.address = d.address
    WHERE tm.address IS NULL
       OR (
         tm.symbol IS NULL
         AND tm.decimals IS NULL
         AND (
           tm.last_attempt_at IS NULL
           OR tm.last_attempt_at < NOW() - (${RETRY_COOLDOWN_DAYS} * INTERVAL '1 day')
       )
       )
    ORDER BY d.chain, d.address
  `;

  return conn.query(query, { lookbackDays });
};

const upsertTokenMetadata = async (payload) => {
  const rows = Array.isArray(payload) ? payload : [payload];
  if (!rows.length) return;

  const conn = await connect();
  const columns = [
    'chain',
    'address',
    { name: 'symbol', def: null },
    { name: 'name', def: null },
    { name: 'decimals', def: null },
    { name: 'last_attempt_at', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table });
  const query =
    pgp.helpers.insert(rows, cs) +
    ' ON CONFLICT(chain, address) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: ['chain', 'address'] });

  return conn.query(query);
};

module.exports = {
  getPendingTokenMetadataCandidates,
  upsertTokenMetadata,
};
