const helperUtils = require("../../helper/utils");

const { ethers } = require('ethers');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi_rewardrouter_arb = require('./abis/RwardRouter_arb.json');
const abi_Elp_arb = require('./abis/Elp_arb.json');
const abi_ElpManager_arb = require('./abis/ElpManager_arb.json');

const AEDE = "0x5566d132324181427eD4f46989121030BC6689C7"
const EUSD = "0xB00885eef0610C1A9D0f4c125Abe959B63F6B2BF"
const reward_tracker_arbitrum_elp1 = "0x2108397905f6d3a9b277c545948c6d6e1ca22d06"
const reward_router_arbitrum_elp1 = "0x86af1e551c081ec2269f62708c291af1627fa4ed"
const elp1_arbitrum = "0xec08b5a75473fd581be6628d4e2ed08b49078df0"
const elpManangere_arbitrum_elp1 = "0x26aa71be9ccd794a4c9043be026c68496b45aa73"
const vault_arbitrum_elp1 = "0xfc36be177868b05f966e57bfc01617501b1f6926"
const vault_tokens_arbitrum_elp1 = [
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", //USDC
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", //WBTC
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", //WETH
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", //USDT
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", //DAI
]
const token_map_arbirtrum_elp1 = {
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "USDCUSDT",
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "BTCUSDT",
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "ETHUSDT",
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDTUSDT",
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": "DAIUSDT"
}

//------------------------------BSC CHAIN---------------------------------------
const AEDE_BSC = "0x43F649919f4ac48874D7f65D361702E4447Dec0c"
const EUSD_BSC = "0x691390b8505821e9f62f7F848dD7C20d5205a58F"
const reward_tracker_bsc_elp1 = "0x43c1FcC7F4E604F7DA57bA58Bb2A8E7d9cc48B21"
const reward_router_bsc_elp1 = "0x2108397905F6d3A9b277c545948C6d6E1Ca22D06"
const elpManangere_bsc_elp1 = "0xFaF4bc3791B7B2133564155482abd190d971f055"
const vault_bsc_elp1 = "0xF1D7e3f06aF6EE68E22baFd37E6a67b1757c35a9"
const vault_tokens_bsc_elp1 = [
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", //WBNB
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", //WBTC
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8", //WETH
    "0x55d398326f99059ff775485246999027b3197955", //USDT
]
const token_map_bsc_elp1 = {
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "BNBUSDT",
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": "BTCUSDT",
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8": "ETHUSDT",
    "0x55d398326f99059ff775485246999027b3197955": "USDTUSDT",
}


async function getVaultTvl(vault, vault_tokens, pChain, priceDataRes) {
    let tvl = 0;
    for (let i = 0; i < vault_tokens.length; i++) {
        let token = vault_tokens[i];
        let decimals = await sdk.api.abi.call({
            target: token,
            abi: 'erc20:decimals',
            chain: pChain,
        });
        let vault_balance = await sdk.api.abi.call({
            target: token,
            abi: 'erc20:balanceOf',
            chain: pChain,
            params: [vault],
        });
        // console.log("vault_balance::", vault_balance.output / (18 ** decimals.output))

        tvl = tvl + (priceDataRes[token_map_arbirtrum_elp1[token]] / 10 ** 30) * (vault_balance.output / (10 ** decimals.output));
    }
    // console.log("tvl::", tvl)

    return tvl
}

