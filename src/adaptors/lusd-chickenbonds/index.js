"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var superagent = require('superagent');
var abi = require('./abi');
var _a = require('./helpers'), getRebondApy = _a.getRebondApy, contractCall = _a.contractCall, getLusdUsdPrice = _a.getLusdUsdPrice;
var _b = require('./addresses'), CHICKEN_BOND_MANAGER_ADDRESS = _b.CHICKEN_BOND_MANAGER_ADDRESS, BLUSD_LUSD_3CRV_POOL_ADDRESS = _b.BLUSD_LUSD_3CRV_POOL_ADDRESS, LUSD_ADDRESS = _b.LUSD_ADDRESS, BLUSD_ADDRESS = _b.BLUSD_ADDRESS, LUSD_3CRV_POOL_ADDRESS = _b.LUSD_3CRV_POOL_ADDRESS, CRV_ADDRESS = _b.CRV_ADDRESS;
var getBLusdRebondStrategy = function () { return __awaiter(void 0, void 0, void 0, function () {
    var lusdUsdPrice, tvlUsd, rebondApy;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getLusdUsdPrice()];
            case 1:
                lusdUsdPrice = _a.sent();
                return [4 /*yield*/, contractCall(CHICKEN_BOND_MANAGER_ADDRESS, abi.chickenBondManager.getPendingLUSD)];
            case 2:
                tvlUsd = ((_a.sent()) /
                    1e18) *
                    lusdUsdPrice;
                return [4 /*yield*/, getRebondApy()];
            case 3:
                rebondApy = _a.sent();
                return [2 /*return*/, {
                        pool: CHICKEN_BOND_MANAGER_ADDRESS,
                        project: 'lusd-chickenbonds',
                        symbol: 'bLUSD',
                        chain: 'ethereum',
                        tvlUsd: tvlUsd,
                        apyBase: rebondApy,
                        underlyingTokens: [LUSD_ADDRESS, BLUSD_ADDRESS],
                        rewardTokens: [LUSD_ADDRESS],
                        poolMeta: 'Rebonding bLUSD strategy continuously performs the following steps: create an LUSD bond, claim it at the optimum rebond time, sell the acquired bLUSD back to LUSD, and then bond again.',
                    }];
        }
    });
}); };
var getBLusdLusd3CrvStrategy = function () { return __awaiter(void 0, void 0, void 0, function () {
    var curvePoolDataResponse, curvePoolDetailsResponse, poolData, apyReward, apyBase, tvlUsd;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0: return [4 /*yield*/, superagent.get('https://api.curve.fi/api/getPools/ethereum/factory-crypto')];
            case 1:
                curvePoolDataResponse = (_e.sent()).body;
                return [4 /*yield*/, superagent.get('https://api.curve.fi/api/getFactoryAPYs?version=crypto')];
            case 2:
                curvePoolDetailsResponse = (_e.sent()).body;
                poolData = (_a = curvePoolDataResponse.data) === null || _a === void 0 ? void 0 : _a.poolData.find(function (pool) { return pool.id === 'factory-crypto-134'; });
                apyReward = poolData === null || poolData === void 0 ? void 0 : poolData.gaugeRewards.reduce(function (total, current) { return total + current.apy; }, 0);
                apyBase = (_d = (_c = (_b = curvePoolDetailsResponse === null || curvePoolDetailsResponse === void 0 ? void 0 : curvePoolDetailsResponse.data) === null || _b === void 0 ? void 0 : _b.poolDetails) === null || _c === void 0 ? void 0 : _c.find(function (pool) { return pool.poolAddress === BLUSD_LUSD_3CRV_POOL_ADDRESS; })) === null || _d === void 0 ? void 0 : _d.apy;
                tvlUsd = poolData === null || poolData === void 0 ? void 0 : poolData.usdTotal;
                return [2 /*return*/, {
                        pool: BLUSD_LUSD_3CRV_POOL_ADDRESS,
                        project: 'lusd-chickenbonds',
                        symbol: 'bLUSD/LUSD-3CRV',
                        chain: 'ethereum',
                        tvlUsd: tvlUsd,
                        apyBase: apyBase,
                        apyReward: apyReward,
                        underlyingTokens: [LUSD_ADDRESS, BLUSD_ADDRESS, LUSD_3CRV_POOL_ADDRESS],
                        rewardTokens: [
                            BLUSD_ADDRESS,
                            LUSD_3CRV_POOL_ADDRESS,
                            LUSD_ADDRESS,
                            CRV_ADDRESS,
                        ],
                        poolMeta: 'Staking bLUSD/LUSD-3CRV LP tokens in the Curve gauge earns yield from trade fees, Curve rewards and LUSD rewards from claimed bonds.',
                    }];
        }
    });
}); };
var getStrategies = function () { return __awaiter(void 0, void 0, void 0, function () {
    var bLusdRebondStrategy, bLusdLusd3CrvPoolStrategy;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getBLusdRebondStrategy()];
            case 1:
                bLusdRebondStrategy = _a.sent();
                return [4 /*yield*/, getBLusdLusd3CrvStrategy()];
            case 2:
                bLusdLusd3CrvPoolStrategy = _a.sent();
                return [2 /*return*/, [bLusdRebondStrategy, bLusdLusd3CrvPoolStrategy]];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getStrategies,
    url: 'https://chickenbonds.org/',
};
