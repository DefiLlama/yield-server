import * as utils from '../utils';
import { BigNumber, utils as ethersUtils } from 'ethers';

const axios = require('axios');
const SDK = require('@defillama/sdk');

const GQL_URL = 'https://api.goldsky.com/api/public/project_clzibgddg2epg01ze4lq55scx/subgraphs/loan_router_arbitrum/0.0.3/gn';

// PayPal Incentives and T-bill Yield

const USDAI = '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef'; // contract holding PYUSD
const PYUSD_ADDRESS = '0x46850aD61C2B7d64d08c9C754F45254596696984';
const PYUSD_DECIMALS = 6;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

// BaseYieldAccrual struct is stored at BASE_YIELD_ACCRUAL_STORAGE_LOCATION:
//   slot +0: accrued (uint256)
//   slot +1: timestamp (uint64)
//   slot +2: rateTiers[].length  (elements at keccak256(slot+2))
// Each RateTier occupies 2 consecutive slots: rate (uint256), threshold (uint256)
const BASE_YIELD_ACCRUAL_STORAGE_LOCATION =
  '0xad76c5b481cb106971e0ae4c23a09cb5b1dc9dba5fad96d9694630df5e853900';

// SDK doesn't expose eth_getStorageAt; access underlying JSON-RPC provider
const getRpcProvider = () => SDK.getProvider('arbitrum').rpcs[0].provider;

const getStorageAt = async (slot: BigNumber): Promise<BigNumber> => {
  const result = await getRpcProvider().send('eth_getStorageAt', [
    USDAI,
    ethersUtils.hexZeroPad(slot.toHexString(), 32),
    'latest',
  ]);
  return BigNumber.from(result);
};

const getRateTiersFromStorage = async () => {
  // BaseYieldAccrual struct layout: { RateTier[] rateTiers; uint256 accrued; uint64 timestamp; }
  // rateTiers array length is at BASE+0; elements start at keccak256(BASE+0).
  // RateTier struct layout: { uint256 rate; uint256 threshold; }
  const base = BigNumber.from(BASE_YIELD_ACCRUAL_STORAGE_LOCATION);

  const length = await getStorageAt(base);
  if (length.isZero()) throw new Error('rateTiers array is empty');

  const arrayDataStart = BigNumber.from(
    ethersUtils.keccak256(ethersUtils.hexZeroPad(base.toHexString(), 32))
  );

  const tiers = await Promise.all(
    Array.from({ length: length.toNumber() }, (_, i) =>
      Promise.all([
        getStorageAt(arrayDataStart.add(i * 2)),
        getStorageAt(arrayDataStart.add(i * 2 + 1)),
      ]).then(([rate, threshold]) => ({ rate, threshold }))
    )
  );

  return tiers;
};

const getUnderlyingYields = async (): Promise<object[]> => {
  const [result, prices, rateTiers] = await Promise.all([
    SDK.api.abi.call({
      abi: 'erc20:balanceOf',
      target: PYUSD_ADDRESS,
      params: [USDAI],
      chain: 'arbitrum',
    }),
    utils.getPrices([PYUSD_ADDRESS], 'arbitrum'),
    getRateTiersFromStorage(),
  ]);

  const price = prices.pricesByAddress[PYUSD_ADDRESS.toLowerCase()] ?? 1;
  const balanceUsd = (Number(result.output) / 10 ** PYUSD_DECIMALS) * price;

  // Build one pool per rate tier. Each tier covers TVL from the previous tier's cap up to its own
  // threshold. rate is interest per second scaled by 1e18; threshold is scaled PYUSD units (1e18).
  const base = {
    chain: utils.formatChain('arbitrum'),
    symbol: utils.formatSymbol('PYUSD'),
    project: 'usd-ai',
    underlyingTokens: [PYUSD_ADDRESS],
    url: 'https://app.usd.ai/reserves',
  };

  const poolMetas = [
    'PayPal Incentives for first billion of PYUSD',
    'T-bill yield for beyond first billion of PYUSD',
  ];

  const pools: object[] = [];
  let remainingTvl = balanceUsd;

  for (let i = 0; i < rateTiers.length; i++) {
    // threshold is in scaled units (1e18 per USD), convert to USD
    const capUsd = Number(rateTiers[i].threshold) / 1e18;
    const tierTvl = Math.min(capUsd, remainingTvl);
    const apyBase = Math.round((Number(rateTiers[i].rate) / 1e18) * SECONDS_PER_YEAR * 100 * 100) / 100;

    pools.push({
      ...base,
      pool: `${USDAI}-tier${i + 1}`,
      tvlUsd: tierTvl,
      apyBase,
      poolMeta: poolMetas[i] ?? `Tier ${i + 1}`,
    });

    remainingTvl -= tierTvl;
  }

  return pools;
};

