import sys

import pandas as pd


def trim(filename: str) -> None:
    # this script reduces hourly data to daily data (latest value per pool based on timestamp)
    # note: i didn't manage to run this directly on db server, hence the script
    df = pd.read_csv(f"{filename}")
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(["pool", "timestamp"]).reset_index(drop=True)
    (
        df.groupby(["pool", pd.Grouper(key="timestamp", freq="1D")])
        .last()
        .reset_index()
        .drop(columns=["timestamp"])
        .to_json(f"{filename.split('.')[0]}_daily.json", orient="records")
    )


if __name__ == "__main__":
    trim(sys.argv[1])
