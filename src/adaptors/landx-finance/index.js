const sdk = require('@defillama/sdk');
const utils = require('../utils');

let oraclePrices = new Map();
oraclePrices.set('arbitrum', '0x050EF3b1CE0CCE775A224d9712b961A86137aa80');
oraclePrices.set('ethereum', '0xF49A0863D532E6036D693FBACfd2417Aebda8784');

const tokens = {
  arbitrum: {
    xSOY: '0xaab1f70478E734e972cDcC108c42A7c8915f5606',
    xRICE: '0x2D8C8888FBFEa79f63dF39baFFf15E70CE4b66c5',
    xCORN: '0x2D09268E7a8271b41CdD3019D97a4980D8110BfA',
    xWHEAT: '0xBa5630d57A8DdEf4EB97b5659c2cb9191dBB4Cab',
  },
  ethereum: {
    xSOY: '0x8A78C1042F24349595f36f1a83091163487f2241',
    xRICE: '0x3356328A3CA51D2664620757bd1c475Ca77FFaB5',
    xCORN: '0x5074c4FA383d63D62d5F531D1CF92125fb39E859',
    xWHEAT: '0x1B2B0FA9283595F5036C007dD99Ed0aA6de8362E',
  },
};

const getPrice = async (network, address) => {
  let oracle = oraclePrices.get(network);
  const price = await sdk.api.abi.call({
    abi: 'function getXTokenPrice(address xToken) public view returns (uint256)',
    target: oracle,
    params: [address],
    chain: network,
  });
  return price.output / 1000000;
};

const getCropPrice = async (network, crop) => {
  let oracle = oraclePrices.get(network);
  const price = await sdk.api.abi.call({
    abi: 'function prices(string memory) public view returns (uint256)',
    target: oracle,
    params: [crop],
    chain: network,
  });
  return price.output / 1000000000;
};

const getLocked = async (network, target) => {
  const locked = await sdk.api.abi.call({
    abi: 'function totalSupply() public view returns (uint256)',
    target: target,
    chain: network,
  });
  return locked.output / 1000000;
};

const getxbasketTVL = async () => {
  const locked = await sdk.api.abi.call({
    abi: 'function calculateTVL() public view returns (uint256)',
    target: '0x6fC27F5CC0aAFeC8e2b8bC4E6393aC89e45232d3',
    chain: 'ethereum',
  });
  return locked.output / 1000000;
};

const poolsFunction = async () => {
  let pools = [];
  let sumEthereumAPY = 0;
  let tokensList = Object.values(tokens);
  let networks = Object.keys(tokens);

  await Promise.all(
    Object.values(networks).map(async (value, key) => {
      let tokenNames = Object.keys(tokensList[key]);
      let tokenAddresses = Object.values(tokensList[key]);
      await Promise.all(
        tokenAddresses.map(async (tokenAddress, nameIndex) => {
          let price = await getPrice(value, tokenAddress);
          let cTokenPrice = await getCropPrice(
            value,
            tokenNames[nameIndex].replace('x', '')
          );
          let locked = await getLocked(value, tokenAddress);
          let apy = (cTokenPrice / price) * 100;
          if (value == 'ethereum') {
            sumEthereumAPY += apy;
          }
          let pool = {
            pool: tokenAddress,
            chain: utils.formatChain(value),
            project: 'landx-finance',
            symbol: tokenNames[nameIndex],
            tvlUsd: locked * price,
            apy: apy,
          };
          pools.push(pool);
        })
      );
    })
  );

  let xbasketTVL = await getxbasketTVL();
  let pool = {
    pool: '0x6fC27F5CC0aAFeC8e2b8bC4E6393aC89e45232d3',
    chain: utils.formatChain('ethereum'),
    project: 'landx-finance',
    symbol: 'xBASKET',
    tvlUsd: xbasketTVL,
    apy: sumEthereumAPY / 4,
  };
  pools.push(pool);

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://landx.fi/dashboard/xTokens',
};
