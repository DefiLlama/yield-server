const { default: axios } = require('axios');

async function getPxGMXApr() {
    const response = await axios.get(
              'https://pirex.io/_next/data/33VnMjJ28usC4n5WCEd0z/vaults.json',

    );
    const apr = parseFloat(response.data.pageProps.apy.pxGMX);

    return apr;
}

module.exports = { getPxGMXApr };

