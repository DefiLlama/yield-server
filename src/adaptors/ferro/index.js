var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
var _this = this;
var _a = require('graphql-request'), gql = _a.gql, request = _a.request;
var sdk = require('@defillama/sdk');
var utils = require('../utils');
var API_URL_3FER = 'https://api.ferroprotocol.com/info/api/getApys';
var FERR_SUBGRAPH = 'https://graph.cronoslabs.com/subgraphs/name/ferro/bar';
var STAKING_ADDRESS = '0x6b82eAce10F782487B61C616B623A78c965Fdd88';
var FERRO_TOKEN = '0x39bC1e38c842C60775Ce37566D03B41A7A66C782';
var SWAP_3FER_ADDRESS = '0xe8d13664a42b338f009812fa5a75199a865da5cd';
var TOKEN_3FER_ADDRESSES = {
    USDT: { address: '0x66e428c3f67a68878562e79A0234c1F83c208770', decimals: 6 },
    USDC: { address: '0xc21223249ca28397b4b6541dffaecc539bff0c59', decimals: 6 },
    DAI: { address: '0xf2001b145b43032aaf5ee2884e456ccd805f677d', decimals: 18 },
};
var SWAP_2FER_ADDRESS = '0xa34c0fe36541fb085677c36b4ff0ccf5fa2b32d6';
var TOKEN_2FER_ADDRESSES = {
    USDC: { address: '0xc21223249ca28397b4b6541dffaecc539bff0c59', decimals: 6 },
    USDT: { address: '0x66e428c3f67a68878562e79A0234c1F83c208770', decimals: 6 },
};
var stakingQuery = gql(__makeTemplateObject(["\n  query stakingQuery {\n    barDailySnapshots(orderBy: date, orderDirection: desc, first: 7) {\n      id\n      ratio\n    }\n  }\n"], ["\n  query stakingQuery {\n    barDailySnapshots(orderBy: date, orderDirection: desc, first: 7) {\n      id\n      ratio\n    }\n  }\n"]));
var CG_NAMES = {
    tether: 'USDT',
    'usd-coin': 'USDC',
    dai: 'DAI',
    ferro: 'FERRO',
};
var getPoolApy = function (swapAddr, symbol, poolMeta, tokenAddresses, mappedPrices, apyApiData) { return __awaiter(_this, void 0, void 0, function () {
    var stakeBalance, tvlUsd;
    var _this = this;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.all(Object.entries(tokenAddresses).map(function (_a) {
                    var _ = _a[0], _b = _a[1], address = _b.address, decimals = _b.decimals;
                    return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0: return [4 /*yield*/, sdk.api.erc20.balanceOf({
                                        target: address,
                                        owner: swapAddr,
                                        chain: 'cronos',
                                    })];
                                case 1: return [2 /*return*/, (_c.sent()).output /
                                        Math.pow(10, decimals)];
                            }
                        });
                    });
                }))];
            case 1:
                stakeBalance = _a.sent();
                tvlUsd = Object.entries(tokenAddresses).reduce(function (acc, token, i) {
                    return acc + mappedPrices[token[0]] * stakeBalance[i];
                }, 0);
                return [2 /*return*/, {
                        pool: swapAddr,
                        symbol: symbol,
                        poolMeta: poolMeta,
                        chain: utils.formatChain('cronos'),
                        project: 'ferro',
                        tvlUsd: tvlUsd,
                        apyBase: apyApiData[poolMeta].baseApr,
                        apyReward: apyApiData[poolMeta].ferroApr,
                        underlyingTokens: Object.values(tokenAddresses).map(function (_a) {
                            var address = _a.address;
                            return address;
                        }),
                        rewardTokens: [FERRO_TOKEN],
                    }];
        }
    });
}); };
var getApy = function () { return __awaiter(_this, void 0, void 0, function () {
    var data, priceKeys, prices, stakingRatio, stakingApy, mappedPrices, ferroStakeBalance, stakePool, stable3FerPool, stable2FerPool;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, utils.getData(API_URL_3FER)];
            case 1:
                data = (_a.sent()).data;
                priceKeys = Object.keys(CG_NAMES)
                    .map(function (t) { return "coingecko:" + t; })
                    .join(',');
                return [4 /*yield*/, utils.getData("https://coins.llama.fi/prices/current/" + priceKeys)];
            case 2:
                prices = (_a.sent()).coins;
                return [4 /*yield*/, request(FERR_SUBGRAPH, stakingQuery)];
            case 3:
                stakingRatio = _a.sent();
                stakingApy = (1 -
                    stakingRatio.barDailySnapshots[6].ratio /
                        stakingRatio.barDailySnapshots[0].ratio) *
                    52;
                mappedPrices = Object.entries(prices).reduce(function (acc, _a) {
                    var _b;
                    var name = _a[0], price = _a[1];
                    return (__assign(__assign({}, acc), (_b = {}, _b[CG_NAMES[name.replace('coingecko:', '')]] = price.price, _b)));
                }, {});
                return [4 /*yield*/, sdk.api.erc20.balanceOf({
                        target: FERRO_TOKEN,
                        owner: STAKING_ADDRESS,
                        chain: 'cronos',
                    })];
            case 4:
                ferroStakeBalance = (_a.sent()).output / 1e18;
                stakePool = {
                    pool: STAKING_ADDRESS,
                    symbol: 'FER',
                    chain: utils.formatChain('cronos'),
                    project: 'ferro',
                    tvlUsd: ferroStakeBalance * mappedPrices.FERRO,
                    apyReward: stakingApy * 100,
                    underlyingTokens: [FERRO_TOKEN],
                    rewardTokens: [FERRO_TOKEN],
                };
                return [4 /*yield*/, getPoolApy(SWAP_3FER_ADDRESS, 'DAI-USDC-USDT', '3FER', TOKEN_3FER_ADDRESSES, mappedPrices, data)];
            case 5:
                stable3FerPool = _a.sent();
                return [4 /*yield*/, getPoolApy(SWAP_2FER_ADDRESS, 'USDC-USDT', '2FER', TOKEN_2FER_ADDRESSES, mappedPrices, data)];
            case 6:
                stable2FerPool = _a.sent();
                return [2 /*return*/, [stakePool, stable3FerPool, stable2FerPool]];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://ferroprotocol.com/#/pools',
};
