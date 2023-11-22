const { ethers } = require('ethers');
const { getProvider } = require('@defillama/sdk/build/general');
const { lusdVaultABI, erc4626ABI } = require('./abi');
const BigNumber = require('bignumber.js'); // support decimal points
const superagent = require('superagent');

const LIQUITY_VAULT = '0x91a6194f1278f6cf25ae51b604029075695a74e5';
const YEARN_VAULT = '0x4FE4BF4166744BcBc13C19d959722Ed4540d3f6a';
const WETH_VAULT = '0x1Fc623b96c8024067142Ec9c15D669E5c99c5e9D';
const USDC_VAULT = '0x1038Ff057b7092f17807358c6f68b42661d15caB';
const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const chain = 'ethereum';
const provider = getProvider(chain);
const BLOCKS_PER_DAY = 7160;

const apy = async () => {

    const prices = await getPrices([LUSD, USDC, WETH]);

    const lusdPool = await calcLusdPoolApy(prices[LUSD.toLowerCase()]);

    const usdcDecimals = new BigNumber(10**6);
    const usdcPool = await calcErc4626PoolApy(USDC, 'USDC', usdcDecimals, USDC_VAULT, prices[USDC.toLowerCase()]);

    const wethDecimals = new BigNumber(10).pow(18);
    const wethPool = await calcErc4626PoolApy(WETH, 'WETH', wethDecimals, WETH_VAULT, prices[WETH.toLowerCase()]);

    return [lusdPool, usdcPool, wethPool];
}

async function calcLusdPoolApy(lusdPrice) {
    const liquityVault = new ethers.Contract(LIQUITY_VAULT, lusdVaultABI, provider);
    const yearnVault = new ethers.Contract(YEARN_VAULT, lusdVaultABI, provider);

    // combine LIQUTIY_VAULT and YEARN_VAULT to be consistent with the DefiLlama TVL adaptor
    const [lvl, yvl] = await Promise.all([
        await liquityVault.totalUnderlying(),
        await yearnVault.totalUnderlying()
    ]);

    const lusdDecimals = new BigNumber(10).pow(18);
    // convert ethers BigNumber to bignumber's BigNumber to have decimal points
    const tvlLUSD = new BigNumber(lvl.add(yvl).toString()).div(lusdDecimals);
    const tvlUsd = tvlLUSD.multipliedBy(lusdPrice).toNumber();

    // s1: totalShares at the moment
    // u1: LUSD in the vault at the moment
    const [s1, u1] = await Promise.all([
        await liquityVault.totalShares(),
        await liquityVault.totalUnderlyingMinusSponsored()
    ]);

    
    // s0: totalShares 28 days before
    // u0: LUSD in the vault 28 days before
    const [s0, u0] = await Promise.all([
        await liquityVault.totalShares({ blockTag: -BLOCKS_PER_DAY * 28 }),
        await liquityVault.totalUnderlyingMinusSponsored({ blockTag: -BLOCKS_PER_DAY * 28 })
    ]);

    // Let sp1 be the current share price in LUSD, i.e., sp1 = u1 / s1
    // Let sp0 be the share price in LSUD 28 days before, i.e., sp0 = u0 / s0
    // we compound 28 days return 13 times to get the apy, as 
    // that is, {[u1 * s0 / (u0 * s1)]^13 - 1} * 100
    const n = new BigNumber(u1.mul(s0).toString());
    const d = new BigNumber(u0.mul(s1).toString());
    const apy = n.div(d).pow(13).minus(1).times(100).toNumber();

    const lusdPool = {
        pool: `${LIQUITY_VAULT}-${chain}`,
        chain,
        project: 'sandclock',
        symbol: 'LUSD',
        tvlUsd,
        underlyingTokens: [LUSD],
        apy,
        poolMeta: 'LUSD Vault',
        url: 'https://app.sandclock.org/'
    };

    return lusdPool;
}

async function calcErc4626PoolApy(asset, symbol, decimals, vault, price) {
    const contract = new ethers.Contract(vault, erc4626ABI, provider);
    const tvl = await contract.totalAssets();
    const tvlUsd = new BigNumber(tvl.toString()).multipliedBy(price).div(decimals).toNumber();

    const sharePriceNow = await contract.convertToAssets(1);
    const sharePriceDayBefore = await contract. convertToAssets(1, { blockTag: -BLOCKS_PER_DAY });
    const n = new BigNumber(sharePriceNow.toString());
    const d = new BigNumber(sharePriceDayBefore.toString());
    const apy = n.div(d).pow(365).minus(1).times(100).toNumber();

    const erc4626Pool = {
        pool: `${vault}-${chain}`,
        chain,
        project: 'sandclock',
        symbol,
        tvlUsd,
        underlyingTokens: [asset],
        apy,
        poolMeta: `${symbol} Vault`,
        url: 'https://app.sandclock.org/'
    };

    return erc4626Pool;
}

const getPrices = async (addresses) => {
    const uri = `${addresses.map((address) => `${chain}:${address}`)}`;
    const prices = (
        await superagent.get('https://coins.llama.fi/prices/current/' + uri)
    ).body.coins;

    const pricesByAddresses = Object.entries(prices).reduce(
        (acc, [address, price]) => ({
            ...acc,
            [address.split(':')[1].toLowerCase()]: price.price,
        }),
        {}
    );

    return pricesByAddresses;
};

module.exports = {
    timetravel: true,
    apy,
    url: 'https://sandclock.org',
};