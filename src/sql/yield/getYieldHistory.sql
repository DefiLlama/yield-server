SELECT
    timestamp,
    "tvlUsd",
    "apy"
FROM
    yield
WHERE
    timestamp IN (
        SELECT
            max(timestamp)
        FROM
            yield
        WHERE
            pool = $<poolValue>
        GROUP BY
            (timestamp :: date)
    )
    AND pool = $<poolValue>
ORDER BY
    timestamp ASC