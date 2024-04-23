const axios = require('axios');
const { utils: { formatUnits }, BigNumber } = require('ethers');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const MULTI_REWARDS_STAKING = require('./abis/MultiRewardsStaking.json');
const SECONDS_PER_YEAR = 31536000;

const FARMS = {
  arbitrum: [{
    address: "0x6d2070b13929Df15B13D96cFC509C574168988Cd",
    stakingToken: "0x30dF229cefa463e991e29D42DB0bae2e122B2AC7",
    stakingTokenPool: "0bf3cb38-1908-4d85-87c3-af62651d5a03",
    rewardTokens: [
      "0x912CE59144191C1204E64559FE8253a0e49E6548", // ARB
      "0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF" // SPELL
    ],
    symbol: "MIM/USDC/USDT",
    underlyingTokens: [
      "0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A", // MIM
      "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC
      "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
    ],
    url: "https://app.abracadabra.money/#/farm/4",
  }],
}

const getApy = async () => {
  const pools = await Promise.all(Object.entries(FARMS).map(async ([chain, chainFarms]) => {
    const rewardDataCalls = chainFarms.flatMap(({ address, rewardTokens }) =>
      rewardTokens.map((rewardToken) => ({
        target: address,
        params: [rewardToken]
      })));
    const [rewardDataResults, totalSupplyResults, prices, symbols, yieldPools] = await Promise.all([
      sdk.api.abi.multiCall({
        abi: MULTI_REWARDS_STAKING.find(({ name }) => name === "rewardData"),
        calls: rewardDataCalls,
        chain,
      }).then((call => call.output)),
      sdk.api.abi.multiCall({
        abi: MULTI_REWARDS_STAKING.find(({ name }) => name === "totalSupply"),
        calls: chainFarms.map(({ address }) => ({ target: address })),
        chain
      }).then((call => call.output.map((x) => [x.input.target.toLowerCase(), x])))
        .then(Object.fromEntries),
      utils.getPrices(chainFarms.flatMap(({ rewardTokens }) => rewardTokens), chain),
      sdk.api.abi.multiCall({
        abi: "erc20:symbol",
        calls: chainFarms.map(({ stakingToken }) => ({
          target: stakingToken
        })),
        chain
      }).then((call => call.output.map((x) => [x.input.target.toLowerCase(), x])))
        .then(Object.fromEntries),
      axios.get('https://yields.llama.fi/pools').then((result) => result.data.data),
    ]);

    const tvlUsdChainFarms = Object.fromEntries(chainFarms.map(({ address }) => {
      const totalSupply = formatUnits(totalSupplyResults[address.toLowerCase()].output, 18);
      const totalSupplyUsd = totalSupply; // Assume $1
      return [address.toLowerCase(), totalSupplyUsd];
    }))
    const aprs = Object.fromEntries(chainFarms.map(({ address }) => [address.toLowerCase(), 0]));
    rewardDataResults.forEach(({ input: { target: farm, params: [rewardToken] }, output: { rewardRate } }) => {
      const rewardsPerYearRaw = BigNumber.from(rewardRate).mul(SECONDS_PER_YEAR);
      const rewardsPerYear = formatUnits(rewardsPerYearRaw, 18);
      const rewardsPerYearUsd = rewardsPerYear * prices.pricesByAddress[rewardToken.toLowerCase()];
      const rewardApr = rewardsPerYearUsd / tvlUsdChainFarms[farm.toLowerCase()] * 100;

      aprs[farm.toLowerCase()] = aprs[farm.toLowerCase()] + rewardApr;
    });
    return chainFarms.map(({ address, rewardTokens, stakingToken, stakingTokenPool, symbol, underlyingTokens, url }) => {
      const stakingTokenYieldPool = yieldPools.find(({ pool }) => pool === stakingTokenPool);
      return {
        pool: `${address}-${chain}`,
        chain: utils.formatChain(chain),
        project: 'abracadabra-spell',
        tvlUsd: Number(tvlUsdChainFarms[address.toLowerCase()]),
        symbol: symbol ?? utils.formatSymbol(symbols[stakingToken.toLowerCase()].output),
        apyBase: stakingTokenYieldPool.apyBase,
        apyReward: aprs[address.toLowerCase()],
        rewardTokens,
        underlyingTokens: underlyingTokens ?? stakingTokenYieldPool.underlyingTokens,
        url,
      }
    });
  }));
  return pools.flat();
}

module.exports = getApy;
