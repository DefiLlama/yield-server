const sdk = require('@defillama/sdk');

const CHAIN = 'base';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SAFE_VAULT = '0x9b937b72172c0706b51984a09992bB8007771E67';
const BOND_CONTRACT = '0x5d25cFc927F95Cb519c0Fef438aFAa64cb374e10';

const BALANCE_OF_ABI = 'function balanceOf(address) view returns (uint256)';

const apy = async () => {
  const safeVaultBal = await sdk.api.abi.call({
    target: USDC,
    abi: BALANCE_OF_ABI,
    params: [SAFE_VAULT],
    chain: CHAIN,
  });

  const tvlUsd = Number(safeVaultBal.output) / 1e6;

  return [
    {
      pool: `${BOND_CONTRACT}-base-standard`.toLowerCase(),
      chain: 'Base',
      project: 'gilder',
      symbol: 'USDC',
      tvlUsd,
      apyBase: 20,
      underlyingTokens: [USDC],
      poolMeta: 'Standard — 3yr fixed, full principal returned at maturity',
      token: null,
    },
    {
      pool: `${BOND_CONTRACT}-base-leverage`.toLowerCase(),
      chain: 'Base',
      project: 'gilder',
      symbol: 'USDC',
      tvlUsd,
      apyBase: 11,
      underlyingTokens: [USDC],
      poolMeta: 'Leverage — 3yr fixed, up to 75% of principal drawn on day 1',
      token: null,
    },
    {
      pool: `${BOND_CONTRACT}-base-turbo`.toLowerCase(),
      chain: 'Base',
      project: 'gilder',
      symbol: 'USDC',
      tvlUsd,
      apyBase: 27.5,
      underlyingTokens: [USDC],
      poolMeta: 'Turbo — 3yr fixed, leveraged loop up to 2.485× multiplier',
      token: null,
    },
  ];
};

module.exports = {
  protocolId: '8424',
  timetravel: false,
  apy,
  url: 'https://gilderfinance.com',
};
