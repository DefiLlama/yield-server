const sdk = require('@defillama/sdk');
const ethers = require('ethers');
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
  })).output.map(({ output }) => ethers.BigNumber.from(output));

  const withdrawals = (await sdk.api.abi.multiCall({
    abi: poolAbi.find(({ name }) => name === 'withheldLiquidity'),
    calls: reactors.map((reactor) => ({
      target: reactor.poolAddress
    }))
  })).output.map(({ output }) => ethers.BigNumber.from(output));

  const balances = totalSupplies.map((totalSupply, i) => totalSupply.sub(withdrawals[i]));

  return balances;
}

async function getPrices() {
  return await fetchURL('https://tokemakmarketdata.s3.amazonaws.com/current.json');
}

async function getAprData() {
  return await fetchURL('https://auto-rewards-prod-bucket-pool-stats-api-tokemakxyz.s3.amazonaws.com/current.json');
}

function calculateTvl(totalSupply, decimals, price) {
  const priceInUSD = ethers.utils.parseUnits(
    price,
    PRICE_DECIMALS
  );

  const divisor = ethers.BigNumber.from(10).pow(decimals);

  const tvl = totalSupply.mul(priceInUSD).div(divisor);
  return parseInt(ethers.utils.formatUnits(tvl, PRICE_DECIMALS));
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
    tvlUsd: calculateTvl(balances[i], reactor.decimals, prices[reactor.symbol.toLowerCase()].toString()),
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
