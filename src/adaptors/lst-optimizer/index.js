const utils = require('../utils');
const sdk = require('@defillama/sdk');
const axios = require('axios');
const { ethers } = require('ethers');

const kETHStrategyAbi = require('./abis/kETHStrategy.json');

const bigToNum = (bn) => {
    if (typeof(bn) == 'string')
        ethers.BigNumber.from(bn);
    
        bn = ethers.utils.formatEther(bn);
    return Number(bn);
}

const queryStakingAprs = async () => {
    const rETHResult = (await axios.get('https://dt4w6sqvtl.execute-api.eu-central-1.amazonaws.com/mainnet/')).data;
    const beaconChainApr = Number(rETHResult.beaconChainAPR) * 100;
    const rETH = Number(rETHResult.rethAPR) * 0.9;
    const dETH = (beaconChainApr * 32) / 24;

    const stETHResult = (await axios.get('https://eth-api.lido.fi/v1/protocol/steth/apr/last')).data;
    const stETH = Number(stETHResult.data.apr) * 0.9;

    return {stETH, rETH, dETH};
}

const topLvl = async (chainString, underlying) => {

    const kETHStrategyAddress = "0xa060a5F83Db8bf08b45Cf56Db370c9383b7B895C";
    const dETHVaultAddress = "0x4c7aF9BdDac5bD3bee9cd2Aa2FeEeeE7610f5a6B";
    const bsnFarmingAddress = "0x5CeCfAf8f8c2983A3336adbe836aF39192a72895";

    const wstETHTokenAddress = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
    const rETHTokenAddress = "0xae78736Cd615f374D3085123A210448E74Fc6393";
    const dETHTokenAddress = "0x3d1E5Cf16077F349e999d6b21A4f646e83Cd90c5";
    const savETHTokenAddress = "0x00ee7ea7ca2b5cc47908f0cad1f296efbde1402e";
    const gETHTokenAddress = "0xe550adfbcadaa86dfe05d0c67c2e6f27accf5cf1";

    let kETHTvl = bigToNum((await sdk.api.abi.call({
        abi: kETHStrategyAbi.find(abi => abi.name == "totalAssets"), 
        target: kETHStrategyAddress
    })).output);

    let kETHAssets = (await sdk.api.abi.call({
        abi: kETHStrategyAbi.find(abi => abi.name == "assetsRatio"), 
        target: kETHStrategyAddress,
    })).output;

    const stETHValue = bigToNum(
        kETHAssets.find((item) =>
            item.token.toLowerCase() == wstETHTokenAddress.toLowerCase()
        ).valueInETH )


    const rETHValue = bigToNum(
        kETHAssets.find((item) =>
                item.token.toLowerCase() == rETHTokenAddress.toLowerCase()
        ).valueInETH)


    const dETHValue =
        bigToNum(
            kETHAssets.find((item) =>
                item.token.toLowerCase() == dETHTokenAddress.toLowerCase()
            ).valueInETH
        ) + 
        bigToNum(
            kETHAssets.find((item) =>
                item.token.toLowerCase() == savETHTokenAddress.toLowerCase()
            ).valueInETH
        ) + 
        bigToNum(
            kETHAssets.find((item) =>
                item.token.toLowerCase() == gETHTokenAddress.toLowerCase()
            ).valueInETH
        )

    const ethValue = kETHTvl - stETHValue - rETHValue - dETHValue

    const stakingAprs = await queryStakingAprs();

    const kETHApr =
        (stETHValue * stakingAprs.stETH +
        rETHValue * stakingAprs.rETH +
        dETHValue * stakingAprs.dETH +
        ethValue) /
        kETHTvl

    const ethUSDPrice = (
        await axios.get(`https://coins.llama.fi/prices/current/ethereum:0x0000000000000000000000000000000000000000`)
    ).data;
    
    ethUsd = ethUSDPrice.coins['ethereum:0x0000000000000000000000000000000000000000'].price;

    return [{
        pool: `${kETHStrategyAddress}-${chainString}`.toLowerCase(),
        chain: utils.formatChain(chainString),
        project: 'lst-optimizer',
        symbol: "kETH",
        tvlUsd: kETHTvl * ethUsd,
        apyBase: kETHApr,
        underlyingTokens: [wstETHTokenAddress, rETHTokenAddress, dETHTokenAddress],
    }];
};

const main = async () => {
  const data = await topLvl (
    'ethereum',
    '0x0000000000000000000000000000000000000000'
  )

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://dapp.getketh.com/home/',
};
