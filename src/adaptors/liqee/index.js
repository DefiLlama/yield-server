var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
var utils = require('../utils');
var abi = require('./abi.json');
var sdk = require('@defillama/sdk');
var API_URL = 'https://app.liqee.io/pos/markets?network=mainnet';
var controller = '0x8f1f15DCf4c70873fAF1707973f6029DEc4164b3';
var apy = function () { return __awaiter(_this, void 0, void 0, function () {
    var data, markets, res;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, utils.getData(API_URL)];
            case 1:
                data = _a.sent();
                return [4 /*yield*/, sdk.api.abi.multiCall({
                        chain: 'ethereum',
                        abi: abi.find(function (n) { return n.name === 'markets'; }),
                        calls: data.supplyMarkets.map(function (m) { return ({
                            target: controller,
                            params: [m.address],
                        }); }),
                    })];
            case 2:
                markets = (_a.sent()).output.map(function (o) { return o.output; });
                res = data.supplyMarkets.map(function (market, i) {
                    var apyReward = (Number(market.rewardSupplyApy) / Math.pow(10, Number(market.decimals))) * 100;
                    return {
                        pool: market.address,
                        chain: utils.formatChain('ethereum'),
                        project: 'liqee',
                        symbol: market.underlying_symbol,
                        tvlUsd: (Number(market.supplyValue) - Number(market.borrowValue)) /
                            Math.pow(10, Number(market.decimals)),
                        apyBase: (Number(market.supplyAPY) / Math.pow(10, Number(market.decimals))) * 100,
                        apyReward: apyReward,
                        rewardTokens: apyReward > 0 ? [market.address] : null,
                        underlyingTokens: market.underlying_symbol === 'ETH'
                            ? ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2']
                            : [data.underlyingToken[i].underlying],
                        // borrow fields
                        totalSupplyUsd: Number(market.supplyValue) / Math.pow(10, Number(market.decimals)),
                        totalBorrowUsd: Number(market.borrowValue) / Math.pow(10, Number(market.decimals)),
                        apyBaseBorrow: (Number(market.borrowAPY) / Math.pow(10, Number(market.decimals))) * 100,
                        apyRewardBorrow: (Number(market.rewardBorrowApy) / Math.pow(10, Number(market.decimals))) * 100,
                        ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
                    };
                });
                return [2 /*return*/, res];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://app.liqee.io/#/lending?AssetsType=Lend&currentPool=pos',
};
