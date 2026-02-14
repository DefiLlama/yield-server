const axios = require('axios');
const utils = require('../utils');

const RPC_URL = 'https://fullnode.mainnet.sui.io';

const VAULT_PACKAGE =
  '0x90a75f641859f4d77a4349d67e518e1dd9ecb4fac079e220fa46b7a7f164e0a5';

const VAULTS = [
  {
    vaultId:
      '0x670c12c8ea3981be65b8b11915c2ba1832b4ebde160b03cd7790021920a8ce68',
    marginPoolId:
      '0x53041c6f86c4782aabbfc1d4fe234a6d37160310c7ee740c915f0a01b7127344',
    assetType: '0x2::sui::SUI',
    symbol: 'SUI',
  },
  {
    vaultId:
      '0xec54bde40cf2261e0c5d9c545f51c67a9ae5a8add9969c7e4cdfe1d15d4ad92e',
    marginPoolId:
      '0x1d723c5cd113296868b55208f2ab5a905184950dd59c48eb7345607d6b5e6af7',
    assetType:
      '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    symbol: 'DEEP',
  },
  {
    vaultId:
      '0x09b367346a0fc3709e32495e8d522093746ddd294806beff7e841c9414281456',
    marginPoolId:
      '0x38decd3dbb62bd4723144349bf57bc403b393aee86a51596846a824a1e0c2c01',
    assetType:
      '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
    symbol: 'WAL',
  },
  {
    vaultId:
      '0x86cd17116a5c1bc95c25296a901eb5ea91531cb8ba59d01f64ee2018a14d6fa5',
    marginPoolId:
      '0xba473d9ae278f10af75c50a8fa341e9c6a1c087dc91a3f23e8048baf67d0754f',
    assetType:
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    symbol: 'USDC',
  },
];

const WINDOW_DAYS = 7;

async function fetchObjects(ids) {
  const response = await axios.post(RPC_URL, {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_multiGetObjects',
    params: [ids, { showContent: true }],
  });
  return response.data.result;
}

async function getTokenPrices(coinTypes) {
  const keys = coinTypes.map((c) => `sui:${c}`).join(',');
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${keys}`
  );
  return coinTypes.map((c) => data.coins[`sui:${c}`]);
}

// Vault exchange rate = underlying_per_atoken
// Grows from pool interest + compounded incentives
function vaultExchangeRate(vaultFields, poolFields) {
  const shares = BigInt(
    vaultFields.abyss_vault_state.fields.margin_pool_shares
  );
  const atokenSupply = BigInt(
    vaultFields.atoken_treasury_cap.fields.total_supply.fields.value
  );
  const poolTotal = BigInt(poolFields.state.fields.total_supply);
  const poolShares = BigInt(poolFields.state.fields.supply_shares);

  if (atokenSupply === 0n || poolShares === 0n) return 1;

  const PREC = 10n ** 18n;
  const underlying = (shares * poolTotal) / poolShares;
  return Number((underlying * PREC) / atokenSupply) / Number(PREC);
}

// Get historical exchange rates from VaultSupply/VaultWithdraw events
// These events record asset_amount and atoken_amount at transaction time,
// giving us the exchange rate at that point
async function getHistoricalERs(vaultIds) {
  const targetTs = Date.now() - WINDOW_DAYS * 86_400_000;
  const vaultSet = new Set(vaultIds);
  const found = {}; // vaultId -> { er, ts }

  const eventTypes = [
    `${VAULT_PACKAGE}::abyss_vault::VaultSupply`,
    `${VAULT_PACKAGE}::abyss_vault::VaultWithdraw`,
  ];

  for (const eventType of eventTypes) {
    let cursor = null;

    // Query descending (recent first), stop when past target window
    while (true) {
      const response = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_queryEvents',
        params: [{ MoveEventType: eventType }, cursor, 50, true],
      });

      const result = response.data.result;
      if (!result?.data?.length) break;

      for (const evt of result.data) {
        const d = evt.parsedJson;
        const ts = parseInt(evt.timestampMs);
        const vid = d.vault_id;

        if (!vaultSet.has(vid)) continue;
        if (Number(d.atoken_amount) === 0) continue;

        // We want the most recent event at or before the target timestamp
        if (ts <= targetTs) {
          if (!found[vid] || ts > found[vid].ts) {
            found[vid] = {
              er: Number(d.asset_amount) / Number(d.atoken_amount),
              ts,
            };
          }
        }
      }

      // Check if we've gone past the target window for all vaults
      const oldestInPage = result.data[result.data.length - 1];
      const oldestTs = parseInt(oldestInPage.timestampMs);

      // If all vaults have a historical ER and we've gone past the window, stop
      if (oldestTs < targetTs && vaultIds.every((id) => found[id])) break;

      // Also stop if we've gone way past (2x window) to prevent infinite loops
      if (oldestTs < targetTs - WINDOW_DAYS * 86_400_000) break;

      if (!result.hasNextPage) break;
      cursor = result.nextCursor;
    }
  }

  return found;
}

const main = async () => {
  const vaultIds = VAULTS.map((v) => v.vaultId);
  const poolIds = VAULTS.map((v) => v.marginPoolId);
  const coinTypes = VAULTS.map((v) => v.assetType);

  const [vaultObjects, poolObjects, coinInfos, historicalERs] =
    await Promise.all([
      fetchObjects(vaultIds),
      fetchObjects(poolIds),
      getTokenPrices(coinTypes),
      getHistoricalERs(vaultIds),
    ]);

  const now = Date.now();
  const pools = [];

  for (let i = 0; i < VAULTS.length; i++) {
    const vault = VAULTS[i];
    const vaultData = vaultObjects[i]?.data?.content?.fields;
    const poolData = poolObjects[i]?.data?.content?.fields;
    const coinInfo = coinInfos[i];

    if (!vaultData || !poolData || !coinInfo) continue;

    // TVL
    const marginPoolShares = BigInt(
      vaultData.abyss_vault_state.fields.margin_pool_shares
    );
    const totalSupply = BigInt(poolData.state.fields.total_supply);
    const supplyShares = BigInt(poolData.state.fields.supply_shares);
    if (supplyShares === 0n) continue;

    const underlying = (marginPoolShares * totalSupply) / supplyShares;
    const tvlUsd =
      (Number(underlying) / 10 ** coinInfo.decimals) * coinInfo.price;

    // APY from exchange rate growth over trailing window
    const currentER = vaultExchangeRate(vaultData, poolData);
    const hist = historicalERs[vault.vaultId];

    let apyBase = 0;
    if (hist && currentER > hist.er) {
      const days = (now - hist.ts) / 86_400_000;
      if (days >= 1) {
        const growth = currentER / hist.er;
        apyBase = (Math.pow(growth, 365 / days) - 1) * 100;
      }
    }

    pools.push({
      pool: `${vault.vaultId}-sui`.toLowerCase(),
      chain: utils.formatChain('sui'),
      project: 'abyss',
      symbol: utils.formatSymbol(vault.symbol),
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.assetType],
    });
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://beta.abyssprotocol.xyz/vaults',
};
