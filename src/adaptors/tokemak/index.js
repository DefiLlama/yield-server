const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const poolAbi = require('./poolAbi.json');
const reactors = require('./reactors.json');
const { fetchURL } = require('../../helper/utils');

const PRICE_DECIMALS = 8;

async function lpBalances() {
  const totalSupplies = (await sdk.api.abi.multiCall({
    abi: poolAbi.find(({ name }) => name === 'totalSupply'),
    calls: reactors.map((reactor) => ({
      target: reactor.poolAddress
    }))
  })).output.map(({ output }) => new BigNumber(output));

  const withdrawals = (await sdk.api.abi.multiCall({
    abi: poolAbi.find(({ name }) => name === 'withheldLiquidity'),
    calls: reactors.map((reactor) => ({
      target: reactor.poolAddress
    }))
  })).output.map(({ output }) => new BigNumber(output));

  const balances = totalSupplies.map((totalSupply, i) => totalSupply.minus(withdrawals[i]));

  return balances;
}

async function getPrices() {
  return await fetchURL('https://tokemakmarketdata.s3.amazonaws.com/current.json');
}

async function getAprData() {
  return await fetchURL('https://auto-rewards-prod-bucket-pool-stats-api-tokemakxyz.s3.amazonaws.com/current.json');
}

function calculateTvl(totalSupply, decimals, price) {
  const priceInUSD = new BigNumber(price * (10 ** PRICE_DECIMALS));

  const divisor = new BigNumber(10 ** decimals);

  const tvl = totalSupply.multipliedBy(priceInUSD).dividedBy(divisor);
  return tvl.dividedBy(10 ** PRICE_DECIMALS).toNumber();
}

function poolApr(aprData, reactor) {
  const apr = aprData.find(({ address }) => address.toLowerCase() === reactor.poolAddress.toLowerCase())?.liquidityProviderApr;
  return apr ? parseFloat(apr) * 100 : 0;
}

async function main() {
  const balances = await lpBalances();
  const { data: { prices } } = await getPrices();
  const { data: { chains: [{ pools: aprData }]} } = await getAprData();

  const pools = reactors.map((reactor, i) => ({
    pool: reactor.poolAddress,
    chain: 'Ethereum',
    project: 'tokemak',
    symbol: reactor.symbol,
    tvlUsd: calculateTvl(balances[i], reactor.decimals, prices[reactor.symbol.toLowerCase()]),
    rewardTokens: ['0x2e9d63788249371f1DFC918a52f8d799F4a38C94'], // TOKEMAK reward
    underlyingTokens: [reactor.tokenAddress],
    apyReward: poolApr(aprData, reactor),
  }));

  return pools;
}

module.exports = {
  timeTravel: false,
  apy: main,
  url: 'https://app.tokemak.xyz'
};
