CREATE TABLE IF NOT EXISTS lsd (
    timestamp timestamp NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    address text NOT NULL,
    type text,
    "expectedRate" numeric,
    "marketRate" numeric,
    "ethPeg" numeric
);

CREATE INDEX IF NOT EXISTS lsd_address_timestamp_idx ON lsd (address, timestamp DESC);