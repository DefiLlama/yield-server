const { gql, default: request } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const AURA_API =
  'https://graph.aura.finance/subgraphs/name/aura/aura-mainnet-v2-1';
const BAL_API =
  'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2';
const AURA_TVL_API = 'https://cache.aura.finance/aura/tvl-deprecated';
const SWAP_APR_API = 'https://cache.aura.finance/aura/aprs-deprecated';

const AURA_ADDRESS = '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF'.toLowerCase();
const BAL_ADDRESS = '0xba100000625a3754423978a60c9317c58a424e3D'.toLowerCase();
const WSTETH_ADDRESS =
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'.toLowerCase();

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

const getAuraMintAmount = (balEarned, auraSupply) => {
  const auraUnitsMinted =
    (((500 - (auraSupply - 50000000) / 100000) * 2.5 + 700) / 500) * balEarned;
  return auraUnitsMinted;
};

const balBoolsQuery = gql`
  query Pools($address_in: [Bytes!] = "") {
    pools(where: { address_in: $address_in }) {
      id
      symbol
      address
      tokens {
        address
        token {
          symbol
        }
        cashBalance
        balance
        decimals
        symbol
      }
    }
  }
`;

const auraPoolsQuery = gql`
  query Pools {
    pools {
      id
      lpToken {
        name
        symbol
        id
      }
      rewardData {
        rewardRate
        token {
          name
          id
        }
      }
      totalSupply
      totalStaked
      gauge {
        balance
        totalSupply
        workingSupply
      }
    }
  }
`;

const main = async () => {
  const { pricesByAddress: prices } = await utils.getPrices(
    [AURA_ADDRESS, BAL_ADDRESS],
    'ethereum'
  );
  const { pools: swapAprs } = await utils.getData(SWAP_APR_API);
  const auraSupply =
    (
      await sdk.api.abi.call({
        target: AURA_ADDRESS,
        abi: 'erc20:totalSupply',
        chain: 'ethereum',
      })
    ).output / 1e18;
  const {
    balancer: { breakdown: auraTvl },
  } = await utils.getData(AURA_TVL_API);
  const { pools } = await request(AURA_API, auraPoolsQuery);
  const { pools: balPools } = await request(BAL_API, balBoolsQuery, {
    address_in: pools.map(({ lpToken }) => lpToken.id),
  });

  let res = pools.map((pool) => {
    const balData = balPools.find(({ address }) => address === pool.lpToken.id);
    if (!balData) return;
    const swapApr = swapAprs.find(({ id }) => id === balData.id);
    if (!swapApr?.poolAprs) return;
    const tvlUsd = auraTvl[pool.lpToken.id] || 0;
    const balRewards = pool.rewardData.find(
      ({ token }) => token.id === BAL_ADDRESS
    );
    const auraExtraRewards = pool.rewardData.find(
      ({ token }) => token.id === AURA_ADDRESS
    );
    const balPerYear = (balRewards.rewardRate / 1e18) * SECONDS_PER_YEAR;
    const apyBal = (balPerYear / tvlUsd) * 100 * prices[BAL_ADDRESS] || 0;
    const auraPerYear = getAuraMintAmount(balPerYear, auraSupply);
    const apyAura = (auraPerYear / tvlUsd) * 100 * prices[AURA_ADDRESS] || 0;
    const auraExtraApy = auraExtraRewards
      ? (((auraExtraRewards.rewardRate / 1e18) * SECONDS_PER_YEAR) / tvlUsd) *
        100 *
        prices[AURA_ADDRESS]
      : 0;

    //make sure to account for stETH rewards on certain pools
    const wstETHApy = swapApr.poolAprs.tokens.breakdown[WSTETH_ADDRESS] || 0;

    const rewardTokens = [BAL_ADDRESS, AURA_ADDRESS];

    return {
      pool: pool.lpToken.id,
      project: 'aura',
      symbol: balData.tokens.map(({ symbol }) => symbol).join('-'),
      chain: utils.formatChain('ethereum'),
      tvlUsd,
      apyBase: Number(swapApr.poolAprs.swap) + wstETHApy,
      apyReward: apyBal + apyAura + auraExtraApy,
      underlyingTokens: balData.tokens.map(({ address }) => address),
      rewardTokens,
    };
  });

  res = res
    .filter(Boolean)
    .filter((p) => p.pool !== '0xe8cc7e765647625b95f59c15848379d10b9ab4af')
    .sort((a, b) => a.apyReward - b.apyReward);

  // subgraph returns some pools more than once, removing those dupes here
  const uniquePools = new Set();
  return res.filter((p) => {
    const x = uniquePools.has(p.pool);
    uniquePools.add(p.pool);
    return !x;
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.aura.finance/',
};
