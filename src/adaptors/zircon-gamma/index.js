const Web3 = require('web3');
let _ = require('lodash');
const {CONTRACT_ABI,
  ERC20_ABI,
  PROVIDER_URL,
  SUBGRAPH_URI, VAULT_CONTRACT_ABI, ZRG_ADDRESS, WMOVR_ADDRESS, PAIR_CONTRACT_ABI, MOVR_ZRG_PAIR_ADDRESS,
  MOVR_USDC_PAIR_ADDRESS, PT_CONTRACT_ABI, PYLON_CONTRACT_ABI, GAMMA_SUBGRAPH_URI
} = require("./constants");
const axios = require('axios');
const {BigNumber} = require("bignumber.js");
const web3 = new Web3(PROVIDER_URL);

let getPoolsSubgraph = async function() {

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
  let query = await axios.post(SUBGRAPH_URI, JSON.stringify({query: QUERY, variables: null, operationName: undefined} ), )
  return query.data.data.psionicFarms
}


let gettingDailyVolume = async function (pairAddress) {
  let date = new Date()
  date.setUTCHours(0,0,0,0)
  date.setUTCDate(date.getUTCDate() - 1);
  let unix = (+ date) / 1000
  let QUERY = `{
    pairDayDatas(where: {pairAddress: "${pairAddress.toString()}", date: ${unix}}) {
        dailyVolumeUSD
    }
    }`
  let query = await axios.post(GAMMA_SUBGRAPH_URI, JSON.stringify({query: QUERY, variables: null, operationName: undefined} ), )
  if (query.data.data.pairDayDatas.length > 0) {
    return query.data.data.pairDayDatas[0].dailyVolumeUSD
  }
}

