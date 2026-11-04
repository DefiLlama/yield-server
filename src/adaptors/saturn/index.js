const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const SUSDAT_ADDRESS = '0xD166337499E176bbC38a1FBd113Ab144e5bd2Df7';
const USDAT_ADDRESS = '0x23238f20b894f29041f48D88eE91131C395Aaa71';
const STRCON_MODULE = '0x3C0f0b502aa7C2ed85620f7f52B8eFb8049b1ECf';
const STRCON_ADDRESS = '0xECABE1Ff8a9e1dC55899cf58dac8497ecE5Ae84c';
const SVALUE_ORACLE = '0x9BC39DB6fbB44B91a48b8D5A6C208B82B1741bE6';

const SVALUE_UPDATED =
  'event SValueUpdated(address indexed asset, uint256 oldSValue, uint256 newSValue)';
const EVENT_LOOKBACK_SECONDS = 31 * 86400;
const CHAIN_TIP_PADDING_BLOCKS = 20;
const ONE_E18 = '1000000000000000000';

const call = (label, params) =>
  sdk.api.abi
    .call({ chain: CHAIN, ...params })
    .then((r) => r.output)
    .catch((err) => {
      console.error(`saturn: ${label} failed: ${err.message || err}`);
      return null;
    });

const getStrconSValueSteps = async () => {
  const head = (await sdk.api.util.getLatestBlock(CHAIN)).number;
  const toBlock = head - CHAIN_TIP_PADDING_BLOCKS;
  const [fromBlock] = await utils.getBlocksByTime(
    [Math.floor(Date.now() / 1000) - EVENT_LOOKBACK_SECONDS],
    CHAIN
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    const logs = await sdk.getEventLogs({
      chain: CHAIN,
      target: SVALUE_ORACLE,
      eventAbi: SVALUE_UPDATED,
      fromBlock,
      toBlock,
    });
    const steps = logs.filter(
      (l) => l.args.asset.toLowerCase() === STRCON_ADDRESS.toLowerCase()
    );
    if (steps.length >= 2) return steps.sort((a, b) => a.blockNumber - b.blockNumber);
  }
  return [];
};

// STRCon reinvests STRC dividends into its sValue, stepped twice a month; the
// latest step's growth over the time since the previous step is the current
// dividend yield, free of STRC's price moves.
const getStrconDividendApy = async () => {
  const steps = await getStrconSValueSteps();
  if (steps.length < 2) {
    console.error('saturn: fewer than 2 STRCon sValue steps in lookback');
    return undefined;
  }
  const [prev, last] = steps.slice(-2);
  const [prevTs, lastTs] = await Promise.all(
    [prev, last].map((l) => sdk.api.util.getTimestamp(l.blockNumber, CHAIN))
  );
  const periodDays = (lastTs - prevTs) / 86400;
  const growth = Number(last.args.newSValue) / Number(last.args.oldSValue);
  if (!(periodDays > 0) || !(growth > 0)) return undefined;
  return (growth ** (365 / periodDays) - 1) * 100;
};

const main = async () => {
  const [totalAssets, rateNow, strconValue, dividendApy] = await Promise.all([
    call('totalAssets', { target: SUSDAT_ADDRESS, abi: 'uint256:totalAssets' }),
    call('convertToAssets', {
      target: SUSDAT_ADDRESS,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      params: [ONE_E18],
    }),
    call('recognizedValue', { target: STRCON_MODULE, abi: 'uint256:recognizedValue' }),
    getStrconDividendApy().catch((err) => {
      console.error(`saturn: sValue steps failed: ${err.message || err}`);
      return undefined;
    }),
  ]);

  if (!(Number(totalAssets) > 0)) {
    console.error('saturn: no totalAssets, skipping pool');
    return [];
  }

  const priceKey = `${CHAIN}:${USDAT_ADDRESS}`;
  const usdatPrice = await utils
    .getPriceApiData(`/prices/current/${priceKey}`)
    .then((r) => r.coins[priceKey]?.price)
    .catch((err) => console.error(`saturn: price lookup failed: ${err.message || err}`));
  if (!(usdatPrice > 0)) {
    console.error('saturn: no USDat price, skipping pool');
    return [];
  }

  const strconShare =
    strconValue === null ? null : Math.min(Number(strconValue) / Number(totalAssets), 1);
  const apyBase =
    dividendApy === undefined || strconShare === null ? undefined : dividendApy * strconShare;
  const pricePerShare = Number(rateNow) / 1e6;

  return [
    {
      pool: SUSDAT_ADDRESS,
      chain: utils.formatChain(CHAIN),
      project: 'saturn',
      symbol: 'sUSDat',
      tvlUsd: (Number(totalAssets) / 1e6) * usdatPrice,
      apyBase,
      ...(pricePerShare > 0 && { pricePerShare }),
      underlyingTokens: [USDAT_ADDRESS],
    },
  ];
};

module.exports = {
  protocolId: '7646',
  timetravel: false,
  apy: main,
  url: 'https://app.saturn.credit/',
};
