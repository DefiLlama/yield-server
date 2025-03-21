const sdk = require('@defillama/sdk');
const STAKING_CONTRACT = '0xee21ab613d30330823D35Cf91A84cE964808B83F';
const MARKETPLACE_CONTRACT = '0x04EA61C431F7934d51fEd2aCb2c5F942213f8967';
const { getLatestBlock } = require('@defillama/sdk/build/util');
const { getPrices } = require('../utils');
const { fetchURL } = require('../../helper/utils');

const { RateLimiter } = require('limiter');

const url = (addrs) =>
  'https://blockchain.info/multiaddr?active=' + addrs.join('|');

const delay = 3 * 60 * 60; // 3 hours

const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 10_000 });

async function _sumTokensBlockchain({ balances = {}, owners = [] }) {
  console.time('bitcoin' + owners.length + '___' + owners[0]);
  const STEP = 200;
  for (let i = 0; i < owners.length; i += STEP) {
    const {
      data: { addresses },
    } = await fetchURL(url(owners.slice(i, i + STEP)));
    for (const addr of addresses)
      sdk.util.sumSingleBalance(balances, 'bitcoin', addr.final_balance / 1e8);
  }

  console.timeEnd('bitcoin' + owners.length + '___' + owners[0]);
  return balances;
}

const withLimiter =
  (fn, tokensToRemove = 1) =>
  async (...args) => {
    await limiter.removeTokens(tokensToRemove);
    return fn(...args);
  };

const sumTokensBlockchain = withLimiter(_sumTokensBlockchain);

async function sumTokens({ balances = {}, owners = [], timestamp }) {
  if (typeof timestamp === 'object' && timestamp.timestamp)
    timestamp = timestamp.timestamp;
  const now = Date.now() / 1e3;

  if (!timestamp || now - timestamp < delay) {
    try {
      await sumTokensBlockchain({ balances, owners });
      return balances;
    } catch (e) {
      sdk.log('bitcoin sumTokens error', e.toString());
    }
  }
}

function reserveBytes(txHashTemp) {
  let txHash = '';
  if (txHashTemp.length % 2 === 1) {
    txHashTemp = '0' + txHashTemp;
  }
  txHashTemp = txHashTemp.split('').reverse().join('');
  for (let i = 0; i < txHashTemp.length - 1; i += 2) {
    txHash += txHashTemp[i + 1] + txHashTemp[i];
  }
  return txHash;
}

const totalBTC = async () => {
  const btcTxHashLockApi =
    'https://api.b14g.xyz/restake/marketplace/defillama/btc-tx-hash';
  const {
    data: {
      data: { result },
    },
  } = await fetchURL(btcTxHashLockApi);
  const hashes = result.map((r) => r.txHash);
  const hashMap = {};
  for (const hash of hashes) {
    const addresses = [];
    const { data: tx } = await fetchURL(
      `https://mempool.space/api/tx/${reserveBytes(hash.slice(2))}`
    );
    let vinAddress = tx.vin.map((el) => el.prevout.scriptpubkey_address);
    tx.vout.forEach((el) => {
      if (
        el.scriptpubkey_type !== 'op_return' &&
        !vinAddress.includes(el.scriptpubkey_address)
      ) {
        addresses.push(el.scriptpubkey_address);
      }
    });
    hashMap[hash] = addresses;
  }
  const owners = [...new Set(Object.values(hashMap).flat())];
  return await sumTokens({ owners });
};

const exchangeRateAbi = {
  inputs: [
    {
      internalType: 'uint256',
      name: '_dualCore',
      type: 'uint256',
    },
  ],
  name: 'exchangeCore',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'nonpayable',
  type: 'function',
};

const getTurnRoundBlockNumber = async (blockNumber) => {
  const roundTag = (
    await sdk.api.abi.call({
      target: '0x0000000000000000000000000000000000001005',
      chain: 'core',
      abi: 'uint256:roundTag',
    })
  ).output;
  return (
    await sdk.api.util.getLogs({
      keys: [],
      chain: 'core',
      target: '0x0000000000000000000000000000000000001005',
      topic: 'turnedRound(uint256)',
      fromBlock: blockNumber.block - 86400,
      toBlock: blockNumber.block,
    })
  ).output.filter(
    (el) => parseInt(el.data) === parseInt(roundTag.toString())
  )[0].blockNumber;
};

