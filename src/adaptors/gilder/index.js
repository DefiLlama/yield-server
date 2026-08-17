const sdk = require('@defillama/sdk');

const CHAIN = 'base';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SAFE_VAULT = '0x9b937b72172c0706b51984a09992bB8007771E67';
const BOND_CONTRACT = '0x5d25cFc927F95Cb519c0Fef438aFAa64cb374e10';

const BALANCE_OF_ABI = 'function balanceOf(address) view returns (uint256)';
const ANNUAL_RATE_ABI = 'uint256:SIMPLE_ANNUAL_RATE_BPS';

const apy = async () => {
  const [safeVaultBal, annualRateBps] = await Promise.all([
    sdk.api.abi.call({
      target: USDC,
      abi: BALANCE_OF_ABI,
      params: [SAFE_VAULT],
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: BOND_CONTRACT,
      abi: ANNUAL_RATE_ABI,
      chain: CHAIN,
    }),
  ]);

  const tvlUsd = Number(safeVaultBal.output) / 1e6;
  const apyBase = Number(annualRateBps.output) / 100;

  return [
    {
      pool: `${BOND_CONTRACT}-base-standard`.toLowerCase(),
      chain: 'Base',
      project: 'gilder',
      symbol: 'USDC',
      tvlUsd,
      apyBase,
      underlyingTokens: [USDC],
      poolMeta: 'Standard 3yr Fixed',
      url: 'https://gilderfinance.com',
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
