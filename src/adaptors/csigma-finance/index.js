const sdk = require('@defillama/sdk');

async function getChainIdToNameMap() {
  const url = 'https://api.llama.fi/chains';

  try {
    const response = await fetch(url);
    const data = await response.json();

    const chainIdMap = {};
    data.forEach(chain => {
      if (chain.chainId) {
        chainIdMap[parseInt(chain.chainId)] = chain.name;
      }
    });

    return chainIdMap;
  } catch (error) {
    return {};
  }
}

const apy = async function () {
  const response = await fetch('https://edgeapi.csigma.finance/api/v1/external/pools/apr');
  if (!response.ok) {
    console.error(`HTTP error! status: ${response.status}`);
    console.error(response);
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  const chainIdToName = await getChainIdToNameMap();

  let pools = [];
  for (const pool of data.data.pools) {
    const { address, networkId, apr } = pool;
    if (apr === 0) {
      continue; // Skip pools with APR 0
    }
    const chain = (chainIdToName[networkId] || 'unknown').toLowerCase();
    const [
      { output: poolToken },
      { output: tvl }
    ] = await Promise.all([
      sdk.api.abi.call({
        target: address,
        abi: "address:poolToken",
        chain,
      }),
      sdk.api.abi.call({
        target: address,
        abi: {
          "inputs": [],
          "name": "totalAssets",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        chain,
      })
    ])

    const [
      { output: tokenSymbol },
      { output: tokenDecimals }
    ] = await Promise.all([
      sdk.api.abi.call({
        target: poolToken,
        abi: "erc20:symbol",
        chain,
      }),
      sdk.api.abi.call({
        target: poolToken,
        abi: "erc20:decimals",
        chain,
      }),
    ]);


    pools.push({
      pool: `${address}-${chain}`, // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
      chain, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
      project: 'csigma-finance', // protocol (using the slug again)
      symbol: tokenSymbol, // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
      tvlUsd: (tvl * 1.0) / Math.pow(10, tokenDecimals), // TVL in USD, can be a single value or an array of values if pool is multi-sided
      apyBase: apr, // APY from pool fees/supplying in %
      rewardTokens: pool.stakingContractAddress ? ['0x53162ec0adae49f21515bb8ca91534dd3872c8db'] : [], // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
      underlyingTokens: [poolToken], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
      poolMeta: pool.name, // A string value which can stand for any specific details of a pool position, market, fee tier, lock duration, specific strategy etc
    });

  }
  return pools;
}
module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.csigma.finance',
};