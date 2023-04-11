const superagent = require('superagent');
const { getProvider } = require('@defillama/sdk/build/general');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');

const { vaultRegistry, rootVault } = require('./abi');

const config = {
    ethereum: {
        registry: '0xfd23f971696576331fcf96f80a20b4d3b31ca5b2',
        fromBlock: 15237714,
        name: 'ethereum'
    },
    polygon: {
        registry: '0xd3d0e85f225348a2006270daf624d8c46cae4e1f',
        fromBlock: 31243728,
        name: 'polygon'
    }
}

const getPrices = async (addresses) => {

    const prices = (
        await superagent.post('https://coins.llama.fi/prices').send({
        coins: addresses,
        })
    ).body.coins;

    const pricesByAddress = Object.entries(prices).reduce(
        (acc, [name, price]) => ({
        ...acc,
        [name.split(':')[1]]: price.price,
        }),
        {}
    );

    return pricesByAddress;
};

const getTvl = async(tvl, tokens, prices, decimals) => {
    if (tvl === null) {
        return 0;
    }
    const minTvl = tvl[0];
    let result = 0;

    for (let i = 0; i < tokens.length; ++i) {
        result += minTvl[i] * prices[String(tokens[i]).toLowerCase()] / 10**decimals[tokens[i]];
    }

    return result;

}

const poolsFunction = async () => {

    const abiA = ["event TokenLocked(address indexed origin, address indexed sender, uint256 indexed nft)"];
    const abiB = ["event VaultRegistered(address indexed origin, address indexed sender, uint256 indexed nft, address vault, address owner)"];
  
    for (let chain in config) {

        const registry = config[chain].registry;
        const name = config[chain].name;

        const provider = getProvider(name);
        let contract = new ethers.Contract(registry, abiB, provider);
        const registered = await contract.queryFilter(contract.filters.VaultRegistered(), config[chain].fromBlock);

        const vaultKeys = {};
        registered.forEach(i => vaultKeys[i.args.nft] = i.args.vault);

        contract = new ethers.Contract(registry, abiA, provider);
        const locked = await contract.queryFilter(contract.filters.TokenLocked(), config[chain].fromBlock);
        locked.forEach(i => delete vaultKeys[i.args.nft]);

        const vaults = Object.values(vaultKeys);
        const allTokens = new Set();

        calls = [];
        vaults.forEach(element => {
            calls.push({target: element, params: []});
        })

        const tokens = await sdk.api.abi.multiCall({
            calls: calls,
            abi: rootVault.find(({ name }) => name === 'vaultTokens'),
            name
        });

        tokens.output.forEach(tokensI => {
            tokensI.output.forEach(token => {
                allTokens.add(token);
            })
        })

        const allTokensArr = [];
        Array.from(allTokens.values()).forEach(element => {
            allTokensArr.push(name + ':' + element);
        })

        const prices = await getPrices(allTokensArr);
        const decimals = await sdk.api.abi.multiCall({
            abi: 'erc20:decimals',
            calls: Array.from(allTokens.values()).map((token) => ({ target: token })), 
            chain: name,
        });

        const tvls = await sdk.api.abi.multiCall({
            calls: calls,
            abi: rootVault.find(({ name }) => name === 'tvl'),
            name
        });

        let decimalsKTV = {};
        for (let i = 0; i < Array.from(allTokens.values()).length; ++i) {
            decimalsKTV[Array.from(allTokens.values())[i]] = decimals.output[i].output;
        }

        for (let i = 0; i < tokens.output.length; ++i) {
            let tvlUsd = await getTvl(tvls.output[i].output, tokens.output[i].output, prices, decimalsKTV);
            if (tvlUsd < 10000) {
                continue;
            }
            console.log(vaults[i]);
        }

    }

};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.mellow.finance/products',
};
