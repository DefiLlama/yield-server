const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { ethers } = require('ethers');
const { length } = require('../agave/abiIncentivesController');

const BOLD_TOKEN = '0x6440f144b7e50d6a8439336510312d2f54beb01d';
const DAY_IN_SECONDS = 24 * 60 * 60;

const WETH_BRANCH = {
 activePool: '0xeb5a8c825582965f1d84606e078620a84ab16afe',
 defaultPool:  '0xd4558240d50c2e219a21c9d25afd513bb6e5b1a0',
 stabilityPool: '0x5721cbbd64fc7ae3ef44a0a3f9a790a9264cf9bf',
 borrowerOperations: '0x0b995602b5a797823f92027e8b40c0f2d97aff1c',
 troveManager: '0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a',
 collToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase(),
 symbol: 'ETH'
}

const WSTETH_BRANCH = {
  activePool: '0x531a8f99c70d6a56a7cee02d6b4281650d7919a0',
  defaultPool:  '0xd796e1648526400386cc4d12fa05e5f11e6a22a1',
  stabilityPool: '0x9502b7c397e9aa22fe9db7ef7daf21cd2aebe56b',
  borrowerOperations: '0x94c1610a7373919bd9cfb09ded19894601f4a1be',
  troveManager: '0xa2895d6a3bf110561dfe4b71ca539d84e1928b22',
  collToken: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'.toLowerCase(),
  symbol: 'WSTETH'
}

const RETH_BRANCH = {
  activePool: '0x9074d72cc82dad1e13e454755aa8f144c479532f',
  defaultPool:  '0x5cc5cefd034fdc4728d487a72ca58a410cddcd6b',
  stabilityPool: '0xd442e41019b7f5c4dd78f50dc03726c446148695',
  borrowerOperations: '0xa351d5b9cda9eb518727c3ceff02208915fda60d',
  troveManager: '0xb2b2abeb5c357a234363ff5d180912d319e3e19e',
  collToken: '0xae78736cd615f374d3085123a210448e74fc6393'.toLowerCase(),
  symbol: 'RETH'
}

const branches = [WETH_BRANCH, WSTETH_BRANCH, RETH_BRANCH];

const SP_YIELD_SPLIT = 0.75; 

const toNumber = (value) => Number(ethers.utils.formatUnits(value, 18));

const STABILITY_POOL_BALANCE_TOPIC = ethers.utils.id(
  'StabilityPoolBoldBalanceUpdated(uint256)'
);
const LIQUIDATION_TOPIC = ethers.utils.id(
  'Liquidation(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)'
);
const LIQUIDATION_EVENT_TYPES = [
  'uint256',
  'uint256',
  'uint256',
  'uint256',
  'uint256',
  'uint256',
  'uint256',
  'uint256',
  'uint256',
  'uint256',
];

