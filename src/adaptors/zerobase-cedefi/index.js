const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'zerobase-cedefi';
const ZBT = '0xfAB99fCF605fD8f4593EDb70A43bA56542777777'.toLowerCase();

const VAULTS = {
  ethereum: {
    vault: '0x9eF52D8953d184840F2c69096B7b3A7dA7093685',
    tokens: {
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    zkTokens: {
      zkUSDT: '0x7336C89fF7AF86131D336d504E677Db0eb338a16',
      zkUSDC: '0x1EE6e93134aee641BDBe470Df2417aF476bb917f',
    },
  },
  bsc: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: {
      USDT: '0x55d398326f99059fF775485246999027B3197955',
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    },
    zkTokens: {
      zkUSDT: '0xa6c17e2C8a3aD6307AE159d1cbc9E33B4d53958E',
      zkUSDC: '0xDFDaA3b21234ECeCE29d84A885D29180a47c3F2d',
    },
  },
  polygon: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: {
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    },
    zkTokens: {
      zkUSDT: '0xa6c17e2C8a3aD6307AE159d1cbc9E33B4d53958E',
      zkUSDC: '0xDFDaA3b21234ECeCE29d84A885D29180a47c3F2d',
    },
  },
  arbitrum: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: {
      USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
    zkTokens: {
      zkUSDT: '0xa6c17e2C8a3aD6307AE159d1cbc9E33B4d53958E',
      zkUSDC: '0xDFDaA3b21234ECeCE29d84A885D29180a47c3F2d',
    },
  },
  optimism: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: {
      USDT: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
      USDC: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    },
    zkTokens: {
      zkUSDT: '0xa6c17e2C8a3aD6307AE159d1cbc9E33B4d53958E',
      zkUSDC: '0xDFDaA3b21234ECeCE29d84A885D29180a47c3F2d',
    },
  },
  avalanche: {
    vault: '0xC3e9006559cB209a987e99257986aA5Ce324F829',
    tokens: {
      USDt: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
      USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    },
    zkTokens: {
      zkUSDT: '0x2a447358e273555A9ecED1106b0CbA5dfB6A99a4',
      zkUSDC: '0xf527bDA1daCE0a27B9a10b4f8d0584d742512Da5',
    },
  },
  base: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    zkTokens: {
      zkUSDC: '0xDFDaA3b21234ECeCE29d84A885D29180a47c3F2d',
    },
  },
};

const vaultAbi = {
  getTVL: 'function getTVL(address _token) view returns (uint256)',
  getCurrentRewardRate:
    'function getCurrentRewardRate(address _token) view returns (uint256, uint256)',
};

function chainForPrices(chain) {
  if (chain === 'avalanche') return 'avax';
  return chain;
}

function getZkTokenAddress(cfg, sym) {
  if (!cfg.zkTokens) return null;

  const s = String(sym);
  if (s === 'USDT' || s === 'USDt') return cfg.zkTokens.zkUSDT || null;
  if (s === 'USDC') return cfg.zkTokens.zkUSDC || null;

  return null;
}

const apy = async () => {
  const pools = [];

  for (const [chain, cfg] of Object.entries(VAULTS)) {
    const vault = cfg.vault.toLowerCase();

    const tokenEntries = Object.entries(cfg.tokens).map(([symbol, addr]) => [
      symbol,
      addr.toLowerCase(),
    ]);
    const tokenAddrs = tokenEntries.map(([, addr]) => addr);

    const tvlRaw = await sdk.api.abi.multiCall({
      chain,
      abi: vaultAbi.getTVL,
      calls: tokenAddrs.map((token) => ({ target: vault, params: [token] })),
      permitFailure: true,
    });

    const rrRaw = await sdk.api.abi.multiCall({
      chain,
      abi: vaultAbi.getCurrentRewardRate,
      calls: tokenAddrs.map((token) => ({ target: vault, params: [token] })),
      permitFailure: true,
    });

    const decimalsRaw = await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: tokenAddrs.map((t) => ({ target: t })),
      permitFailure: true,
    });

    const { pricesByAddress } = await utils.getPrices(
      tokenAddrs,
      chainForPrices(chain)
    );

    for (let i = 0; i < tokenEntries.length; i++) {
      const [sym, token] = tokenEntries[i];

      const tvlOut = tvlRaw.output?.[i]?.output;
      const rrOut = rrRaw.output?.[i]?.output;
      const decOut = decimalsRaw.output?.[i]?.output;

      const decimals =
        decOut !== undefined && decOut !== null ? Number(decOut) : 18;

      const price = pricesByAddress?.[token];

      const tvlToken = tvlOut ? Number(tvlOut) / 10 ** decimals : 0;
      const tvlUsd =
        Number.isFinite(tvlToken) && Number.isFinite(price) ? tvlToken * price : 0;

      let apyBase = 0;
      if (Array.isArray(rrOut) && rrOut.length >= 2) {
        const rate = Number(rrOut[0]);
        const base = Number(rrOut[1]);
        if (Number.isFinite(rate) && Number.isFinite(base) && base > 0) {
          apyBase = (rate / base) * 100;
        }
      }

      const zkTokenAddr = getZkTokenAddress(cfg, sym);
      if (!zkTokenAddr) continue;

      const underlyingTokens = [token];
      const rewardTokens = Array.from(new Set([...underlyingTokens, ZBT])); // ✅ underlying + ZBT

      pools.push({
        pool: `${zkTokenAddr}-${utils.formatChain(chain)}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: PROJECT,
        symbol: utils.formatSymbol(sym),
        tvlUsd: Number(tvlUsd),
        apyBase: Number(apyBase),
        apyReward: 2, // ✅ 每条链固定 2%
        underlyingTokens,
        rewardTokens,
        url: 'https://app.zerobase.pro',
      });
    }
  }

  return pools.filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.zerobase.pro',
};