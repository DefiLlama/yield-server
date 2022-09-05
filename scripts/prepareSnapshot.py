import sys
import ast

import pandas as pd


def replaceFunc(x: str) -> str:
    if x == "[null]":
        return "[]"
    elif x == "[null,null]":
        return "[]"
    elif "null," in x:
        return x.replace("null,", "")
    elif ",null" in x:
        return x.replace(",null", "")
    else:
        return x


def prepare_snapshot(filename: str) -> None:
    df = pd.read_csv(f"{filename}")

    # correct none, null values in array
    df.loc[df["underlyingTokens"].notnull(), "underlyingTokens"] = df.loc[
        df["underlyingTokens"].notnull(), "underlyingTokens"
    ].apply(lambda x: replaceFunc(x) if "null" in x else x)

    # remove rows where all 3 apy fields are null
    df = df[
        ~((df["apy"].isnull()) & (df["apyReward"].isnull()) & (df["apyBase"].isnull()))
    ]

    # keep positive apy sum values only
    df = df[(df["apy"] >= 0) & (df["apy"] <= 1e6)]
    # tvl btw boundary values
    df = df[(df["tvlUsd"] >= 1000) & (df["tvlUsd"] <= 2e10)]

    # remove pools and project from exclusion list
    exclude_pools = [
        "0xf4bfe9b4ef01f27920e490cea87fe2642a8da18d",
        "DWmAv5wMun4AHxigbwuJygfmXBBe9WofXAtrMCRJExfb",
        "ripae-seth-weth-42161",
        "ripae-peth-weth-42161",
        "0x3eed430cd45c5e2b45aa1adc609cc77c6728d45b",
        "0x3c42B0f384D2912661C940d46cfFE1CD10F1c66F-ethereum",
        "0x165ab553871b1a6b3c706e15b6a7bb29a244b2f3",
    ]
    df = df[~df["pool"].isin(exclude_pools)]
    df = df[df["project"] != "koyo-finance"]

    # cast dtypes and round
    df["tvlUsd"] = df["tvlUsd"].astype(int)
    apy_columns = ["apy", "apyBase", "apyReward"]
    df[apy_columns] = df[apy_columns].round(5)

    # 1. hourly (for yield table)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(["pool", "timestamp"], ascending=True).reset_index(drop=True)
    f = "yield_snapshot"
    df.to_csv(f"{f}_hourly.csv", index=False)

    # 2. prepare daily (for stat)
    df_daily = (
        df.groupby(["pool", pd.Grouper(key="timestamp", freq="1D")])
        .last()
        .reset_index()
    )
    df_daily.to_json(f"{f}_daily.json", orient="records")

    # 3. prepare last (for config)
    df_last = (
        df_daily.sort_values(["pool", "timestamp"], ascending=True)
        .groupby("pool")
        .last()
        .reset_index()
    )
    # cast string to arrays
    func = lambda x: ast.literal_eval(x) if type(x) == str else x
    df_last["underlyingTokens"] = df_last["underlyingTokens"].apply(func)
    df_last["rewardTokens"] = df_last["rewardTokens"].apply(func)
    df_last.to_json(f"{f}_last.json", orient="records")


if __name__ == "__main__":
    prepare_snapshot(sys.argv[1])
