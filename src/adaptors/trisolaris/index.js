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
var sdk = require('@defillama/sdk');
var _a = require('./abi'), token0 = _a.token0, token1 = _a.token1, name = _a.name;
var API_URL = 'https://cdn.trisolaris.io/datav2.json';
var TRI_TOKEN = '0xFa94348467f64D5A457F75F8bc40495D33c65aBB';
var makeCall = function (targets, abi) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, sdk.api.abi.multiCall({
                    abi: abi,
                    calls: targets.map(function (target) { return ({ target: target }); }),
                    chain: 'aurora',
                })];
            case 1: return [2 /*return*/, (_a.sent()).output.map(function (_a) {
                    var output = _a.output;
                    return output;
                })];
        }
    });
}); };
var apy = function () { return __awaiter(_this, void 0, void 0, function () {
    var farms, lpAddresses, tokens0, tokens1, names, token0Symbols, token1Symbols, pools;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, utils.getData(API_URL)];
            case 1:
                farms = _a.sent();
                lpAddresses = farms.map(function (_a) {
                    var lpAddress = _a.lpAddress;
                    return lpAddress;
                });
                return [4 /*yield*/, makeCall(lpAddresses, token0)];
            case 2:
                tokens0 = _a.sent();
                return [4 /*yield*/, makeCall(lpAddresses, token1)];
            case 3:
                tokens1 = _a.sent();
                return [4 /*yield*/, makeCall(lpAddresses, name)];
            case 4:
                names = _a.sent();
                return [4 /*yield*/, makeCall(tokens0, 'erc20:symbol')];
            case 5:
                token0Symbols = _a.sent();
                return [4 /*yield*/, makeCall(tokens1, 'erc20:symbol')];
            case 6:
                token1Symbols = _a.sent();
                pools = farms.map(function (farm, i) {
                    var isStablePool = token0Symbols[i] === null;
                    var name = isStablePool
                        ? names[i].replace('Trisolaris ', '')
                        : token0Symbols[i] + "-" + token1Symbols[i];
                    var extraApr = farm.nonTriAPRs.reduce(function (acc, val) { return acc + val.apr; }, 0);
                    return {
                        pool: farm.lpAddress + "-" + farm.id,
                        chain: utils.formatChain('aurora'),
                        project: 'trisolaris',
                        symbol: utils.formatSymbol(name),
                        tvlUsd: farm.totalStakedInUSD,
                        apyReward: farm.apr + extraApr,
                        underlyingTokens: isStablePool
                            ? [farm.lpAddress]
                            : [tokens0[i], tokens1[i]],
                        rewardTokens: __spreadArray([
                            TRI_TOKEN
                        ], (extraApr ? farm.nonTriAPRs.map(function (_a) {
                            var address = _a.address;
                            return address;
                        }) : []), true),
                    };
                });
                return [2 /*return*/, pools];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://www.trisolaris.io/#/farm',
};
