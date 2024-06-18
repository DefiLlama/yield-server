const { ethers } = require('ethers');
const { getProvider } = require('@defillama/sdk/build/general');
const { erc4626ABI, scUSDCv2ABI, erc20ABI, stabilityPoolABI, wstethABI, priceConverterABI } = require('./abi');
const BigNumber = require('bignumber.js'); // support decimal points
const superagent = require('superagent');

// const LIQUITY_VAULT = '0x91a6194f1278f6cf25ae51b604029075695a74e5'; // deprecated
// const YEARN_VAULT = '0x4FE4BF4166744BcBc13C19d959722Ed4540d3f6a'; // deprecated
// const WETH_VAULT = '0x1Fc623b96c8024067142Ec9c15D669E5c99c5e9D'; // never in frontend or facing user
// const USDC_VAULT = '0x1038Ff057b7092f17807358c6f68b42661d15caB'; // never in frontend or facing user
// const JADE = '0x00C567D2b1E23782d388c8f58E64937CA11CeCf1'; // not enough tvl for yield server
// const AMETHYST = '0x8c0792Bfee67c80f0E7D4A2c5808edBC9af85e6F'; // not enough tvl for yield server
const AMBER = '0xdb369eEB33fcfDCd1557E354dDeE7d6cF3146A11';
const EMERALD = '0x4c406C068106375724275Cbff028770C544a1333';
const OPAL = '0x096697720056886b905D0DEB0f06AfFB8e4665E5';

const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';
const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

const QUARTZ = '0xbA8A621b4a54e61C442F5Ec623687e2a942225ef';

const LIQUITY_STABILITY_POOL = '0x66017D22b0f8556afDd19FC67041899Eb65a21bb';
const PRICE_CONVERTER = '0xD76B0Ff4A487CaFE4E19ed15B73f12f6A92095Ca';

const chain = 'ethereum';
const provider = getProvider(chain);
const BLOCKS_PER_DAY = 7160;

const lqtyContract = new ethers.Contract(LQTY, erc20ABI, provider);
const stabilityPoolContract = new ethers.Contract(LIQUITY_STABILITY_POOL, stabilityPoolABI, provider);
const LQTY_DECIMALS = new BigNumber(1e18.toString());

const apy = async () => {

    const prices = await getPrices([LUSD, USDC, WETH, LQTY]);

    const amber = await calcErc4626PoolApy(LUSD, 'LUSD', 'Amber', AMBER, prices, true);

    const opal = await calcErc4626PoolApy(USDC, 'USDC', 'Opal', OPAL, prices, false);

    const emerald = await calcErc4626PoolApy(WETH, 'WETH', 'Emerald', EMERALD, prices, false);

    return [amber, opal, emerald];
}

