// forked from uniswap.fish chads (see https://github.com/chunza2542/uniswap.fish)
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
var bn = require('bignumber.js');
var axios = require('axios');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });
var Q96 = new bn(2).pow(96);
var getTickFromPrice = function (price, token0Decimal, token1Decimal) {
    var token0 = expandDecimals(price, Number(token0Decimal));
    var token1 = expandDecimals(1, Number(token1Decimal));
    var sqrtPrice = encodeSqrtPriceX96(token1).div(encodeSqrtPriceX96(token0));
    return Math.log(sqrtPrice.toNumber()) / Math.log(Math.sqrt(1.0001));
};
var getPriceFromTick = function (tick, token0Decimal, token1Decimal) {
    var sqrtPrice = new bn(Math.pow(Math.sqrt(1.0001), tick)).multipliedBy(new bn(2).pow(96));
    var token0 = expandDecimals(1, Number(token0Decimal));
    var token1 = expandDecimals(1, Number(token1Decimal));
    var L2 = mulDiv(encodeSqrtPriceX96(token0), encodeSqrtPriceX96(token1), Q96);
    var price = mulDiv(L2, Q96, sqrtPrice)
        .div(new bn(2).pow(96))
        .div(new bn(10).pow(token0Decimal))
        .pow(2);
    return price.toNumber();
};
var getTokensAmountFromDepositAmountUSD = function (P, Pl, Pu, priceUSDX, priceUSDY, depositAmountUSD) {
    var deltaL = depositAmountUSD /
        ((Math.sqrt(P) - Math.sqrt(Pl)) * priceUSDY +
            (1 / Math.sqrt(P) - 1 / Math.sqrt(Pu)) * priceUSDX);
    var deltaY = deltaL * (Math.sqrt(P) - Math.sqrt(Pl));
    if (deltaY * priceUSDY < 0)
        deltaY = 0;
    if (deltaY * priceUSDY > depositAmountUSD)
        deltaY = depositAmountUSD / priceUSDY;
    var deltaX = deltaL * (1 / Math.sqrt(P) - 1 / Math.sqrt(Pu));
    if (deltaX * priceUSDX < 0)
        deltaX = 0;
    if (deltaX * priceUSDX > depositAmountUSD)
        deltaX = depositAmountUSD / priceUSDX;
    return { amount0: deltaX, amount1: deltaY };
};
// for calculation detail, please visit README.md (Section: Calculation Breakdown, No. 2)
var getLiquidityForAmount0 = function (sqrtRatioAX96, sqrtRatioBX96, amount0) {
    // amount0 * (sqrt(upper) * sqrt(lower)) / (sqrt(upper) - sqrt(lower))
    var intermediate = mulDiv(sqrtRatioBX96, sqrtRatioAX96, Q96);
    return mulDiv(amount0, intermediate, sqrtRatioBX96.minus(sqrtRatioAX96));
};
var getLiquidityForAmount1 = function (sqrtRatioAX96, sqrtRatioBX96, amount1) {
    // amount1 / (sqrt(upper) - sqrt(lower))
    return mulDiv(amount1, Q96, sqrtRatioBX96.minus(sqrtRatioAX96));
};
var getSqrtPriceX96 = function (price, token0Decimal, token1Decimal) {
    var token0 = expandDecimals(price, token0Decimal);
    var token1 = expandDecimals(1, token1Decimal);
    return token0.div(token1).sqrt().multipliedBy(Q96);
};
var getLiquidityDelta = function (P, lowerP, upperP, amount0, amount1, token0Decimal, token1Decimal) {
    var amt0 = expandDecimals(amount0, token1Decimal);
    var amt1 = expandDecimals(amount1, token0Decimal);
    var sqrtRatioX96 = getSqrtPriceX96(P, token0Decimal, token1Decimal);
    var sqrtRatioAX96 = getSqrtPriceX96(lowerP, token0Decimal, token1Decimal);
    var sqrtRatioBX96 = getSqrtPriceX96(upperP, token0Decimal, token1Decimal);
    var liquidity;
    if (sqrtRatioX96.lte(sqrtRatioAX96)) {
        liquidity = getLiquidityForAmount0(sqrtRatioAX96, sqrtRatioBX96, amt0);
    }
    else if (sqrtRatioX96.lt(sqrtRatioBX96)) {
        var liquidity0 = getLiquidityForAmount0(sqrtRatioX96, sqrtRatioBX96, amt0);
        var liquidity1 = getLiquidityForAmount1(sqrtRatioAX96, sqrtRatioX96, amt1);
        liquidity = bn.min(liquidity0, liquidity1);
    }
    else {
        liquidity = getLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amt1);
    }
    return liquidity;
};
var estimateFee = function (liquidityDelta, liquidity, volume24H, feeTier) {
    var feeTierPercentage = getFeeTierPercentage(feeTier);
    var liquidityPercentage = liquidityDelta
        .div(liquidity.plus(liquidityDelta))
        .toNumber();
    return feeTierPercentage * volume24H * liquidityPercentage;
};
var getLiquidityFromTick = function (poolTicks, tick) {
    var _a;
    // calculate a cumulative of liquidityNet from all ticks that poolTicks[i] <= tick
    var liquidity = new bn(0);
    for (var i = 0; i < poolTicks.length - 1; ++i) {
        liquidity = liquidity.plus(new bn(poolTicks[i].liquidityNet));
        var lowerTick = Number(poolTicks[i].tickIdx);
        var upperTick = Number((_a = poolTicks[i + 1]) === null || _a === void 0 ? void 0 : _a.tickIdx);
        if (lowerTick <= tick && tick <= upperTick) {
            break;
        }
    }
    return liquidity;
};
// private helper functions
var encodeSqrtPriceX96 = function (price) {
    return new bn(price).sqrt().multipliedBy(Q96).integerValue(3);
};
var expandDecimals = function (n, exp) {
    return new bn(n).multipliedBy(new bn(10).pow(exp));
};
var mulDiv = function (a, b, multiplier) {
    return a.multipliedBy(b).div(multiplier);
};
var getFeeTierPercentage = function (tier) {
    if (tier === '100')
        return 0.01 / 100;
    if (tier === '500')
        return 0.05 / 100;
    if (tier === '3000')
        return 0.3 / 100;
    if (tier === '10000')
        return 1 / 100;
    return 0;
};
var getPoolTicks = function (poolAddress, url) { return __awaiter(_this, void 0, void 0, function () {
    var PAGE_SIZE, result, page, pool1, pool2, pool3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                PAGE_SIZE = 3;
                result = [];
                page = 0;
                _a.label = 1;
            case 1:
                if (!true) return [3 /*break*/, 5];
                return [4 /*yield*/, _getPoolTicksByPage(poolAddress, page, url)];
            case 2:
                pool1 = _a.sent();
                return [4 /*yield*/, _getPoolTicksByPage(poolAddress, page + 1, url)];
            case 3:
                pool2 = _a.sent();
                return [4 /*yield*/, _getPoolTicksByPage(poolAddress, page + 2, url)];
            case 4:
                pool3 = _a.sent();
                result = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], result, true), pool1, true), pool2, true), pool3, true);
                if (pool1.length === 0 || pool2.length === 0 || pool3.length === 0) {
                    return [3 /*break*/, 5];
                }
                page += PAGE_SIZE;
                return [3 /*break*/, 1];
            case 5: return [2 /*return*/, result];
        }
    });
}); };
var _getPoolTicksByPage = function (poolAddress, page, url) { return __awaiter(_this, void 0, void 0, function () {
    var res, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, _queryUniswap("{\n    ticks(first: 1000, skip: " + page * 1000 + ", where: { poolAddress: \"" + poolAddress + "\" }, orderBy: tickIdx) {\n      tickIdx\n      liquidityNet\n      price0\n      price1\n    }\n  }", url)];
            case 1:
                res = _a.sent();
                return [3 /*break*/, 3];
            case 2:
                e_1 = _a.sent();
                console.log('_getPoolTicksByPage failed for', poolAddress);
                return [2 /*return*/, []];
            case 3: return [2 /*return*/, res === undefined ? [] : res.ticks];
        }
    });
}); };
var _queryUniswap = function (query, url) { return __awaiter(_this, void 0, void 0, function () {
    var data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios({
                    url: url,
                    method: 'post',
                    data: {
                        query: query,
                    },
                })];
            case 1:
                data = (_a.sent()).data;
                return [2 /*return*/, data.data];
        }
    });
}); };
module.exports.EstimatedFees = function (poolAddress, priceAssumptionValue, priceRangeValue, currentPriceUSDToken1, currentPriceUSDToken0, depositAmountUSD, decimalsToken0, decimalsToken1, feeTier, url, volume) { return __awaiter(_this, void 0, void 0, function () {
    var P, Pl, Pu, priceUSDX, priceUSDY, _a, amount0, amount1, deltaL, currentTick, poolTicks, L, estimatedFee;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                P = priceAssumptionValue;
                Pl = priceRangeValue[0];
                Pu = priceRangeValue[1];
                priceUSDX = currentPriceUSDToken1 || 1;
                priceUSDY = currentPriceUSDToken0 || 1;
                _a = getTokensAmountFromDepositAmountUSD(P, Pl, Pu, priceUSDX, priceUSDY, depositAmountUSD), amount0 = _a.amount0, amount1 = _a.amount1;
                deltaL = getLiquidityDelta(P, Pl, Pu, amount0, amount1, Number(decimalsToken0 || 18), Number(decimalsToken1 || 18));
                currentTick = getTickFromPrice(P, decimalsToken0 || '18', decimalsToken1 || '18');
                return [4 /*yield*/, getPoolTicks(poolAddress, url)];
            case 1:
                poolTicks = _b.sent();
                if (!poolTicks.length) {
                    console.log("No pool ticks found for " + poolAddress);
                    return [2 /*return*/, { poolAddress: poolAddress, estimatedFee: 0 }];
                }
                L = getLiquidityFromTick(poolTicks, currentTick);
                estimatedFee = P >= Pl && P <= Pu ? estimateFee(deltaL, L, volume, feeTier) : 0;
                return [2 /*return*/, { poolAddress: poolAddress, estimatedFee: estimatedFee }];
        }
    });
}); };
