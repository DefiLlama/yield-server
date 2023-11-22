const sdk = require('@defillama/sdk');
const axios = require('axios');

const abiIBToken = require('./abiIBToken.json');
const abiDebtToken = require('./abiDebtToken.json');
const abiMoneyMarketReader = require('./abiMoneyMarketReader.json');
const abiMiniFL = require('./abiMiniFL.json');

const moneyMarketReader = '0x4913DEC75cC0e061Ba78ebbDb2584905760be4C6';
const miniFL = '0x4579587AE043131999cE3d9C66199726972E3Fb7';
const ALPACA = '0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F';

const markets = [
  {
    name: 'WBNB',
    tier: 'COLLATERAL',
    token: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    ibToken: '0x2928623eFF453Fb8C9BC744041637a4D2D5Fc56b',
    debtToken: '0x855894fe37CFaeE188A1acCc5dd4b38d504F09E9',
    interestModel: '0xe44bDd3f0b69f2c294A0250825BCF31eE3af4314',
  },
  {
    name: 'USDC',
    tier: 'COLLATERAL',
    token: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    ibToken: '0x547593f6aFa897bb05828FBb8D587Ca31D9fF519',
    debtToken: '0x049C15F84850FC0d76eFe3b0940a44fC3edD6e2E',
    interestModel: '0x4132392C57B9D2DE1BA393A03f23Fcb880Bf8EE1',
  },
  {
    name: 'USDT',
    tier: 'COLLATERAL',
    token: '0x55d398326f99059fF775485246999027B3197955',
    ibToken: '0x90476BFEF61F190b54a439E2E98f8E43Fb9b4a45',
    debtToken: '0xd9D0a0B8B9dc0f845797B678F00c6d7FAD577B56',
    interestModel: '0x4132392C57B9D2DE1BA393A03f23Fcb880Bf8EE1',
  },
  {
    name: 'BUSD',
    tier: 'COLLATERAL',
    token: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    ibToken: '0x3f38BA29AcC107E6F0b059a17c9bAb0598d0f249',
    debtToken: '0x7ffbcda33cD2F7812f9Da4c1189E745379F95B79',
    interestModel: '0x4132392C57B9D2DE1BA393A03f23Fcb880Bf8EE1',
  },
  {
    name: 'BTCB',
    tier: 'COLLATERAL',
    token: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    ibToken: '0x6C9Cb3739d6B390A4BAcc4D5F0a2629cF5c383B3',
    debtToken: '0x457a325E5c63aE73F684d9477826e07F56da749B',
    interestModel: '0x89c53B34b5E6A1D0b2922941749e9Ee05ce58b42',
  },
  {
    name: 'ETH',
    tier: 'COLLATERAL',
    token: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    ibToken: '0x0A4FE32De91bE99a3EFAC80F6576976293B95369',
    debtToken: '0x57496afdB38A0da228046c93695778c757075dEa',
    interestModel: '0x89c53B34b5E6A1D0b2922941749e9Ee05ce58b42',
  },
  {
    name: 'HIGH',
    tier: 'CROSS',
    token: '0x5f4Bde007Dc06b867f86EBFE4802e34A1fFEEd63',
    ibToken: '0x0c9E2653B17b60E9aD9465D1cF478bD6d76a03F0',
    debtToken: '0xeB27c21EBA6765608681ec96B0d9F697726884DA',
    interestModel: '0xe44bDd3f0b69f2c294A0250825BCF31eE3af4314',
  },
  {
    name: 'Cake',
    tier: 'COLLATERAL',
    token: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    ibToken: '0x848204278E491f5f15B3F2dce593e6af9552b372',
    debtToken: '0xE0ECA72bEe09695C82d9DD5422267270495eA0c2',
    interestModel: '0xe44bDd3f0b69f2c294A0250825BCF31eE3af4314',
  },
  {
    name: 'XRP',
    tier: 'COLLATERAL',
    token: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
    ibToken: '0xACb41b8bddF67727F07bf375b01edC40Ed51c4ff',
    debtToken: '0x9c04F5D68fc754D79fBCAc8fC56469C0264F85DC',
    interestModel: '0x89c53B34b5E6A1D0b2922941749e9Ee05ce58b42',
  },
  {
    name: 'DOGE',
    tier: 'COLLATERAL',
    token: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
    ibToken: '0x72Ad41ecf9C6C1171F19FaCCBA2b347D64AFe57f',
    debtToken: '0xBda539AFD66fEE61499B22769E4e413dc158f271',
    interestModel: '0xe44bDd3f0b69f2c294A0250825BCF31eE3af4314',
  },
  {
    name: 'LTC',
    tier: 'COLLATERAL',
    token: '0x4338665CBB7B2485A8855A139b75D5e34AB0DB94',
    ibToken: '0x42b2D846785636CfB393b5EC48C6581f47c37EC3',
    debtToken: '0x22c583069619eA08F260758E34Bc525B5833d11b',
    interestModel: '0xe44bDd3f0b69f2c294A0250825BCF31eE3af4314',
  },
  {
    name: 'THE',
    tier: 'ISOLATE',
    token: '0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11',
    ibToken: '0x91E3A9B3f5a2c02Dd5cd40733fe4d52a87A213d9',
    debtToken: '0x2C8A7592828007eF33D87B49732F174D9A0b6759',
    interestModel: '0xe44bDd3f0b69f2c294A0250825BCF31eE3af4314',
  },
  {
    name: 'ADA',
    tier: 'COLLATERAL',
    token: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',
    ibToken: '0x674d38092D177A9b074e5CAA5D45315eaAcEc790',
    debtToken: '0xA57Ce447a14Ec8822105bF2c8f8456fcC0ba4dF4',
    interestModel: '0xe44bDd3f0b69f2c294A0250825BCF31eE3af4314',
  },
];