async function calcErc4626PoolApy(asset, symbol, poolMeta, vault, prices, liquity) {
    const contract = new ethers.Contract(vault, erc4626ABI, provider);

    const decimals = asset == USDC ? new BigNumber(1e6.toString()) : new BigNumber(1e18.toString());
    const price = prices[asset.toLowerCase()];
    const lqtyPrice = prices[LQTY.toLowerCase()];
    const tvl = await contract.totalAssets();
    let tvlUsd = new BigNumber(tvl.toString()).multipliedBy(price).div(decimals);
    
    if (liquity) {
      let lqtyUsd = await calcLqtyUsd(lqtyPrice);
      tvlUsd = tvlUsd.plus(lqtyUsd);
    }

    const days = 7;
    let totalAssetsNow = new BigNumber((await totalAssets(vault)).toString());
    if (liquity) {
      totalAssetsNow = totalAssetsNow.multipliedBy(price);  
      const lqtyTotalUsd = await calcLqtyAsset(lqtyPrice); 
      totalAssetsNow = totalAssetsNow.plus(lqtyTotalUsd);
    }
    const totalSharesNow =new BigNumber((await contract.totalSupply()).toString());
    const sharePriceNow = totalSharesNow.isZero()? 
        new BigNumber(0) :
        totalAssetsNow.div(totalSharesNow);
    
    let totalAssetsYesterday = new BigNumber((await totalAssets(vault, { blockTag: -BLOCKS_PER_DAY })).toString());
    let totalAssetsBefore = new BigNumber((await totalAssets(vault, { blockTag: -BLOCKS_PER_DAY * days })).toString());

    if (liquity) {
      totalAssetsYesterday = totalAssetsYesterday.multipliedBy(price);
      const lqtyTotalUsdYesterday = await calcLqtyAsset(lqtyPrice, { blockTag: -BLOCKS_PER_DAY });  
      totalAssetsYesterday = totalAssetsYesterday.plus(lqtyTotalUsdYesterday);

      totalAssetsBefore = totalAssetsBefore.multipliedBy(price);
      const lqtyTotalUsdBefore = await calcLqtyAsset(lqtyPrice, { blockTag: -BLOCKS_PER_DAY * days });  
      totalAssetsBefore = totalAssetsBefore.plus(lqtyTotalUsdBefore);
    }

    const totalSharesYesterday = new BigNumber((await contract.totalSupply({ blockTag: -BLOCKS_PER_DAY })).toString());
    const sharePriceYesterday = totalSharesYesterday.isZero()? 
        new BigNumber(0) :
        totalAssetsYesterday.div(totalSharesYesterday);
    const apyBase = sharePriceYesterday.isZero() ? 
        0 :
        sharePriceNow.minus(sharePriceYesterday).multipliedBy(365).div(sharePriceYesterday).multipliedBy(100).toNumber();

    const totalSharesBefore = new BigNumber((await contract.totalSupply({ blockTag: -BLOCKS_PER_DAY * days })).toString());
    const sharePriceBefore = totalSharesBefore.isZero()? 
        new BigNumber(0) :
        totalAssetsBefore.div(totalSharesBefore);
    // const compound = Math.floor(365 / days);
    // const apy = n.div(d).pow(compound).minus(1).times(100).toNumber();
    const apyBase7d = sharePriceBefore.isZero() ? 
        0 :
        sharePriceNow.minus(sharePriceBefore).multipliedBy(365).div(days).div(sharePriceBefore).multipliedBy(100).toNumber();

    const apyReward = 15; // QUARTZ will be airdropped to depositors to Amber, Opal and Emerald vaults    
    const erc4626Pool = {
        pool: `${vault}-${chain}`,
        chain,
        project: 'sandclock',
        symbol,
        tvlUsd: tvlUsd.toNumber(),
        underlyingTokens: [asset],
        rewardTokens: [QUARTZ],
        apyBase,
        apyBase7d,
        apyReward,
        poolMeta,
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

const totalAssets = async(vault, options) => {
    const args = options?.blockTag ? { blockTag: options.blockTag } : {};
    if (vault == EMERALD) { // scWETHv2
        return await totalEmeraldAssets(args);
    } else if (vault == OPAL) { // scUSDCv2
        return await totalOpalAssets(args)
    } 
    const vaultContract = new ethers.Contract(vault, erc4626ABI, provider);
    return new BigNumber((await vaultContract.totalAssets(args)).toString());
}

const totalEmeraldAssets = async(args) => {
    const vaultContract = new ethers.Contract(EMERALD, erc4626ABI, provider);
    const wstethContract = new ethers.Contract(WSTETH, wstethABI, provider);
    const totalCollateral = await wstethContract.getStETHByWstETH(
        await vaultContract.totalCollateral(args),
        args
    );
    const totalDebt = await vaultContract.totalDebt(args);
    const wethContract = new ethers.Contract(WETH, erc20ABI, provider);
    const float = await wethContract.balanceOf(EMERALD, args);
    return new BigNumber(float.add(totalCollateral).sub(totalDebt).toString());
}

const totalOpalAssets = async (args) => {
    const vaultContract = new ethers.Contract(OPAL, scUSDCv2ABI, provider);
    const usdcBalance = new BigNumber((await vaultContract.usdcBalance(args)).toString());
    const totalCollateral = new BigNumber((await vaultContract.totalCollateral(args)).toString());
    // in WETH
    const totalDebt = new BigNumber((await vaultContract.totalDebt(args)).toString());
    
    const emeraldContract = new ethers.Contract(EMERALD, erc20ABI, provider);
    const sharesInvested = new BigNumber((await emeraldContract.balanceOf(OPAL, args)).toString());
    const emeraldAssets = new BigNumber((await totalEmeraldAssets(args)).toString());
    const emeraldShares = new BigNumber((await emeraldContract.totalSupply(args)).toString());
    const wethInvested = new BigNumber(emeraldAssets.multipliedBy(sharesInvested).dividedBy(emeraldShares).toFixed(0));

    let total = usdcBalance.plus(totalCollateral);

    const priceConverter = new ethers.Contract(PRICE_CONVERTER, priceConverterABI, provider);

    if (wethInvested.gt(totalDebt)) { // in profit
        const profitInWETH = wethInvested.minus(totalDebt);
        const slippageTolerance = new BigNumber((await vaultContract.slippageTolerance(args)).toString());
        const profitInUsdcNoSlippage = new BigNumber((await priceConverter.ethToUsdc(profitInWETH.toString(), args)).toString());
        const profitInUsdc = profitInUsdcNoSlippage.multipliedBy(slippageTolerance).dividedBy(new BigNumber(1e18.toString()));
        total = total.plus(profitInUsdc);
    } else {
        const lossInWETH = totalDebt.minus(wethInvested);
        const lossInUsdc = new BigNumber((await priceConverter.ethToUsdc(lossInWETH)).toString());
        total = total.minus(lossInUsdc);
    }

    return total;
}

const calcLqtyAsset = async (price, options) => {
    const args = options?.blockTag ? { blockTag: options.blockTag } : {};

    let lqtyTotal = ethers.BigNumber.from(0);

    const lqtyBalance = await lqtyContract.balanceOf(AMBER, args);
    lqtyTotal = lqtyTotal.add(lqtyBalance);

    const lqtyGain = await stabilityPoolContract.getDepositorLQTYGain(AMBER, args);
    lqtyTotal = lqtyTotal.add(lqtyGain);

    lqtyTotalUsd = new BigNumber(lqtyTotal.toString()).multipliedBy(price);
    return lqtyTotalUsd;
}

const calcLqtyUsd = async (price) => {
    return (await calcLqtyAsset(price)).div(LQTY_DECIMALS);
}

module.exports = {
    timetravel: true,
    apy,
    url: 'https://sandclock.org',
};