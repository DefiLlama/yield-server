// Адаптер доходности FWB для DeFiLlama (репозиторий DefiLlama/yield-server).
// Путь в репозитории: src/adaptors/fwb/index.js
//
// Протокол: фиксированная ставка на фиксированный срок (30, 90, 180, 360 дней).
// Расписок ERC-20 за депозит нет — позиция живёт во внутреннем учёте контракта,
// поэтому идентификатор пула строим из адреса хранилища и адреса актива.
//
// Что откуда берём (всё — вызовы чтения в контракте, без внешних API):
//   getSupportedTokens()                      список принимаемых активов
//   activePrincipalByToken(token)             тело активных депозитов
//   getTokenUsdValue18(token, amount)         оценка в долларах, 18 знаков
//   currentAprBps(token, term)                ставка в базисных пунктах
//
// APY подаём для срока 360 дней и указываем это в poolMeta: единой ставки
// у пула нет, срок выбирает вкладчик. Тот же подход у рынков с фиксированной
// доходностью до погашения.

const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'fwb';
const SITE = 'https://finwb.xyz';

// Срок, ставку за который показываем.
const TERM_DAYS = 360;

const VAULTS = {
  ethereum: '0x1Ef96B8fad9aE983E60610C4ba13536606B5c477',
  bsc: '0x18A021d1c89Af87AaeD266B2C58dD16855Ad3702',
  polygon: '0xd17127796D46c1588550Df783FCfE3D08ef8F6c0',
  arbitrum: '0xF5d84413f2cd33d6d473BA9D0c665a73472d8fC7',
  base: '0x199180dfbACEE5c204Db4E803A92a9D3A9Db4d1F',
};

const abi = {
  getSupportedTokens: 'function getSupportedTokens() view returns (address[])',
  activePrincipalByToken: 'function activePrincipalByToken(address) view returns (uint256)',
  getTokenUsdValue18: 'function getTokenUsdValue18(address token, uint256 amount) view returns (uint256)',
  currentAprBps: 'function currentAprBps(address, uint32) view returns (uint16)',
};

const WAD = 1e18;
const BPS = 100; // базисные пункты -> проценты

// В символе USD₮0 стоит знак ₮ (U+20AE), а не латинская T: фильтр символов
// его вырезает и получается USD0. Приводим к обычному написанию.
function normaliseSymbol(symbol) {
  return String(symbol).replace(/₮/g, 'T');
}

async function poolsForChain(chain) {
  const target = VAULTS[chain];

  const tokens = (
    await sdk.api.abi.call({ target, chain, abi: abi.getSupportedTokens })
  ).output;

  if (!tokens || tokens.length === 0) return [];

  const [principals, symbols, decimals, aprs] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      abi: abi.activePrincipalByToken,
      calls: tokens.map((token) => ({ target, params: [token] })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:symbol',
      calls: tokens.map((token) => ({ target: token })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: tokens.map((token) => ({ target: token })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: abi.currentAprBps,
      calls: tokens.map((token) => ({ target, params: [token, TERM_DAYS] })),
    }),
  ]);

  // Оценку в долларах контракт считает сам — своим оракулом цен.
  const values = await sdk.api.abi.multiCall({
    chain,
    abi: abi.getTokenUsdValue18,
    calls: tokens.map((token, i) => ({
      target,
      params: [token, principals.output[i].output],
    })),
  });

  return tokens.map((token, i) => {
    const tvlUsd = Number(values.output[i].output) / WAD;
    const apyBase = Number(aprs.output[i].output) / BPS;

    return {
      pool: `${target}-${token}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: utils.formatSymbol(normaliseSymbol(symbols.output[i].output)),
      tvlUsd,
      apyBase,
      underlyingTokens: [token],
      // Единой ставки у пула нет — она зависит от выбранного вкладчиком срока.
      // Показываем ставку за 360 дней и говорим об этом прямо.
      poolMeta: `Fixed term 30/90/180/${TERM_DAYS}d, APY shown for ${TERM_DAYS}d`,
      url: SITE,
    };
  }).filter((pool) => Number.isFinite(pool.tvlUsd) && Number.isFinite(pool.apyBase));
}

const apy = async () => {
  const chains = Object.keys(VAULTS);
  const results = await Promise.all(chains.map((chain) => poolsForChain(chain)));
  return results.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: SITE,
  // Номер протокола обязан стоять здесь цифрой: проверка yield-server читает
  // файл как текст и константу подставить не может.
  protocolId: '8069',
};
