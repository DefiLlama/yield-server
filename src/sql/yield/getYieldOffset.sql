-- retrieve the historical offset data for a every unique pool given an offset day (1d/7d/30d)
-- to calculate pct changes. allow some buffer (+/- 3hs) in case of missing data (via tsLB and tsUB)
SELECT
    DISTINCT ON (pool) pool,
    apy
FROM
    (
        SELECT
            y.pool,
            apy,
            abs(
                extract (
                    epoch
                    FROM
                        timestamp - (NOW() - INTERVAL '$<age> DAY')
                )
            ) AS abs_delta
        FROM
            yield AS y
            LEFT JOIN meta AS m ON m.pool = y.pool
        WHERE
            "tvlUsd" >= $<tvlLB>
            AND project = $<project>
            AND timestamp >= $<tsLB>
            AND timestamp <= $<tsUB>
    ) y
ORDER BY
    pool,
    abs_delta ASC