const getBlockWindow = async () => {
  const latestBlock = await sdk.api.util.getLatestBlock('ethereum');
  const startTimestamp = latestBlock.timestamp - DAY_IN_SECONDS;
  const startBlock = await sdk.api.util.lookupBlock(startTimestamp, { chain: 'ethereum' });

  return {
    endBlock: latestBlock.number,
    startBlock: startBlock.number,
  };
};

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

  const getStabilityPoolDepositsAtBlock = async (stabilityPoolAddr, blockNumber) => {
    const res = await sdk.api.abi.call({
        target: stabilityPoolAddr,
        abi: ABIS.getTotalBoldDeposits,
        block: blockNumber,
        chain: 'ethereum',
      });
 
    return toNumber(res.output);
  };
  
  const getStabilityPoolBalanceUpdates = async (stabilityPoolAddr, startBlock, endBlock) => {
    const logs = (
      await sdk.api.util.getLogs({
        target: stabilityPoolAddr,
        fromBlock: startBlock,
        toBlock: endBlock,
        topics: [STABILITY_POOL_BALANCE_TOPIC],
        keys: [],
        chain: 'ethereum',
      })
    ).output;
  
    return logs
      .map((log) => ({
        blockNumber: Number(log.blockNumber),
        logIndex: Number(log.logIndex),
        balance: toNumber(log.data),
        transactionHash: log.transactionHash,
      }))
      .sort(
        (a, b) =>
          a.blockNumber - b.blockNumber || a.logIndex - b.logIndex
      );
  };
  
  const getLiquidationEvents = async (troveManagerAddr, startBlock, endBlock) => {
    const logs = (
      await sdk.api.util.getLogs({
        target: troveManagerAddr,
        fromBlock: startBlock,
        toBlock: endBlock,
        topics: [LIQUIDATION_TOPIC],
        keys: [],
        chain: 'ethereum',
      })
    ).output;
  
    return logs
      .map((log) => {
        const decoded = ethers.utils.defaultAbiCoder.decode(LIQUIDATION_EVENT_TYPES, log.data);
  
        return {
          blockNumber: Number(log.blockNumber),
          logIndex: Number(log.logIndex),
          transactionHash: log.transactionHash,
          debtOffsetBySP: toNumber(decoded[0]),
          collSentToSP: toNumber(decoded[4]),
          price: toNumber(decoded[9]),
        };
      })
      .sort(
        (a, b) =>
          a.blockNumber - b.blockNumber || a.logIndex - b.logIndex
      );
  };

  const isBeforeLog = (a, b) =>
    a.blockNumber < b.blockNumber ||
    (a.blockNumber === b.blockNumber && a.logIndex < b.logIndex);

  const calculateLiquidationApyForBranch = async (
    branch,
    blockWindow,
    boldPrice
  ) => {
    // Skip until TroveManager addresses are populated.
    if (!branch.troveManager || branch.troveManager === '0x0000000000000000000000000000000000000000') {
      return 0;
    }

    // Fetch all liquidations for the branch in the past 24h.
    const liquidations = await getLiquidationEvents(
      branch.troveManager,
      blockWindow.startBlock,
      blockWindow.endBlock
    );

    if (!liquidations.length) return 0;

    // Seed the stability pool balance at the start block and gather later balance updates.
    const [startBalance, balanceUpdates] = await Promise.all([
      getStabilityPoolDepositsAtBlock(branch.stabilityPool, blockWindow.startBlock),
      getStabilityPoolBalanceUpdates(branch.stabilityPool, blockWindow.startBlock, blockWindow.endBlock),
    ]);

    let currentBalance = startBalance;
    let balanceIdx = 0;
    let dailyReturn = 0;

    const advanceBalance = (target) => {
      while (
        balanceIdx < balanceUpdates.length &&
        isBeforeLog(balanceUpdates[balanceIdx], target)
      ) {
        currentBalance = balanceUpdates[balanceIdx].balance;
        balanceIdx++;
      }
    };

    for (const liquidation of liquidations) {
      advanceBalance(liquidation);

      // Only process liquidations if there was SP liquidity at that instant
      if (currentBalance === 0) continue;

      // Net liquidation gain is collateral sent minus BOLD burned, expressed in USD
      const collateralValueUsd = liquidation.collSentToSP * liquidation.price;
      const rewardUsd =
        collateralValueUsd - liquidation.debtOffsetBySP * boldPrice;

      if (rewardUsd <= 0) continue;

      // Denominator is the SP deposits present just before the liquidation
      const depositsUsd = currentBalance * boldPrice;
      if (depositsUsd <= 0) continue;

      dailyReturn += rewardUsd / depositsUsd;
    }
    
    // Convert daily return to percentage yearly return
    return dailyReturn * 100 * 365;
  };

  const getSPSupplyAndApy = async (spAddr, avgBranchInterestRate, branchBoldSupply) => {
      let spSupply = (await sdk.api.abi.call({
        target: spAddr,
        abi: ABIS.getTotalBoldDeposits,
        chain: 'ethereum',
      })).output / 1e18;
 
  
    if (spSupply === 0) return [0, 0]

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
    const blockWindow = await getBlockWindow();
    const boldPrice = prices[BOLD_TOKEN] ?? 1;

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
      const liquidationApy = await calculateLiquidationApyForBranch(
        branch,
        blockWindow,
        boldPrice
      );
      const totalSpApy = spApy + liquidationApy;

      const spPool = 
        {
          pool: branch.stabilityPool,
          project: 'liquity-v2',
          symbol: 'BOLD',
          chain: 'ethereum',
          apy: totalSpApy,
          tvlUsd: spSupplyUsd,
          underlyingTokens: [BOLD_TOKEN],
          rewardTokens: [BOLD_TOKEN, branch.collToken],
          poolMeta: `BOLD deposited in the ${branch.symbol} Stability Pool earns continuous BOLD yield and periodic ${branch.symbol} rewards from Trove liquidations`
        }

      const borrowPool = 
        {
          pool: branch.activePool,
          project: 'liquity-v2',
          symbol: branch.symbol,
          chain: 'ethereum',
          apy: 0,
          tvlUsd: totalCollUsd,
          apyBaseBorrow: borrowApy,
          totalSupplyUsd: totalCollUsd,
          totalBorrowUsd: totalDebtUsd,
          ltv: ltv,
          mintedCoin: 'BOLD',
          underlyingTokens: [branch.collToken], 
        }

      pools.push(spPool, borrowPool);
    };

    return pools;
  }

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.liquity.org/',
};
