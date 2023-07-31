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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _this = this;
var utils = require('../utils');
var _a = require('graphql-request'), request = _a.request, gql = _a.gql;
var API_URL = 'https://api.auragi.finance/api/v1/pairs';
var SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/oxbill/auragi';
var swapPairsQuery = function (skip) {
    return gql(__makeTemplateObject(["\n    query MyQuery {\n      pairs(first: 100, skip: ", ", where: {reserveUSD_gt: 10000}) {\n        reserve0\n        reserve1\n        token1 {\n          id\n          symbol\n        }\n        token0 {\n          id\n          symbol\n        }\n        reserveUSD\n        id\n      }\n    }\n  "], ["\n    query MyQuery {\n      pairs(first: 100, skip: ", ", where: {reserveUSD_gt: 10000}) {\n        reserve0\n        reserve1\n        token1 {\n          id\n          symbol\n        }\n        token0 {\n          id\n          symbol\n        }\n        reserveUSD\n        id\n      }\n    }\n  "]), skip);
};
var getPairs = function () { return __awaiter(_this, void 0, void 0, function () {
    var pairs, index, res;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pairs = [];
                index = 0;
                _a.label = 1;
            case 1: return [4 /*yield*/, request(SUBGRAPH_URL, swapPairsQuery(index), {})];
            case 2:
                res = _a.sent();
                if (res.pairs.length > 0) {
                    pairs = __spreadArray(__spreadArray([], pairs, true), res.pairs, true);
                }
                index += res.pairs.length;
                _a.label = 3;
            case 3:
                if (res.pairs.length > 0) return [3 /*break*/, 1];
                _a.label = 4;
            case 4: return [2 /*return*/, pairs];
        }
    });
}); };
var getApy = function () { return __awaiter(_this, void 0, void 0, function () {
    var poolsRes, apyDict, alreadySeen, _i, poolsRes_1, pool, pairs, _a, pairs_1, pair, token0Key, token1Key, fullCoin, chunkSize, i, chunk, coins, pools;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, utils.getData(API_URL)];
            case 1:
                poolsRes = (_b.sent()).data;
                apyDict = {};
                alreadySeen = [];
                for (_i = 0, poolsRes_1 = poolsRes; _i < poolsRes_1.length; _i++) {
                    pool = poolsRes_1[_i];
                    apyDict[pool.address.toLowerCase()] = pool === null || pool === void 0 ? void 0 : pool.apr;
                }
                return [4 /*yield*/, getPairs()];
            case 2:
                pairs = _b.sent();
                for (_a = 0, pairs_1 = pairs; _a < pairs_1.length; _a++) {
                    pair = pairs_1[_a];
                    token0Key = 'arbitrum:' + pair.token0.id.toLowerCase();
                    token1Key = 'arbitrum:' + pair.token1.id.toLowerCase();
                    if (!alreadySeen.includes(token0Key)) {
                        alreadySeen.push(token0Key);
                    }
                    if (!alreadySeen.includes(token1Key)) {
                        alreadySeen.push(token1Key);
                    }
                }
                fullCoin = {};
                chunkSize = 60;
                i = 0;
                _b.label = 3;
            case 3:
                if (!(i < alreadySeen.length)) return [3 /*break*/, 6];
                chunk = alreadySeen.slice(i, i + chunkSize);
                return [4 /*yield*/, utils.getData("https://coins.llama.fi/prices/current/" + chunk.join(',') + "?searchWidth=4h")];
            case 4:
                coins = (_b.sent()).coins;
                fullCoin = __assign(__assign({}, fullCoin), coins);
                _b.label = 5;
            case 5:
                i += chunkSize;
                return [3 /*break*/, 3];
            case 6:
                pools = pairs.map(function (pair) {
                    var tvl = 0;
                    if (fullCoin['arbitrum:' + pair.token0.id.toLowerCase()] && fullCoin['arbitrum:' + pair.token1.id.toLowerCase()]) {
                        var token0ValueInReserve = parseFloat(pair.reserve0) * parseFloat(fullCoin['arbitrum:' + pair.token0.id.toLowerCase()].price);
                        var token1ValueInReserve = parseFloat(pair.reserve1) * parseFloat(fullCoin['arbitrum:' + pair.token1.id.toLowerCase()].price);
                        tvl = token0ValueInReserve + token1ValueInReserve;
                    }
                    else {
                        // fallbacking to the one from api if defillama price are missing
                        tvl = parseFloat(pair.reserveUSD);
                    }
                    return {
                        pool: pair.id,
                        chain: utils.formatChain('arbitrum'),
                        project: 'auragi-finance',
                        symbol: pair.token0.symbol + "-" + pair.token1.symbol,
                        tvlUsd: tvl,
                        apyReward: parseFloat(apyDict[pair.id.toLowerCase()]),
                        underlyingTokens: [pair.token0.id, pair.token1.id],
                        rewardTokens: [
                            '0xFF191514A9baba76BfD19e3943a4d37E8ec9a111', // AGI
                        ],
                    };
                });
                return [2 /*return*/, pools];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://auragi.finance/pools',
};