// Loan Yields

const LOAN_ROUTER_ADDRESS = '0x0C2ED170F2bB1DF1a44292Ad621B577b3C9597D1';

const LOAN_STATE_ABI = {
  inputs: [{ name: 'loanTermsHash', type: 'bytes32' }],
  name: 'loanState',
  outputs: [
    { name: 'status', type: 'uint8' },
    { name: 'maturity', type: 'uint64' },
    { name: 'repaymentDeadline', type: 'uint64' },
    { name: 'scaledBalance', type: 'uint256' },
  ],
  stateMutability: 'view',
  type: 'function',
};

const BORROW_ABI = [
  {
    name: 'borrow',
    type: 'function',
    inputs: [
      {
        name: 'loanTerms',
        type: 'tuple',
        components: [
          { name: 'expiration', type: 'uint64' },
          { name: 'borrower', type: 'address' },
          { name: 'currencyToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'collateralTokenId', type: 'uint256' },
          { name: 'duration', type: 'uint64' },
          { name: 'repaymentInterval', type: 'uint64' },
          { name: 'interestRateModel', type: 'address' },
          { name: 'gracePeriodRate', type: 'uint256' },
          { name: 'gracePeriodDuration', type: 'uint256' },
          {
            name: 'feeSpec',
            type: 'tuple',
            components: [
              { name: 'originationFee', type: 'uint256' },
              { name: 'exitFee', type: 'uint256' },
            ],
          },
          {
            name: 'trancheSpecs',
            type: 'tuple[]',
            components: [
              { name: 'lender', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'rate', type: 'uint256' },
            ],
          },
          { name: 'collateralWrapperContext', type: 'bytes' },
          { name: 'options', type: 'bytes' },
        ],
      },
      {
        name: 'lenderDepositInfos',
        type: 'tuple[]',
        components: [
          { name: 'depositType', type: 'uint8' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

const iface = new ethersUtils.Interface(BORROW_ABI);
const BORROW_SELECTOR = iface.getSighash('borrow');

function tryDecodeBorrowFromInput(rawHex: string) {
  const sel = BORROW_SELECTOR.slice(2);
  const idx = rawHex.indexOf(sel);
  if (idx === -1) return null;
  try {
    return iface.parseTransaction({ data: '0x' + rawHex.slice(idx) });
  } catch {
    return null;
  }
}

const GQL_QUERY = `
  query GetLoanHashes($first: Int!, $skip: Int!) {
    loanRouterEvents(
      where: {
        type: LoanOriginated,
        timestamp_gte: "0"
      }
      orderBy: timestamp
      orderDirection: asc
      first: $first
      skip: $skip
    ) {
      loanTermsHash
      loanOriginated {
        currencyToken {
          id
          symbol
        }
      }
      txHash
    }
  }
`;

const GQL_PAGE_SIZE = 1000;

const getLoanPools = async (): Promise<object[]> => {
  // 1. Paginate through all LoanOriginated events
  const allEvents: any[] = [];
  let skip = 0;
  while (true) {
    const response = await axios.post(GQL_URL, {
      query: GQL_QUERY,
      variables: { first: GQL_PAGE_SIZE, skip },
    });
    if (response.data.errors || !response.data.data) {
      console.error('GQL error fetching loanRouterEvents:', response.data.errors ?? response.data);
      break;
    }
    const page: any[] = response.data.data.loanRouterEvents;
    allEvents.push(...page);
    if (page.length < GQL_PAGE_SIZE) break;
    skip += GQL_PAGE_SIZE;
  }

  const events: any[] = allEvents.map((e: any, i: number) => ({ ...e, id: i + 1 }));

  if (!events.length) return [];

  // 2. Unique currency token addresses
  const uniqueTokens: string[] = [
    ...new Set(
      events.map((e) => e.loanOriginated.currencyToken.id.toLowerCase())
    ),
  ];

  // 3. Parallel: loanState multicall + prices
  const [loanStates, prices] = await Promise.all([
    SDK.api.abi.multiCall({
      abi: LOAN_STATE_ABI,
      calls: events.map((e) => ({
        target: LOAN_ROUTER_ADDRESS,
        params: [e.loanTermsHash],
      })),
      chain: 'arbitrum',
    }),
    utils.getPrices(uniqueTokens, 'arbitrum'),
  ]);

  // 4. Annotate events with loanState output, filter to active only
  const activeEvents = events
    .map((event, i) => ({
      event,
      status: Number(loanStates.output[i].output.status),
      scaledBalance: BigInt(loanStates.output[i].output.scaledBalance),
    }))
    .filter(({ status }) => status === 1); // LoanStatus.Active = 1

  // 5. For each active loan: fetch tx, decode LoanTerms, build pool
  const provider = SDK.getProvider('arbitrum');
  const poolGroups = await Promise.all(
    activeEvents.map(async ({ event, scaledBalance }) => {
      const tx = await provider.getTransaction(event.txHash);
      if (!tx) return [];

      const decoded = tryDecodeBorrowFromInput(tx.data.slice(2));
      if (!decoded) return [];

      const loanTerms = decoded.args.loanTerms;
      const currencyToken = event.loanOriginated.currencyToken.id.toLowerCase();
      const price = prices.pricesByAddress[currencyToken] ?? 1;

      // scaledBalance is 1e18-scaled; divide as BigInt first to avoid precision loss
      const loanBalanceUsd = Number(scaledBalance / 10n ** 18n) * price;

      const totalTrancheAmount = loanTerms.trancheSpecs.reduce(
        (sum: number, t: any) => sum + Number(t.amount),
        0
      );
      if (!loanTerms.trancheSpecs.length || totalTrancheAmount === 0) return [];
      const tranche0 = loanTerms.trancheSpecs[0];
      const tvlUsd = loanBalanceUsd * (Number(tranche0.amount) / totalTrancheAmount);

      // Round to 2 decimal places
      const apyBase = Math.round(Number(tranche0.rate) * SECONDS_PER_YEAR * 100 / 1e18 * 100) / 100;

      return [
        {
          pool: event.loanTermsHash,
          chain: utils.formatChain('arbitrum'),
          project: 'usd-ai',
          symbol: utils.formatSymbol(event.loanOriginated.currencyToken.symbol),
          tvlUsd,
          apyBase,
          underlyingTokens: [event.loanOriginated.currencyToken.id],
          url: 'https://app.usd.ai/loans',
        },
      ];
    })
  );

  return poolGroups.flat();
};

// --- Entry point ---

const apy = async () => {
  const [fixedPools, loanPools] = await Promise.all([
    getUnderlyingYields(),
    getLoanPools(),
  ]);

  return [...fixedPools, ...loanPools]
    .filter((p: any) => p.tvlUsd > 0)
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.usd.ai',
};
