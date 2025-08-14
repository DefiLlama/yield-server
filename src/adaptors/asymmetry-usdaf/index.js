const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const BOLD_TOKEN = '0x9cf12ccd6020b6888e4d4c4e4c7aca33c1eb91f8';

const YSYBOLD_BRANCH = {
  activePool: '0xb87e1e1c4cc2decada13025a8dc8a94bdb77fb63',
  defaultPool:  '0x27f539ec3fa3e548e10d4ac883534eba891bb212',
  stabilityPool: '0x83e5bde77d7477ecd972e338541b90af57675536',
  borrowerOperations: '0x57bd20ae68f845b35b76fe6e0239c9929eb48469',
  collToken: '0x23346b04a7f55b8760e5860aa5a77383d63491cd'.toLowerCase(),
  symbol: 'YSYBOLD'
}

const SCRVUSD_BRANCH = {
  activePool: '0x244c422663328233a5d1bd5045ff943ba97d046e',
  defaultPool: '0xc20a51f66c917feff80d1e089199f727060c0369',
  stabilityPool: '0xd48dc7cddc481f596bd9a97755c7ac696ad4ea87',
  borrowerOperations: '0x9e601005deaaee8294c686e28e1affd04cc13830',
  collToken: '0x0655977feb2f289a4ab78af67bab0d17aab84367'.toLowerCase(),
  symbol: 'SCRVUSD'
}

const SUSDS_BRANCH = {
  activePool: '0x08eaafd8fbb12cf12d6765e80c5b0ff8490c232d',
  defaultPool: '0xfab7396e2a6a3364e02ed26d2f80a354aa923b88',
  stabilityPool: '0xb571781cedf07257d60d6b252a3d8b24150ded97',
  borrowerOperations: '0x336d9c5ecb9d6ce79c8c077d35426e714969b41d',
  collToken: '0xa3931d71877c0e7a3148cb7eb4463524fec27fbd'.toLowerCase(),
  symbol: 'SUSDS'
}

const SFRXUSD_BRANCH = {
  activePool: '0x20f29569566020d8e49c9843033c370772a93774',
  defaultPool: '0xfe6f765e77fd8f17ec3a985ac36c3c3ea92c946d',
  stabilityPool: '0x446f358e3a927cc68f342141d78aa2d1c54e18f0',
  borrowerOperations: '0x2538cd346429ea59902e02448bb7a7c098e4554e',
  collToken: '0xcf62f905562626cfcdd2261162a51fd02fc9c5b6'.toLowerCase(),
  symbol: 'SFRXUSD'
}

const TBTC_BRANCH = {
  activePool: '0xb00d1d5dfd72a440b8c04a5f7b5bc3c8159a7f44',
  defaultPool: '0x254a6a3e172a81d5825122403e1bc4d47f264a07',
  stabilityPool: '0x545a7ddfd863bd7ea0bfc689125169598085f75e',
  borrowerOperations: '0xda9af112edfd837eebc1780433481426a52556e0',
  collToken: '0x18084fba666a33d37592fa2633fd49a74dd93a88'.toLowerCase(),
  symbol: 'TBTC'
}

const WBTC_BRANCH = {
  activePool: '0xf507e264d507ef64a72aeaf4cc8c270d008fc48a',
  defaultPool: '0x01e37634cbd25ec7ffe680ece5eec178ff51ef2d',
  stabilityPool: '0x922faa141e95e43a9deeab8dade3ac8d4a32ad5c',
  borrowerOperations: '0x664507f1445657d36d8064663653b7810971f411',
  collToken: '0xe065bc161b90c9c4bba2de7f1e194b70a3267c47'.toLowerCase(),
  symbol: 'WBTC'
}

const branches = [YSYBOLD_BRANCH, SCRVUSD_BRANCH, SUSDS_BRANCH, SFRXUSD_BRANCH, TBTC_BRANCH, WBTC_BRANCH];

const SP_YIELD_SPLIT = 0.75; 

