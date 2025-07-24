const axios = require("axios");
const { utils: { getAddress } } = require("ethers");

const HOSTED_SDK_URL = "https://api-v2.pendle.finance/core/v1/";

async function callPendleSDK(
  path,
  params = {}
) {
  const response = await axios.get(HOSTED_SDK_URL + path, {
    params,
  });

  return response.data;
}

async function getFormattedActiveMarkets(chainId) {
  try {
    const data = await callPendleSDK(`${chainId}/markets/active`);

    if (!data) {
      throw new Error("Error fetching active markets:");
    }
    return data.markets?.reduce(
      (acc, currentValue) => {
        const pt = getAddress(currentValue.pt.split("-")[1]);

        acc[pt] = currentValue.details;

        return acc;
      },
      {}
    );
  } catch (error) {
    console.error("Error fetching vault data:", error);
    throw error;
  }
}

module.exports = {
  getFormattedActiveMarkets,
};