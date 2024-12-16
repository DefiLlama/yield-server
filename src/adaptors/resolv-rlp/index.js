const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');

const RLP = '0x4956b52aE2fF65D74CA2d61207523288e4528f96';

const rlpPriceStorage = '0xAa33e5ECAE01779b26cD9dBD3c62E34c29b2D565';

const topic0priceSet =
  '0x2f0fe01aa6daff1c7bb411a324bdebe55dc2cd1e0ff2fc504b7569346e7d7d5a';

const priceSetInterface = new ethers.utils.Interface([
  'event PriceSet(bytes32 indexed key, uint256 price, uint256 timestamp);',
]);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getTotalSupply = async (tokenAddress, chain = 'ethereum') => {
  try {
    const { output } = await sdk.api.abi.call({
      target: tokenAddress,
      abi: 'erc20:totalSupply',
      chain,
    });
    return output / 1e18;
  } catch (error) {
    console.error(`Error fetching total supply for ${tokenAddress}:`, error);
    throw error;
  }
};

const getTokenPrice = async (tokenAddress) => {
  try {
    const priceKey = `ethereum:${tokenAddress}`;
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${priceKey}`
    );
    return data.coins[priceKey].price;
  } catch (error) {
    console.error(`Error fetching price for ${tokenAddress}:`, error);
    throw error;
  }
};

const rlpPool = async () => {
  try {
    const totalSupply = await getTotalSupply(RLP);
    const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
    const currentDate = new Date(currentBlock.timestamp * 1000);
    const previousStartOfDay =
      new Date(currentDate).setHours(0, 0, 0, 0) - 2 * DAY_IN_MS;

    const [fromBlock] = await utils.getBlocksByTime(
      [previousStartOfDay / 1000],
      'ethereum'
    );
    const toBlock = currentBlock.block;

    const logs = (
      await sdk.api.util.getLogs({
        target: rlpPriceStorage,
        topic: '',
        fromBlock,
        toBlock,
        keys: [],
        chain: 'ethereum',
        topics: [topic0priceSet],
      })
    ).output.sort((a, b) => a.blockNumber - b.blockNumber);

    let aprBase = 0;
    if (logs.length >= 2) {
      const lastLpPrice = priceSetInterface.parseLog(logs[logs.length - 1]).args
        .price;
      const previousLpPrice = priceSetInterface.parseLog(logs[logs.length - 2])
        .args.price;

      aprBase = ((lastLpPrice - previousLpPrice) / previousLpPrice) * 365;
    }

    const price =
      logs.length > 0
        ? priceSetInterface.parseLog(logs[logs.length - 1]).args.price / 1e18
        : await getTokenPrice(RLP);
    const tvl = totalSupply * price;

    return {
      pool: RLP,
      symbol: 'RLP',
      chain: 'ethereum',
      project: 'resolv-rlp',
      tvlUsd: tvl,
      apyBase: aprBase * 100,
    };
  } catch (error) {
    console.error('Error fetching RLP pool data:', error);
    throw error;
  }
};

const apy = async () => {
  try {
    return [await rlpPool()];
  } catch (error) {
    console.error('Error fetching APYs:', error);
    throw error;
  }
};

module.exports = {
  apy,
  url: 'https://www.resolv.xyz/',
};