const getCORERewardForBTCHolderPerDay = async (blockNumber) => {
  //get all order
  let allOrder = (
    await sdk.api.util.getLogs({
      keys: [],
      chain: 'core',
      target: MARKETPLACE_CONTRACT,
      topic: 'CreateRewardReceiver(address,address,uint256,uint256)',
      fromBlock: 19942300,
      toBlock: blockNumber.block,
    })
  ).output.map((el) => {
    return {
      order: el.topics[2].replace('000000000000000000000000', ''),
      owner: el.topics[1].replace('000000000000000000000000', ''),
    };
  });

  //filter order active, remove expired
  let listTxHash = [];
  let listOrderActive = (
    await sdk.api.abi.multiCall({
      abi: {
        outputs: [{ name: '', internalType: 'bytes32[]', type: 'bytes32[]' }],
        inputs: [
          { name: 'delegator', internalType: 'address', type: 'address' },
        ],
        name: 'getTxIdsByDelegator',
        stateMutability: 'view',
        type: 'function',
      },
      calls: allOrder.map((el) => {
        return {
          target: '0x0000000000000000000000000000000000001014',
          params: [el.order],
        };
      }),
      chain: 'core',
    })
  ).output
    .map((el, index) => {
      return {
        ...el,
        order: allOrder[index].order,
        owner: allOrder[index].owner,
      };
    })
    .filter((order) => {
      listTxHash = listTxHash.concat(order.output);
      return order.output.length > 0;
    });

  // total BTC stake in order
  let btcStake =
    (
      await sdk.api.abi.multiCall({
        abi: {
          outputs: [
            { name: 'amount', internalType: 'uint64', type: 'uint64' },
            {
              name: 'outputIndex',
              internalType: 'uint32',
              type: 'uint32',
            },
            { name: 'blockTimestamp', internalType: 'uint64', type: 'uint64' },
            {
              name: 'lockTime',
              internalType: 'uint32',
              type: 'uint32',
            },
            { name: 'usedHeight', internalType: 'uint32', type: 'uint32' },
          ],
          inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
          name: 'btcTxMap',
          stateMutability: 'view',
          type: 'function',
        },
        calls: listTxHash.map((el) => {
          return {
            target: '0x0000000000000000000000000000000000001014',
            params: [el],
          };
        }),
        chain: 'core',
      })
    ).output.reduce((acc, el) => acc + parseInt(el.output.amount), 0) / 1e8;
  let turnRoundBlockNumber = await getTurnRoundBlockNumber(blockNumber);

  let rewardBTCBeforeTurnround = (
    await sdk.api.abi.multiCall({
      abi: 'uint256:pendingRewardForBTC',
      calls: listOrderActive.map((el) => {
        return {
          target: el.order,
        };
      }),
      block: turnRoundBlockNumber,
      chain: 'core',
    })
  ).output.reduce((acc, el) => acc + parseInt(el.output), 0);
  let rewardBTCAfterTurnround = (
    await sdk.api.abi.multiCall({
      abi: {
        inputs: [
          {
            components: [
              {
                internalType: 'address',
                name: 'receiver',
                type: 'address',
              },
              {
                internalType: 'bytes32',
                name: 'txHash',
                type: 'bytes32',
              },
              {
                internalType: 'address',
                name: 'to',
                type: 'address',
              },
            ],
            internalType: 'struct Marketplace.ClaimParamOnBehalf[]',
            name: 'claimParam',
            type: 'tuple[]',
          },
        ],
        name: 'claimBTCRewardProxyOnBehalf',
        outputs: [
          {
            internalType: 'uint256[]',
            name: 'amounts',
            type: 'uint256[]',
          },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      calls: listOrderActive.map((el) => {
        return {
          params: [
            [{ receiver: el.order, txHash: el.output[0], to: el.owner }],
          ],
          target: MARKETPLACE_CONTRACT,
        };
      }),
      block: turnRoundBlockNumber + 1,
      chain: 'core',
      chunkSize: 20,
      permitFailure: true,
    })
  ).output.reduce((acc, el) => acc + parseInt(el.output), 0);
  return {
    reward: (rewardBTCAfterTurnround - rewardBTCBeforeTurnround) / 1e18,
    btcStake,
  };
};

const getDualCOREVault = async (blockNumber) => {
  const [totalStake, exchangeRateYesterday, currentExchangeRate] =
    await Promise.all([
      sdk.api.abi.call({
        chain: 'core',
        target: STAKING_CONTRACT,
        abi: 'uint256:totalStaked',
      }),
      sdk.api.abi.call({
        chain: 'core',
        target: STAKING_CONTRACT,
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
        block: blockNumber.block - 28800,
      }),
      sdk.api.abi.call({
        chain: 'core',
        target: STAKING_CONTRACT,
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
      }),
    ]);
  // this vault is auto compound
  let apy =
    ((currentExchangeRate.output / exchangeRateYesterday.output) ** 365 - 1) *
    100;
  return { apy, totalStake: totalStake.output/1e18 };
};

const getBTCMarketplace = async (blockNumber, corePrice, btcPrice) => {
  const totalBTCLock = await totalBTC();
  const coreRewardForBTCHolderPerDay = await getCORERewardForBTCHolderPerDay(
    blockNumber
  );
  const btcLock = Math.min(totalBTCLock.bitcoin, coreRewardForBTCHolderPerDay.btcStake);
  const apy = ((corePrice * coreRewardForBTCHolderPerDay.reward) / btcLock / btcPrice) * 365 * 100;
  return { totalLock: btcLock, apy };
};

const getApy = async () => {
  const blockNumber = await getLatestBlock('core');
  const price = await getPrices(
    [
      '0x0000000000000000000000000000000000000000',
      '0x5832f53d147b3d6cd4578b9cbd62425c7ea9d0bd',
    ],
    'core'
  );
  const dualCOREVault = await getDualCOREVault(blockNumber);
  const btcMarketplace = await getBTCMarketplace(
    blockNumber,
    price.pricesBySymbol.core,
    price.pricesBySymbol.wbtc
  );

  return [
    {
      pool: `${STAKING_CONTRACT}-core`,
      project: 'b14g',
      symbol: 'CORE',
      tvlUsd: dualCOREVault.totalStake * price.pricesBySymbol.core ,
      apyBase: dualCOREVault.apy,
      chain: "core",
      url: 'https://app.b14g.xyz/vaults/core',
    },
    {
      pool: `${MARKETPLACE_CONTRACT}-bitcoin`,
      project: 'b14g',
      symbol: 'BTC',
      tvlUsd: btcMarketplace.totalLock * price.pricesBySymbol.wbtc,
      apyBase: btcMarketplace.apy,
      chain: 'bitcoin',
      url: 'https://app.b14g.xyz/marketplace',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
