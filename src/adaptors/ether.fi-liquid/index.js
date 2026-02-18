const sdk = require('@defillama/sdk');
const axios = require('axios');

// Liquid ETH Vault (liquidETH) - same address on Ethereum and Scroll
const liquidETH = '0xf0bb20865277aBd641a307eCe5Ee04E79073416C';
const liquidETHAccountant = '0x0d05D94a5F1E76C18fbeB7A13d17C8a314088198';

// Liquid USD Vault (liquidUSD) - same address on Ethereum and Scroll
const liquidUSD = '0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C';
const liquidUSDAccountant = '0xc315D6e14DDCDC7407784e2Caf815d131Bc1D3E7';

// Liquid BTC Vault (liquidBTC) - same address on Ethereum and Scroll
const liquidBTC = '0x5f46d540b6eD704C3c8789105F30E075AA900726';
const liquidBTCAccountant = '0xEa23aC6D7D11f6b181d6B98174D334478ADAe6b0';

// Liquid HYPE Vault (liquidHYPE) on Hyperliquid
const liquidHYPE = '0x441794D6a8F9A3739F5D4E98a728937b33489D29';
const liquidHYPEOracle = '0x1CeaB703956e24b18a0AF6b272E0bF3F499aCa0F';

// Underlying tokens (Ethereum)
const weETH = '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
const HYPE = '0x0000000000000000000000000000000000000000';
const beHYPE = '0xd8FC8F0b03eBA61F64D08B0bef69d80916E5DdA9';

const SECONDS_PER_DAY = 86400;

const getBlocksByTime = async (timestamps, chain = 'ethereum') => {
  const blocks = await Promise.all(
    timestamps.map(async (t) => {
      const response = await axios.get(
        `https://coins.llama.fi/block/${chain}/${t}`
      );
      return response.data.height;
    })
  );
  return blocks;
};

// Get total supply across multiple chains
const getMultichainSupply = async (tokenAddress, chains, decimals) => {
  const supplies = await Promise.all(
    chains.map(async (chain) => {
      try {
        const result = await sdk.api.abi.call({
          target: tokenAddress,
          abi: 'erc20:totalSupply',
          chain,
        });
        return Number(result.output) / Math.pow(10, decimals);
      } catch (e) {
        return 0;
      }
    })
  );
  return supplies.reduce((sum, s) => sum + s, 0);
};

