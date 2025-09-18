const sdk = require('@defillama/sdk');
const axios = require('axios');

// Time constants
const MS_PER_SECOND = 1000;
const SECONDS_PER_DAY = 86400;
const THIRTY_DAYS_SECONDS = SECONDS_PER_DAY * 30;
const DAYS_PER_YEAR = 365;

// Contract addresses constants
const RATE_PROVIDER_CONTRACT_ADDRESS = '0x387dBc0fB00b26fb085aa658527D5BE98302c84C';
const EZETH_CONTRACT_ADDRESS = '0xbf5495efe5db9ce00f80364c8b423567e58d2110';

// Function ABI constants
const ERC20_ABI_totalSupply = 'erc20:totalSupply';
const RATE_PROVIDER_ABI_getRate = 'function getRate() external view returns (uint256)';

const apy = async () => {
  // Fetch current total supply of ezETH
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: EZETH_CONTRACT_ADDRESS,
        abi: ERC20_ABI_totalSupply,
      })
    ).output / 1e18;

  // Calculate timestamp for 30d ago
  const timestampNowMs = Date.now();
  const timestampNowSeconds = timestampNowMs / MS_PER_SECOND;
  const timestamp30DaysAgoSeconds = timestampNowSeconds - THIRTY_DAYS_SECONDS;

  // Fetch block number for 30d ago
  const block30dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp30DaysAgoSeconds}`)
  ).data.height;

  if (block30dayAgo === 0 || typeof block30dayAgo !== 'number') {
    throw new Error('RPC issue: Block number for 30d ago is invalid');
  }

  // Fetch current and 30d ago rates from the rate provider
  const [rateNow, rate30d] = await Promise.all([
    sdk.api.abi.call({
      target: RATE_PROVIDER_CONTRACT_ADDRESS,
      abi: RATE_PROVIDER_ABI_getRate,
    }),
    sdk.api.abi.call({
        target: RATE_PROVIDER_CONTRACT_ADDRESS,
        abi: RATE_PROVIDER_ABI_getRate,
        block: block30dayAgo,
      }),
  ]);

  if (rateNow.output == 0 || typeof rateNow.output !== 'string') {
    throw new Error('RPC issue: Current rate is invalid');
  }

  if (rate30d.output == 0 || typeof rate30d.output !== 'string') {
    throw new Error('RPC issue: 30d rate is invalid');
  }

  // Calculate APY for last 30 days
  const rateChangePeriodDays = 30;
  const rateStart = rate30d.output;
  const rateEnd = rateNow.output;
  const rateDelta = rateNow.output - rate30d.output;
  if (rateDelta === 0) {
    throw new Error("rateDelta is 0 -> apy30d would be 0, skipping");
  }
  const apy30d = (1 + rateDelta / rateStart) ** (DAYS_PER_YEAR / rateChangePeriodDays) - 1
  
  // Fetch ezETH price
  const priceKey = `ethereum:${EZETH_CONTRACT_ADDRESS}`;
  const ezethPriceUsd = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  if (ezethPriceUsd === 0 || typeof ezethPriceUsd !== 'number') {
    throw new Error('Oracle issue: ezETH price is invalid');
  }

  // Calculate TVL
  const tvlUsd = totalSupply * ezethPriceUsd;
  
  return [
    {
      pool: EZETH_CONTRACT_ADDRESS ,
      chain: 'ethereum',
      project: 'renzo',
      symbol: 'ezETH',
      apyBase: apy30d * 100,
      tvlUsd: tvlUsd,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.renzoprotocol.com',
};
