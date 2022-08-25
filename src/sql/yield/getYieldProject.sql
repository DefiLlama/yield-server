-- get latest yield row per unique pool id for a specific project
-- exclude if tvlUsd is < LB
-- exclude if pool age > 7days
-- join meta data
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
            pool IN (
                SELECT
                    *
                FROM
                    (
                        SELECT
                            DISTINCT (pool)
                        FROM
                            meta
                        WHERE
                            "project" = $<project>
                    ) AS m
            )
            AND "tvlUsd" >= $<tvlLB>
            AND timestamp >= NOW() - INTERVAL '$<age> DAY'
        ORDER BY
            pool,
            timestamp DESC
    ) AS y
    LEFT JOIN meta AS m ON y.pool = m.pool