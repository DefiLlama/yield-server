const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');

const { vaultRegistry, rootVault, farm } = require('./abi');

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

const getPrices = async (addresses, timestamp) => {

    let request = 'https://coins.llama.fi/prices/historical/' + timestamp + '/';
    addresses.forEach(address => {
        request = request + address + ','
    });

    const prices = (
        await axios.get(request.substr(0, request.length - 1))).data.coins;

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
        result += minTvl[i] * prices[String(tokens[i])] / 10**decimals[tokens[i]];
    }

    return result;

}

const transformLink = (link) => {
    
    let i = 0;
    while (link[i] != 'v' || link[i + 1] != '2' || link[i + 2] != '/') {
        i += 1;
    }

    return link.substr(i + 3, link.length);

}

const poolsFunction = async () => {

    const abiA = ["event TokenLocked(address indexed origin, address indexed sender, uint256 indexed nft)"];
    const abiB = ["event VaultRegistered(address indexed origin, address indexed sender, uint256 indexed nft, address vault, address owner)"];

    const rewardMap = {};
    rewardMap['0x13c7bCc2126d6892eEFd489Ad215A1a09F36AA9f'] = '0xbfafc964361f78754f523343b09b3cb7bb73bdd6';
    rewardMap['0x6A2Dd3B817F0364e7603e781dDA9c62f62c440E1'] = '0x0fd566cda6d6a3ae1760e1eebd22ee400cc79655';
    rewardMap['0x8E024f875f6fDdf1471582bed8504F46CB64487E'] = '0x6955ab1adefa2e48f449b88183a2774a186b7e61';

    const ldo = '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32';

    let pools = [];
  
    for (let chain in config) {

        const registry = config[chain].registry;
        const name = config[chain].name;
        
        let provider = new ethers.providers.AlchemyProvider(
            name == 'ethereum' ? 'homestead' : 'matic',
            transformLink(process.env.ALCHEMY_CONNECTION_ETHEREUM)
        );

        let contract = new ethers.Contract(registry, abiB, provider);
        const registered = await contract.queryFilter(contract.filters.VaultRegistered(), config[chain].fromBlock);
        
        const vaultKeys = {};
        const blockKeys = {};

        registered.forEach(i => vaultKeys[i.args.nft] = i.args.vault);
        registered.forEach(i => blockKeys[i.args.vault] = i.blockNumber);

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
            chain: name,
            permitFailure: true
        });

        tokens.output.forEach(tokensI => {
            tokensI.output.forEach(token => {
                allTokens.add(token);
            })
        });

        allTokens.add(ldo);

        const allTokensArr = [];
        Array.from(allTokens.values()).forEach(element => {
            allTokensArr.push(name + ':' + element);
        })

        const currentTimestamp = (await provider.getBlock(await provider.getBlockNumber())).timestamp;

        const prices = await getPrices(allTokensArr, currentTimestamp);

        const decimals = await sdk.api.abi.multiCall({
            abi: 'erc20:decimals',
            calls: Array.from(allTokens.values()).map((token) => ({ target: token })), 
            chain: name,
            permitFailure: true
        });

        const symbols = await sdk.api.abi.multiCall({
            abi: 'erc20:symbol',
            calls: Array.from(allTokens.values()).map((token) => ({ target: token })), 
            chain: name,
            permitFailure: true
        });

        const tvls = await sdk.api.abi.multiCall({
            calls: calls,
            abi: rootVault.find(({ name }) => name === 'tvl'),
            chain: name,
            permitFailure: true
        });

        const supplys = await sdk.api.abi.multiCall({
            calls: calls,
            abi: rootVault.find(({ name }) => name === 'totalSupply'),
            chain: name,
            permitFailure: true
        });

        let decimalsKTV = {};
        for (let i = 0; i < Array.from(allTokens.values()).length; ++i) {
            decimalsKTV[Array.from(allTokens.values())[i]] = decimals.output[i].output;
        }

        let symbolKTV = {};
        for (let i = 0; i < Array.from(allTokens.values()).length; ++i) {
            symbolKTV[Array.from(allTokens.values())[i]] = symbols.output[i].output;
        }

        for (let i = 0; i < tokens.output.length; ++i) {

            const tokensI = tokens.output[i].output;

            let tvlUsd = await getTvl(tvls.output[i].output, tokensI, prices, decimalsKTV);
            if (tvlUsd < 10000) {
                continue;
            }

            let symbol;
            if (tokensI.length == 1) {
                symbol = symbolKTV[tokensI[0]];
            }

            else {
                symbol = symbolKTV[tokensI[0]] + '-' + symbolKTV[tokensI[1]];
            }
            
            const blockStart = blockKeys[vaults[i]] + 50000;
            const timestampStart = (await provider.getBlock(blockStart)).timestamp;

            calls = [];
            calls.push({target: vaults[i], params: []});

            let oldTvls = await sdk.api.abi.multiCall({
                calls: calls,
                abi: rootVault.find(({ name }) => name === 'tvl'),
                chain: name,
                block: blockStart,
                permitFailure: true
            });

            let oldSupply = await sdk.api.abi.multiCall({
                calls: calls,
                abi: rootVault.find(({ name }) => name === 'totalSupply'),
                chain: name,
                block: blockStart,
                permitFailure: true
            });

            while (!oldTvls.output[0].success) {
                oldTvls = await sdk.api.abi.multiCall({
                    calls: calls,
                    abi: rootVault.find(({ name }) => name === 'tvl'),
                    chain: name,
                    block: blockStart,
                    permitFailure: true
                });
            }

            while (!oldSupply.output[0].success) {
                oldSupply = await sdk.api.abi.multiCall({
                    calls: calls,
                    abi: rootVault.find(({ name }) => name === 'totalSupply'),
                    chain: name,
                    block: blockStart,
                    permitFailure: true
                });
            }

            const timePassedShareYear = (currentTimestamp - timestampStart) / (86400 * 365);

            const lpPriceUsdDoNothing = await getTvl(oldTvls.output[0].output, tokensI, prices, decimalsKTV) / oldSupply.output[0].output;
            const lpPriceNow = tvlUsd / supplys.output[i].output;
            
            const apy = 100 * (((1 + (lpPriceNow - lpPriceUsdDoNothing) / lpPriceUsdDoNothing) ** (1 / timePassedShareYear)) - 1);

            let rewardApy = 0;
            let rewardToken;

            if (vaults[i] in rewardMap) {

                const farmAddress = rewardMap[vaults[i]];

                calls = [];
                calls.push({target: farmAddress, params: []});

                const finish = await sdk.api.abi.multiCall({
                    calls: calls,
                    abi: farm.find(({ name }) => name === 'periodFinish'),
                    chain: name,
                    permitFailure: true
                });

                if (finish.output[0].output > currentTimestamp) {

                    const currentReward = await sdk.api.abi.multiCall({
                        calls: calls,
                        abi: farm.find(({ name }) => name === 'getRewardForDuration'),
                        chain: name,
                        permitFailure: true
                    });

                    const currentDuration = await sdk.api.abi.multiCall({
                        calls: calls,
                        abi: farm.find(({ name }) => name === 'rewardsDuration'),
                        chain: name,
                        permitFailure: true
                    });

                    rewardToken = await sdk.api.abi.multiCall({
                        calls: calls,
                        abi: farm.find(({ name }) => name === 'rewardsToken'),
                        chain: name,
                        permitFailure: true
                    });

                    rewardToken = rewardToken.output[0].output

                    const yearlyRewardUsd = (currentReward.output[0].output * (86400 * 365) / currentDuration.output[0].output) * prices[String(rewardToken)] / 10**decimalsKTV[rewardToken];
                    rewardApy = 100 * yearlyRewardUsd / tvlUsd;
                }

            }

            if (rewardApy == 0) {

                const pool = {
                    pool: vaults[i],
                    chain: utils.formatChain(name),
                    project: 'mellow-yield',
                    tvlUsd: tvlUsd,
                    symbol: symbol,
                    apy: apy,
                    underlyingTokens: tokens.output[i].output,
                };

                pools.push(pool);

            }

            else {
                const pool = {
                    pool: vaults[i],
                    chain: utils.formatChain(name),
                    project: 'mellow-yield',
                    tvlUsd: tvlUsd,
                    symbol: symbol,
                    apyBase: apy,
                    apyReward: rewardApy,
                    apy: apy + rewardApy,
                    rewardTokens: [rewardToken], 
                    underlyingTokens: tokens.output[i].output,
                };

                pools.push(pool);
            }

        }

    }

    return pools;

};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.mellow.finance/products',
};
