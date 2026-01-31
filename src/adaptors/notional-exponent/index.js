const project = 'notional-exponent';

const main = async () => {
  const response = await fetch('https://yields.notional.finance/fetchYields')
  if (!response.ok) {
    throw new Error(`Failed to fetch yields: ${response.statusText}`);
  }
  const vaults = await response.json();
  if (!vaults || !Array.isArray(vaults)) {
    throw new Error('Invalid response format');
  }

  return vaults.map(({vaultAddress, chain, symbol, apyBase, tvlUSD, underlying, poolMeta, rewardTokens}) => {
      return {
        pool: `${vaultAddress}-${chain}`,
        chain: chain === 'mainnet' ? 'ethereum' : chain,
        project,
        symbol,
        underlyingTokens: underlying,
        poolMeta,
        url: `https://notional.finance/vault/${chain}/${vaultAddress}`,
        tvlUsd: tvlUSD,
        apyBase: apyBase,
        rewardTokens: rewardTokens,
      };
    })
};

module.exports = {
  timetravel: false,
  apy: main,
};
