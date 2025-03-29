const axios = require("axios")

async function apy() {
  const response = await axios.get('https://api.multipli.fi/multipli/v1/external-aggregator/defillama/yield/')

  const data = response.data.payload

  return data
}


module.exports = {
  apy,
  url: 'https://www.multipli.fi/',
};