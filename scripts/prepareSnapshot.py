import sys
import ast

import pandas as pd


def trim(filename: str) -> None:
    # this script reduces hourly data to daily data (latest value per pool based on timestamp)
    # note: i didn't manage to run this directly on mongodb server, hence the script
    df = pd.read_csv(f"{filename}")
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    # lb filters, type casting, rounding
    df = df[(df["apy"] >= 0) & (df["apy"] <= 1e6) & (df["tvlUsd"] >= 1e3)]
    df["tvlUsd"] = df["tvlUsd"].astype(int)
    apy_columns = ["apy", "apyBase", "apyReward"]
    df[apy_columns] = df[apy_columns].round(5)

    # hourly (for yield table)
    df = df.sort_values(["pool", "timestamp"], ascending=True).reset_index(drop=True)
    f = "yield_snapshot"
    df.to_csv(f"{f}_hourly.csv", index=False)

    # prepare daily
    df_daily = (
        df.groupby(["pool", pd.Grouper(key="timestamp", freq="1D")])
        .last()
        .reset_index()
    )
    df_daily.to_json(f"{f}_daily.json", orient="records")

    # prepare last
    df_last = (
        df_daily.sort_values(["pool", "timestamp"], ascending=True)
        .groupby("pool")
        .last()
        .reset_index()
    )
    f = lambda x: ast.literal_eval(x) if type(x) == str else x
    df_last["underlyingTokens"] = df_last["underlyingTokens"].apply(f)
    df_last["rewardTokens"] = df_last["rewardTokens"].apply(f)
    df_last.to_json(f"{f}_last.json", orient="records")


if __name__ == "__main__":
    trim(sys.argv[1])
