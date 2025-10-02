const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');

const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const lensAbi = require('./lens.abi.json');
const factoryAbi = require('./factory.abi.json');

const chains = {
  ethereum: {
    factory: '0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e',
    vaultLens: '0x83801C7BbeEFa54B91F8A07E36D81515a0Fc5b60',
    fromBlock: 20529225,
  },
  bob: {
    factory: '0x046a9837A61d6b6263f54F4E27EE072bA4bdC7e4',
    vaultLens: '0xC6B56a52e5823659d90F3020164b92D1c2de03CE',
    fromBlock: 12266832,
  },
  sonic: {
    factory: '0xF075cC8660B51D0b8a4474e3f47eDAC5fA034cFB',
    vaultLens: '0x4c7BA548032FE3eA11b7D6BeaF736B3B74F69248',
    fromBlock: 5324454,
  },
  avax: {
    factory: '0xaf4B4c18B17F6a2B32F6c398a3910bdCD7f26181',
    vaultLens: '0xcC5F7593a4D5974F84A30B28Bd3fdb374319a254',
    fromBlock: 56805794,
  },
  berachain: {
    factory: '0x5C13fb43ae9BAe8470f646ea647784534E9543AF',
    vaultLens: '0x2ffd260BAd257C08516B649c93Ea3eb6b63a5639',
    fromBlock: 786314,
  },
  bsc: {
    factory: '0x7F53E2755eB3c43824E162F7F6F087832B9C9Df6',
    vaultLens: '0x84641751808f85F54344369036594E1a7301a414',
    fromBlock: 46370655,
  },
  base: {
    factory: '0x7F321498A801A191a93C840750ed637149dDf8D0',
    vaultLens: '0x3530dA02ceC2818477888FdC77e777b566B6db4C',
    fromBlock: 22282408,
  },
  swellchain: {
    factory: '0x238bF86bb451ec3CA69BB855f91BDA001aB118b9',
    vaultLens: '0x94Dd6A076838D6Fc5031e32138b95d810793DB1c',
    fromBlock: 2350701,
  },
  unichain: {
    factory: '0xbAd8b5BDFB2bcbcd78Cc9f1573D3Aad6E865e752',
    vaultLens: '0xd40DD19eD88a949436f784877A1BB59660ee8DE3',
    fromBlock: 8541544,
  },
  arbitrum: {
    factory: '0x78Df1CF5bf06a7f27f2ACc580B934238C1b80D50',
    vaultLens: '0x59d28aF1fC4A52EE402C9099BeCEf333366184Df',
    fromBlock: 300690953,
  },
  linea: {
    factory: '0x84711986Fd3BF0bFe4a8e6d7f4E22E67f7f27F04',
    vaultLens: '0xd20E9D6cfa0431aC306cC9906896a7BC0BE0Db64',
    fromBlock: 17915340,
  },
  tac: {
    factory: '0x2b21621b8Ef1406699a99071ce04ec14cCd50677',
    vaultLens: '0x70d9bc0aBd4EF6Ceb7C88875b9cf4013db3D780A',
    fromBlock: 555116,
  },
};

// Chain name mapping for URL construction
const chainNameMapping = {
  ethereum: 'ethereum',
  bob: 'bob',
  sonic: 'sonic',
  avax: 'avalanche',
  berachain: 'berachain',
  bsc: 'bnbsmartchain',
  base: 'base',
  swellchain: 'swellchain',
  unichain: 'unichain',
  arbitrum: 'arbitrumone',
  linea: 'lineamainnet',
  tac: 'tac',
};

const CHAIN_TIMEOUT_MS = 120_000;

const getLogsWithTimeout = (params, chain) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out fetching logs for ${chain}`)),
      CHAIN_TIMEOUT_MS
    );
  });

  return Promise.race([sdk.api.util.getLogs(params), timeoutPromise]).finally(
    () => clearTimeout(timer)
  );
};

const getApys = async () => {
  const factoryIFace = new ethers.utils.Interface(factoryAbi);

  const chainResults = await Promise.all(
    Object.entries(chains).map(async ([chain, config]) => {
      try {
        const currentBlock = await sdk.api.util.getLatestBlock(chain);
        const toBlock = currentBlock.number;

        // Fetch all pools from factory events
        const poolDeployEvents = await getLogsWithTimeout(
          {
            fromBlock: config.fromBlock,
            toBlock: toBlock,
            target: config.factory,
            chain: chain,
            topic: '',
            keys: [],
            topics: [factoryIFace.getEventTopic('ProxyCreated')],
            entireLog: true,
          },
          chain
        );

        const vaultAddresses = poolDeployEvents.output.map((event) => {
          const decoded = factoryIFace.decodeEventLog(
            'ProxyCreated',
            event.data,
            event.topics
          );
          return decoded['proxy'];
        });

        const vaultInfos = (
          await sdk.api.abi.multiCall({
            calls: vaultAddresses.map((address) => ({
              target: config.vaultLens,
              params: [address],
            })),
            abi: lensAbi.find((m) => m.name === 'getVaultInfoFull'),
            chain,
            permitFailure: true,
          })
        ).output.map((o) => o.output);

        // keep only pools with interest rate data
        const vaultInfosFilterted = vaultInfos.filter(
          (i) => i?.irmInfo?.interestRateInfo[0]?.supplyAPY > 0
        );

        const priceKeys = vaultInfosFilterted
          .map((i) => `${chain}:${i.asset}`)
          .join(',');

        const { data: prices } = await axios.get(
          `https://coins.llama.fi/prices/current/${priceKeys}`
        );

        const pools = vaultInfosFilterted.map((i) => {
          const price = prices.coins[`${chain}:${i.asset}`]?.price;

          const totalSupplied = i.totalAssets;
          const totalBorrowed = i.totalBorrowed;

          const totalSuppliedUSD =
            ethers.utils.formatUnits(totalSupplied, i.assetDecimals) * price;
          const totalBorrowedUSD =
            ethers.utils.formatUnits(totalBorrowed, i.assetDecimals) * price;

          return {
            pool: i.vault,
            chain,
            project: 'euler-v2',
            symbol: i.assetSymbol,
            poolMeta: i.vaultName,
            tvlUsd: totalSuppliedUSD - totalBorrowedUSD,
            totalSupplyUsd: totalSuppliedUSD,
            totalBorrowUsd: totalBorrowedUSD,
            apyBase: Number(
              ethers.utils.formatUnits(
                i.irmInfo.interestRateInfo[0].supplyAPY,
                25
              )
            ),
            apyBaseBorrow: Number(
              ethers.utils.formatUnits(
                i.irmInfo.interestRateInfo[0].borrowAPY,
                25
              )
            ),
            underlyingTokens: [i.asset],
            url: `https://app.euler.finance/vault/${i.vault}?network=${chainNameMapping[chain]}`,
          };
        });
        return pools;
      } catch (err) {
        console.error(`Error processing chain ${chain}:`, err);
        return [];
      }
    })
  );

  return await addMerklRewardApy(chainResults.flat(), 'euler');
};

module.exports = {
  timetravel: false,
  apy: getApys,
};
