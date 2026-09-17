const sdk = require('@defillama/sdk');
const utils = require('../utils');

const YEAR = 31536000;
const ZERO = '0x0000000000000000000000000000000000000000';
const address = (value) => /^0x[\da-f]{40}$/i.test(value || '');
const receipt = (pool) => pool.pool.split('-')[0].toLowerCase();
const reserve = (pool) => pool.routeGroupKey && address(receipt(pool));

const rewardApr = ({
  emission,
  supply,
  assetDecimals,
  rewardDecimals,
  assetPrice,
  rewardPrice,
}) => {
  if (
    ![emission, supply, assetPrice, rewardPrice].every(
      (n) => Number.isFinite(n) && n > 0
    )
  )
    return undefined;
  if (
    ![assetDecimals, rewardDecimals].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 36
    )
  )
    return undefined;
  const apr =
    ((emission / 10 ** rewardDecimals) * YEAR * rewardPrice * 100) /
    ((supply / 10 ** assetDecimals) * assetPrice);
  return Number.isFinite(apr) && apr > 0 && apr <= 1e6 ? apr : undefined;
};

const addNativeSupplyRewards = async (pools, dependencies = {}) => {
  const api = dependencies.sdk || sdk;
  const getPrices = dependencies.getPrices || utils.getPriceApiCoins;
  const byChain = new Map();
  for (const pool of pools.filter(reserve)) {
    if (!byChain.has(pool.chain)) byChain.set(pool.chain, []);
    byChain.get(pool.chain).push(pool);
  }
  const additions = new Map();
  const chains = [...byChain];
  let nextChain = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, chains.length) }, async () => {
      while (nextChain < chains.length) {
        const [chain, chainPools] = chains[nextChain++];
        try {
          const block = await api.api.util.getLatestBlock(chain);
          if (
            !Number.isSafeInteger(block.number) ||
            !Number.isFinite(block.timestamp)
          )
            throw new Error('Invalid reward block');
          const read = async (abi, calls) => {
            const values = calls.map(() => undefined);
            for (let attempt = 0; attempt < 2; attempt++) {
              const missing = calls
                .map((call, i) => ({ call, i }))
                .filter(({ i }) => values[i] === undefined);
              if (!missing.length) break;
              if (attempt)
                await new Promise((resolve) => setTimeout(resolve, 300));
              try {
                const { output } = await api.api.abi.multiCall({
                  chain,
                  block: block.number,
                  abi,
                  calls: missing.map(({ call }) => call),
                  permitFailure: true,
                });
                missing.forEach(({ i }, j) => {
                  if (output[j]?.success && output[j].output != null)
                    values[i] = output[j].output;
                });
              } catch {}
            }
            if (values.some((value) => value === undefined))
              console.error(
                `aave-v3 ${chain}: ${
                  values.filter((value) => value === undefined).length
                }/${
                  calls.length
                } native reward reads failed after retry (${abi})`
              );
            return values;
          };
          const controllers = await read(
            'address:getIncentivesController',
            chainPools.map((pool) => ({ target: receipt(pool) }))
          );
          const assets = chainPools.flatMap((pool, i) =>
            address(controllers[i]) && controllers[i].toLowerCase() !== ZERO
              ? [{ pool, asset: receipt(pool), controller: controllers[i] }]
              : []
          );
          const rewards = await read(
            'function getRewardsByAsset(address) view returns (address[])',
            assets.map((a) => ({ target: a.controller, params: [a.asset] }))
          );
          const streams = assets.flatMap((a, i) =>
            [
              ...new Set(
                (rewards[i] || []).filter(address).map((r) => r.toLowerCase())
              ),
            ].map((reward) => ({ ...a, reward }))
          );
          const data = await read(
            'function getRewardsData(address,address) view returns (uint256 index,uint256 emissionPerSecond,uint256 lastUpdateTimestamp,uint256 distributionEnd)',
            streams.map((s) => ({
              target: s.controller,
              params: [s.asset, s.reward],
            }))
          );
          const active = streams.flatMap((stream, i) => {
            const d = data[i];
            if (!d) return [];
            const index = Number(d.index ?? d[0]);
            const emission = Number(d.emissionPerSecond ?? d[1]);
            const updated = Number(d.lastUpdateTimestamp ?? d[2]);
            const end = Number(d.distributionEnd ?? d[3]);
            if (!(emission > 0 && end > block.timestamp)) return [];
            if (!(index > 0 && updated > 0 && updated <= block.timestamp)) {
              console.error(
                `aave-v3 ${chain}: native reward accrual unverified for ${stream.asset}`
              );
              return [];
            }
            return [{ ...stream, emission }];
          });
          if (!active.length) continue;
          const tokens = [
            ...new Set(active.flatMap((s) => [s.asset, s.reward])),
          ];
          const assetTokens = [...new Set(active.map((s) => s.asset))];
          const [decimals, supplies] = await Promise.all([
            read(
              'erc20:decimals',
              tokens.map((target) => ({ target }))
            ),
            read(
              'erc20:totalSupply',
              assetTokens.map((target) => ({ target }))
            ),
          ]);
          const units = new Map(
            tokens.map((token, i) => [
              token,
              decimals[i] == null ? undefined : Number(decimals[i]),
            ])
          );
          const balances = new Map(
            assetTokens.map((token, i) => [token, Number(supplies[i])])
          );
          const underlying = new Map(
            chainPools.map((pool) => [
              receipt(pool),
              pool.underlyingTokens?.[0]?.toLowerCase(),
            ])
          );
          const priceKey = (token) =>
            `${chain}:${underlying.get(token) || token}`;
          const priceKeys = [
            ...new Set(
              active
                .filter((s) => s.asset !== s.reward)
                .flatMap((s) => [priceKey(s.asset), priceKey(s.reward)])
            ),
          ];
          const prices = priceKeys.length ? await getPrices(priceKeys) : {};
          for (const stream of active) {
            const selfReward = stream.asset === stream.reward;
            const apr = rewardApr({
              emission: stream.emission,
              supply: balances.get(stream.asset),
              assetDecimals: units.get(stream.asset),
              rewardDecimals: units.get(stream.reward),
              assetPrice: selfReward
                ? 1
                : prices[priceKey(stream.asset)]?.price,
              rewardPrice: selfReward
                ? 1
                : prices[priceKey(stream.reward)]?.price,
            });
            if (apr === undefined) {
              console.error(
                `aave-v3 ${chain}: native reward units/supply/price unavailable for ${stream.asset}/${stream.reward}`
              );
              continue;
            }
            const previous = additions.get(stream.pool.pool) || {
              apyReward: 0,
              rewardTokens: [],
            };
            previous.apyReward += apr;
            previous.rewardTokens.push(stream.reward);
            additions.set(stream.pool.pool, previous);
          }
        } catch {
          console.error(`aave-v3 ${chain}: native supply rewards unavailable`);
        }
      }
    })
  );
  return pools.map((pool) => {
    const native = additions.get(pool.pool);
    if (!native) return pool;
    const apyReward = (pool.apyReward || 0) + native.apyReward;
    if (!Number.isFinite(apyReward) || apyReward > 1e6) {
      console.error(`aave-v3: native reward exceeds bounds for ${pool.pool}`);
      return pool;
    }
    return {
      ...pool,
      apyReward,
      rewardTokens: [
        ...new Set(
          [...(pool.rewardTokens || []), ...native.rewardTokens].map((token) =>
            token.toLowerCase()
          )
        ),
      ],
    };
  });
};

module.exports = { addNativeSupplyRewards, rewardApr };
