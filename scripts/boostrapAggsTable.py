import boto3
import requests
import pandas as pd
from botocore.config import Config


def aggregate() -> pd.DataFrame:
    # exported database snapshot as csv
    df = pd.read_csv("pools.csv")

    # reduce to daily values (keeping latest row on a given day)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(["timestamp", "pool"])
    df = (  
        df.groupby(["pool", pd.Grouper(key="timestamp", freq="D")]).last().reset_index()
    )
    df = df.dropna()
    df = df[["timestamp", "apy", "pool"]]

    # scale to pct and calc geometric mean of returns and std
    T = 365
    df["return"] = (1 + (df["apy"] / 100)) ** (1 / T) - 1

    # for the table we require:
    # 1) product of returns
    # 2) the count
    # 3) the mean
    # 4) mean2 (see welfords algorithm)
    def aggr(group) -> pd.Series:
        return pd.Series(
            {
                "count": group["return"].count(),
                "mean": group["return"].mean(),
                "mean2": group["return"].var() * (len(group) - 1)
                if len(group) > 1
                else 0,
                "returnProduct": (1 + group["return"]).prod(),
            }
        )

    agg = df.groupby("pool").apply(aggr).reset_index()

    return agg


def save_to_table(agg: pd.DataFrame):

    # set profile
    boto3.setup_default_session(profile_name="defillama")
    my_config = Config(region_name="eu-central-1")

    # get bearer token required for post request
    ssm = boto3.client("ssm", config=my_config)
    ssm_bearertoken = "/llama-apy/serverless/sls-authenticate/bearertoken"
    token = ssm.get_parameter(Name=ssm_bearertoken, WithDecryption=True)
    bearer_token = token["Parameter"]["Value"]

    # make post request
    h = {"Authorization": f"Bearer {bearer_token}"}
    urlBase = "https://1rwmj4tky9.execute-api.eu-central-1.amazonaws.com"
    data = agg.to_dict(orient="records")

    r = requests.post(f"{urlBase}/aggregations", json=data, headers=h)
    r = r.json()

    print(
        f"""
        status: {r['status']}
        nUpserted: {r['response']['nUpserted']}
        nMatched: {r['response']['nMatched']}
        nModified: { r['response']['nModified']}
        """
    )


if __name__ == "__main__":
    df_agg = aggregate()
    save_to_table(df_agg)
