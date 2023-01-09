const { ethers, BigNumber: BN } = require('ethers'); // BN doesn't have decimal points
const { getProvider } = require('@defillama/sdk/build/general');
const { vaultABI, curveABI } = require('./abi');
const BigNumber = require('bignumber.js'); // support decimal points

const LIQUITY_VAULT = '0x91a6194f1278f6cf25ae51b604029075695a74e5';
const YEARN_VAULT = '0x4FE4BF4166744BcBc13C19d959722Ed4540d3f6a';
const CURVE_ROUTER = '0x81C46fECa27B31F3ADC2b91eE4be9717d1cd3DD7';
const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const apy = async () => {
    const chain = 'ethereum';
    const provider = getProvider(chain);

    const liquityVault = new ethers.Contract(LIQUITY_VAULT, vaultABI, provider);
    const yearnVault = new ethers.Contract(YEARN_VAULT, vaultABI, provider);

    const lvl = await liquityVault.totalUnderlying(); // liquity vault's LUSD balance
    const yvl = await yearnVault.totalUnderlying(); // yearn vault's LUSD balance
    // combine LIQUTIY_VAULT and YEARN_VAULT to be consistent with the DefiLlama TVL adaptor
    // convert ethers BigNumber to bignumber's BigNumber to have decimal points
    const tvlLUSD = new BigNumber(lvl.add(yvl).toString());

    // we use USDC value assuming 1 USDC = 1 USD
    const oneLUSD = new BigNumber(10).pow(18);
    const oneUSDC = new BigNumber(10**6);
    const lusdPrice = await getLUSDPrice(provider);
    const tvlUsd = tvlLUSD.div(oneLUSD).times(lusdPrice).div(oneUSDC).toNumber();

    // s1: totalShares at the moment
    // u1: LUSD in the vault at the moment
    const [s1, u1] = await Promise.all([
        await liquityVault.totalShares(), 
        await liquityVault.totalUnderlyingMinusSponsored()
    ]);
    
    const BLOCKS_PER_DAY = 7160;

    // s0: totalShares a day before
    // u0: LUSD in the vault a day before
    const [s0, u0] = await Promise.all([
        await liquityVault.totalShares({ blockTag: -BLOCKS_PER_DAY }), 
        await liquityVault.totalUnderlyingMinusSponsored({ blockTag: -BLOCKS_PER_DAY })
    ]);

    // Let sp1 be the current share price in LUSD, i.e., sp1 = u1 / s1
    // Let sp0 be the share price in LSUD a day before, i.e., sp0 = u0 / s0
    // current apy percentage = {[sp1 / sp0]^365 - 1} * 100,
    // that is, {[u1 * s0 / (u0 * s1)]^365 - 1} * 100
    const n = new BigNumber(u1.mul(s0).toString());
    const d = new BigNumber(u0.mul(s1).toString());
    const apy = n.div(d).pow(365).minus(1).times(100).toNumber();

    const liquityPool = {
        pool: `${LIQUITY_VAULT}-ethereum`,    
        chain,
        project: 'sandclock', 
        symbol: 'LUSD',
        tvlUsd,
        underlyingTokens: ['0x5f98805A4E8be255a32880FDeC7F6728C6568bA0'], // LUSD
        apy,
        poolMeta: 'Liquity Vault', 
        url: 'https://app.sandclock.org/'
    };

    return [liquityPool];
}

const getLUSDPrice = async (provider) => {
    const oneLUSD = BN.from(10).pow(18);
    const curveRouter = new ethers.Contract(CURVE_ROUTER, curveABI, provider);
    // get_best_rate(LUSD, USDC, oneLUSD) returns [address pool, BigNumber usdcAmount]
    const lusdBesRate = await curveRouter.get_best_rate(LUSD, USDC, oneLUSD); 
    return new BigNumber(lusdBesRate[1].toString());
}

module.exports = {
    timetravel: true,
    apy,
    url: 'https://sandclock.org',
};