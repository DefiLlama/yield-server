var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
var _a = require('graphql-request'), gql = _a.gql, request = _a.request;
var utils = require('ethers').utils;
var PREMIA_TOKEN_ADDRESS = require('./addresses').PREMIA_TOKEN_ADDRESS;
var _b = require('./utils'), convert = _b.convert, getChainRewardData = _b.getChainRewardData;
var getPrices = require('../utils').getPrices;
var getPoolsQuery = gql(__makeTemplateObject(["\n  query MyQuery {\n    pools {\n      address\n      annualPercentageReturn\n      averageReturn\n      netSizeInUsd\n      openInterest\n      totalLocked\n      name\n      id\n      underlying {\n        address\n        symbol\n        decimals\n      }\n      totalVolumeInUsd\n      openInterestInUsd\n      profitLossPercentage\n      optionType\n      base {\n        address\n        symbol\n        decimals\n      }\n    }\n  }\n"], ["\n  query MyQuery {\n    pools {\n      address\n      annualPercentageReturn\n      averageReturn\n      netSizeInUsd\n      openInterest\n      totalLocked\n      name\n      id\n      underlying {\n        address\n        symbol\n        decimals\n      }\n      totalVolumeInUsd\n      openInterestInUsd\n      profitLossPercentage\n      optionType\n      base {\n        address\n        symbol\n        decimals\n      }\n    }\n  }\n"]));
var chainToSubgraph = {
    ethereum: 'https://api.thegraph.com/subgraphs/name/premiafinance/premiav2',
    arbitrum: 'https://api.thegraph.com/subgraphs/name/premiafinance/premia-arbitrum',
    fantom: 'https://api.thegraph.com/subgraphs/name/premiafinance/premia-fantom',
    optimism: 'https://api.thegraph.com/subgraphs/name/premiafinance/premia-optimism',
};
function fetchChainPools(url, chain, price) {
    return __awaiter(this, void 0, void 0, function () {
        var pools, chainRewardData;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, request(url, getPoolsQuery)];
                case 1:
                    pools = (_a.sent()).pools;
                    return [4 /*yield*/, getChainRewardData(chain)];
                case 2:
                    chainRewardData = _a.sent();
                    return [4 /*yield*/, Promise.all(pools.map(function (pool) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, convert(pool, chain, chainRewardData, price)];
                                case 1: return [2 /*return*/, _a.sent()];
                            }
                        }); }); }))];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function getPREMIAPrice() {
    return __awaiter(this, void 0, void 0, function () {
        var PREMIA_PRICE;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getPrices([PREMIA_TOKEN_ADDRESS['ethereum']], 'ethereum')];
                case 1:
                    PREMIA_PRICE = _a.sent();
                    return [2 /*return*/, PREMIA_PRICE.pricesBySymbol.premia];
            }
        });
    });
}
function poolsFunction() {
    return __awaiter(this, void 0, void 0, function () {
        var PRICE, pools;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getPREMIAPrice()];
                case 1:
                    PRICE = _a.sent();
                    return [4 /*yield*/, Promise.all(Object.keys(chainToSubgraph).map(function (chain) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                            return [2 /*return*/, fetchChainPools(chainToSubgraph[chain], chain, PRICE)];
                        }); }); }))];
                case 2:
                    pools = _a.sent();
                    return [2 /*return*/, pools.flat()];
            }
        });
    });
}
module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://app.premia.finance/options',
};
