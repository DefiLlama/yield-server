const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');
const superagent = require('superagent');

const facades = {
  polygon: '0x0708542D895C2559001Fa9e4Bc49C3343735e6e2',
  arbitrum: '0xE75254f298a5145438595Aa9d6D4327fCD14418D',
  bsc: '0xD187937762c6fd4d7a58C71fD810CbfE22E64a84',
  optimism: '0x285cAee14514f30bB178FB56c985e43A47d68E75',
};

function ethersBNToBN(bn, decimals) {
  return new BigNumber(ethers.utils.formatUnits(bn, decimals));
}

function aprToAPY(apr, timesCompounded) {
  return apr.div(timesCompounded).plus(1).pow(timesCompounded).minus(1);
}

const getChainPools = async (chain, facade) => {
  // -----====== Get Strategies ======----- //
  const strategies = (
    await sdk.api.abi.call({
      abi: abi.find((n) => n.name === 'getStrategies'),
      params: [],
      target: facade,
      chain,
    })
  ).output;

  // -----====== Get Balances ======----- //
  const balancesR = (
    await sdk.api.abi.multiCall({
      abi: abi.find((n) => n.name === 'getStrategyBalance'),
      calls: strategies.map((address) => ({
        target: facade,
        params: [address],
      })),
      chain,
    })
  ).output;

  // -----====== Get APRs ======----- //
  const aprs = (
    await sdk.api.abi.multiCall({
      abi: abi.find((n) => n.name === 'getStrategyAPR'),
      calls: strategies.map((address) => ({
        target: facade,
        params: [address, 1],
      })),
      chain,
    })
  ).output;

  // -----====== Get Underlying Tokens ======----- //
  let priceKeys = [];
  const underlyingBalances = {};
  balancesR.map((strategyBalance, index) => {
    vaultAddr = strategyBalance.output[0].toLowerCase();
    tokenAddr = strategyBalance.output[1].toLowerCase();
    balance = strategyBalance.output[2];

    const priceKey = `${chain}:${tokenAddr}`;
    const underlyingTokens = `${vaultAddr}:${tokenAddr}`;

    priceKeys.includes(priceKey) ? null : priceKeys.push(priceKey);

    underlyingBalances[underlyingTokens] = balance;
  });

  // -----====== Get Prices ======----- //
  const priceKeysQ = priceKeys.join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeysQ}`)
  ).body.coins;

  const apys = aprs.map((apr, index) => {
    const aprBN = ethersBNToBN(apr.output, 4);
    const apy = aprToAPY(aprBN, 365);
    return apy.multipliedBy(100);
  });

  // -----====== Prepare Pools ======----- //
  const pools = strategies.map((address, index) => {
    const vaultAddr = balancesR[index].output[0].toLowerCase();
    const tokenAddr = balancesR[index].output[1].toLowerCase();

    const priceKey = `${chain}:${tokenAddr}`;
    const underlyingTokens = `${vaultAddr}:${tokenAddr}`;

    const symbol = prices[priceKey].symbol;
    const decimals = prices[priceKey].decimals;

    const balance = underlyingBalances[underlyingTokens];

    const tvlUsd =
      ethers.utils.formatUnits(balance, decimals) * prices[priceKey].price;

    const apr = aprs[index].output;
    const apy = apys[index];

    return {
      pool: `${vaultAddr}-${chain}`.toLowerCase(),
      chain: chain,
      project: 'luxsfi',
      symbol: symbol,
      tvlUsd: tvlUsd,
      apy: apy.toNumber(),
      underlyingTokens: [tokenAddr],
    };
  });

  return pools;
};

// -----====== Get Pools ======----- //
const getPools = async () => {
  let pools = [];

  for (let chain in facades) {
    const chainPools = await getChainPools(chain, facades[chain]);
    pools = pools.concat(chainPools);
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.luxs.fi',
};
