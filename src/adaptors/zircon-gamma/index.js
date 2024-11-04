const { Web3 } = require('web3');
let _ = require('lodash');
const {
  CONTRACT_ABI,
  PROVIDER_URL,
  SUBGRAPH_URI,
  VAULT_CONTRACT_ABI,
  ZRG_ADDRESS,
  WMOVR_ADDRESS,
  PAIR_CONTRACT_ABI,
  MOVR_ZRG_PAIR_ADDRESS,
  MOVR_USDC_PAIR_ADDRESS,
  PT_CONTRACT_ABI,
  PYLON_CONTRACT_ABI,
  GAMMA_SUBGRAPH_URI,
  NTV_ZRG_PAIR_ADDRESS,
  NTV_USDC_PAIR_ADDRESS,
  DAILY_BLOCK,
  CHAIN_NAME,
} = require('./constants');
const axios = require('axios');
const { BigNumber } = require('bignumber.js');
const utils = require('../utils');

let getPoolsSubgraph = async function (chainId, web3) {
  let blockNumber = await web3.eth.getBlockNumber();

  const QUERY = `{
    psionicFarms(where:{endBlock_gt: ${blockNumber}}) {
    endBlock
    id
    startBlock
    timestamp
    stakeToken {
      id
    }
  }
  }
  `;
  let query = await axios.post(
    SUBGRAPH_URI[chainId],
    JSON.stringify({ query: QUERY, variables: null, operationName: undefined })
  );
  return query.data.data.psionicFarms;
};

