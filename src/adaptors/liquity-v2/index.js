const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const BOLD_TOKEN = '0x6440f144b7e50d6a8439336510312d2f54beb01d';

const WETH_BRANCH = {
 activePool: '0xeb5a8c825582965f1d84606e078620a84ab16afe',
 defaultPool:  '0xd4558240d50c2e219a21c9d25afd513bb6e5b1a0',
 stabilityPool: '0x5721cbbd64fc7ae3ef44a0a3f9a790a9264cf9bf',
 borrowerOperations: '0x0b995602b5a797823f92027e8b40c0f2d97aff1c',
 collToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase(),
 symbol: 'ETH'
}

const WSTETH_BRANCH = {
  activePool: '0x531a8f99c70d6a56a7cee02d6b4281650d7919a0',
  defaultPool:  '0xd796e1648526400386cc4d12fa05e5f11e6a22a1',
  stabilityPool: '0x9502b7c397e9aa22fe9db7ef7daf21cd2aebe56b',
  borrowerOperations: '0x94c1610a7373919bd9cfb09ded19894601f4a1be',
  collToken: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'.toLowerCase(),
  symbol: 'WSTETH'
}

const RETH_BRANCH = {
  activePool: '0x9074d72cc82dad1e13e454755aa8f144c479532f',
  defaultPool:  '0x5cc5cefd034fdc4728d487a72ca58a410cddcd6b',
  stabilityPool: '0xd442e41019b7f5c4dd78f50dc03726c446148695',
  borrowerOperations: '0xa351d5b9cda9eb518727c3ceff02208915fda60d',
  collToken: '0xae78736cd615f374d3085123a210448e74fc6393'.toLowerCase(),
  symbol: 'RETH'
}

const branches = [WETH_BRANCH, WSTETH_BRANCH, RETH_BRANCH];

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

  const getSPApy = async (spAddr, avgBranchInterestRate, branchBoldSupply) => {
      const spSupply = (await sdk.api.abi.call({
        target: spAddr,
        abi: ABIS.getTotalBoldDeposits,
        chain: 'ethereum',
      })).output;
 
    // Yield is the branch interest rate amplifyed by ratio of branch supply to the BOLD in the SP
    const spApy = avgBranchInterestRate * SP_YIELD_SPLIT * branchBoldSupply / (spSupply / 1e18);

    return spApy;
  }

  const getPrices = async (addresses) => {
    const req = addresses.map((address) => `ethereum:${address}`).join(',').toLowerCase();
    const prices = (await superagent.get(`https://coins.llama.fi/prices/current/${req}`)).body.coins;

    const pricesObj = Object.fromEntries(
      Object.entries(prices).map(([address, priceData]) => [address.split(':')[1].toLowerCase(), priceData.price])
    );

    console.dir(pricesObj);

    return pricesObj;
  }

  const getBranchColl = async (collPools) => {
    console.dir(collPools);
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
     
      return res.output / 1e18;
  }

  const main = async () => {
    const prices = await getPrices(
      [WETH_BRANCH.collToken, 
        WSTETH_BRANCH.collToken, 
        RETH_BRANCH.collToken, 
        BOLD_TOKEN
      ]
    );

    WETH_BRANCH.price = prices[WETH_BRANCH.collToken];
    WSTETH_BRANCH.price = prices[WSTETH_BRANCH.collToken];
    RETH_BRANCH.price = prices[RETH_BRANCH.collToken];
    
    const pools = [];

    for (const branch of branches) {
      const collPools = [branch.activePool, branch.defaultPool];

      const totalColl = await getBranchColl(collPools);
      const tvlUsd = totalColl * branch.price

      const ltv = getLTV(branch.borrowerOperations);
      const borrowApy = await getNewApproxAvgInterestRateFromTroveChange(branch.activePool);
      
      const totalDebt = await getBranchDebt(collPools);
      const totalDebtUsd = totalDebt * prices[BOLD_TOKEN];
      const spApy = await getSPApy(branch.stabilityPool, borrowApy, totalDebt);

      const pool = 
        {
          pool: branch.stabilityPool,
          project: 'liquity-v2',
          symbol: branch.symbol,
          chain: 'ethereum',
          apy: spApy,
          tvlUsd: tvlUsd,
          apyBaseBorrow: borrowApy,
          totalSupplyUsd: tvlUsd,
          totalBorrowUsd: totalDebtUsd,
          ltv: ltv,
          mintedCoin: 'BOLD',
          underlyingTokens: [branch.collToken],
        }

      pools.push(pool);
    };

    return pools;
  }

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.liquity.org/',
};