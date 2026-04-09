const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const chain = 'monad';
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

const pools = {
  '0x106d0e2bff74b39d09636bdcd5d4189f24d91433': NATIVE_TOKEN, // MON
  '0xdb4e67f878289a820046f46f6304fd6ee1449281': '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', // USDC
  '0xf358f9e4ba7d210fde8c9a30522bb0063e15c4bb': '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON
  '0x7821ba4e39c86ac4bdd2482e853f9c7ba57d01d0': '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', // USDT
  '0x0394728ef18258ca21f782ce37ebf1a16799d7ef': '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', // WETH
  '0xd636d6ab7072483de6ddc067f9147f8c1e512f18': '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', // WBTC
  '0x7f5996865e952bd7892366712d319de59b9ecc6b': '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', // AUSD
  '0x3249df5ca0b825e7c3e7d84a4bb11c2eacd8c0f6': '0x111111d2bf19e43C34263401e0CAd979eD1cdb61', // USD1
  '0x09cd0233ad57bac4f916ca7aa08321b96effbaf2': '0x336D414754967C6682B5A665C7DAF6F1409E63e8', // MUBOND
  '0xaa3f243731d724f2195271a9c3f5c744f0d0b948': '0x4917a5ec9fCb5e10f47CBB197aBe6aB63be81fE8', // AZND
  '0x7d99267be583d46273803b2b1c5edb98bff6538d': '0x103222f020e98Bba0AD9809A011FDF8e6F067496', // earnAUSD
  '0xd2108dec68089646c3d4d95f01ea42ee1142e7f4': '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', // shMON
  '0xc0fda7f80e772ac3f85735f66ecb1ac964a033f2': '0xA3227C5969757783154C60bF0bC1944180ed81B9', // kintsu MON
  '0xfdd72592a657775249da1b013ac1371ccd45d885': '0x0c65A0BC65a5D819235B71F554D210D3F80E0852', // aprMON
  '0x428bebf994c970656854eb66586583fe682cc1d3': '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', // gMON
  '0x6973eb51C7A2aeF62B22208c72869b4440176ebE': '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', // cbBTC
  '0x43dF57B359141aAe021E64375dDaA0b2bb89b148': '0xD7aCB868F97F8286D5d3A0Fd5Ef112a8a72eCD90', // enzoBTC
  '0x1FCD2d883e6EF9146672e2Bdb8501918dc7b3ed4': '0xd691b0aFed67F96CEC28Ab6308Cbe5b2C103b7e9', // eBTC
  '0x4C79B2368d0FFa1BC7399ee0fB3569e220C3f52d': '0xD793c04B87386A6bb84ee61D98e0065FdE7fdA5E', // sAUSD
  '0x9f2Bc225892Eee4C2B579d4b7cB3a74859b5D622': '0x9dcB0D17eDDE04D27F387c89fECb78654C373858', // yzUSD
  '0x8A0F894ec72c879b0f808c6d3FC1FBc7B130Cc69': '0x484be0540aD49f351eaa04eeB35dF0f937D4E73f', // syzUSD
};

const apy = async () => {
  const poolAddresses = Object.keys(pools);
  const tokenAddresses = Object.values(pools);

  const [depositData, borrowData] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'function getDepositData() view returns (tuple(uint16 optimalUtilisationRatio, uint256 totalAmount, uint256 interestRate, uint256 interestIndex))',
      calls: poolAddresses.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: 'function getVariableBorrowData() view returns (tuple(uint32 vr0, uint32 vr1, uint32 vr2, uint256 totalAmount, uint256 interestRate, uint256 interestIndex))',
      calls: poolAddresses.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
  ]);

  const depositDataList = depositData.output.map((o) => o.output);
  const borrowDataList = borrowData.output.map((o) => o.output);

  // Get ERC20 metadata for non-native tokens
  const nonNativeTokens = tokenAddresses.filter((t) => t !== NATIVE_TOKEN);

  const [decimalsRes, symbolsRes] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: nonNativeTokens.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: nonNativeTokens.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
  ]);

  const decimalsMap = { [NATIVE_TOKEN]: 18 };
  const symbolsMap = { [NATIVE_TOKEN]: 'MON' };
  nonNativeTokens.forEach((t, i) => {
    decimalsMap[t.toLowerCase()] = Number(decimalsRes.output[i]?.output) || 18;
    symbolsMap[t.toLowerCase()] = symbolsRes.output[i]?.output || t;
  });

  // Get token prices
  const priceKeys = tokenAddresses.map((t) => `${chain}:${t}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return poolAddresses
    .map((poolAddr, i) => {
      const tokenAddr = tokenAddresses[i];
      const deposit = depositDataList[i];
      const borrow = borrowDataList[i];

      if (!deposit || !borrow) {
        return null;
      }

      const tokenKey = tokenAddr.toLowerCase();
      const decimals = decimalsMap[tokenKey] || 18;
      const symbol = symbolsMap[tokenKey] || tokenAddr;
      const price = prices[`${chain}:${tokenAddr}`]?.price;

      if (!price) {
        return null;
      }

      const totalDepositAmount = Number(deposit.totalAmount);
      const totalBorrowAmount = Number(borrow.totalAmount);

      const tvlUsd =
        ((totalDepositAmount - totalBorrowAmount) / 10 ** decimals) * price;
      const totalSupplyUsd = (totalDepositAmount / 10 ** decimals) * price;
      const totalBorrowUsd = (totalBorrowAmount / 10 ** decimals) * price;

      // interestRate is 18 d.p. where 1e18 = 100% APR
      const depositApr = Number(deposit.interestRate) / 1e16;
      const borrowApr = Number(borrow.interestRate) / 1e16;

      const apyBase = utils.aprToApy(depositApr);
      const apyBaseBorrow = utils.aprToApy(borrowApr);
      const borrowable = apyBaseBorrow > 0

      return {
        pool: `${poolAddr}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'townsquare',
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase,
        underlyingTokens: [tokenAddr],
        totalSupplyUsd,
        url: 'https://app.townsq.xyz/',
        ...(borrowable && {
          apyBaseBorrow,
          borrowable,
          totalBorrowUsd,
        })
      };
    })
    .filter((p) => p !== null && utils.keepFinite(p));
};

module.exports = {
  apy,
  url: 'https://townesquare.xyz',
};
