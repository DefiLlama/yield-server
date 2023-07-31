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
var sdk = require('@defillama/sdk');
var BN = require('bignumber.js');
var utils = require('../utils');
var _a = require('./subgraph'), getXCALPrice = _a.getXCALPrice, getSwapPairs = _a.getSwapPairs;
var GAUGE_ABI = require('./abi.json');
var STABLE_FEE_PERCENTAGE = 0.00369;
var VARIABLE_FEE_PERCENTAGE = 0.27;
var CHAIN = 'arbitrum';
var XCAL_ADRESS = '0xd2568acCD10A4C98e87c44E9920360031ad89fCB';
var getApy = function () { return __awaiter(_this, void 0, void 0, function () {
    var _a, xcalPrice_1, pairs, gaugePairs_1, nonGaugePairs_1, multicalls_1, gaugesRewardRates_1, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                return [4 /*yield*/, Promise.all([
                        getXCALPrice(),
                        getSwapPairs(),
                    ])];
            case 1:
                _a = _b.sent(), xcalPrice_1 = _a[0], pairs = _a[1];
                gaugePairs_1 = [];
                nonGaugePairs_1 = [];
                multicalls_1 = [];
                _uniquePairs(pairs).forEach(function (pair) {
                    if (pair.gaugeAddress) {
                        gaugePairs_1.push(pair);
                        // construct rewardRate multicall
                        multicalls_1.push({ params: XCAL_ADRESS, target: pair.gaugeAddress });
                    }
                    else {
                        nonGaugePairs_1.push(pair);
                    }
                });
                return [4 /*yield*/, sdk.api.abi.multiCall({
                        calls: multicalls_1,
                        abi: GAUGE_ABI.find(function (_a) {
                            var name = _a.name;
                            return name === 'rewardRate';
                        }),
                        chain: CHAIN,
                    })];
            case 2:
                gaugesRewardRates_1 = (_b.sent()).output.map(function (_a) {
                    var output = _a.output;
                    return output;
                });
                // gauge pairs apr/apy
                gaugePairs_1 = gaugePairs_1.map(function (pair, index) {
                    var rewardRate = gaugesRewardRates_1[index].toString();
                    var apr = _calculateGaugeAPR(pair.reserveUSD, xcalPrice_1, rewardRate);
                    var apy = _toApy(apr);
                    // apy might have 20+ decimals for low liq pool, just show apr instead
                    pair.apy = new BN(apy).gt(1000000)
                        ? Number(apr)
                        : new BN(apy).times(100).toNumber();
                    return pair;
                });
                // none-gauge pairs apr/apy
                nonGaugePairs_1 = nonGaugePairs_1.map(function (pair) {
                    var apr = _calculateSwapFeeAPR(pair.volumeUSD, pair.reserveUSD, pair.stable);
                    var apy = _toApy(apr);
                    // apy might have 20+ decimals for low liq pool, just show apr instead
                    pair.apy = new BN(apy).gt(1000000)
                        ? Number(apr)
                        : new BN(apy).times(100).toNumber();
                    return pair;
                });
                return [2 /*return*/, __spreadArray(__spreadArray([], gaugePairs_1, true), nonGaugePairs_1, true).sort(function (a, b) { return Number(b.reserveUSD) - Number(a.reserveUSD); })
                        .map(function (_a) {
                        var address = _a.address, token0 = _a.token0, token1 = _a.token1, reserveUSD = _a.reserveUSD, apy = _a.apy, stable = _a.stable;
                        return ({
                            pool: address,
                            chain: utils.formatChain('arbitrum'),
                            project: '3xcalibur',
                            symbol: token0.symbol + "-" + token1.symbol,
                            tvlUsd: Number(reserveUSD),
                            apyReward: apy,
                            underlyingTokens: [token0.address, token1.address],
                            rewardTokens: [XCAL_ADRESS],
                            url: "https://app.3xcalibur.com/swap/liquidity/add?asset0=" + token0.address + "&asset1=" + token1.address + "&stable=" + stable,
                        });
                    })];
            case 3:
                error_1 = _b.sent();
                console.error('error@getApy', error_1);
                return [2 /*return*/, []];
            case 4: return [2 /*return*/];
        }
    });
}); };
var _uniquePairs = function (pairs) {
    var existingPairs = new Set();
    return pairs
        .sort(function (a, b) { return Number(b.reserveUSD) - Number(a.reserveUSD); }) // keep the highest tvl pairs
        .filter(function (pair) {
        var symbol = pair.token0.symbol + "_" + pair.token1.symbol;
        if (!existingPairs.has(symbol)) {
            existingPairs.add(symbol);
            return true;
        }
        return false;
    });
};
var _calculateSwapFeeAPR = function (volumeUSD, reserveUSD, stable) {
    var feeShare = new BN(volumeUSD)
        .times(stable ? STABLE_FEE_PERCENTAGE : VARIABLE_FEE_PERCENTAGE)
        .div(100);
    var projectedYearlyFees = feeShare.times(365);
    var feeAPR = projectedYearlyFees.div(reserveUSD).times(100).toFixed();
    return feeAPR;
};
var _calculateGaugeAPR = function (reserveUSD, rewardRate, xcalPrice) {
    var gaugeAPR = new BN(rewardRate)
        .div(1e18)
        .times(3600 * 24 * 365)
        .times(xcalPrice)
        .div(reserveUSD)
        .toFixed(18);
    return gaugeAPR;
};
var _toApy = function (apr) {
    var anualCompounds = 365; // assume 1 compound per day
    var leftSide = new BN(1).plus(new BN(apr).div(anualCompounds));
    return new BN(leftSide).pow(anualCompounds).minus(1).toFixed(18);
};
module.exports = {
    getApy: getApy,
};