const ABIS = {
    getTotalBoldDeposits: {
      inputs: [],
      name: 'getTotalBoldDeposits',
      outputs: [
        {
          internalType: 'uint256',
          name: 'totalBoldDeposits',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    getCollBalance: {
      inputs: [],
      name: 'getCollBalance',
      outputs: [
        {
          internalType: 'uint256',
          name: 'collBalance',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    getBoldDebt: {
      inputs: [],
      name: 'getBoldDebt',
      outputs: [
        {
          internalType: 'uint256',
          name: 'boldDebt',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    getMCR: {
      inputs: [],
      name: 'MCR',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    getNewApproxAvgInterestRateFromTroveChange: {
      inputs: [
        {
          components: [
            {
              internalType: 'uint256',
              name: 'appliedRedistBoldDebtGain',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'appliedRedistCollGain',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'collIncrease',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'collDecrease',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'debtIncrease',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'debtDecrease',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'newWeightedRecordedDebt',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'oldWeightedRecordedDebt',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'upfrontFee',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'batchAccruedManagementFee',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'newWeightedRecordedBatchManagementFee',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'oldWeightedRecordedBatchManagementFee',
              type: 'uint256',
            },
          ],
          internalType: 'struct TroveChange',
          name: '_troveChange',
          type: 'tuple',
        },
      ],
      name: 'getNewApproxAvgInterestRateFromTroveChange',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    }
  };

  const getSPSupplyAndApy = async (spAddr, avgBranchInterestRate, branchBoldSupply) => {
      const spSupply = (await sdk.api.abi.call({
        target: spAddr,
        abi: ABIS.getTotalBoldDeposits,
        chain: 'ethereum',
      })).output / 1e18;
 
    // Yield is the branch interest rate amplifyed by ratio of branch supply to the BOLD in the SP
    const spApy = avgBranchInterestRate * SP_YIELD_SPLIT * branchBoldSupply / spSupply;

    return [spSupply, spApy];
  }

  const getPrices = async (addresses) => {
    const req = addresses.map((address) => `ethereum:${address}`).join(',').toLowerCase();
    const prices = (await superagent.get(`https://coins.llama.fi/prices/current/${req}`)).body.coins;

    const pricesObj = Object.fromEntries(
      Object.entries(prices).map(([address, priceData]) => [address.split(':')[1].toLowerCase(), priceData.price])
    );

    return pricesObj;
  }

  const getBranchColl = async (collPools) => {
    const results = await sdk.api.abi.multiCall({
      calls: collPools.map((poolAddr) => ({
        target: poolAddr, 
        params: [],
      })),
      abi: ABIS.getCollBalance,
      chain: 'ethereum',
    });
    
    const totalColl = results.output.map(x => Number(x.output)).reduce((a, b) => a + b);
    return totalColl / 1e18;
  }

  const getBranchDebt = async (debtPools) => {
    const results = await sdk.api.abi.multiCall({
      calls: debtPools.map((poolAddr) => ({
        target: poolAddr, 
        params: [],
      })),
      abi: ABIS.getBoldDebt,
      chain: 'ethereum',
    });
  
    const totalDebt = results.output.map(x => Number(x.output)).reduce((a, b) => a + b);
    return totalDebt / 1e18;
  }

  const getLTV = async (borrowerOpsAddr) =>{
    const res = (await sdk.api.abi.call({
        target: borrowerOpsAddr,
        abi: ABIS.getMCR,
        chain: 'ethereum',
      })
    );

    return 1 / (res.output / 1e18);
  }
  
  const getNewApproxAvgInterestRateFromTroveChange = async(activePoolAddr) => {
    const res = await sdk.api.abi.call({
        target: activePoolAddr,
        abi: ABIS.getNewApproxAvgInterestRateFromTroveChange,
        params: [
        [0, // appliedRedistBoldDebtGain
          0, // appliedRedistCollGain  
          0, // collIncrease
          0, // collDecrease
          0, // debtIncrease
          0, // debtDecrease
          0, // newWeightedRecordedDebt
          0, // oldWeightedRecordedDebt
          0, // upfrontFee
          0, // batchAccruedManagementFee
          0, // newWeightedRecordedBatchManagementFee
          0] // oldWeightedRecordedBatchManagementFee
      ],
        chain: 'ethereum',
      });
     
      // convert from 18 decimals and make percentage
      return res.output / 1e16;
  }

  const main = async () => {
    const prices = await getPrices(
      [YSYBOLD_BRANCH.collToken, 
        SCRVUSD_BRANCH.collToken, 
        SUSDS_BRANCH.collToken, 
        SFRXUSD_BRANCH.collToken, 
        TBTC_BRANCH.collToken, 
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC - collToken is wrapper
        BOLD_TOKEN
      ]
    );

    YSYBOLD_BRANCH.price = prices[YSYBOLD_BRANCH.collToken];
    SCRVUSD_BRANCH.price = prices[SCRVUSD_BRANCH.collToken];
    SUSDS_BRANCH.price = prices[SUSDS_BRANCH.collToken];
    SFRXUSD_BRANCH.price = prices[SFRXUSD_BRANCH.collToken];
    TBTC_BRANCH.price = prices[TBTC_BRANCH.collToken];
    WBTC_BRANCH.price = prices['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599']; // WBTC
    
    const pools = [];

    for (const branch of branches) {
      const collPools = [branch.activePool, branch.defaultPool];

      const totalColl = await getBranchColl(collPools);
      const totalCollUsd = totalColl * branch.price

      const ltv = await getLTV(branch.borrowerOperations);
      const borrowApy = await getNewApproxAvgInterestRateFromTroveChange(branch.activePool);
      
      const totalDebt = await getBranchDebt(collPools);
      const totalDebtUsd = totalDebt * prices[BOLD_TOKEN];

      const [spSupply, spApy] = await getSPSupplyAndApy(branch.stabilityPool, borrowApy, totalDebt);
      const spSupplyUsd = spSupply * prices[BOLD_TOKEN];

      const spPool = 
        {
          pool: branch.stabilityPool,
          project: 'asymmetry-usdaf',
          symbol: 'USDaf',
          chain: 'ethereum',
          apy: spApy,
          tvlUsd: spSupplyUsd,
          underlyingTokens: [BOLD_TOKEN],
          rewardTokens: [BOLD_TOKEN, branch.collToken],
          poolMeta: `${branch.symbol} Stability Pool`
        }

      const borrowPool = 
        {
          pool: branch.activePool,
          project: 'asymmetry-usdaf',
          symbol: branch.symbol,
          chain: 'ethereum',
          apy: 0,
          tvlUsd: totalCollUsd,
          apyBaseBorrow: borrowApy,
          totalSupplyUsd: totalCollUsd,
          totalBorrowUsd: totalDebtUsd,
          ltv: ltv,
          mintedCoin: 'USDaf',
          underlyingTokens: [branch.collToken], 
        }

      pools.push(spPool, borrowPool);
    };

    return pools;
  }

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://usdaf.asymmetry.finance/',
};