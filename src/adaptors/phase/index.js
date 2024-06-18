const sdk = require('@defillama/sdk');
const utils = require('./utils');
const noAPIUtils = require('../utils');

const DBAbi = require('./abi/DB');
const VaultAbi = require('./abi/Vault');
const BalancerAbi = require('./abi/Balancer');

const config = require('./config');

const VAULT_KEY =
  '0x68fc488efe30251cadb6ac88bdeef3f1a5e6048808baf387258d1d78e986720c';

async function getVaults(chain) {
  const { db } = config[chain];

  const data = await sdk.api.abi.call({
    target: db,
    abi: DBAbi.find((m) => m.name === 'getValues'),
    chain,
    params: [VAULT_KEY],
  });

  const rawAddresses = data.output;
  const fixedAddresses = rawAddresses.map((a) => a.substr(0, 42));

  return fixedAddresses;
}

const poolsFunction = async () => {
  const pools = [];

  for (const chain of Object.keys(config)) {
    const { balancer, network } = config[chain];

    const vaults = await getVaults(chain);

    const collaterals = await utils.makeMulticall({
      abi: VaultAbi.find((m) => m.name === 'collectiveCollateral'),
      calls: vaults.map((vault) => ({ target: vault })),
      chain,
    });

    const prices = await utils.makeMulticall({
      abi: VaultAbi.find((m) => m.name === 'price'),
      calls: vaults.map((vault) => ({ target: vault })),
      chain,
    });

    const assets = await utils.makeMulticall({
      abi: VaultAbi.find((m) => m.name === 'asset'),
      calls: vaults.map((vault) => ({ target: vault })),
      chain,
    });

    const symbols = await utils.makeMulticall({
      abi: 'erc20:symbol',
      calls: assets.map((asset) => ({ target: asset })),
      chain,
    });

    const decimals = await utils.makeMulticall({
      abi: 'erc20:decimals',
      calls: assets.map((asset) => ({ target: asset })),
      chain,
    });

    const tvls = collaterals.map((collateral, i) => {
      const price = prices[i];
      const decimal = decimals[i];

      return (collateral / 10 ** decimal) * (price / 10 ** 18);
    });

    const aprs = await utils.makeMulticall({
      abi: BalancerAbi.find((m) => m.name === 'assetAPR'),
      calls: assets.map((asset) => ({ target: balancer, params: [asset] })),
      chain,
    });

    const apys = aprs
      .map(Number)
      .map((apr) => apr / 1e18)
      .map((apr) => utils.aprToApy(apr))
      .map((apy) => apy * 100);

    for (let i = 0; i < vaults.length; i++) {
      const vault = vaults[i];
      const asset = assets[i];
      const symbol = symbols[i];
      const apy = apys[i];
      const tvl = tvls[i];

      pools.push({
        pool: `${chain}:${vault}`,
        chain: noAPIUtils.formatChain(chain),
        project: 'phase',
        symbol: noAPIUtils.formatSymbol(symbol),
        tvlUsd: tvl,
        apyBase: apy,
        underlyingTokens: [asset],
        poolMeta: 'V1 Vault',
        url: `https://app.phase.cash/protocol/vault?network=${network}&id=${vault}`,
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: true,
  apy: poolsFunction,
  url: 'https://app.phase.cash/vaults?p=explore',
};
