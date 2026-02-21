const axios = require('axios');
const utils = require('../utils');
const SDK = require('@defillama/sdk');

const GQL_URL = 'https://api.goldsky.com/api/public/project_clzibgddg2epg01ze4lq55scx/subgraphs/loan_router_arbitrum/0.0.3/gn';

// PayPal Incentives and T-bill Yield

const USDAI = '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef'; // contract holding PYUSD
const FIXED_POOL_TIER_1_APY = '4.5';
const FIXED_POOL_TIER_2_APY = '3.3';
const PYUSD_ADDRESS = '0x46850aD61C2B7d64d08c9C754F45254596696984';
const PYUSD_DECIMALS = 6;
const TIER_1_CAP = 1_000_000_000; // $1 billion

const getUnderlyingYields = async (): Promise<object[]> => {
  const [result, prices] = await Promise.all([
    SDK.api.abi.call({
      abi: 'erc20:balanceOf',
      target: PYUSD_ADDRESS,
      params: [USDAI],
      chain: 'arbitrum',
    }),
    utils.getPrices([PYUSD_ADDRESS], 'arbitrum'),
  ]);

  const price = prices.pricesByAddress[PYUSD_ADDRESS.toLowerCase()] ?? 1;
  const balanceUsd = (Number(result.output) / 10 ** PYUSD_DECIMALS) * price;

  const tier1Tvl = Math.min(TIER_1_CAP, balanceUsd);
  const tier2Tvl = balanceUsd > TIER_1_CAP ? balanceUsd - TIER_1_CAP : 0;

  const base = {
    chain: utils.formatChain('arbitrum'),
    project: 'usd-ai',
    underlyingTokens: [PYUSD_ADDRESS],
    url: 'https://app.usd.ai/reserves',
  };

  return [
    {
      ...base,
      pool: `${USDAI}-tier1`,
      symbol: 'PayPal Incentives',
      tvlUsd: tier1Tvl,
      apyBase: Number(FIXED_POOL_TIER_1_APY),
      poolMeta: 'PayPal Incentives for first billion of PYUSD',
    },
    {
      ...base,
      pool: `${USDAI}-tier2`,
      symbol: 'T-bill Yield',
      tvlUsd: tier2Tvl,
      apyBase: Number(FIXED_POOL_TIER_2_APY),
      poolMeta: 'T-bill yield for beyond first billion of PYUSD',
    },
  ];
};

// Legacy Underlying Yield (wrapped M)

const WRAPPED_M_ADDRESS = '0x437cc33344a0B27A429f795ff6B469C72698B291';
const WRAPPED_M_DECIMALS = 6;
const LEGACY_APY = 3.3;

const getLegacyUnderlyingYield = async (): Promise<object[]> => {
  const [result, prices] = await Promise.all([
    SDK.api.abi.call({
      abi: 'erc20:balanceOf',
      target: WRAPPED_M_ADDRESS,
      params: [USDAI],
      chain: 'arbitrum',
    }),
    utils.getPrices([WRAPPED_M_ADDRESS], 'arbitrum'),
  ]);

  const price = prices.pricesByAddress[WRAPPED_M_ADDRESS.toLowerCase()] ?? 1;
  const tvlUsd = (Number(result.output) / 10 ** WRAPPED_M_DECIMALS) * price;

  return [
    {
      pool: `${USDAI}-legacy`,
      chain: utils.formatChain('arbitrum'),
      project: 'usd-ai',
      symbol: 'Legacy Underlying Yield',
      tvlUsd,
      apyBase: LEGACY_APY,
      underlyingTokens: [WRAPPED_M_ADDRESS],
      url: 'https://app.usd.ai/reserves',
    },
  ];
};

// Loan Yields

const LOAN_ROUTER_ADDRESS = '0x0C2ED170F2bB1DF1a44292Ad621B577b3C9597D1';
const SECONDS_PER_YEAR = 365 * 24 * 3600;

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

const ethers = require('ethers');
const iface = new ethers.utils.Interface(BORROW_ABI);
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
          symbol: `LOAN ${event.id}`,
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
  try {
    const [fixedPools, legacyPools, loanPools] = await Promise.all([
      getUnderlyingYields(),
      getLegacyUnderlyingYield(),
      getLoanPools(),
    ]);

    return [...fixedPools, ...legacyPools, ...loanPools].filter((p: any) => p.tvlUsd > 0);
  } catch (error) {
    console.error('Error fetching usdai data:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy,
  url: '',
};
