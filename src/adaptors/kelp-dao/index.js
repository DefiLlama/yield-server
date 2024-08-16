const sdk = require('@defillama/sdk');

const utils = require('../utils');

async function getTokenPrice(chain, token) {
    const data = await utils.getData(
        `https://coins.llama.fi/prices/current/${chain}:${token}`
    );
    return data.coins[`${chain}:${token}`]?.price;
}

const rsETH = '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7';
const DEPOSIT_POOL = "0x036676389e48133B63a802f8635AD39E752D375D";
const apy = async () => {
    const apy = (await utils.getData('https://universe.kelpdao.xyz/rseth/apy')).value;
    const config = (await sdk.api.abi.call({ abi: 'address:lrtConfig', target: DEPOSIT_POOL })).output;
    const tokens = (await sdk.api.abi.call({ abi: 'address[]:getSupportedAssetList', target: config })).output;

    let tvlUsd = 0;
    for (let token of tokens) {
        const balance = (await sdk.api.abi.call({
            abi: 'function getTotalAssetDeposits(address) external view returns (uint)',
            params: [token],
            target: DEPOSIT_POOL,
        })).output;

        let decimals = 18;
        if (token !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
            decimals = (await sdk.api.abi.call({
                abi: 'erc20:decimals',
                target: token,
            })).output;
        }

        const tokenPrice = await getTokenPrice("ethereum", token);
        tvlUsd += balance * tokenPrice / 10 ** decimals;
    }

    return [{
        pool: `${rsETH}-ethereum`.toLowerCase(),
        chain: "Ethereum",
        project: "kelp-dao",
        symbol: "rsETH",
        underlyingTokens: tokens,
        tvlUsd,
        apy,
    }];
};

module.exports = {
    timetravel: false,
    apy,
    url: 'https://kelpdao.xyz/'
}