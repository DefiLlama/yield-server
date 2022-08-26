-- get latest yield row per unique pool id
-- exclude if tvlUsd is < LB
-- exclude if pool age > 7days
-- join meta data
-- NOTE: i use sqlformatter vscode extension. one issue i found is that it formats 
-- named parameter placeholders such as $<tvlLB> to $ < tvlLB > which is invalid and 
-- which pg-promise's internal formatter can't correct (at least i didn't find a way how to)
-- in order to get around this i'm using the formatter to generally format the query
-- but make sure to use cmd shift p -> save without formatting before pushing any changes to the repo
SELECT
    y.pool,
    symbol,
    chain,
    project,
    apy,
    "tvlUsd",
    "rewardTokens",
    "underlyingTokens",
    "poolMeta"
FROM
    (
        SELECT
            DISTINCT ON (pool) *
        FROM
            yield
        WHERE
            "tvlUsd" >= $<tvlLB>
            AND timestamp >= NOW() - INTERVAL '$<age> DAY'
        ORDER BY
            pool,
            timestamp DESC
    ) AS y
    LEFT JOIN meta AS m ON y.pool = m.pool