async function getVaultTvl_bsc(vault, vault_tokens, pChain, priceDataRes) {
    let tvl = 0;
    for (let i = 0; i < vault_tokens.length; i++) {
        let token = vault_tokens[i];
        let decimals = await sdk.api.abi.call({
            target: token,
            abi: 'erc20:decimals',
            chain: pChain,
        });
        let vault_balance = await sdk.api.abi.call({
            target: token,
            abi: 'erc20:balanceOf',
            chain: pChain,
            params: [vault],
        });
        // console.log("vault_balance::", vault_balance.output / (18 ** decimals.output))

        tvl = tvl + (priceDataRes[token_map_bsc_elp1[token]] / 10 ** 30) * (vault_balance.output / (10 ** decimals.output));
    }
    // console.log("tvl::", tvl)

    return tvl
}
const getPools = async () => {
    let edePrice = (await utils.getData(
        'https://data.ede.finance/arb/edekline'
    )).data[0].price;
    let elpPrice = 1;

    let arb_info = await sdk.api.abi.call({
        target: reward_router_arbitrum_elp1,
        abi: abi_rewardrouter_arb["stakedELPnAmount"],
        chain: "arbitrum",
    });
    // console.log("arb_info::", arb_info.output);
    const totalStaked_elp1 = Number(ethers.utils.formatUnits(arb_info.output[1][0], 18));
    const stakingPool_elp1 = Number(ethers.utils.formatUnits(arb_info.output[2][0], 18));
    // console.log("totalStaked_elp1::", totalStaked_elp1)
    // console.log("stakingPool_elp1::", stakingPool_elp1)

    const apr_ede_elp = (stakingPool_elp1 * 3600 * 24 * 365 * edePrice) / (totalStaked_elp1 * elpPrice);
    // console.log("apr_ede_elp::", apr_ede_elp)


    let feeAmount_arb = await sdk.api.abi.call({
        target: elp1_arbitrum,
        abi: abi_Elp_arb["getFeeAmount"],
        chain: "arbitrum",
        params: [1,1]
    });
    // console.log("feeAmount_arb::", feeAmount_arb.output);


    let elpManager_info = await sdk.api.abi.call({
        target: elpManangere_arbitrum_elp1,
        abi: abi_ElpManager_arb["getPoolInfo"],
        chain: "arbitrum"
    });

    const elpManager_totalSupply = Number(ethers.utils.formatUnits(elpManager_info.output[2], 18));


    // console.log("elpManager_info::", elpManager_info.output);


    const apr_eusd_elp = (Number(ethers.utils.formatUnits(feeAmount_arb.output, 18)) / 1 * 365) / (1 * elpManager_totalSupply * elpPrice) * 0.6;

    // console.log("apr_eusd_elp::", apr_eusd_elp)







    let pools = [];

    const priceDataRes = await utils.getData(
        'https://api.ede.finance/prices'
    );

    // console.log("priceDataRes::", priceDataRes)

    let tvl_arbitrum_elp1 = await getVaultTvl(vault_arbitrum_elp1, vault_tokens_arbitrum_elp1, 'arbitrum', priceDataRes);


    pools.push({
        pool: reward_tracker_arbitrum_elp1,
        chain: utils.formatChain('arbitrum'),
        project: 'el-dorado-exchange',
        symbol: 'WETH-WBTC-USDC-USDT-DAI',
        tvlUsd: parseFloat(tvl_arbitrum_elp1),
        apyBase: apr_eusd_elp * 100,
        apyReward: apr_ede_elp * 100,
        rewardTokens: [EUSD, AEDE],
        poolMeta: "ELP-1"
    })

    //======================================BSC CHAIN======================================

    let bsc_info = await sdk.api.abi.call({
        target: reward_router_bsc_elp1,
        abi: abi_rewardrouter_arb["stakedELPnAmount"],
        chain: "bsc",
    });
    console.log("bsc_info::", bsc_info.output);

    const totalStaked_elp1_bsc = Number(ethers.utils.formatUnits(bsc_info.output[1][2], 18));
    const stakingPool_elp1_bsc = Number(ethers.utils.formatUnits(bsc_info.output[2][2], 18));
    console.log("totalStaked_elp1_bsc::", totalStaked_elp1_bsc)
    console.log("stakingPool_elp1_bsc::", stakingPool_elp1_bsc)

    edePrice = (await utils.getData(
        'https://data.ede.finance/bsc/edekline'
    )).data[0].price;

    elpPrice = 0.92
    const apr_ede_elp_bsc = (stakingPool_elp1_bsc * 3600 * 24 * 365 * edePrice) / (totalStaked_elp1_bsc * elpPrice);
    console.log("apr_ede_elp_bsc::", apr_ede_elp_bsc)


    const feeAmount_bsc = (
        await helperUtils.fetchURL("https://data.ede.finance/api/ede/dalyFee")
    ).data.elp1;
    console.log("feeAmount_bsc::", feeAmount_bsc);


    let elpManager_info_bsc = await sdk.api.abi.call({
        target: elpManangere_bsc_elp1,
        abi: abi_ElpManager_arb["getPoolInfo"],
        chain: "bsc"
    });

    console.log("elpManager_info_bsc::", elpManager_info_bsc.output);

    const elpManager_totalSupply_bsc = Number(ethers.utils.formatUnits(elpManager_info_bsc.output[2], 18));

    console.log("elpManager_totalSupply_bsc::", elpManager_totalSupply_bsc);

    const apr_eusd_elp_bsc = (Number(ethers.utils.formatUnits(feeAmount_bsc, 18)) / 1 * 365) / (1 * elpManager_totalSupply_bsc * elpPrice) * 0.6;

    console.log("apr_eusd_elp_bsc::", apr_eusd_elp_bsc)


    let tvl_bsc_elp1 = await getVaultTvl_bsc(vault_bsc_elp1, vault_tokens_bsc_elp1, 'bsc', priceDataRes);


    pools.push({
        pool: reward_tracker_bsc_elp1,
        chain: utils.formatChain('bsc'),
        project: 'el-dorado-exchange',
        symbol: 'WETH-WBTC-WBNB-USDT',
        tvlUsd: parseFloat(tvl_bsc_elp1),
        apyBase: apr_eusd_elp_bsc * 100,
        apyReward: apr_ede_elp_bsc * 100,
        rewardTokens: [EUSD_BSC, AEDE_BSC],
        poolMeta: "ELP1p"
    })




    return pools;
};

module.exports = {
    timetravel: false,
    apy: getPools,
    url: 'https://app.ede.finance/#/Earn',
};