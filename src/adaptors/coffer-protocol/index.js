const sdk = require('@defillama/sdk');
const { formatChain, getPriceApiData } = require('../utils');

const CHAIN = 'ethereum';
const PROJECT = 'coffer-protocol';
const APP_URL = 'https://app.coffer.bond/coffers';

const FACTORY = '0x619BE899317C58abEe3c0CE3c6D6A605221dD26f';
const FACTORY_DEPLOY_BLOCK = 26106422;

const ETH = '0x0000000000000000000000000000000000000000';
const ETH_PRICE_KEY = 'coingecko:ethereum';

// interestRate is a yearly rate where 1e8 is 100%. The protocol fee is in basis points of a bond's interest.
const RATE_DENOMINATOR = 100_000_000n;
const BPS_DENOMINATOR = 10_000n;
const SECONDS_IN_YEAR = 31_536_000n;
const SECONDS_IN_DAY = 86_400;

const abi = {
  cofferIssued:
    'event CofferIssued(address indexed owner, address indexed cofferAddress, bytes32 indexed publicKeyPart1, bytes16 publicKeyPart2, uint32 interestRate, uint32 minimumDuration, uint32 maximumDuration, uint128 minimumValueToAccept, uint16 issueSizeBufferBps, uint128 issueSize)',
  bondBought:
    'event BondBought(address indexed holderAddress, uint256 indexed bondId, uint128 indexed bondMaturityValue, uint32 duration, uint128 principal, uint32 interestRate)',
  validatorConditions:
    'function sValidatorConditions() view returns (uint128 issueSize, uint32 interestRate, uint32 minimumDuration, uint32 maximumDuration, uint128 minimumValueToAccept, uint32 version, uint32 outstandingBonds, uint16 issueSizeBufferBps, bool isActive, bool validatorDefaulted)',
  holderConditions:
    'function sHolderConditions(uint256 bondId) view returns (uint128 bondMaturityValue, uint32 duration, uint32 startTimestamp)',
  feeCurve: 'function FEE_CURVE() view returns (address)',
  getFee: 'function getFee() view returns (uint256 bps, address recipient)',
};

const toEth = (wei) => Number(wei) / 1e18;
const toDays = (seconds) =>
  Number((Number(seconds) / SECONDS_IN_DAY).toFixed(1));

// What a bond is worth today: its principal plus the interest accrued so far, never more than the
// Coffer still owes on it. A redeemed bond owes nothing.
const bondValue = (bond, now) => {
  if (bond.remaining === 0n) return 0n;
  const elapsed = now > bond.start ? now - bond.start : 0n;
  const accrued =
    elapsed >= bond.duration
      ? bond.maturityValue
      : bond.principal +
        ((bond.maturityValue - bond.principal) * elapsed) / bond.duration;
  return accrued < bond.remaining ? accrued : bond.remaining;
};

// The smallest bond a holder can buy: the least amount for the shortest duration, valued the way
// buyBond does it (principal plus interest, less the fee on the interest).
const smallestBond = (conditions, feeBps) => {
  const interest =
    (conditions.minimumValue * conditions.rate * conditions.minimumDuration) /
    (RATE_DENOMINATOR * SECONDS_IN_YEAR);
  return (
    conditions.minimumValue + interest - (interest * feeBps) / BPS_DENOMINATOR
  );
};

