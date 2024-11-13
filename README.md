# DefiLlama APY Server

## How to list a new protocol

1. Make sure you are listed on defillama's TVL page (see https://github.com/DefiLlama/DefiLlama-Adapters)
2. Fork this repository
3. Create a new folder within [src/adaptors/](src/adaptors/) with your protocol name (use your project `slug` from `https://api.llama.fi/protocols`)
4. Write an adaptor for your protocol (tutorial below)
5. `cd src/adaptors` and run `npm i`
6. Test your adaptor by running `npm run test --adapter=YOUR_ADAPTER`
7. Submit a PR

### Data sources

The data must be fetched from on-chain calls or from subgraphs. Centralised api calls are only accepted if there is no other way of obtaining that data (eg off-chain gauge weights).

### APY Methodology

Our goal is to display minimum attainable yield values for all listed projects:

- Omit any pre-mined rewards
- Use unboosted (lower bound) apy values
- If rewards are slashed when exiting a pool early, then set the apy value to that lower bound.
- Omit any yield which requires an additional token aside from the LP token (eg veCRV to boost reward yields)
- Omit any locked rewards
- Fee based APY values should be calculated over a 24h window

### Adaptors

An adaptor is just a javascript (or typescript) file that exports an async function that returns an array of objects that represent pools of a protocol. The pools follow the following schema (all values are just examples):

```typescript
interface Pool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  poolMeta?: string;
  url?: string;
  // optional lending protocol specific fields:
  apyBaseBorrow?: number;
  apyRewardBorrow?: number;
  totalSupplyUsd?: number;
  totalBorrowUsd?: number;
  ltv?: number; // btw [0, 1]
}
```

```typescript
{
    pool: "0x3ed3b47dd13ec9a98b44e6204a523e766b225811-ethereum", // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
    chain: "Ethereum", // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
    project: 'aave', // protocol (using the slug again)
    symbol: "USDT", // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
    tvlUsd: 1000.1, // number representing current USD TVL in pool
    apyBase: 0.5, // APY from pool fees/supplying in %
    apyReward: 0.7, // APY from pool LM rewards in %
    rewardTokens: ['0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9'], // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
    underlyingTokens: ['0xdAC17F958D2ee523a2206206994597C13D831ec7'], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
    poolMeta: "V3 market", // A string value which can stand for any specific details of a pool position, market, fee tier, lock duration, specific strategy etc
  };
```

```
A note on how to set apy related fields:

- if a pool's apy only consists of a base component, provide `apyBase` and omit `apyReward` (or set to null) [and vice versa]
- if a pool's apy consists of both, provide both fields
- if you are unsure/your data source doesn't contain a detailed breakdown, then provide an `apy` field indicating the total apy and omit the `apyBase` and `apyReward` fields (or set to null)
```

#### FAQ

> Why are some pools missing on DefiLlama which appear on my adapter?

DefiLlama only displays pools with >10k TVL, so pools with less TVL than that will appear on the adapter but not on defillama

> I'm getting errors when running `npm install`

Make sure you're running the command inside the `src/adaptors` folder, not in the project root folder.

> Why is X pool missing from https://defillama.com/yields/stablecoins ?

That page has stricter filters than other pages, only pools with >1M TVL and on audited protocols are included there.

#### Adapter module structure

```js
module.exports = {
  timetravel: false,
  apy: apy, // Main function, returns pools
  url: 'https://example.com/pools', // Link to page with pools (Only required if you do not provide url's for each pool)
};
```

An example of the most basic adaptor is the following for Anchor on terra:

```js
const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://api.anchorprotocol.com/api/v1/market/ust'
  );
  const dataTvl = await utils.getData(
    'https://api.anchorprotocol.com/api/v1/deposit'
  );

  const ustPool = {
    pool: 'terra1hzh9vpxhsk8253se0vv5jj6etdvxu3nv8z07zu',
    chain: utils.formatChain('terra'),
    project: 'anchor',
    symbol: utils.formatSymbol('UST'),
    tvlUsd: Number(dataTvl.total_ust_deposits) / 1e6,
    apy: apyData.deposit_apy * 100,
  };

  return [ustPool]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.anchorprotocol.com/#/earn',
};
```

You can find examples for a bunch of other protocols in the [src/adaptors/](src/adaptors/) folder, and if you have any questions feel free to ask them on [our discord](https://discord.defillama.com/).