const apy = async () => {
  const marketStats = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({
        target: moneyMarketReader,
        params: [m.token],
      })),
      abi: abiMoneyMarketReader.find((m) => m.name === 'getMarketStats'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const getMarketMetadata = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({
        target: moneyMarketReader,
        params: [m.token],
      })),
      abi: abiMoneyMarketReader.find((m) => m.name === 'getMarketMetadata'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m.ibToken })),
      abi: abiIBToken.find((m) => m.name === 'decimals'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const decimalsDebtToken = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m.debtToken })),
      abi: 'erc20:decimals',
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const priceKeys = markets.map((m) => `bsc:${m.token}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = markets.map((m, i) => {
    const underlyingPrice = prices[`bsc:${m.token}`].price;

    const totalSupplyUsd =
      (marketStats[i].ibTotalAsset / 10 ** decimals[i]) * underlyingPrice;

    const totalBorrowUsd =
      (marketStats[i].globalDebtValue / 10 ** decimalsDebtToken[i]) *
      underlyingPrice;

    const utilization = totalBorrowUsd / totalSupplyUsd;

    const apyBaseBorrow =
      (marketStats[i].interestRate / 1e18) * 60 * 60 * 24 * 365 * 100;
    const apyBase = apyBaseBorrow * utilization * (1 - 0.18);

    const ltv = getMarketMetadata[i].ibTokenConfig.collateralFactor / 1e4;
    const borrowFactor =
      getMarketMetadata[i].underlyingTokenConfig.borrowingFactor / 1e4;
    const debtCeilingUsd =
      (getMarketMetadata[i].underlyingTokenConfig.maxBorrow / 1e18) *
      underlyingPrice;

    const url = `https://app-v2.alpacafinance.org/market/${m.token}`;

    return {
      pool: m.ibToken,
      symbol: m.name,
      chain: 'bsc',
      project: 'alpaca-finance-2.0',
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase,

      apyBaseBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      debtCeilingUsd,
      ltv,
      borrowFactor,
      url,
    };
  });
  return pools;
};

module.exports = {
  apy,
};
