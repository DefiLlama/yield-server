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
var API_URL = 'https://s.meshswap.fi/stat/recentPoolInfo.min.json';
var TOKENS_URL = 'https://s.meshswap.fi/stat/tokenInfo.min.json';
var LENDING_URL = 'https://s.meshswap.fi/stat/leverage.min.json';
var MESH_TOKEN = '0x82362Ec182Db3Cf7829014Bc61E9BE8a2E82868a';
var csvLikeToObjArr = function (csv) {
    var headers = csv[0];
    return csv
        .slice(1)
        .map(function (row) {
        return row.reduce(function (acc, val, i) {
            var _a;
            return (__assign(__assign({}, acc), (_a = {}, _a[headers[i]] = val, _a)));
        }, {});
    });
};
var getApy = function () { return __awaiter(_this, void 0, void 0, function () {
    var farmsRes, tokensRes, lendingRes, farms, tokens, lending, lendingPools, pools, res;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, utils.getData(API_URL)];
            case 1:
                farmsRes = (_a.sent()).recentPool;
                return [4 /*yield*/, utils.getData(TOKENS_URL)];
            case 2:
                tokensRes = _a.sent();
                return [4 /*yield*/, utils.getData(LENDING_URL)];
            case 3:
                lendingRes = (_a.sent()).leveragePool.single;
                farms = csvLikeToObjArr(farmsRes);
                tokens = csvLikeToObjArr(tokensRes);
                lending = csvLikeToObjArr(lendingRes);
                tokens;
                lendingPools = lending.map(function (market) {
                    return {
                        pool: market.address,
                        chain: utils.formatChain('polygon'),
                        project: 'meshswap',
                        symbol: market.tokenSymbol,
                        tvlUsd: Number(market.totalDepositVol),
                        apyBase: Number(market.supplyRate),
                        apyReward: Number(market.totalRewardRate) - Number(market.supplyRate),
                        underlyingTokens: [market.token],
                        rewardTokens: [MESH_TOKEN, market.token],
                    };
                });
                pools = farms.map(function (farm) {
                    var token0 = tokens.find(function (token) { return token.address === farm.token0; });
                    var token1 = tokens.find(function (token) { return token.address === farm.token1; });
                    return {
                        pool: farm.exchange_address,
                        chain: utils.formatChain('polygon'),
                        project: 'meshswap',
                        symbol: token0.symbol + "-" + token1.symbol,
                        tvlUsd: Number(farm.poolVolume),
                        apyReward: Number(farm.totalRewardRate) - Number(farm.feeRewardRate),
                        apyBase: Number(farm.feeRewardRate),
                        underlyingTokens: [farm.token0, farm.token1],
                        rewardTokens: [MESH_TOKEN],
                        url: "https://meshswap.fi/exchange/pool/detail/" + farm.exchange_address,
                    };
                });
                res = __spreadArray(__spreadArray([], pools, true), lendingPools, true);
                return [2 /*return*/, res];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://meshswap.fi/exchange/pool',
};
