const axios = require('axios');
const sdk = require('@defillama/sdk');
const abiCore = require('./abiCore.json');
const abiLToken = require('./abiLToken.json');
const abiRateModelSlope = require('./abiRateModelSlope.json');
const abiRewardContract = require('./abiRewardContract.json'); // Import the updated reward contract ABI
const abiFlyWheel = require('./abiFlyWheel.json');
const utils = require('../utils');
const { ethers } = require('ethers');
const { rewardTokens } = require('../sommelier/config');
// Helper function to format units without ethers.js
const formatUnits = (value, decimals) => {
  return Number(value) / Math.pow(10, decimals);
};
const project = 'ionic-protocol'
// Define markets per chain
const markets = {
  mode: [
    { ionWETH: '0x71ef7EDa2Be775E5A7aa8afD02C45F059833e9d2' },
    { ionUSDC: '0x2BE717340023C9e14C1Bb12cb3ecBcfd3c3fB038' },
    { ionUSDT: '0x94812F2eEa03A49869f95e1b5868C6f3206ee3D3' },
    { ionWBTC: '0xd70254C3baD29504789714A7c69d60Ec1127375C' },
    { ionweETH: '0x9a9072302B775FfBd3Db79a7766E75Cf82bcaC0A' },
    { ionezETH: '0x59e710215d45F584f44c0FEe83DA6d43D762D857' },
    { ionSTONE: '0x959FA710CCBb22c7Ce1e59Da82A247e686629310' },
    // { ionmsDAI: '0x0aCC14dcFf35b731A3f9Bd70DCBa3c97C44EdBA0' },
    // { iondMBTC: '0x5158ae44C1351682B3DC046541Edf84BF28c8ca4' },
    // { ionsUSDe: '0x4417A9B33bA8dD6fC9dfd8274B401AFd42299AA3' },
    { ionwrsETH: '0x49950319aBE7CE5c3A6C90698381b45989C99b46' },
    // { ionUSDe: '0xBb2B9780BDB4Ccc168947050dFfC3181503c4D18' },
    { 'ionweETH.mode': '0xA0D844742B4abbbc43d8931a6Edb00C56325aA18' },
    { 'M-BTC': '0x19F245782b1258cf3e11Eda25784A378cC18c108' },
    // {xxxxxxxxxxxxxxxx-below are native mode markets-xxxxxxxxxxxxxxxxxx},
    // { ionMODE: '0x4341620757Bee7EB4553912FaFC963e59C949147' },
    // { ionWETH: '0xDb8eE6D1114021A94A045956BBeeCF35d13a30F2' },
    // { ionUSDC: '0xc53edEafb6D502DAEC5A7015D67936CEa0cD0F52' },
    // { ionUSDT: '0x3120B4907851cc9D780eef9aF88ae4d5360175Fd' },
  ],
  // mode_native: [
  //   { ionWETH: '0xDb8eE6D1114021A94A045956BBeeCF35d13a30F2' },
  //   { ionUSDC: '0xc53edEafb6D502DAEC5A7015D67936CEa0cD0F52' },
  //   { ionUSDT: '0x94812F2eEa03A49869f95e1b5868C6f3206ee3D3' },
  //   { ionWBTC: '0xd70254C3baD29504789714A7c69d60Ec1127375C' },
  //   { ionweETH: '0x9a9072302B775FfBd3Db79a7766E75Cf82bcaC0A' },
  //   { ionezETH: '0x59e710215d45F584f44c0FEe83DA6d43D762D857' },
  //   { ionSTONE: '0x959FA710CCBb22c7Ce1e59Da82A247e686629310' },
  // ],
  base: [
    { ionWETH: '0x49420311B518f3d0c94e897592014de53831cfA3' },
    { ionUSDC: '0xa900A17a49Bc4D442bA7F72c39FA2108865671f0' },
    { ioncbBTC: '0x1De166df671AE6DB4C4C98903df88E8007593748' },
    { ionUSDz: '0xa4442b665d4c6DBC6ea43137B336e3089f05626C' },
    { ionwUSD: '0xF1bbECD6aCF648540eb79588Df692c6b2F0fbc09' },
    { ioneUSD: '0x9c2A4f9c5471fd36bE3BBd8437A33935107215A1' },
    { ionbsdETH: '0x3D9669DE9E3E98DB41A1CbF6dC23446109945E3C' },
    { ioncbETH: '0x9c201024A62466F9157b2dAaDda9326207ADDd29' },
    { ionwsuperOETHb: '0xC462eb5587062e2f2391990b8609D2428d8Cf598' },
    { ionOGN: '0xE00B2B2ca7ac347bc7Ca82fE5CfF0f76222FF375' },
    // { ionwUSDM: '0xe30965Acd0Ee1CE2e0Cd0AcBFB3596bD6fC78A51' },
    { ionuSOL: '0xbd06905590b6E1b6Ac979Fc477A0AebB58d52371' },
    { ionEURC: '0x0E5A87047F871050c0D713321Deb0F008a41C495' },
    { ionhyUSD: '0x751911bDa88eFcF412326ABE649B7A3b28c4dEDe' },
    { ionezETH: '0x079f84161642D81aaFb67966123C9949F9284bf5' },
    { ionAERO: '0x014e08F05ac11BB532BE62774A4C548368f59779' },
    { ionRSR: '0xfc6b82668E10AFF62f208C492fc95ef1fa9C0426' },
    { ionwstETH: '0x9D62e30c6cB7964C99314DCf5F847e36Fcb29ca9' },
    { 'ionweETH.mode': '0x84341B650598002d427570298564d6701733c805' },
    { 'ionUSD%2B': '0x74109171033F662D5b898A7a2FcAB2f1EF80c201' },
    // Add other markets for Base as needed
  ],
  optimism: [
    { ionWETH: '0x53b1D15b24d93330b2fD359C798dE7183255e7f2' },
    { ionUSDC: '0x50549be7e21C3dc0Db03c3AbAb83e1a78d07e6e0' },
    { ionUSDT: '0xb2918350826C1FB3c8b25A553B5d49611698206f' },
    { ionwUSDM: '0xc63B18Fc9025ACC7830B9df05e5A0B208940a3EE' },
    { ionOP: '0xAec01BB498bec2Fe8f3416314D5E0Db7EC76576b' },
    { ionwstETH: '0x2527e8cC363Ef3fd470c6320B22956021cacd149' },
    { ionSNX: '0xe4c5Aeb87762789F854B3Bae7515CF00d77a1f5e' },
    { ionWBTC: '0x863dccAaD60A1105f4B948C67895B4F0411C4497' },
    { ionLUSD: '0x9F4089Ea33773A090ac514934517990dF04ae5a7' },
    // Add other markets for Optimism as needed
  ],
  // bob: [
  //   { ionWETH: '0x10f07DF86f5c3cB16f0cA62Bd8239A4954EeD2Df' },
  //   { ionUSDC: '0x3E14B5D5187efE86eA99422F7696db5408a5E372' },
  //   // Add other markets for Bob as needed
  // ],
  // Add other chains if needed
};
// Define CORE and Reward contract addresses per chain
const CHAINS = {
  mode: {
    CORE: '0xFB3323E24743Caf4ADD0fDCCFB268565c0685556',
    REWARD_CONTRACT: '0x01aB485A0fae0667be36AB876c95ADc1A2a5e449', // Replace with actual reward contract address
  },
  // mode_native: {
  //   CORE: '0x8Fb3D4a94D0aA5D6EDaAC3Ed82B59a27f56d923a',
  //   REWARD_CONTRACT: '0x01aB485A0fae0667be36AB876c95ADc1A2a5e449', // Replace with actual reward contract address
  // },
  base: {
    CORE: '0x05c9C6417F246600f8f5f49fcA9Ee991bfF73D13',
    REWARD_CONTRACT: '0xB1402333b12fc066C3D7F55d37944D5e281a3e8B', // Replace with actual reward contract address
  },
  optimism: {
    CORE: '0xaFB4A254D125B0395610fdc8f1D022936c7b166B',
    REWARD_CONTRACT: '0xa6BA5F1164dc66F9C5bDCE33A6d2fC70bE8Da108', // Replace with actual reward contract address
  },
  // bob: {
  //   CORE: '0x9cFEe81970AA10CC593B83fB96eAA9880a6DF715',
  //   REWARD_CONTRACT: '0xYourRewardContractAddressHere', // Replace with actual reward contract address
  // },
  // Add other chains if needed
};
// APY Calculation Function
const apy = async (chain) => {
  const { CORE, REWARD_CONTRACT } = CHAINS[chain];
  const chainMarkets = markets[chain];
  if (!chainMarkets) {
    console.warn(`No markets defined for chain: ${chain}`);
    return [];
  }
  const allMarkets = chainMarkets.map((i) => Object.values(i)).flat();
  try {
    // Fetch collateral factors


    const collateralFactorMantissa = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiCore.find((n) => n.name === 'markets'),
        calls: allMarkets.map((m) => ({
          target: CORE,
          params: [m],
        })),
      })
    ).output.map((o) => o.output.collateralFactorMantissa);
    // Fetch decimals first to use for formatting
    //////console.log("Current Chain:", chain);
    const decimalsRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: 'erc20:decimals',
        calls: allMarkets.map((m) => ({
          target: m,
        })),
        permitFailure: true,
      })
    ).output.map((o) => (o.output !== undefined ? Number(o.output) : 18));
    // Fetch totalSupply and format it
    const totalSupplyRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'totalSupply'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    const totalSupply = totalSupplyRaw.map((val, i) => formatUnits(val, decimalsRaw[i]));
    // Fetch totalBorrow and format it
    const totalBorrowRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'totalBorrows'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    const totalBorrow = totalBorrowRaw.map((val, i) => formatUnits(val, decimalsRaw[i]));
    // Fetch totalReserve and format it
    const totalReserveRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'totalReserves'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    const totalReserve = totalReserveRaw.map((val, i) => formatUnits(val, decimalsRaw[i]));
    // Fetch interestRateModel
    const rateModel = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'interestRateModel'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    // Fetch reserveFactorMantissa
    const reserveFactorRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'reserveFactorMantissa'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    const reserveFactor = reserveFactorRaw.map((val) => formatUnits(val, 18));
    // Fetch cash and format it
    const cashRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'getCash'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    const cash = cashRaw.map((val, i) => formatUnits(val, decimalsRaw[i]));
    // Fetch borrowRate and format it
    const borrowRateRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiRateModelSlope.find((n) => n.name === 'getBorrowRate'),
        calls: rateModel.map((m, i) => ({
          target: m,
          params: [cashRaw[i], totalBorrowRaw[i], totalReserveRaw[i]],
        })),
      })
    ).output.map((o) => o.output);
    const borrowRate = borrowRateRaw.map((val) => formatUnits(val, 18));
    // Fetch supplyRate and format it
    const supplyRateRaw = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiRateModelSlope.find((n) => n.name === 'getSupplyRate'),
        calls: rateModel.map((m, i) => ({
          target: m,
          params: [cashRaw[i], totalBorrowRaw[i], totalReserveRaw[i], reserveFactorRaw[i]],
        })),
      })
    ).output.map((o) => o.output);
    const supplyRate = supplyRateRaw.map((val) => formatUnits(val, 18));
    // Fetch underlying tokens

    const underlying = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'underlying'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    // Fetch symbols
    const symbol = (
      await sdk.api.abi.multiCall({
        chain,
        abi: 'erc20:symbol',
        calls: underlying.map((m) => ({
          target: m,
        })),
        permitFailure: true,
      })
    ).output.map((o) => o.output || 'UNKNOWN');
    // Assemble pool data
    const tokenDecimals = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'decimals'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);
    // Fetch prices

    const priceKeys = underlying.map((t) => `${chain}:${t}`).join(',');
    let prices = {};
    try {
      const pricesResponse = await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`);
      prices = pricesResponse.data.coins;
    } catch (error) {
      console.error(`Error fetching prices for chain ${chain}:`, error);
    }
    // Fetch reward rates from the Reward Contract using the updated ABI
    // Fetch reward rates from the Reward Contract using the updated ABI
    let rewardApyPerMarket = []; // Array to hold APY per market
    const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

    if (REWARD_CONTRACT && REWARD_CONTRACT !== '') {
      try {
        // Ensure the function exists in the ABI
        const getMarketRewardsInfoFunction = abiRewardContract.find(n => n.name === 'getMarketRewardsInfo');
        if (!getMarketRewardsInfoFunction) {
          throw new Error("Function 'getMarketRewardsInfo' not found in abiRewardContract.json");
        }

        // Fetch Market Rewards Info by passing all market addresses
        // Step 1: Fetch raw market rewards info
        const marketRewardsInfoRaw = await sdk.api.abi.call({
          chain,
          abi: getMarketRewardsInfoFunction,
          target: REWARD_CONTRACT,
          params: [allMarkets], // Pass all markets as parameters
        });

        // Step 2: Function to get the flywheel booster address for each reward's flywheel
        async function getFlywheelBoosterAddress(sdk, chain, flywheelAddress) {
          const flywheelBoosterFunction = abiFlyWheel.find(n => n.name === 'flywheelBooster');
          if (!flywheelBoosterFunction) {
            throw new Error("Function 'flywheelBooster' not found in abiFlyWheel.json");
          }

          // Fetch the flywheelBooster address
          const flywheelBoosterAddressRaw = await sdk.api.abi.call({
            chain,
            abi: flywheelBoosterFunction,
            target: flywheelAddress,
          });
          return flywheelBoosterAddressRaw.output;  // Ensure you access the `output` field for the result
        }

        // Step 3: Filter and map the output based on flywheel's booster address
        async function getFilteredMarketRewardsInfo(sdk, chain, marketRewardsInfoRaw) {
          const filteredRewards = [];

          for (let info of marketRewardsInfoRaw.output) {
            const filteredRewardsInfo = [];

            // Iterate over each reward in rewardsInfo and check booster address
            for (let reward of info.rewardsInfo) {
              //console.log("reward flywheel",reward.flywheel)
              const boosterAddress = await getFlywheelBoosterAddress(sdk, chain, reward.flywheel); // Use flywheel here
              if (boosterAddress === '0x0000000000000000000000000000000000000000') {
                filteredRewardsInfo.push(reward);
              }
            }

            // Add market info only if there are valid rewards
            if (filteredRewardsInfo.length > 0) {
              filteredRewards.push({
                market: info.market,
                underlyingPrice: info.underlyingPrice,
                rewardsInfo: filteredRewardsInfo.map(reward => ({
                  rewardSpeedPerSecondPerToken: reward.rewardSpeedPerSecondPerToken,
                  rewardToken: reward.rewardToken || 0,
                  rewardTokenPrice: reward.rewardTokenPrice,
                  formattedAPR: reward.formattedAPR || null,
                })),
                rewardTokens: filteredRewardsInfo.map(reward => reward.rewardToken) || 0,
              });
            }
          }
          return filteredRewards;
        }

        // Step 4: Execute the function to get the filtered rewards
        const marketRewardsInfo = await getFilteredMarketRewardsInfo(sdk, chain, marketRewardsInfoRaw);

        const BLOCKS_PER_MINUTE = 27; // Given: 27 blocks per minute
        const BLOCKS_PER_YEAR = BLOCKS_PER_MINUTE * 60 * 24 * 365; // Blocks in a year

        await Promise.all(marketRewardsInfo.map(async (marketReward, index) => {
          const rewards = marketReward.rewardsInfo || [];
          const decimals = decimalsRaw[index];
        
          // Filter out rewards with invalid formattedAPR
          const validRewards = rewards.filter(reward => reward.formattedAPR);
        
          if (validRewards.length === 0) {
            console.warn(`No valid rewards found for market at index ${index}:`, marketReward);
            rewardApyPerMarket.push(0); // Push zero if no valid rewards are found
            return; // Exit early for this market
          }
        
          const totalRewardApy = await Promise.all(
            validRewards.map(async (reward) => {
              const formattedAPR = reward.formattedAPR;
              const parsedRate = parseFloat(ethers.utils.formatUnits(formattedAPR, decimals));
              const scaleFactor = 10 ** (18 - decimals);
              let normalizedRate;
        
              // Normalize rates based on decimals
              if (decimals < 18) {
                normalizedRate = parsedRate / scaleFactor;
              } else {
                normalizedRate = parsedRate; // No scaling needed if decimals are 18 or more
              }
        
              //console.log("Normalized Rate for reward:", normalizedRate);
              return normalizedRate; // Return the normalized rate
            })
          );
        
          // Calculate total APY for the current market
          const totalAPY = totalRewardApy.reduce((acc, curr) => acc + curr, 0);
          const apyPercentage = (totalAPY > 0) ? totalAPY * 100 : 0; // Calculate percentage

          const apyPercFormatted = apyPercentage.toFixed(2)
          // Push the calculated total APY into the array
          rewardApyPerMarket.push(apyPercFormatted); // Ensure this is the same array you're checking later
        }));
        //console.log('Final rewardApyPerMarket:', rewardApyPerMarket);

      } catch (error) {
        console.error("Error fetching Market Rewards Info:", error);
      }
    }
    // Inside your pools mapping

    const blocksPerMin = 27;

    const pools = allMarkets.map((p, i) => {
      const price = prices[`${chain}:${underlying[i]}`]?.price || 0;
      if (!price) {
        console.warn(`Price not found for ${chain}:${underlying[i]}`);
        return null;
      }
      //////console.log("token",underlying[i])
      const decimal = tokenDecimals[i] || 18; // Fallback to 18 if token not found
      const totalBorrowInUsd = totalBorrow[i]; // Convert totalBorrow to token value
      const cashInUsd = cash[i]; // Convert cash to token value

      // Ensure price is in USD (double-check this value)
      const totalBorrowUsd = totalBorrowInUsd * price; // Convert to USD
      const tvlUsd = cashInUsd * price; // Convert to USD

      // Calculate total supply USD
      const totalSupplyUsd = totalBorrowUsd + tvlUsd;
      function ratePerBlockToAPY(ratePerBlock, blocksPerMin) {
        // Check if ratePerBlock is null, undefined, or NaN
        if (ratePerBlock == null || isNaN(ratePerBlock)) {
          return 0;
        }

        const blocksPerDay = blocksPerMin * 60 * 24; // Calculate blocks per day
        const rateAsNumber = Number(ratePerBlock);

        return (Math.pow(rateAsNumber * blocksPerDay + 1, 365) - 1) * 100; // Calculate APY
      }
      let apyBase = 0;
      if (supplyRate[i] !== 0 && supplyRate[i] !== null && supplyRate[i] !== undefined) {
        apyBase = ratePerBlockToAPY(supplyRate[i], blocksPerMin) || 0;
      }
      // Reward APR calculation (adjusted with totalSupplyUsd for normalization)
      //////console.log('rewards APY', rewardApyPerMarket[i])
      // // const rewardApy = rewardApyPerMarket[i] / (10 ** 12); // Convert from wei to ether if applicable
      // const apyReward = (totalSupplyUsd > 0 && rewardApyPerMarket[i] !== undefined)
      //   ? (rewardApy / totalSupplyUsd) * 100 // Normalize reward APY
      //   : 0;
      //console.log("Final rewardApyPerMarket:", rewardApyPerMarket);
      const apyReward = (rewardApyPerMarket[i])
        ? Number((rewardApyPerMarket[i]))
        : 0;
      const apyTotal = apyReward + apyBase;
      // const apyTotal = (totalSupplyUsd > 0) ? (apyBase + totalSupplyRewardsAPR) : 0;
      return {
        pool: p,
        chain,
        project: 'ionic-protocol',
        symbol: symbol[i],
        tvlUsd,
        totalSupplyUsd,
        totalBorrowUsd,
        apyReward: apyReward !== null && apyReward !== undefined ? apyReward : 0, // Ensure apyBase has a valid value,
        apyBase: apyBase !== null && apyBase !== undefined ? apyBase : 0, // Ensure apyBase has a valid value
        rewardTokens: rewardTokens,
      };
    });
    return pools;
  } catch (error) {
    console.error(`Error processing APY for chain ${chain}:`, error);
    return [];
  }
};
// Main Function
const main = async () => {
  try {
    const poolArrays = await Promise.all(
      Object.keys(CHAINS).map((chain) => apy(chain))
    );
    const pools = poolArrays.flat().filter((i) => utils.keepFinite(i));
    return pools;
  } catch (error) {
    console.error('Error in main APY function:', error);
    return [];
  }
};
// Export the module
module.exports = {
  apy: main,
  url: 'https://app.ionic.money/',
};

