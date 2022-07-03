const { DataPipeline } = require("aws-sdk");
const axios = require("axios");
const utils = require('../utils');

const baseUrl = "https://api-v1.verocket.com";
const urlApy = `${baseUrl}/apy`
const tvlApy = `${baseUrl}/dex/overall/lp_volume`

const apy = async () => {
  const response = (await axios.get(urlApy)).data.data;

  // create a custom object with pool address as the key
  var apyObject = {}
  response.forEach(el => {
    apyObject[el.pool] = el;
  });

  return apyObject
}

const tvl = async (data) => {
  const response = (await axios.get(tvlApy)).data.data;

  eq_vet = 0

  response.forEach(el => {
    eq_vet += Number(el.eq_vet);
    el.items.forEach(item => {
      if ("tvl_vet" in data[item.pool]) {
        data[item.pool].tvl_vet += Number(item.eq_vet);
      } else {
        data[item.pool].tvl_vet = Number(item.eq_vet);
      }
    });
  });

  console.log(eq_vet);
  return data
}

const main = async () => {
  // pull apy data
  data = await apy();

  // pull tvl data and merge it with apy data object
  // data = await tvl(data);

  const response = (await axios.get("https://api-v1.verocket.com/pool/lp_volume/0x58108ba70902869f42eb12c5fdbc0cefab0ad13d")).data.data;
  lp = 0;
  response.forEach(el => {
   lp += Number(el.eq_vet);
  })
  console.log(lp);

  // console.log(data, Object.keys(data).length);
}

main()