const getTokenPrice = async (tokenAddress, chain = 'moonriver') => {
  let key = `${chain}:${tokenAddress}`;
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${key}`
  );
  console.log(data);
  return data.coins[key];
};

let gettingDailyVolume = async function (pairAddress, chainId) {
  let date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);
  let unix = +date / 1000;

  let QUERY = `{
    pairDayDatas(where: {pairAddress: "${pairAddress.toString()}", date: ${unix}}) {
        dailyVolumeUSD
    }
    }`;
  let query = await axios.post(
    GAMMA_SUBGRAPH_URI[chainId],
    JSON.stringify({ query: QUERY, variables: null, operationName: undefined })
  );
  if (query.data.data.pairDayDatas.length > 0) {
    return query.data.data.pairDayDatas[0].dailyVolumeUSD;
  }
};

let calculatePrices = async function (chainId, web3) {
  // Calculating ZRG Price and MOVR Price
  const zrgNtvContract = new web3.eth.Contract(
    JSON.parse(PAIR_CONTRACT_ABI),
    NTV_ZRG_PAIR_ADDRESS[chainId]
  );
  const usdcMovrContract = new web3.eth.Contract(
    JSON.parse(PAIR_CONTRACT_ABI),
    NTV_USDC_PAIR_ADDRESS[chainId]
  );
  const zrgNtvReserves = await zrgNtvContract.methods.getReserves().call();
  let tk0 = await zrgNtvContract.methods.token0().call();
  let token0 = new web3.eth.Contract(JSON.parse(PAIR_CONTRACT_ABI), tk0);
  let symbol0 = await token0.methods.symbol().call();
  let zrgNtvPrice;
  if (symbol0 === 'ZRG') {
    zrgNtvPrice = new BigNumber(zrgNtvReserves[1].toString()).dividedBy(
      zrgNtvReserves[0].toString()
    );
  } else {
    zrgNtvPrice = new BigNumber(zrgNtvReserves[0].toString()).dividedBy(
      zrgNtvReserves[1].toString()
    );
  }

  let tk0U = await usdcMovrContract.methods.token0().call();
  let tk1 = await usdcMovrContract.methods.token1().call();
  let token0USDC = new web3.eth.Contract(JSON.parse(PAIR_CONTRACT_ABI), tk0U);
  let token1USDC = new web3.eth.Contract(JSON.parse(PAIR_CONTRACT_ABI), tk1);
  let symbol0USDC = await token0USDC.methods.symbol().call();
  let decimals0USDC = await token0USDC.methods.decimals().call();
  let decimals1USDC = await token1USDC.methods.decimals().call();
  let usdcMovrReserves = await usdcMovrContract.methods.getReserves().call();
  let ntvUsdPrice;
  if (symbol0USDC.startsWith('USD')) {
    ntvUsdPrice = new BigNumber(usdcMovrReserves[0].toString())
      .multipliedBy(new BigNumber('1e' + (decimals1USDC - decimals0USDC)))
      .dividedBy(usdcMovrReserves[1].toString());
  } else {
    ntvUsdPrice = new BigNumber(usdcMovrReserves[1].toString())
      .multipliedBy(new BigNumber('1e' + (decimals0USDC - decimals1USDC)))
      .dividedBy(usdcMovrReserves[0].toString());
  }
  // Hardcoded to 1e12 because USDC is 6 decimals and MOVR is 18 decimals
  return {
    zrg: zrgNtvPrice.multipliedBy(ntvUsdPrice),
    movr: ntvUsdPrice,
    ntv: ntvUsdPrice,
  };
};

let getPools = async function (chainId) {
  // Getting Moonbase Provider
  // Getting Farming Contract
  // Getting Pools And Allocation Points
  const web3 = new Web3(PROVIDER_URL[chainId]);

  const pools = await getPoolsSubgraph(chainId, web3);

  // Getting ZRG/MOVR ERC20 Contracts
  const zrgContract = new web3.eth.Contract(
    JSON.parse(PAIR_CONTRACT_ABI),
    ZRG_ADDRESS[chainId]
  );
  const wmovrContract = new web3.eth.Contract(
    JSON.parse(PAIR_CONTRACT_ABI),
    WMOVR_ADDRESS[chainId]
  );

  // Getting ZRG USD Price
  const prices = await calculatePrices(chainId, web3);

  // Creating the result to convert in JSON
  let result = [];
  if (!_.isEmpty(pools)) {
    for (const pool of pools) {
      try {
        // Pool Contract
        const contract = new web3.eth.Contract(
          JSON.parse(CONTRACT_ABI),
          pool.id
        );
        const stakedToken = pool.stakeToken.id; // Staked PT Address

        // Getting Vault Contract
        const vaultAddress = await contract.methods.psionicVault().call();
        const vaultContract = new web3.eth.Contract(
          JSON.parse(VAULT_CONTRACT_ABI),
          vaultAddress.toString()
        );

        // Balances from Vault
        let ZRGBalance = await zrgContract.methods
          .balanceOf(vaultAddress.toString())
          .call();
        let WMOVRBalance = await wmovrContract.methods
          .balanceOf(vaultAddress.toString())
          .call();
        if (ZRGBalance <= 0) {
          // In case the pool was initialized but it doesn't have any rewards yet we skip it
          continue;
        }

        // Adding Reward Tokens to the list

        let rewardTokens = [];
        if (ZRGBalance > 0) {
          rewardTokens.push(ZRG_ADDRESS[chainId]);
        }
        if (WMOVRBalance > 0) {
          rewardTokens.push(WMOVR_ADDRESS[chainId]);
        }

        // Getting PT & Pylon Contracts for each pool
        const ptStakedContract = new web3.eth.Contract(
          JSON.parse(PT_CONTRACT_ABI),
          stakedToken
        );
        const pylon = await ptStakedContract.methods.pylon().call();
        const pylonContract = new web3.eth.Contract(
          JSON.parse(PYLON_CONTRACT_ABI),
          pylon
        );
        const pair = await ptStakedContract.methods.pair().call();
        const pairContract = new web3.eth.Contract(
          JSON.parse(PAIR_CONTRACT_ABI),
          pair
        );
        const token0 = await pairContract.methods.token0().call();
        const token1 = await pairContract.methods.token1().call();
        const reserves = await pairContract.methods.getReserves().call();
        const isAnchor = await ptStakedContract.methods.isAnchor().call();

        const isFloatRes0 = await pylonContract.methods
          .isFloatReserve0()
          .call();

        // Getting Info from Tokens
        const token0Contract = new web3.eth.Contract(
          JSON.parse(PAIR_CONTRACT_ABI),
          isFloatRes0 ? token0 : token1
        );
        const token1Contract = new web3.eth.Contract(
          JSON.parse(PAIR_CONTRACT_ABI),
          !isFloatRes0 ? token0 : token1
        );
        const token0Symbol = await token0Contract.methods.symbol().call();
        const token0Decimals = await token0Contract.methods.decimals().call();
        const token1Decimals = await token1Contract.methods.decimals().call();
        const token1Symbol = await token1Contract.methods.symbol().call();

        // Retrieving Price From Binance
        let symbol = token1Symbol === 'WMOVR' ? 'MOVR' : token1Symbol;
        symbol = token1Symbol === 'WBNB' ? 'BNB' : symbol;
        symbol = symbol.replace('xc', ''); // For cross chain tokens
        symbol = `${symbol}BUSD`;
        symbol = symbol === 'USDTBUSD' ? 'BUSDUSDT' : symbol;
        const stablePrice = await getTokenPrice(
          !isFloatRes0 ? token0 : token1,
          CHAIN_NAME[chainId]
        );

        //await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)

        // Getting Staked Ratio of PT in farm
        const totalStaked = await ptStakedContract.methods
          .balanceOf(pool.id)
          .call();
        const totalSupply = await ptStakedContract.methods.totalSupply().call();
        const stakedRatio = new BigNumber(totalStaked.toString()).dividedBy(
          totalSupply.toString()
        );

        // LP Total Supply And Pylon Balance
        const lpTotalSupply = await pairContract.methods.totalSupply().call();
        const pylonBalance = await pairContract.methods
          .balanceOf(pylon.toString())
          .call();
        const pylonRatio = new BigNumber(pylonBalance.toString()).dividedBy(
          lpTotalSupply.toString()
        );

        // Getting muu for daily fees
        const muu = await pylonContract.methods.muMulDecimals().call();
        // Getting Daily Volume
        let dailyVolume = await gettingDailyVolume(pair, chainId);
        let dailyFees = new BigNumber(dailyVolume).multipliedBy(0.0015);

        // Getting TVL of the pool
        const pylonReserves = await pylonContract.methods
          .getSyncReserves()
          .call();
        const r0 = new BigNumber(reserves[0].toString()).dividedBy(
          new BigNumber(10).pow(token0Decimals.toString())
        );
        const r1 = new BigNumber(reserves[1].toString()).dividedBy(
          new BigNumber(10).pow(token1Decimals.toString())
        );
        const pairRes0 = isFloatRes0 ? r0 : r1;
        const pairRes1 = isFloatRes0 ? r1 : r0;
        const ratio = pairRes1.dividedBy(pairRes0);

        const tvlPair = new BigNumber(pairRes1)
          .multipliedBy(2)
          .multipliedBy(stablePrice.price);
        const r0Pylon = new BigNumber(pylonReserves[0].toString()).dividedBy(
          new BigNumber(10).pow(token0Decimals.toString())
        );
        const r1Pylon = new BigNumber(pylonReserves[1].toString()).dividedBy(
          new BigNumber(10).pow(token1Decimals.toString())
        );

        const r0PylonTVL = r0Pylon
          .multipliedBy(ratio)
          .multipliedBy(stablePrice.price);
        const r1PylonTVL = r1Pylon.dividedBy(
          new BigNumber(10).pow(token1Decimals.toString())
        );

        const tvlPylon = r0PylonTVL.plus(r1PylonTVL);
        const tvl = tvlPair.plus(tvlPylon);
        // Calculating VAB or VFB in USD
        let tokenReserveUSD = 0;
        let feesAPR = 0;
        let staked = 0;
        const vab = await pylonContract.methods.virtualAnchorBalance().call();
        const gamma = await pylonContract.methods.gammaMulDecimals().call();

        if (isAnchor) {
          const vabDecimals = new BigNumber(vab.toString()).dividedBy(
            new BigNumber(10).pow(token1Decimals.toString())
          );
          const vabFarm = vabDecimals.multipliedBy(stakedRatio);
          tokenReserveUSD = new BigNumber(vabFarm).multipliedBy(
            parseFloat(stablePrice.price)
          );
          staked = vabDecimals;
          // Calculating Stable fees APR
          // daylyFees*365*muu/vab
          let muuDivided = new BigNumber(muu.toString()).dividedBy(1e18);
          feesAPR = new BigNumber(dailyFees.toString())
            .multipliedBy(muuDivided)
            .multipliedBy(365)
            .dividedBy(vabDecimals.multipliedBy(stablePrice.price))
            .multipliedBy(100);
        } else {
          const gammaDivided = new BigNumber(gamma.toString()).dividedBy(
            new BigNumber(10).pow(18)
          );
          const reserveTR = new BigNumber(pairRes1)
            .multipliedBy(2)
            .multipliedBy(gammaDivided)
            .multipliedBy(pylonRatio.toString());
          const vfb = new BigNumber(pylonReserves[0].toString())
            .multipliedBy(ratio)
            .dividedBy(new BigNumber(10).pow(token0Decimals.toString()))
            .plus(reserveTR);
          tokenReserveUSD = new BigNumber(vfb)
            .multipliedBy(stablePrice.price)
            .multipliedBy(stakedRatio);
          staked = vfb;

          // Calculating Float fees APR
          // daylyFees*365*(1-muu)/vfb
          let muuDivided = new BigNumber(1e18)
            .minus(muu.toString())
            .dividedBy(1e18);
          feesAPR = new BigNumber(dailyFees.toString())
            .multipliedBy(muuDivided)
            .multipliedBy(365)
            .dividedBy(vfb.multipliedBy(stablePrice.price))
            .multipliedBy(100);
        }

        // Calculating Total Pending Rewards to subtract from block balance
        const psiTS = await vaultContract.methods.totalSupply().call();
        const blocksRemaining =
          pool.endBlock - (await web3.eth.getBlockNumber());
        let psiRemaining = await vaultContract.methods
          .balanceOf(pool.id)
          .call();
        let remaining = new BigNumber(psiRemaining.toString()).minus(
          new BigNumber(blocksRemaining).multipliedBy(1e18)
        );

        // Calculating earnings per year
        let ZRGBalanceCorrected = new BigNumber(ZRGBalance.toString()).minus(
          remaining
            .multipliedBy(ZRGBalance.toString())
            .dividedBy(psiTS.toString())
        );
        let MOVRBalanceCorrected = new BigNumber(WMOVRBalance.toString()).minus(
          remaining
            .multipliedBy(WMOVRBalance.toString())
            .dividedBy(psiTS.toString())
        );

        // Current earnings per block
        let movrEarningsPerBlock = new BigNumber(MOVRBalanceCorrected)
          .multipliedBy(prices.movr.toString())
          .dividedBy(1e18)
          .dividedBy(blocksRemaining.toString());
        let zrgEarningsPerBlock = new BigNumber(ZRGBalanceCorrected)
          .multipliedBy(prices.zrg.toString())
          .dividedBy(1e18)
          .dividedBy(blocksRemaining.toString());

        let earningPerYear = new BigNumber(zrgEarningsPerBlock)
          .plus(movrEarningsPerBlock)
          .multipliedBy(DAILY_BLOCK[chainId] * 365);
        const apr = earningPerYear.dividedBy(tokenReserveUSD).multipliedBy(100);

        result.push({
          pairId: pair,
          apr: apr.toString(),
          feesAPR: feesAPR.toString(),
          tokenSymbol: isAnchor ? token1Symbol : token0Symbol,
          tokenAddress: isAnchor ? token1 : token0,
          tvl: tvl.toString(),
          isAnchor,
          rewardTokens,
          underlyingTokens: [token0, token1],
          underlyingTokensSymbol: [token0Symbol, token1Symbol],
          stakedToken,
          movrEarningsPerBlock,
          zrgEarningsPerBlock,
          psiTS,
          ZRGBalance,
          WMOVRBalance,
        });
      } catch (e) {
        console.error(e);
      }
    }
  }

  return result;
};

async function apy(chain) {
  let response = await getPools(chain);
  let chainName = chain === 56 ? 'bsc' : 'moonriver';
  const pools = response.map((p) => ({
    pool: `${p.stakedToken}-${chainName}`.toLowerCase(),
    chain: `${chainName}`,
    project: 'zircon-gamma',
    symbol: `${p.tokenSymbol}`,
    tvlUsd: Number(p.tvl),
    apyBase: Number(p.feesAPR),
    apyReward: Number(p.apr),
    rewardTokens: p.rewardTokens,
    underlyingTokens: p.underlyingTokens,
    poolMeta: `${
      p.isAnchor ? 'Stable' : 'Float'
    } ${p.underlyingTokensSymbol.join('-')}`,
  }));

  return [...pools];
}

const main = async () => {
  const [movr, bsc] = await Promise.all([apy(1285), apy(56)]);
  return [...movr, ...bsc];
};
module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.app.zircon.finance/#/farm',
};
