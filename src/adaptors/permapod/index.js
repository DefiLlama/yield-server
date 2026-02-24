const utils = require('../utils');                                                                                                                                                
  const BigNumber = require('bignumber.js');                                                                                                                                        
                                                                                                                                                                                    
  const CHAIN_NAME_LLAMA = 'ZIGChain';
  const CHAIN_KEY = 'zigchain';                                                                                                                                                     
                                                                                                                                                                                    
  const LCD_ENDPOINT = 'https://public-zigchain-lcd.numia.xyz';

  const ADDRESS_PROVIDER =
    'zig1jy2amze7fxcmessewv65jq5kupsxae2n96yech9g8d8rp5vnv74qxlddqk';

  const FALLBACK_MODULES = {
    red_bank:
      'zig1s3frrzltqaxvuzffvxg89uuad6nkcyqe3ucvrahynznaek3mhe4s75puyu',
    oracle:
      'zig1nr48m8vv6kutnse3scxsg96pxmeyzj8hkn6rf9mstdtmmcn8h2tsm54kmz',
    params:
      'zig1ma6e2dgkuu62fc66rn4msrnv89tyws75jpzz5kkk5pn4uf2cat5quevjw0',
  };

  const TOKENS = {
    'coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig':
      { symbol: 'stZIG', decimals: 6 },
    'ibc/6490A7EAB61059BFC1CDDEB05917DD70BDF3A611654162A1A47DB930D40D8AF4':
      { symbol: 'USDC', decimals: 6 },
    uzig: { symbol: 'ZIG', decimals: 6 },
  };

  const ORACLE_PRICE_DECIMALS = 6;
  const PROJECT_SLUG = 'permapod';
  const APP_URL = 'https://app.permapod.xyz';

  async function apy() {
    const apyData = [];

    const modules = await getCoreModules();
    const assetParams = await getAllAssetParams(modules.params);

    await Promise.all(
      assetParams.map(async (p) => {
        try {
          const denom = p.denom;
          const token = TOKENS[denom];
          if (!token) return;

          const whitelisted = !!p?.credit_manager?.whitelisted;
          const depositEnabled = !!p?.red_bank?.deposit_enabled;
          if (!whitelisted || !depositEnabled) return;

          const market = await queryMarket(modules.red_bank, denom);

          const priceInfo = await queryContract(LCD_ENDPOINT, modules.oracle, {
            price: { denom },
          });

          const priceDecimalsDiff = token.decimals - ORACLE_PRICE_DECIMALS;
          const price = new BigNumber(priceInfo.price).shiftedBy(
            priceDecimalsDiff
          );

          const totalSupplied = new BigNumber(market.totalSupplied).shiftedBy(
            -token.decimals
          );
          const totalBorrowed = new BigNumber(market.totalBorrowed).shiftedBy(
            -token.decimals
          );

          const depositApr = Number(market.depositApr) * 100;
          const borrowApr = Number(market.borrowApr) * 100;

          const tvlUsd = totalSupplied
            .minus(totalBorrowed)
            .times(price)
            .toNumber();
          if (tvlUsd < 10_000) return;

          apyData.push({
            pool: `permapod-${denom}-${CHAIN_KEY}`.toLowerCase(),
            chain: CHAIN_NAME_LLAMA,
            project: PROJECT_SLUG,
            symbol: token.symbol,
            underlyingTokens: [denom],

            tvlUsd,
            totalSupplyUsd: totalSupplied.times(price).toNumber(),
            totalBorrowUsd: totalBorrowed.times(price).toNumber(),

            apyBase: utils.aprToApy(depositApr, 365),
            apyBaseBorrow: utils.aprToApy(borrowApr, 365),

            ltv:
              p?.max_loan_to_value != null
                ? Number(p.max_loan_to_value)
                : null,
            borrowable: p?.red_bank?.borrow_enabled ?? null,
            url: APP_URL,
          });
        } catch (e) {
          return;
        }
      })
    );

    return apyData;
  }

  async function getCoreModules() {
    async function resolve(addressType, fallback) {
      try {
        const res = await queryContract(LCD_ENDPOINT, ADDRESS_PROVIDER, {
          address: addressType,
        });
        return res?.data?.address ?? res?.address ?? fallback;
      } catch (e) {
        return fallback;
      }
    }

    const [params, red_bank, oracle] = await Promise.all([
      resolve('params', FALLBACK_MODULES.params),
      resolve('red_bank', FALLBACK_MODULES.red_bank),
      resolve('oracle', FALLBACK_MODULES.oracle),
    ]);

    return { params, red_bank, oracle };
  }

  async function getAllAssetParams(paramsContract) {
    const out = [];
    const limit = 50;
    let startAfter = null;

    while (true) {
      const res = await queryContract(LCD_ENDPOINT, paramsContract, {
        all_asset_params_v2: { limit, start_after: startAfter },
      }).catch(async () => {
        return queryContract(LCD_ENDPOINT, paramsContract, {
          all_asset_params: { limit, start_after: startAfter },
        });
      });

      const page = res?.data?.data ?? res?.data ?? res;
      const items = page?.data ?? page;

      if (!Array.isArray(items) || items.length === 0) break;

      out.push(...items);

      const hasMore =
        page?.metadata?.has_more ??
        page?.meta_data?.has_more ??
        items.length === limit;

      if (!hasMore) break;
      startAfter = items[items.length - 1].denom;
    }

    return out;
  }

  async function queryMarket(redBankContract, denom) {
    const m2 = await queryContract(LCD_ENDPOINT, redBankContract, {
      market_v2: { denom },
    }).catch(() => null);

    if (m2) {
      const totalSupplied =
        m2.collateral_total_amount ?? m2?.market?.collateral_total_amount;
      const totalBorrowed =
        m2.debt_total_amount ?? m2?.market?.debt_total_amount;

      if (totalSupplied != null && totalBorrowed != null) {
        return {
          totalSupplied: String(totalSupplied),
          totalBorrowed: String(totalBorrowed),
          depositApr: Number(
            m2.liquidity_rate ?? m2?.market?.liquidity_rate ?? 0
          ),
          borrowApr: Number(m2.borrow_rate ?? m2?.market?.borrow_rate ?? 0),
        };
      }
    }

    const marketInfo = await queryContract(LCD_ENDPOINT, redBankContract, {
      market: { denom },
    });

    const amountScaled = marketInfo['debt_total_scaled'];
    const debtUnderlying = await queryContract(LCD_ENDPOINT, redBankContract, {
      underlying_debt_amount: {
        denom,
        amount_scaled: amountScaled,
      },
    });

    const v1Supplied =
      marketInfo.collateral_total_amount ??
      marketInfo.total_deposit_amount ??
      marketInfo.deposit_total_amount ??
      '0';

    return {
      totalSupplied: String(v1Supplied),
      totalBorrowed: String(debtUnderlying ?? '0'),
      depositApr: Number(marketInfo.liquidity_rate ?? 0),
      borrowApr: Number(marketInfo.borrow_rate ?? 0),
    };
  }

  async function queryContract(api, contract, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const encoded = Buffer.from(payload).toString('base64');
    const endpoint = `${api}/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`;
    const result = await utils.getData(endpoint);
    return result?.data?.data ?? result?.data;
  }

  module.exports = {
    apy,
    timetravel: false,
    url: APP_URL,
  };