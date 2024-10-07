const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { gql, GraphQLClient } = require('graphql-request');
const BigNumber = require('bignumber.js');
const { differenceInDays } = require('date-fns');

const erc4626TotalAssetsAbi = {
  inputs: [],
  name: 'totalAssets',
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

const poolAddresses = [
  {
    address: '0x27D22Eb71f00495Eccc89Bb02c2B68E6988C6A42',
    symbol: 'ETH++',
    underlyingAsset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  {
    address: '0xD1D64dAeED7504Ef3Eb056aa2D973bD064843A84',
    symbol: 'd2USDC',
    underlyingAsset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  {
    address: '0xaB2743a3A2e06d457368E901F5f927F271fa1374',
    symbol: 'GMX++',
    underlyingAsset: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
  },
  {
    address: '0x0F76De33a3679a6065D14780618b54584a3907D4',
    symbol: 'dgnETHv2',
    underlyingAsset: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  {
    address: '0xB0730AA7d6e880F901B5d71A971096dB56895a0f',
    symbol: 'iARB',
    underlyingAsset: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  {
    address: '0x291344FBaaC4fE14632061E4c336Fe3B94c52320',
    symbol: 'ARB++',
    underlyingAsset: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  {
    address: '0x5f44A7DD0a016A5Ec9682df36899A781442CAa43',
    symbol: 'dgnARB',
    underlyingAsset: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  {
    address: '0x36b1939ADf539a4AC94b57DBAd32FaEcd5bcF4d0',
    symbol: 'PlsDAOPlusv2',
    underlyingAsset: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  {
    address: '0x34F0FdD80A51dfd8bA42343c20F89217280d760E',
    symbol: 'Dewhalesv2',
    underlyingAsset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  {
    address: '0x57f467C9c4639B066F5A4D676Cd8Ed7D87C1791b',
    symbol: 'GTxD2',
    underlyingAsset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
];

const formatSecondsToDay = (seconds) => {
  const days = differenceInDays(new Date(seconds * 1000), new Date(0));
  return days;
};

const fetchVaultData = async (address) => {
  const client = new GraphQLClient('https://d2.finance/subgraphs/name/d2');
  const req = gql`
    query getVaultData($address: String!) {
      epochStarteds(
        where: { contract_contains_nocase: $address }
        orderBy: blockTimestamp
        orderDirection: desc
      ) {
        epoch
        epochEnd
        epochStart
        fundingStart
      }
      fundsReturneds(
        where: { contract_contains_nocase: $address }
        orderBy: blockTimestamp
        orderDirection: desc
      ) {
        amount
        epoch
        blockTimestamp
      }
      fundsCustodieds(
        where: { contract_contains_nocase: $address }
        orderBy: blockTimestamp
        orderDirection: desc
      ) {
        amount
        epoch
        blockTimestamp
      }
    }
  `;
  const response = await client.request(req, { address });

  return response;
};

const getPoolApy = async (pools) => {
  const poolPromises = pools.map(async (pool) => {
    const { epochStarteds, fundsReturneds, fundsCustodieds } =
      await fetchVaultData(pool.address);
    const epochAPYs = epochStarteds.map((epoch) => {
      const epochStart = Number(epoch.epochStart);
      const epochEnd = Number(epoch.epochEnd);
      const fundCustody = fundsCustodieds.find((fund) => {
        const blockTimestamp = Number(fund.blockTimestamp);
        return blockTimestamp > epochStart && blockTimestamp < epochEnd;
      });
      if (!fundCustody) {
        return 0;
      }
      const fundReturn = fundsReturneds.find(
        (fund) => Number(fund.epoch) === Number(fundCustody.epoch)
      );
      if (!fundReturn) {
        return 0;
      }
      const duration = formatSecondsToDay(epochEnd - epochStart);
      const APY = BigNumber(fundReturn.amount)
        .minus(fundCustody.amount)
        .div(fundCustody.amount)
        .times(365)
        .div(duration);

      return APY.isPositive() ? APY.toNumber() : 0;
    });

    const totalApy = epochAPYs.reduce((sum, epochAPY) => sum + epochAPY, 0);
    return {
      ...pool,
      apy:
        (totalApy * 100) /
        (fundsReturneds.length === 0 ? 1 : fundsReturneds.length),
    };
  });
  return Promise.all(poolPromises);
};

const getPoolTvl = async (pools, prices) => {
  const { output: outputBalances } = await sdk.api.abi.multiCall({
    abi: erc4626TotalAssetsAbi,
    calls: pools.map((pool) => ({
      target: pool.address,
    })),
    chain: 'arbitrum',
  });
  const balances = outputBalances.map((output) => output.output);
  return pools.map((pool, index) => {
    const priceData = prices.find(
      (price) =>
        price.address.toLowerCase() === pool.underlyingAsset.toLowerCase()
    );
    return {
      ...pool,
      tvlUsd: BigNumber(balances[index])
        .div(BigNumber(10).pow(priceData.decimals))
        .times(priceData.price)
        .toNumber(),
    };
  });
};

const getUnderlyingAssetData = async () => {
  const underlyingAssetAddresses = [
    ...new Set(poolAddresses.map((pool) => pool.underlyingAsset)),
  ];
  const { pricesByAddress: prices } = await utils.getPrices(
    underlyingAssetAddresses,
    'arbitrum'
  );
  const { output: decimalsOutput } = await sdk.api.abi.multiCall({
    abi: 'erc20:decimals',
    calls: underlyingAssetAddresses.map((address) => ({
      target: address,
    })),
    chain: 'arbitrum',
  });
  const decimals = decimalsOutput.map((output) => output.output);

  const underlyingAsset = underlyingAssetAddresses.map(
    (assetAddress, index) => {
      return {
        address: assetAddress,
        price: prices[assetAddress.toLowerCase()],
        decimals: decimals[index],
      };
    }
  );
  return underlyingAsset;
};

const poolsFunction = async () => {
  const underlyingAssetPrices = await getUnderlyingAssetData();
  const poolsWithBalances = await getPoolTvl(
    poolAddresses,
    underlyingAssetPrices
  );
  const poolsWithApy = await getPoolApy(poolsWithBalances);
  const result = poolsWithApy.map(({ address, symbol, tvlUsd, apy }) => {
    return {
      pool: `${address}-arbitrum`.toLowerCase(),
      chain: 'Arbitrum',
      project: 'd2-finance',
      symbol,
      tvlUsd,
      apy,
      poolMeta:
        "Strategy's lock duration is aligned with market opportunities, verifable onchain.",
    };
  });
  return result;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://d2.finance',
};
