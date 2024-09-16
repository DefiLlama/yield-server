const utils = require('../utils');

const GRAPHQL_ENDPOINT = 'https://api5.storm.tg/graphql';


const getVault = async (address, price, symbol, token) => {
    console.log("Requesting vault " + address)
    const vault = (await utils.getData(GRAPHQL_ENDPOINT, {
        query: `
        query {
  vault(address: "${address}") {
    freeBalance
    config {
      asset {
        name
        decimals
      }
    }
    APR {
      rateAPR
    }
  }
}`
    })).data.vault;
    console.log(vault);
    return {
        pool: `${address}-ton`.toLowerCase(),
        chain: 'Ton',
        project: 'storm-trade',
        symbol: symbol,
        tvlUsd: vault.freeBalance / 1e9 * price,
        apyBase: Number(vault.APR.rateAPR),
        underlyingTokens: [token],
        url: `https://app.storm.tg/vault/${symbol}`
    }
}


const getApr = async () => {
    console.log("Requesting vaults list")
    const TON = 'ton:EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
    const NOT = 'ton:EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT';
    const price = async (token) => (await utils.getData(`https://coins.llama.fi/prices/current/${token}`)).coins[token].price;
    const ton_price = await price(TON);

    return [
        await getVault('0:33e9e84d7cbefff0d23b395875420e3a1ecb82e241692be89c7ea2bd27716b77', 1,
            'USDT', 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'),
        await getVault('0:e926764ff3d272c73ddeb836975c5521c025ad68e7919a25094e2de3198805f1', await price(TON),
            'TON', 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
        await getVault('0:06f3f073c255a49aa6fdcc89abf512638e065908b30e4173fd3d1d01d4f607bd', await price(NOT),
            'NOT', 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT')
    ];
};

module.exports = {
    timetravel: false,
    apy: getApr,
    url: 'https://storm.tg/',
};
