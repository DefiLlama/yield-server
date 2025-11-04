const { request, gql } = require('graphql-request');
const { getPrices } = require('../utils.js');

const GRAPH_URL = 'https://ponder.frankencoin.com';
const CHAINS = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  avalanche: 43114,
  gnosis: 100,
  sonic: 146,
};

// @dev: all relevant addresses across all supported chains
const ChainAddressMap = {
  ethereum: {
    frankencoin: '0xB58E61C3098d85632Df34EecfB899A1Ed80921cB',
    equity: '0x1bA26788dfDe592fec8bcB0Eaff472a42BE341B2',
    savingsV2: '0x3BF301B0e2003E75A3e86AB82bD1EFF6A9dFB2aE',
    savingsReferral: '0x27d9AD987BdE08a0d083ef7e0e4043C857A17B38',
  },
  polygon: {
    bridgedFrankencoin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
    bridgedSavings: '0xB519BAE359727e69990C27241Bef29b394A0ACbD',
  },
  arbitrum: {
    bridgedFrankencoin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
    bridgedSavings: '0xb41715e54e9f0827821A149AE8eC1aF70aa70180',
  },
  optimism: {
    bridgedFrankencoin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
    bridgedSavings: '0x6426324Af1b14Df3cd03b2d500529083c5ea61BC',
  },
  base: {
    bridgedFrankencoin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
    bridgedSavings: '0x6426324Af1b14Df3cd03b2d500529083c5ea61BC',
  },
  avalanche: {
    bridgedFrankencoin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
    bridgedSavings: '0x8e7c2a697751a1cE7a8DB51f01B883A27c5c8325',
  },
  gnosis: {
    bridgedFrankencoin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
    bridgedSavings: '0xbF594D0feD79AE56d910Cb01b5dD4f4c57B04402',
  },
  sonic: {
    bridgedFrankencoin: '0xD4dD9e2F021BB459D5A5f6c24C12fE09c5D45553',
    bridgedSavings: '0x4E104918908293cd6A93E1A9bbe06C345d751235',
  },
};

const gqlQueries = {
  // Query for Lending SavingsReferral - Multichain
  lending: gql`
    {
      savingsStatuss {
        items {
          chainId
          module
          balance
          rate
        }
      }
    }
  `,
  // Query for Borrow PositionV2 - Mainnet
  borrowing: '',
};

const getChainName = (chainId) => {
  return Object.keys(CHAINS).find((c) => CHAINS[c] == chainId);
};

// apy callback function
const apy = async () => {
  const { savingsStatuss } = await request(GRAPH_URL, gqlQueries.lending, {});

  const defaultFrankencoin = ChainAddressMap['ethereum'].frankencoin;
  const price = (await getPrices([defaultFrankencoin], 'ethereum'))
    .pricesByAddress[defaultFrankencoin.toLowerCase()];

  const earnPools = savingsStatuss.items.map((savings) => {
    const chain = getChainName(savings.chainId);
    const token = (
      chain == 'ethereum'
        ? defaultFrankencoin
        : ChainAddressMap[chain].bridgedFrankencoin
    ).toLowerCase();

    return {
      pool: `frankencoin-savings-${savings.module.toLowerCase()}-${chain}`,
      chain,
      project: 'frankencoin',
      symbol: `ZCHF`,
      apyBase: savings.rate / 10000 || 0, // converted from PPM to PCT
      tvlUsd: (savings.balance / 1e18) * price || 0,
      underlyingTokens: [token],
      url: `https://app.frankencoin.com/savings?chain=${chain}`,
      poolMeta: `Savings (${chain})`,
    };
  });

  return [...earnPools];
};

// export
module.exports = {
  apy,
};