let getPools =  async function () {
  // Getting Moonbase Provider
  // Getting Farming Contract
  // Getting Pools And Allocation Points
  const pools = await getPoolsSubgraph();

  // Getting ZRG/MOVR ERC20 Contracts
  const zrgContract = new web3.eth.Contract(JSON.parse(ERC20_ABI), ZRG_ADDRESS, )
  const wmovrContract = new web3.eth.Contract(JSON.parse(ERC20_ABI), WMOVR_ADDRESS,  )

  // Calculating ZRG Price and MOVR Price
  const zrgMovrContract = new web3.eth.Contract(JSON.parse(PAIR_CONTRACT_ABI), MOVR_ZRG_PAIR_ADDRESS,  );
  const usdcMovrContract = new web3.eth.Contract(JSON.parse(PAIR_CONTRACT_ABI), MOVR_USDC_PAIR_ADDRESS,  );


  const zrgMovrReserves = await zrgMovrContract.methods.getReserves().call();
  const usdcMovrReserves = await usdcMovrContract.methods.getReserves().call();

  const zrgMovrPrice = new BigNumber(zrgMovrReserves[1].toString()).dividedBy(zrgMovrReserves[0].toString());
  // Hardcoded to 1e12 because USDC is 6 decimals and MOVR is 18 decimals
  const movrUsdcPrice = new BigNumber(usdcMovrReserves[1].toString()).multipliedBy("1000000000000").dividedBy(usdcMovrReserves[0].toString());

  // Getting ZRG USD Price
  const zrgPrice = zrgMovrPrice.multipliedBy(movrUsdcPrice);


  // Creating the result to convert in JSON
  let result = []
  if (!_.isEmpty(pools)) {
    for (const pool of pools) {
      try {
        // Pool Contract
        const contract = new web3.eth.Contract(JSON.parse(CONTRACT_ABI), pool.id);
        const stakedToken = pool.stakeToken.id; // Staked PT Address

        // Getting Vault Contract
        const vaultAddress = await contract.methods.psionicVault().call();
        const vaultContract = new web3.eth.Contract(JSON.parse(VAULT_CONTRACT_ABI), vaultAddress.toString());

        // Balances from Vault
        let ZRGBalance = await zrgContract.methods.balanceOf(vaultAddress.toString()).call();
        let WMOVRBalance = await wmovrContract.methods.balanceOf(vaultAddress.toString()).call();
        if (ZRGBalance <= 0 && WMOVRBalance <= 0) {
          // In case the pool was initialized but it doesn't have any rewards yet we skip it
          continue;
        }

        // Adding Reward Tokens to the list

        let rewardTokens = []
        if (ZRGBalance > 0) { rewardTokens.push(ZRG_ADDRESS) }
        if (WMOVRBalance > 0) { rewardTokens.push(WMOVR_ADDRESS) }

        // Getting PT & Pylon Contracts for each pool
        const ptStakedContract = new web3.eth.Contract(JSON.parse(PT_CONTRACT_ABI), stakedToken,  );
        const pylon = await ptStakedContract.methods.pylon().call();
        const pylonContract = new web3.eth.Contract(JSON.parse(PYLON_CONTRACT_ABI), pylon,  );
        const pair = await ptStakedContract.methods.pair().call();
        const pairContract = new web3.eth.Contract(JSON.parse(PAIR_CONTRACT_ABI), pair,  );
        const token0 = await pairContract.methods.token0().call();
        const token1 = await pairContract.methods.token1().call();
        const reserves = await pairContract.methods.getReserves().call();
        const ptToken = await ptStakedContract.methods.token().call();
        const isAnchor = await ptStakedContract.methods.isAnchor().call();

        const t = ptToken.toString() === token0.toString() ? !isAnchor : isAnchor;

        // Getting Info from Tokens
        const token0Contract = new web3.eth.Contract(JSON.parse(ERC20_ABI), t ? token0 : token1,  );
        const token1Contract = new web3.eth.Contract(JSON.parse(ERC20_ABI), !t ? token0 : token1, );
        const token0Symbol = await token0Contract.methods.symbol().call();
        const token0Decimals = await token0Contract.methods.decimals().call();
        const token1Decimals = await token1Contract.methods.decimals().call();
        const token1Symbol = await token1Contract.methods.symbol().call();

        // Retrieving Price From Binance
        let symbol = token1Symbol === "WMOVR" ? "MOVR" : token1Symbol;
        symbol = symbol.replace("xc", "");// For cross chain tokens
        const stablePrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}BUSD`)

        // Getting Staked Ratio of PT in farm
        const totalStaked = await ptStakedContract.methods.balanceOf(pool.id).call();
        const totalSupply = await ptStakedContract.methods.totalSupply().call();
        const stakedRatio = new BigNumber(totalStaked.toString()).dividedBy(totalSupply.toString());

        // LP Total Supply And Pylon Balance
        const lpTotalSupply = await pairContract.methods.totalSupply().call()
        const pylonBalance = await pairContract.methods.balanceOf(pylon.toString()).call();
        const pylonRatio = new BigNumber(pylonBalance.toString()).dividedBy(lpTotalSupply.toString());

        // Getting muu for daily fees
        const muu = await pylonContract.methods.muMulDecimals().call();
        // Getting Daily Volume
        let dailyVolume = await gettingDailyVolume(pair)
        let dailyFees = new BigNumber(dailyVolume).multipliedBy(0.003);

        // Getting TVL of the pool
        const pylonReserves = await pylonContract.methods.getSyncReserves().call();
        const r0 = new BigNumber(reserves[0].toString()).dividedBy(new BigNumber(10).pow(token0Decimals.toString()));
        const r1 = new BigNumber(reserves[1].toString()).dividedBy(new BigNumber(10).pow(token1Decimals.toString()));
        const ratio = new BigNumber(!t ? r0 : r1).dividedBy(t ? r0 : r1); // Calculating ratio of token1/token0

        const tvlPair = new BigNumber(!t ? r0 : r1).multipliedBy(2).multipliedBy(stablePrice.data.price);
        const r0Pylon = new BigNumber(pylonReserves[0].toString()).multipliedBy(ratio).dividedBy(new BigNumber(10).pow(token0Decimals.toString())).multipliedBy(stablePrice.data.price);
        const r1Pylon = new BigNumber(pylonReserves[1].toString()).dividedBy(new BigNumber(10).pow(token1Decimals.toString())).multipliedBy(stablePrice.data.price);

        const tvl = tvlPair.plus(r0Pylon).plus(r1Pylon);

        // Calculating VAB or VFB in USD
        let tokenReserveUSD = 0;
        let feesAPR = 0
        if (isAnchor) {
          const vab = await pylonContract.methods.virtualAnchorBalance().call();
          const vabDecimals = new BigNumber(vab.toString()).dividedBy(new BigNumber(10).pow(token1Decimals.toString()));
          const vabFarm = vabDecimals.multipliedBy(stakedRatio);
          tokenReserveUSD = new BigNumber(vabFarm).multipliedBy(parseFloat(stablePrice.data.price));

          // Calculating Stable fees APR
          // daylyFees*365*muu/vab
          let muuDivided = (new BigNumber(muu.toString())).dividedBy(1e18);
          feesAPR = new BigNumber(dailyFees.toString()).multipliedBy(muuDivided).multipliedBy(365).dividedBy(vabDecimals.multipliedBy(stablePrice.data.price)).multipliedBy(100);
        } else {

          const gamma = await pylonContract.methods.gammaMulDecimals().call();

          const gammaDivided = new BigNumber(gamma.toString()).dividedBy(new BigNumber(10).pow(18));
          const reserveTR = new BigNumber(!t ? r0 : r1).multipliedBy(2).multipliedBy(gammaDivided).multipliedBy(pylonRatio.toString());
          const vfb = new BigNumber(pylonReserves[0].toString()).multipliedBy(ratio).dividedBy(new BigNumber(10).pow(token0Decimals.toString())).plus(reserveTR)
          tokenReserveUSD = new BigNumber(vfb).multipliedBy(stablePrice.data.price).multipliedBy(stakedRatio);

          // Calculating Float fees APR
          // daylyFees*365*(1-muu)/vfb
          let muuDivided = (new BigNumber(1e18).minus(muu.toString())).dividedBy(1e18);
          feesAPR = new BigNumber(dailyFees.toString()).multipliedBy(muuDivided).multipliedBy(365).dividedBy(vfb.multipliedBy(stablePrice.data.price)).multipliedBy(100);
        }

        // Calculating Total Pending Rewards to subtract from block balance
        const psiTS = await vaultContract.methods.totalSupply().call();
        const blocksRemaining = pool.endBlock - await web3.eth.getBlockNumber();
        let psiRemaining = await vaultContract.methods.balanceOf(pool.id).call();
        let remaining = new BigNumber(psiRemaining.toString()).minus(new BigNumber(blocksRemaining).multipliedBy(1e18));

        // Calculating earnings per year
        let ZRGBalanceCorrected = new BigNumber(ZRGBalance.toString()).minus(remaining.multipliedBy(ZRGBalance.toString()).dividedBy(psiTS.toString()));
        let MOVRBalanceCorrected = new BigNumber(WMOVRBalance.toString()).minus(remaining.multipliedBy(WMOVRBalance.toString()).dividedBy(psiTS.toString()));

        // Current earnings per block
        let movrEarningsPerBlock = new BigNumber(MOVRBalanceCorrected).multipliedBy(movrUsdcPrice.toString()).dividedBy(1e18).dividedBy(blocksRemaining.toString())
        let zrgEarningsPerBlock = new BigNumber(ZRGBalanceCorrected).multipliedBy(zrgPrice.toString()).dividedBy(1e18).dividedBy(blocksRemaining.toString())

        let earningPerYear = (new BigNumber(zrgEarningsPerBlock).plus(movrEarningsPerBlock)).multipliedBy(6500*365);

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
          WMOVRBalance
        })
      }catch (e) {
        console.error(e)
      }

    }
  }

  return result
}

async function apy(chain) {
  let response = await getPools()

  const pools = response.map((p) => ({
    pool: `${p.stakedToken}-moonriver`.toLowerCase(),
    chain: 'moonriver',
    project: 'Zircon-Gamma',
    symbol: `${p.tokenSymbol}`,
    tvlUsd: Number(p.tvl),
    apyBase: Number(p.feesAPR),
    apyReward: Number(p.apr),
    rewardTokens: p.rewardTokens,
    underlyingTokens: p.underlyingTokens,
    poolMeta: `${p.isAnchor ? 'Stable' : 'Float'} ${p.underlyingTokensSymbol.join("-")}`
  }));


  return [
    ...pools,
  ];
}

const main = async () => {
  const [movr] = await Promise.all([apy()]);
  return [...movr];
};
module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.app.zircon.finance/#/farm',
};