// One Coffer is one pool: a validator borrows ETH from bond holders at a fixed yearly rate, against
// its stake. Returns null for a Coffer in default and for a Coffer with no open bond.
const buildPool = ({
  coffer,
  conditions,
  bonds,
  balance,
  feeBps,
  ethPrice,
  now,
}) => {
  if (conditions.defaulted) return null;
  const supplied = bonds.reduce((sum, bond) => sum + bondValue(bond, now), 0n);
  if (supplied === 0n) return null;

  // A bond's principal is paid out to the validator at the purchase, so only the ETH that sits in
  // the Coffer is not lent out
  const idle = balance < supplied ? balance : supplied;

  const shortest = toDays(conditions.minimumDuration);
  const longest = toDays(conditions.maximumDuration);

  return {
    pool: `${coffer}-${CHAIN}`.toLowerCase(),
    chain: formatChain(CHAIN),
    project: PROJECT,
    symbol: 'ETH',
    tvlUsd: toEth(idle) * ethPrice,
    // the rate for a new bond, less the protocol fee, which the holder pays out of the interest
    apyBase: Number(conditions.rate * (BPS_DENOMINATOR - feeBps)) / 1e10,
    totalSupplyUsd: toEth(supplied) * ethPrice,
    totalBorrowUsd: toEth(supplied - idle) * ethPrice,
    underlyingTokens: [ETH],
    poolMeta:
      shortest === longest
        ? `Fixed rate, ${shortest} days`
        : `Fixed rate, ${shortest} to ${longest} days`,
    isFixedRate: true,
    // no bond can be bought: sales are switched off or the remaining issue size is used up
    frozen:
      !conditions.isActive ||
      smallestBond(conditions, feeBps) > conditions.issueSize,
    url: `${APP_URL}/${coffer.toLowerCase()}`,
  };
};

const apy = async () => {
  const { number: toBlock } = await sdk.api.util.getLatestBlock(CHAIN);

  // every Coffer the factory deployed
  const issued = await sdk.getEventLogs({
    target: FACTORY,
    eventAbi: abi.cofferIssued,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    toBlock,
    chain: CHAIN,
  });
  const coffers = issued.map((log) => log.args.cofferAddress.toLowerCase());
  if (!coffers.length) return [];

  const calls = coffers.map((target) => ({ target }));
  const [conditions, feeCurves] = await Promise.all([
    sdk.api.abi.multiCall({
      calls,
      abi: abi.validatorConditions,
      chain: CHAIN,
    }),
    sdk.api.abi.multiCall({ calls, abi: abi.feeCurve, chain: CHAIN }),
  ]);
  const fees = await sdk.api.abi.multiCall({
    calls: feeCurves.output.map((i) => ({ target: i.output })),
    abi: abi.getFee,
    chain: CHAIN,
  });

  const ethPrice = (await getPriceApiData(`/prices/current/${ETH_PRICE_KEY}`))
    .coins[ETH_PRICE_KEY].price;
  const now = BigInt(Math.floor(Date.now() / 1000));

  const pools = [];
  for (let i = 0; i < coffers.length; i++) {
    const coffer = coffers[i];
    const c = conditions.output[i].output;
    if (c.validatorDefaulted || Number(c.outstandingBonds) === 0) continue;

    const [purchases, balance] = await Promise.all([
      sdk.getEventLogs({
        target: coffer,
        eventAbi: abi.bondBought,
        fromBlock: FACTORY_DEPLOY_BLOCK,
        toBlock,
        chain: CHAIN,
      }),
      sdk.api.eth.getBalance({ target: coffer, chain: CHAIN }),
    ]);
    // what each bought bond still owes, which is 0 once it is redeemed
    const live = await sdk.api.abi.multiCall({
      calls: purchases.map((log) => ({
        target: coffer,
        params: [log.args.bondId.toString()],
      })),
      abi: abi.holderConditions,
      chain: CHAIN,
    });

    pools.push(
      buildPool({
        coffer,
        conditions: {
          issueSize: BigInt(c.issueSize),
          rate: BigInt(c.interestRate),
          minimumDuration: BigInt(c.minimumDuration),
          maximumDuration: BigInt(c.maximumDuration),
          minimumValue: BigInt(c.minimumValueToAccept),
          isActive: c.isActive,
          defaulted: c.validatorDefaulted,
        },
        bonds: purchases.map((log, j) => ({
          principal: BigInt(log.args.principal.toString()),
          maturityValue: BigInt(log.args.bondMaturityValue.toString()),
          remaining: BigInt(live.output[j].output.bondMaturityValue),
          duration: BigInt(live.output[j].output.duration),
          start: BigInt(live.output[j].output.startTimestamp),
        })),
        balance: BigInt(balance.output),
        feeBps: BigInt(fees.output[i].output.bps),
        ethPrice,
        now,
      })
    );
  }

  return pools.filter(Boolean);
};

module.exports = {
  protocolId: '9470',
  timetravel: false,
  apy,
  url: APP_URL,
};
