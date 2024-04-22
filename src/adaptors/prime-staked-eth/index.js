const axios = require('axios');

const apy = async () => {

    const { data } = await axios.get("https://api.originprotocol.com/api/v2/primestaked");

    const primeStaked = {
        pool: "0x6ef3D766Dfe02Dc4bF04aAe9122EB9A0Ded25615-ethereum".toLowerCase(),
        chain: "Ethereum",
        project: "prime-staked-eth",
        symbol: "primeETH",
        apy: data.apy,
        tvlUsd: data.tvlUsd,
        underlyingTokens: [
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "0x0000000000000000000000000000000000000000",
            "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3",
        ]
    }

    return [primeStaked];
};
module.exports = {
    timetravel: false,
    apy,
    url: "https://www.primestaked.com",
}