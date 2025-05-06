const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const lensAbi = require('./lens.abi.json');
const factoryAbi = require('./factory.abi.json');
const axios = require('axios');
const { url } = require('inspector');

const chains = {
  ethereum: {
    factory: '0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e',
    vaultLens: '0xA8695d44EC128136F8Afcd796D6ba3Db3cdA8914',
    fromBlock: 20529225,
  },
  bob: {
    factory: '0x046a9837A61d6b6263f54F4E27EE072bA4bdC7e4',
    vaultLens: '0xb20343277ad78150D21CC8820fF012efDDa71531',
    fromBlock: 12266832,
  },
  sonic: {
    factory: '0xF075cC8660B51D0b8a4474e3f47eDAC5fA034cFB',
    vaultLens: '0x0058F402aaa67868A682DA1bDd2E08c7aA3795eE',
    fromBlock: 5324454,
  },
  avax: {
    factory: '0xaf4B4c18B17F6a2B32F6c398a3910bdCD7f26181',
    vaultLens: '0xeE2CaC5Df4984f56395b48e71b1D1E84acFbcD9E',
    fromBlock: 56805794,
  },
  berachain: {
    factory: '0x5C13fb43ae9BAe8470f646ea647784534E9543AF',
    vaultLens: '0xa61BC2Df76DBFCeDAe4fAaB7A1341bA98fA76FdA',
    fromBlock: 786314,
  },
  bsc: {
    factory: '0x7F53E2755eB3c43824E162F7F6F087832B9C9Df6',
    vaultLens: '0xBfD019C90e8Ca8286f9919DF31c25BF989C6bD46',
    fromBlock: 46370655,
  },
};

const getApys = async () => {
  const result = [];

  const factoryIFace = new ethers.utils.Interface(factoryAbi);
  const lensIFace = new ethers.utils.Interface(lensAbi);

  for (const [chain, config] of Object.entries(chains)) {
    const currentBlock = await sdk.api.util.getLatestBlock(chain);
    const toBlock = currentBlock.number;

    // Fetch all pools from factory events
    const poolDeployEvents = await sdk.api.util.getLogs({
      fromBlock: config.fromBlock,
      toBlock: toBlock,
      target: config.factory,
      chain: chain,
      topic: '',
      keys: [],
      topics: [factoryIFace.getEventTopic('ProxyCreated')],
      entireLog: true,
    });

    const vaultAddresses = poolDeployEvents.output.map((event) => {
      const decoded = factoryIFace.decodeEventLog(
        'ProxyCreated',
        event.data,
        event.topics
      );
      return decoded['proxy'];
    });

    // TODO loop over all vaults to get their info
    for (const vault of vaultAddresses) {
      try {
        const vaultInfo = await sdk.api.abi.call({
          target: config.vaultLens,
          params: [vault],
          abi: lensAbi.find((m) => m.name === 'getVaultInfoFull'),
          chain,
        });
  
        // Only pools with an interest rate
        if (
          vaultInfo.output.irmInfo.interestRateInfo[0] &&
          vaultInfo.output.irmInfo.interestRateInfo[0].supplyAPY > 0
        ) {
          const price = (
            await axios.get(
              `https://coins.llama.fi/prices/current/${chain}:${vaultInfo.output.asset}`
            )
          ).data.coins[`${chain}:${vaultInfo.output.asset}`]?.price;
  
          const totalSupplied = vaultInfo.output.totalAssets;
          const totalBorrowed = vaultInfo.output.totalBorrowed;
  
          const totalSuppliedUSD =
            ethers.utils.formatUnits(
              totalSupplied,
              vaultInfo.output.assetDecimals
            ) * price;
          const totalBorrowedUSD =
            ethers.utils.formatUnits(
              totalBorrowed,
              vaultInfo.output.assetDecimals
            ) * price;
  
          result.push({
            pool: vault,
            chain,
            project: 'euler-v2',
            symbol: vaultInfo.output.assetSymbol,
            poolMeta: vaultInfo.output.vaultName,
            tvlUsd: totalSuppliedUSD - totalBorrowedUSD,
            totalSupplyUsd: totalSuppliedUSD,
            totalBorrowUsd: totalBorrowedUSD,
            apyBase: Number(
              ethers.utils.formatUnits(
                vaultInfo.output.irmInfo.interestRateInfo[0].supplyAPY,
                25
              )
            ),
            apyBaseBorrow: Number(
              ethers.utils.formatUnits(
                vaultInfo.output.irmInfo.interestRateInfo[0].borrowAPY,
                25
              )
            ),
            underlyingTokens: [vaultInfo.output.asset],
            url: `https://app.euler.finance/vault/${vault}?network=${chain}`,
          });
        }
      } catch (error) {
        console.log(`failed to fetch pool ${vault}`, error)
      }
    }
  }
  return result;
};

module.exports = {
  timetravel: false,
  apy: getApys,
};
