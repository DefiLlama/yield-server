CREATE MATERIALIZED VIEW volatility AS
WITH daily_apy AS (
    SELECT DISTINCT ON ("configID", timestamp::date)
        "configID",
        apy
    FROM yield
    WHERE "configID" IN (
        SELECT DISTINCT "configID"
        FROM yield
        WHERE timestamp >= NOW() - INTERVAL '7 DAY'
    )
    AND timestamp >= NOW() - INTERVAL '30 DAY'
    AND apy IS NOT NULL
    ORDER BY "configID", timestamp::date, timestamp DESC
)
SELECT
    "configID",
    AVG(apy) as apy_avg_30d,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY apy) as apy_median_30d,
    STDDEV_SAMP(apy) as apy_std_30d,
    CASE
        WHEN AVG(apy) = 0 THEN NULL
        ELSE STDDEV_SAMP(apy) / NULLIF(AVG(apy), 0)
    END as cv_30d
FROM daily_apy
GROUP BY "configID"
HAVING COUNT(*) >= 7  -- 7 days of daily data minimum for reliable std dev
WITH NO DATA;

CREATE UNIQUE INDEX ON volatility("configID");
