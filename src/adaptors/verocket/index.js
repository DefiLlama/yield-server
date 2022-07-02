const axios = require("axios");
const utils = require('../utils');

const baseUrl = "https://api-v1.verocket.com";
const urlApy = `${baseUrl}/apy`
const tvlApy = `${baseUrl}/dex/overall/lp_volume`

const apy = async () => {
  const response = (await axios.get(urlApy)).data;
  return response
}

apy()