const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Pareto credit vaults are IdleCDO-style epoch contracts (single AA tranche in
// practice, BB supply is 0 on every live vault). TVL comes from the vault's
// getContractValue (denominated in the underlying token) and the advertised
// rate from getApr(AATranche), which the manager sets per epoch.
const CHAIN = 'ethereum';
const FACTORY = '0x59aabDAd8FDaBD227CC71543B128765f93906626';
const FACTORY_START_BLOCK = 22938055;

// vaults deployed before the factory existed
const LEGACY_VAULTS = [
  '0xf6223C567F21E33e859ED7A045773526E9E3c2D5', // Fasanara
  '0x4462eD748B8F7985A4aC6b538Dfc105Fce2dD165', // Bastion
  '0x14B8E918848349D1e71e806a52c13D4e0d3246E0', // Adaptive Frontier
  '0x433D5B175148dA32Ffe1e1A37a939E1b7e79be4d', // FalconX
];

const multiCall = async (abi, calls) =>
  (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi,
      calls,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

// "Pareto AA Tranche - FalconXUSDC" -> "FalconX", "IdleCDO AA Tranche - idle_Fasanara" -> "Fasanara"
const vaultName = (trancheName, tokenSymbol) => {
  if (!trancheName) return undefined;
  return trancheName
    .split(' - ')
    .pop()
    .replace(new RegExp(`${tokenSymbol}$`), '')
    .replace(/^idle_/, '')
    .trim();
};

const apy = async () => {
  const currentBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const deployEvents = await sdk.getEventLogs({
    chain: CHAIN,
    target: FACTORY,
    eventAbi: 'event CreditVaultDeployed(address proxy)',
    fromBlock: FACTORY_START_BLOCK,
    toBlock: currentBlock.number,
  });

  const vaults = [...LEGACY_VAULTS];
  for (const ev of deployEvents) {
    const proxy = ev.args.proxy;
    if (!vaults.some((v) => v.toLowerCase() === proxy.toLowerCase())) {
      vaults.push(proxy);
    }
  }

  const vaultCalls = vaults.map((target) => ({ target }));
  const [tokens, tranches, contractValues] = await Promise.all([
    multiCall('address:token', vaultCalls),
    multiCall('address:AATranche', vaultCalls),
    multiCall('uint256:getContractValue', vaultCalls),
  ]);

  const [aprs, trancheNames, symbols, decimals] = await Promise.all([
    multiCall(
      'function getApr(address) view returns (uint256)',
      vaults.map((target, i) => ({ target, params: [tranches[i]] }))
    ),
    multiCall('string:name', tranches.map((target) => ({ target }))),
    multiCall('erc20:symbol', tokens.map((target) => ({ target }))),
    multiCall('erc20:decimals', tokens.map((target) => ({ target }))),
  ]);

  const { pricesByAddress: prices } = await utils.getPrices(
    [...new Set(tokens.filter(Boolean))],
    CHAIN
  );

  const pools = vaults.map((vault, i) => {
    const token = tokens[i];
    const price = prices[token?.toLowerCase()];
    if (!token || !price || !contractValues[i]) return null;

    const tvlUsd = (contractValues[i] / 10 ** decimals[i]) * price;

    return {
      pool: `${vault}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'pareto-credit',
      symbol: utils.formatSymbol(symbols[i]),
      poolMeta: vaultName(trancheNames[i], symbols[i]),
      tvlUsd,
      apyBase: aprs[i] / 1e18,
      underlyingTokens: [token],
    };
  });

  return pools.filter(Boolean).filter((p) => p.tvlUsd > 0 && utils.keepFinite(p));
};

module.exports = {
  protocolId: '6429',
  timetravel: false,
  apy,
  url: 'https://app.pareto.credit/vaults',
};
