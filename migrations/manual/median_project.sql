CREATE TABLE IF NOT EXISTS median_project (
    project text NOT NULL,
    timestamp timestamp NOT NULL,
    "uniquePools" numeric NOT NULL,
    "medianAPY" numeric NOT NULL
);

CREATE INDEX IF NOT EXISTS median_project_idx ON median_project (project);