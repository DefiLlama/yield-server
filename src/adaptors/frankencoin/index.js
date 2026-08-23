const axios = require('axios');
const { getPrices } = require('../utils.js');

const API_URL = 'https://api.frankencoin.com';
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

const getChainName = (chainId) => {
  return Object.keys(CHAINS).find((c) => CHAINS[c] == chainId);
};

// apy callback function
const apy = async () => {
  const savingsByChain = (await axios.get(`${API_URL}/savings/core/info`)).data
    .status;
  const savingsItems = Object.values(savingsByChain).flatMap((byModule) =>
    Object.values(byModule)
  );

  const defaultFrankencoin =
    ChainAddressMap['ethereum'].frankencoin.toLowerCase();
  const leadrateModuleId =
    'savings-0x3bf301b0e2003e75a3e86ab82bd1eff6a9dfb2ae-ethereum';

  const price = (await getPrices([defaultFrankencoin], 'ethereum'))
    .pricesByAddress[defaultFrankencoin];

  const earnPools = savingsItems.map((savings) => {
    const chain = getChainName(savings.chainId);
    const token = (
      chain == 'ethereum'
        ? defaultFrankencoin
        : ChainAddressMap[chain].bridgedFrankencoin
    ).toLowerCase();

    return {
      pool: `savings-${savings.module.toLowerCase()}-${chain}`,
      chain,
      project: 'frankencoin',
      symbol: `ZCHF`,
      apyBase: savings.rate / 10000 || 0, // converted from PPM to PCT
      tvlUsd: (savings.balance / 1e18) * price || 0,
      underlyingTokens: [token],
      url: `https://app.frankencoin.com/savings?chain=${chain}`,
      poolMeta: `Savings`,
    };
  });

  const openPositions = (await axios.get(`${API_URL}/positions/open`)).data
    .map;
  const positionData = Object.values(openPositions).filter(
    (pos) => pos.version === 2
  );

  const collateralAddresses = [
    ...new Set(positionData.map((pos) => pos.collateral.toLowerCase())),
  ];

  const collateralPrices = await getPrices(collateralAddresses, 'ethereum');
  const leadratePool = earnPools.find((p) => p.pool == leadrateModuleId);
  const leadrate = leadratePool ? leadratePool.apyBase : 0;

  const borrowPools = positionData.flatMap((pos) => {
    const chain = 'ethereum';
    const borrowToken = (
      chain == 'ethereum'
        ? defaultFrankencoin
        : ChainAddressMap[chain].bridgedFrankencoin
    ).toLowerCase();

    const collateralBalance =
      pos.collateralBalance / 10 ** pos.collateralDecimals;
    const collateralPrice =
      collateralPrices.pricesByAddress[pos.collateral.toLowerCase()];
    if (!collateralPrice) return [];
    const collateralValueUsd = collateralBalance * collateralPrice;

    const loanBalance = pos.minted / 10 ** 18;
    const loanValueUsd = loanBalance * price;

    const ltv = loanValueUsd / collateralValueUsd;

    return {
      pool: `position-v2-${pos.position.toLowerCase()}-${chain}`,
      chain,
      project: 'frankencoin',
      symbol: pos.collateralSymbol,
      apy: 0,
      tvlUsd: collateralValueUsd,
      underlyingTokens: [pos.collateral],
      apyBaseBorrow: leadrate + pos.riskPremiumPPM / 10000,
      totalSupplyUsd: (pos.limitForClones / 10 ** 18) * price,
      totalBorrowUsd: (pos.minted / 10 ** 18) * price,
      debtCeilingUsd: (pos.availableForClones / 10 ** 18) * price,
      ltv,
      mintedCoin: 'ZCHF',
      borrowToken,
      url: `https://app.frankencoin.com/monitoring/${pos.position}?chain=${chain}`,
      poolMeta: `PositionV2`,
    };
  });

  return [...earnPools, ...borrowPools];
};

// export
module.exports = {
  protocolId: '3790',
  apy,
};
