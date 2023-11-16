const uniswapV3FactoryAbi = require('./abi/UniswapV3Factory.json');
const stakePrizePoolAbi = require('./abi/StakePrizePool.json');
const uniswapV3PoolAbi = require('./abi/UniswapV3Pool.json');
const ticketAbi = require('./abi/Ticket.json');
const erc20Abi = require('./abi/ERC20.json');

const BigNumber = require('bignumber.js');

const utils = require('../utils');

const Web3 = require('web3');

let uniswapV3FactoryContract;
let stakePrizePoolContract;
let ticketContract;
let wethContract;
let usdcContract;
let asxContract;

let web3;

const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const STAKE_PRIZE_POOL_ADDRESS = '0x82D24dD5041A3Eb942ccA68B319F1fDa9EB0c604';
const TICKET_ADDRESS = '0xd1c88b7Cc2F9B3A23d1CB537d53A818cef5E5E32';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const ASX_ADDRESS = '0x67d85A291fcDC862A78812a3C26d55e28FFB2701';

async function init() {
  web3 = new Web3(
    new Web3.providers.HttpProvider('https://ethereum.publicnode.com')
  );

  stakePrizePoolContract = new web3.eth.Contract(
    stakePrizePoolAbi,
    STAKE_PRIZE_POOL_ADDRESS
  );
  wethContract = new web3.eth.Contract(erc20Abi, WETH_ADDRESS);
  usdcContract = new web3.eth.Contract(erc20Abi, USDC_ADDRESS);
  asxContract = new web3.eth.Contract(erc20Abi, ASX_ADDRESS);
  ticketContract = new web3.eth.Contract(ticketAbi, TICKET_ADDRESS);
  uniswapV3FactoryContract = new web3.eth.Contract(
    uniswapV3FactoryAbi,
    UNISWAP_V3_FACTORY_ADDRESS
  );
}

async function getTokenPriceInWeth(tokenContract) {
  const uniswapV3TokenWethPoolAddress = await uniswapV3FactoryContract.methods
    .getPool(tokenContract.options.address, WETH_ADDRESS, 3000)
    .call();
  const uniswapV3TokenWethPoolContract = new web3.eth.Contract(
    uniswapV3PoolAbi,
    uniswapV3TokenWethPoolAddress
  );

  const { tick } = await uniswapV3TokenWethPoolContract.methods.slot0().call();

  const tokenDecimals = await tokenContract.methods.decimals().call();
  const wethDecimals = await wethContract.methods.decimals().call();

  const oneTokenInWeth =
    1 / ((1.0001 ** Math.abs(tick) * 10 ** wethDecimals) / 10 ** tokenDecimals);

  return oneTokenInWeth;
}

async function getTokenPriceInUsdc(tokenContract) {
  const uniswapV3TokenUsdcPoolAddress = await uniswapV3FactoryContract.methods
    .getPool(tokenContract.options.address, USDC_ADDRESS, 3000)
    .call();
  const uniswapV3TokenUsdcPoolContract = new web3.eth.Contract(
    uniswapV3PoolAbi,
    uniswapV3TokenUsdcPoolAddress
  );

  const { tick } = await uniswapV3TokenUsdcPoolContract.methods.slot0().call();

  const tokenDecimals = await tokenContract.methods.decimals().call();
  const usdcDecimals = await usdcContract.methods.decimals().call();

  const oneTokenInUsdc =
    1 / ((1.0001 ** Math.abs(tick) * 10 ** usdcDecimals) / 10 ** tokenDecimals);

  return oneTokenInUsdc;
}

async function getApy() {
  // 1. Retrieve reward per year amount (in ASX tokens).
  let rewardPerSecondInEsAsxTokens = await stakePrizePoolContract.methods
    .esAsxRewardPerSecond()
    .call();

  const rewardPerYearInEsAsxTokens =
    +new BigNumber(rewardPerSecondInEsAsxTokens.toString()) * 60 * 60 * 24 * 365;

  // 2. Calculate price of 1 ASX token in WETH.
  const oneAsxInWeth = await getTokenPriceInWeth(asxContract);

  // 3. Calculate price of 1 WETH token in USDC.
  const oneWethPriceUsdc = await getTokenPriceInUsdc(wethContract);

  // 4. Calculate price of 1 ASX token in USDC.
  const oneAsxInUsdc = oneAsxInWeth * oneWethPriceUsdc;

  // 5. Calculate reward per year (in esASX tokens, in USDC).
  const rewardPerYearInEsAsxTokensInUsdc =
  rewardPerYearInEsAsxTokens * +new BigNumber(oneAsxInUsdc.toString());

  // 6. Calculate APR.
  const totalInProtocol = +new BigNumber(
    (await ticketContract.methods.totalSupply().call()).toString()
  );

  const lockedEthPriceInUsdc = totalInProtocol * oneWethPriceUsdc;
  const apy = (rewardPerYearInEsAsxTokensInUsdc / lockedEthPriceInUsdc) * 100;

  if (apy === Infinity) {
    return 0;
  }

  return apy;
}

async function getApyData() {
  await init();

  const stakePrizePoolData = {
    pool: stakePrizePoolContract.options.address,
    chain: utils.formatChain('ethereum'),
    project: 'asymetrix-protocol',
    symbol: utils.formatSymbol('stETH'),
    tvlUsd: await utils.getData('https://api.llama.fi/tvl/asymetrix-protocol/'),
    apyReward: await getApy(),
    rewardTokens: [asxContract.options.address], // [ASX]
    underlyingTokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'], // [stETH]
    url: 'https://app.asymetrix.io/',
  };

  return [stakePrizePoolData];
}

module.exports = {
  timetravel: false,
  apy: getApyData,
};
