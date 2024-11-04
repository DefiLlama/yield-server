const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');

const utils = require('../utils');

BigNumber.config({ EXPONENTIAL_AT: [-1e9, 1e9] });

// 2.2.8
const url =
  'https://api.thegraph.com/subgraphs/id/QmZwDpzNPEdDFMmSghyBC6wZ3aAjJqFB2xrAsrcLCPwVQk';

const fallbackBlacklist = ['0x6543ee07cf5dd7ad17aeecf22ba75860ef3bbaaa'];

const pageSizeLimit = 100;

const getAssetsAbi = {
  inputs: [],
  name: 'getAssets',
  outputs: [
    {
      internalType: 'address[]',
      name: 'assets',
      type: 'address[]',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getBalanceAbi = {
  inputs: [
    {
      internalType: 'address',
      name: 'account',
      type: 'address',
    },
  ],
  name: 'balanceOf',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getDecimalsAbi = {
  inputs: [],
  name: 'decimals',
  outputs: [
    {
      internalType: 'uint8',
      name: '',
      type: 'uint8',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getAssetStateAbi = {
  inputs: [],
  name: 'getAssetsWithState',
  outputs: [
    {
      internalType: 'address[]',
      name: 'assets',
      type: 'address[]',
    },
    {
      components: [
        {
          internalType: 'contract IShareToken',
          name: 'collateralToken',
          type: 'address',
        },
        {
          internalType: 'contract IShareToken',
          name: 'collateralOnlyToken',
          type: 'address',
        },
        {
          internalType: 'contract IShareToken',
          name: 'debtToken',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'totalDeposits',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'collateralOnlyDeposits',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'totalBorrowAmount',
          type: 'uint256',
        },
      ],
      internalType: 'struct IBaseSilo.AssetStorage[]',
      name: 'assetsStorage',
      type: 'tuple[]',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const START_BLOCK_ETHEREUM = 15307294;
const SILO_FACTORY_ETHEREUM = '0x4D919CEcfD4793c0D47866C8d0a02a0950737589';

const query = gql`
  {
    markets(where: { totalValueLockedUSD_gt: 100 }) {
      id
      name
      totalValueLockedUSD
      totalBorrowBalanceUSD
      inputToken {
        id
        symbol
        decimals
        # totalSupply
        lastPriceUSD
      }
      marketAssets {
        id
        balance
        supply
        protectedSupply
        tokenPriceUSD
        maximumLTV
        dToken {
          totalSupply
          derivativeConversion
        }
        asset {
          id
          decimals
          lastPriceUSD
        }
      }
      rates {
        rate
        side
        token {
          id
          symbol
        }
      }
      # 2.0.3
      outputToken {
        id
        lastPriceUSD
      }
    }
  }
`;

async function getSiloAddressesToAssetBalances(block, silos) {
  const { output: assets } = await sdk.api.abi.multiCall({
    abi: getAssetsAbi,
    calls: silos.map((i) => ({ target: i })),
    block,
  });

  const tokenAddressAndSiloAddressPairs = assets
    .map((i) => i.output.map((j) => [j, i.input.target]))
    .flat();

  // We put all silo addresses from tokenAddressAndSiloAddressPairs into an array
  // We can then associate the balances/decimals with the silos based on their indexes
  // siloAddressesToResultIndex, assetAddressesToResultIndex, balances & decimals align with each other by index
  // i.e. we maintain parity of their indexes

  const siloAddressesParityIndexed = tokenAddressAndSiloAddressPairs.map(
    (entry) => entry[1]
  );

  const { output: balancesRaw } = await sdk.api.abi.multiCall({
    abi: getBalanceAbi,
    calls: tokenAddressAndSiloAddressPairs.map((i) => ({
      target: i[0],
      params: [i[1]],
    })),
    block,
  });

  const balances = balancesRaw.map((entry) => entry.output);

  const { output: decimalsRaw } = await sdk.api.abi.multiCall({
    abi: getDecimalsAbi,
    calls: tokenAddressAndSiloAddressPairs.map((i) => ({ target: i[0] })),
    block,
  });

  const decimals = decimalsRaw.map((entry) => entry.output);

  let parityIndex = 0;
  let siloAddressToAssetBalanceResults = {};
  for (let balance of balances) {
    let siloAddress = siloAddressesParityIndexed[parityIndex];
    let assetAddress = tokenAddressAndSiloAddressPairs[parityIndex][0];
    let assetDecimals = decimals[parityIndex];
    let assetBalance = new BigNumber(
      ethers.utils.formatUnits(balances[parityIndex], assetDecimals)
    ).toString();
    if (!siloAddressToAssetBalanceResults[siloAddress]) {
      siloAddressToAssetBalanceResults[siloAddress] = [];
    }
    siloAddressToAssetBalanceResults[siloAddress].push({
      siloAddress,
      assetAddress,
      assetBalance,
    });
    parityIndex++;
  }

  return siloAddressToAssetBalanceResults;
}

const main = async () => {
  const latestBlock = await sdk.api.util.getLatestBlock('ethereum');
  const latestBlockNumber = latestBlock.number;

  // market data
  const data = await request(url, query);

  const siloAddresses = data.markets
    .map((item) => ethers.utils.getAddress(item.id))
    .filter(
      (address) => fallbackBlacklist.indexOf(address.toLowerCase()) === -1
    );

  const siloAddressesToAssetBalances = await getSiloAddressesToAssetBalances(
    latestBlockNumber,
    siloAddresses
  );

  const markets = [];

  let tokenAddressToLastPriceUsd = {};

  for (let market of data.markets) {
    const {
      id,
      name,
      totalValueLockedUSD,
      inputToken,
      outputToken, // 2.0.3
      marketAssets,
      rates,
      totalBorrowBalanceUSD,
    } = market;

    if (fallbackBlacklist.indexOf(id.toLowerCase()) === -1) {
      let siloChecksumAddress = ethers.utils.getAddress(id);
      let inputTokenChecksumAddress = ethers.utils.getAddress(inputToken.id);

      for (let outputTokenEntry of outputToken) {
        let checksumAddress = ethers.utils.getAddress(outputTokenEntry.id);
        if (!tokenAddressToLastPriceUsd[checksumAddress]) {
          tokenAddressToLastPriceUsd[checksumAddress] =
            outputTokenEntry.lastPriceUSD ? outputTokenEntry.lastPriceUSD : 0;
        }
      }

      if (!tokenAddressToLastPriceUsd[inputTokenChecksumAddress]) {
        tokenAddressToLastPriceUsd[inputTokenChecksumAddress] =
          inputToken.lastPriceUSD ? inputToken.lastPriceUSD : 0;
      }

      let underlyingAssetAddresses = [];
      let siloAssetBalances = siloAddressesToAssetBalances[siloChecksumAddress];

      let tvlUsd = new BigNumber(0);
      for (let siloAssetBalanceEntry of siloAssetBalances) {
        if (
          siloAssetBalanceEntry.assetAddress ===
          '0xd7C9F0e536dC865Ae858b0C0453Fe76D13c3bEAc'
        ) {
          continue;
        }
        underlyingAssetAddresses.push(siloAssetBalanceEntry.assetAddress);
        let useAssetPrice = tokenAddressToLastPriceUsd[
          siloAssetBalanceEntry.assetAddress
        ]
          ? tokenAddressToLastPriceUsd[siloAssetBalanceEntry.assetAddress]
          : 0;
        tvlUsd = tvlUsd.plus(
          new BigNumber(siloAssetBalanceEntry.assetBalance).multipliedBy(
            tokenAddressToLastPriceUsd[siloAssetBalanceEntry.assetAddress]
          )
        );
      }

      let inputTokenBorrowRateObject = rates.find(
        (rate) => rate.token.id === inputToken.id && rate.side === 'BORROWER'
      );
      let inputTokenSupplyRateObject = rates.find(
        (rate) => rate.token.id === inputToken.id && rate.side === 'LENDER'
      );

      let inputMarketAsset = marketAssets.filter(
        (marketAsset) => marketAsset.asset.id === inputToken.id
      )?.[0];

      let ltvInputToken = new BigNumber(inputMarketAsset?.maximumLTV)
        .dividedBy(100)
        .toNumber();

      let totalBorrowUsdInputTokenRaw = new BigNumber(
        inputMarketAsset?.dToken.totalSupply
      )
        .multipliedBy(inputMarketAsset?.dToken.derivativeConversion)
        .decimalPlaces(0, 1)
        .toString();
      let totalBorrowUsdInputToken = new BigNumber(
        ethers.utils.formatUnits(
          totalBorrowUsdInputTokenRaw,
          inputMarketAsset?.asset?.decimals
        )
      )
        .multipliedBy(inputMarketAsset?.asset?.lastPriceUSD)
        .toString();

      let totalSupplyUsdInputTokenRaw = new BigNumber(inputMarketAsset?.supply)
        .minus(inputMarketAsset?.protectedSupply)
        .toString();
      let totalSupplyUsdInputToken = new BigNumber(
        ethers.utils.formatUnits(
          totalSupplyUsdInputTokenRaw,
          inputMarketAsset?.asset?.decimals
        )
      )
        .multipliedBy(inputMarketAsset?.asset?.lastPriceUSD)
        .toString();

      markets.push({
        pool: `${market.id}-ethereum`,
        chain: 'Ethereum',
        project: 'silo-finance',
        symbol: utils.formatSymbol(name),
        tvlUsd: tvlUsd.toNumber(),
        apyBase: Number(inputTokenSupplyRateObject.rate),
        apyBaseBorrow: Number(inputTokenBorrowRateObject.rate),
        url: `https://app.silo.finance/silo/${market.id}`,
        underlyingTokens: underlyingAssetAddresses,
        ltv: ltvInputToken,
        totalBorrowUsd: totalBorrowUsdInputToken,
        totalSupplyUsd: totalSupplyUsdInputToken,
      });
    }
  }

  return markets;
};

module.exports = {
  timetravel: false,
  apy: main,
};