// Get liquidHYPE oracle data from Redstone feed
const getLiquidHYPEOracleData = async () => {
  const roundDataAbi =
    'function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)';
  const latestRoundAbi =
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)';

  try {
    // Get latest round data
    const latestResult = await sdk.api.abi.call({
      target: liquidHYPEOracle,
      abi: latestRoundAbi,
      chain: 'hyperliquid',
    });

    const currentRoundId = Number(latestResult.output.roundId);
    const currentRate = Number(latestResult.output.answer) / 1e8;
    const currentTimestamp = Number(latestResult.output.updatedAt);

    // Find rounds close to 1 day and 7 days ago
    const now = Math.floor(Date.now() / 1000);
    const target1d = now - SECONDS_PER_DAY;
    const target7d = now - 7 * SECONDS_PER_DAY;

    let rate1dAgo = null;
    let timestamp1dAgo = null;
    let rate7dAgo = null;
    let timestamp7dAgo = null;

    // Search through previous rounds to find historical data
    for (
      let roundId = currentRoundId - 1;
      roundId >= 1 && roundId >= currentRoundId - 50;
      roundId--
    ) {
      try {
        const roundResult = await sdk.api.abi.call({
          target: liquidHYPEOracle,
          abi: roundDataAbi,
          params: [roundId],
          chain: 'hyperliquid',
        });

        const timestamp = Number(roundResult.output[3]);
        const rate = Number(roundResult.output[1]) / 1e8;

        // Find the closest round to 1 day ago
        if (!rate1dAgo && timestamp <= target1d) {
          rate1dAgo = rate;
          timestamp1dAgo = timestamp;
        }

        // Find the closest round to 7 days ago
        if (!rate7dAgo && timestamp <= target7d) {
          rate7dAgo = rate;
          timestamp7dAgo = timestamp;
          break;
        }
      } catch (e) {
        break;
      }
    }

    return {
      currentRate,
      currentTimestamp,
      rate1dAgo,
      timestamp1dAgo,
      rate7dAgo,
      timestamp7dAgo,
    };
  } catch (e) {
    console.error('Error fetching liquidHYPE oracle data:', e.message);
    return null;
  }
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;

  const [block1dayAgo, block7dayAgo] = await getBlocksByTime([
    timestamp1dayAgo,
    timestamp7dayAgo,
  ]);

  const rateAbi = 'function getRate() external view returns (uint256)';

  // Fetch rates for all Ethereum vaults at current, 1d ago, and 7d ago
  const [
    liquidETHRates,
    liquidUSDRates,
    liquidBTCRates,
    liquidHYPEOracleData,
  ] = await Promise.all([
    Promise.all([
      sdk.api.abi.call({ target: liquidETHAccountant, abi: rateAbi }),
      sdk.api.abi.call({
        target: liquidETHAccountant,
        abi: rateAbi,
        block: block1dayAgo,
      }),
      sdk.api.abi.call({
        target: liquidETHAccountant,
        abi: rateAbi,
        block: block7dayAgo,
      }),
    ]),
    Promise.all([
      sdk.api.abi.call({ target: liquidUSDAccountant, abi: rateAbi }),
      sdk.api.abi.call({
        target: liquidUSDAccountant,
        abi: rateAbi,
        block: block1dayAgo,
      }),
      sdk.api.abi.call({
        target: liquidUSDAccountant,
        abi: rateAbi,
        block: block7dayAgo,
      }),
    ]),
    Promise.all([
      sdk.api.abi.call({ target: liquidBTCAccountant, abi: rateAbi }),
      sdk.api.abi.call({
        target: liquidBTCAccountant,
        abi: rateAbi,
        block: block1dayAgo,
      }),
      sdk.api.abi.call({
        target: liquidBTCAccountant,
        abi: rateAbi,
        block: block7dayAgo,
      }),
    ]),
    getLiquidHYPEOracleData(),
  ]);

  // Get total supplies across chains (liquidETH, liquidUSD, and liquidBTC are bridged to Scroll)
  const [
    liquidETHTotalSupply,
    liquidUSDTotalSupply,
    liquidBTCTotalSupply,
    liquidHYPESupply,
  ] = await Promise.all([
    getMultichainSupply(liquidETH, ['ethereum', 'scroll'], 18),
    getMultichainSupply(liquidUSD, ['ethereum', 'scroll'], 6),
    getMultichainSupply(liquidBTC, ['ethereum', 'scroll'], 8),
    sdk.api.abi
      .call({
        target: liquidHYPE,
        abi: 'erc20:totalSupply',
        chain: 'hyperliquid',
      })
      .then((r) => Number(r.output) / 1e18),
  ]);

  // Get prices for underlying tokens
  const priceKeys = [
    `ethereum:${liquidETH}`,
    `ethereum:${liquidUSD}`,
    `ethereum:${WBTC}`,
    `hyperliquid:0x0000000000000000000000000000000000000000`,
  ];
  const pricesRes = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKeys.join(',')}`
  );

  const liquidETHPrice =
    pricesRes.data.coins[`ethereum:${liquidETH}`]?.price || 0;
  const liquidUSDPrice =
    pricesRes.data.coins[`ethereum:${liquidUSD}`]?.price || 1;
  const wbtcPrice = pricesRes.data.coins[`ethereum:${WBTC}`]?.price || 0;
  const hypePrice =
    pricesRes.data.coins[`hyperliquid:0x0000000000000000000000000000000000000000`]?.price || 0;

  // Calculate liquidETH APY
  const liquidETHRateCurrent = Number(liquidETHRates[0].output);
  const liquidETHRate1dAgo = Number(liquidETHRates[1].output);
  const liquidETHRate7dAgo = Number(liquidETHRates[2].output);

  const liquidETHApr1d =
    liquidETHRate1dAgo > 0
      ? ((liquidETHRateCurrent - liquidETHRate1dAgo) / liquidETHRate1dAgo) *
        365 *
        100
      : 0;

  const liquidETHApr7d =
    liquidETHRate7dAgo > 0
      ? ((liquidETHRateCurrent - liquidETHRate7dAgo) /
          liquidETHRate7dAgo /
          7) *
        365 *
        100
      : 0;

  // Calculate liquidUSD APY
  const liquidUSDRateCurrent = Number(liquidUSDRates[0].output);
  const liquidUSDRate1dAgo = Number(liquidUSDRates[1].output);
  const liquidUSDRate7dAgo = Number(liquidUSDRates[2].output);

  const liquidUSDApr1d =
    liquidUSDRate1dAgo > 0
      ? ((liquidUSDRateCurrent - liquidUSDRate1dAgo) / liquidUSDRate1dAgo) *
        365 *
        100
      : 0;

  const liquidUSDApr7d =
    liquidUSDRate7dAgo > 0
      ? ((liquidUSDRateCurrent - liquidUSDRate7dAgo) /
          liquidUSDRate7dAgo /
          7) *
        365 *
        100
      : 0;

  // Calculate liquidBTC APY
  const liquidBTCRateCurrent = Number(liquidBTCRates[0].output);
  const liquidBTCRate1dAgo = Number(liquidBTCRates[1].output);
  const liquidBTCRate7dAgo = Number(liquidBTCRates[2].output);

  const liquidBTCApr1d =
    liquidBTCRate1dAgo > 0
      ? ((liquidBTCRateCurrent - liquidBTCRate1dAgo) / liquidBTCRate1dAgo) *
        365 *
        100
      : 0;

  const liquidBTCApr7d =
    liquidBTCRate7dAgo > 0
      ? ((liquidBTCRateCurrent - liquidBTCRate7dAgo) /
          liquidBTCRate7dAgo /
          7) *
        365 *
        100
      : 0;

  // Calculate liquidHYPE APY from oracle data
  let liquidHYPEApr1d = 0;
  let liquidHYPEApr7d = 0;

  if (liquidHYPEOracleData) {
    const {
      currentRate,
      currentTimestamp,
      rate1dAgo,
      timestamp1dAgo,
      rate7dAgo,
      timestamp7dAgo,
    } = liquidHYPEOracleData;

    if (rate1dAgo && timestamp1dAgo) {
      const daysDiff = (currentTimestamp - timestamp1dAgo) / SECONDS_PER_DAY;
      if (daysDiff > 0) {
        liquidHYPEApr1d =
          ((currentRate - rate1dAgo) / rate1dAgo / daysDiff) * 365 * 100;
      }
    }

    if (rate7dAgo && timestamp7dAgo) {
      const daysDiff = (currentTimestamp - timestamp7dAgo) / SECONDS_PER_DAY;
      if (daysDiff > 0) {
        liquidHYPEApr7d =
          ((currentRate - rate7dAgo) / rate7dAgo / daysDiff) * 365 * 100;
      }
    }
  }

  // Calculate TVL using DefiLlama token prices (includes rate appreciation)
  const liquidETHTvl = liquidETHTotalSupply * liquidETHPrice;
  const liquidUSDTvl = liquidUSDTotalSupply * liquidUSDPrice;
  const liquidBTCTvl =
    liquidBTCTotalSupply * (liquidBTCRateCurrent / 1e8) * wbtcPrice;

  // liquidHYPE: totalSupply * rate * HYPE price
  const liquidHYPERate = liquidHYPEOracleData?.currentRate || 1;
  const liquidHYPETvl = liquidHYPESupply * liquidHYPERate * hypePrice;

  const pools = [
    {
      pool: `${liquidETH}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'ether.fi-liquid',
      symbol: 'liquidETH',
      tvlUsd: liquidETHTvl,
      apyBase: liquidETHApr1d > 0 ? liquidETHApr1d : liquidETHApr7d,
      apyBase7d: liquidETHApr7d,
      underlyingTokens: [weETH],
      tokenAddress: liquidETH,
      url: 'https://app.ether.fi/liquid/eth',
    },
    {
      pool: `${liquidUSD}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'ether.fi-liquid',
      symbol: 'liquidUSD',
      tvlUsd: liquidUSDTvl,
      apyBase: liquidUSDApr1d > 0 ? liquidUSDApr1d : liquidUSDApr7d,
      apyBase7d: liquidUSDApr7d,
      underlyingTokens: [USDC],
      tokenAddress: liquidUSD,
      url: 'https://app.ether.fi/liquid/usd',
    },
    {
      pool: `${liquidBTC}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'ether.fi-liquid',
      symbol: 'liquidBTC',
      tvlUsd: liquidBTCTvl,
      apyBase: liquidBTCApr1d > 0 ? liquidBTCApr1d : liquidBTCApr7d,
      apyBase7d: liquidBTCApr7d,
      underlyingTokens: [WBTC],
      tokenAddress: liquidBTC,
      url: 'https://app.ether.fi/liquid/btc',
    },
    {
      pool: `${liquidHYPE}-hyperliquid`.toLowerCase(),
      chain: 'Hyperliquid',
      project: 'ether.fi-liquid',
      symbol: 'liquidHYPE',
      tvlUsd: liquidHYPETvl,
      apyBase: liquidHYPEApr1d > 0 ? liquidHYPEApr1d : liquidHYPEApr7d,
      apyBase7d: liquidHYPEApr7d > 0 ? liquidHYPEApr7d : undefined,
      underlyingTokens: [HYPE, beHYPE],
      tokenAddress: liquidHYPE,
      url: 'https://app.ether.fi/liquid/hype',
    },
  ];

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ether.fi/liquid',
};
