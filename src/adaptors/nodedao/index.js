const sdk = require('@defillama/sdk3');
const axios = require('axios');
const abiStakingPool = require('./abiStakingPool');

const filHubPool = '0xfeB16A48dbBB0E637F68215b19B4DF5b12449676';
const sdkChain = 'filecoin';
const url = 'https://www.nodedao.com/';

const ethStakingPool = '0x8103151E2377e78C04a3d2564e20542680ed3096';
const ethSdkChain = 'ethereum';


const getApy = async () => {
    // <- Ethereum ->
    const ethererumApyResponse = await axios.get(`https://neth.kinghash.com/neth/apr`)
    const ethererumAPY = ethererumApyResponse && ethererumApyResponse.data && ethererumApyResponse.data.data && ethererumApyResponse.data.data.ethApr
    const ethPriceKey = `coingecko:ethereum`;
    const ethPrice = (
        await axios.get(`https://coins.llama.fi/prices/current/${ethPriceKey}`)
    ).data.coins[ethPriceKey]?.price;

    const totalEthValue = await sdk.api2.abi.call({  abi: 'uint256:getTotalEthValue', target: ethStakingPool })

    const totalEthDecimal = totalEthValue / 1e18;

    const ethTvlUsd = totalEthDecimal * ethPrice;

    const ethereumAPY = {
        pool: `${ethStakingPool}-${ethSdkChain}`, // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
        chain: `${ethSdkChain}`, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
        project: 'nodedao', // protocol (using the slug again)
        symbol: "ETH", // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
        tvlUsd: ethTvlUsd, // number representing current USD TVL in pool
        apyBase: parseFloat(ethererumAPY), // APY from pool fees/supplying in %
        url,
    };

    return [
        ethereumAPY
    ]
}

module.exports = {
    apy: getApy,
};



