-- used for fetching latest apy values per pool with min tvl filter
CREATE INDEX concurrently yield_cfg_ts_desc_high_tvl_idx
ON yield ("configID", timestamp DESC)
INCLUDE ("tvlUsd")
WHERE "tvlUsd" >= 10000;


-- used by avg N day query
CREATE INDEX CONCURRENTLY yield_ts_cfg_idx
ON yield (timestamp DESC, "configID")
INCLUDE (apy);