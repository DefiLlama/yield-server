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
var sdk = require('@defillama/sdk');
var superagent = require('superagent');
var lambertW0 = require('lambert-w-function').lambertW0;
var abi = require('./abi');
var _a = require('./addresses'), LUSD_ADDRESS = _a.LUSD_ADDRESS, BLUSD_ADDRESS = _a.BLUSD_ADDRESS, BLUSD_LUSD_3CRV_POOL_ADDRESS = _a.BLUSD_LUSD_3CRV_POOL_ADDRESS, LUSD_3CRV_POOL_ADDRESS = _a.LUSD_3CRV_POOL_ADDRESS, CHICKEN_BOND_MANAGER_ADDRESS = _a.CHICKEN_BOND_MANAGER_ADDRESS, CURVE_REGISTRY_SWAPS_ADDRESS = _a.CURVE_REGISTRY_SWAPS_ADDRESS;
var getLusdUsdPrice = function () { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, superagent.get("https://coins.llama.fi/prices/current/ethereum:" + LUSD_ADDRESS)];
            case 1: return [2 /*return*/, (_a.sent()).body.coins["ethereum:" + LUSD_ADDRESS].price];
        }
    });
}); };
var contractCall = function (address, functionAbi, params) {
    if (params === void 0) { params = undefined; }
    return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sdk.api.abi.call({
                        target: address,
                        abi: functionAbi,
                        chain: 'ethereum',
                        params: params,
                    })];
                case 1: return [2 /*return*/, (_a.sent()).output];
            }
        });
    });
};
var _getAverageBondAgeInSeconds = function () { return __awaiter(_this, void 0, void 0, function () {
    var totalWeightedStartTimes, pendingBucketLusd, averageStartTimeinMilliseconds, averageBondAgeInSeconds;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, contractCall(CHICKEN_BOND_MANAGER_ADDRESS, abi.chickenBondManager.totalWeightedStartTimes)];
            case 1:
                totalWeightedStartTimes = (_a.sent()) / 1e18;
                return [4 /*yield*/, contractCall(CHICKEN_BOND_MANAGER_ADDRESS, abi.chickenBondManager.getPendingLUSD)];
            case 2:
                pendingBucketLusd = (_a.sent()) / 1e18;
                averageStartTimeinMilliseconds = Math.round(totalWeightedStartTimes / pendingBucketLusd) * 1000;
                averageBondAgeInSeconds = Math.round(Date.now() - averageStartTimeinMilliseconds) / 1000;
                return [2 /*return*/, averageBondAgeInSeconds];
        }
    });
}); };
var _secondsToDays = function (seconds) { return seconds / 60 / 60 / 24; };
var _getDaysUntilControllerStartsAdjusting = function (targetBondAgeInSeconds) { return __awaiter(_this, void 0, void 0, function () {
    var averageBondAgeInSeconds, secondsUntil, daysUntil;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, _getAverageBondAgeInSeconds()];
            case 1:
                averageBondAgeInSeconds = (_a.sent()) / 1e18;
                secondsUntil = targetBondAgeInSeconds > averageBondAgeInSeconds
                    ? targetBondAgeInSeconds - averageBondAgeInSeconds
                    : 0;
                daysUntil = _secondsToDays(secondsUntil);
                return [2 /*return*/, daysUntil];
        }
    });
}); };
var _getControllerAdjustedRebondDays = function (rebondPeriodInDays) { return __awaiter(_this, void 0, void 0, function () {
    var targetBondAgeInSeconds, daysUntilControllerStartsAdjusting, rebondDaysRemaining, lambertDividend, lambertDivisor, lambertQuotient, formulaDividend, formulaDivisor, controlledAdjustedRebondDays;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, contractCall(CHICKEN_BOND_MANAGER_ADDRESS, abi.chickenBondManager.targetAverageAgeSeconds)];
            case 1:
                targetBondAgeInSeconds = (_a.sent()) / 1e18;
                return [4 /*yield*/, _getDaysUntilControllerStartsAdjusting(targetBondAgeInSeconds)];
            case 2:
                daysUntilControllerStartsAdjusting = _a.sent();
                rebondDaysRemaining = rebondPeriodInDays;
                if (rebondDaysRemaining < daysUntilControllerStartsAdjusting) {
                    return [2 /*return*/, rebondDaysRemaining];
                }
                lambertDividend = rebondPeriodInDays * Math.log(0.99);
                lambertDivisor = Math.pow(0.99, daysUntilControllerStartsAdjusting);
                lambertQuotient = lambertW0(-(lambertDividend / lambertDivisor));
                formulaDividend = lambertQuotient + Math.log(0.99) * daysUntilControllerStartsAdjusting;
                formulaDivisor = Math.log(0.99);
                controlledAdjustedRebondDays = -(formulaDividend / formulaDivisor);
                return [2 /*return*/, controlledAdjustedRebondDays];
        }
    });
}); };
var _getBLusdMarketPrice = function () { return __awaiter(_this, void 0, void 0, function () {
    var marginalInputAmount, marginalOutputAmount, marketPrice;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                marginalInputAmount = 0x038d7ea4c68000;
                return [4 /*yield*/, contractCall(CURVE_REGISTRY_SWAPS_ADDRESS, abi.curveRegistrySwaps.get_exchange_multiple_amount, [
                        [
                            BLUSD_ADDRESS,
                            BLUSD_LUSD_3CRV_POOL_ADDRESS,
                            LUSD_3CRV_POOL_ADDRESS,
                            LUSD_3CRV_POOL_ADDRESS,
                            LUSD_ADDRESS,
                            '0x0000000000000000000000000000000000000000',
                            '0x0000000000000000000000000000000000000000',
                            '0x0000000000000000000000000000000000000000',
                            '0x0000000000000000000000000000000000000000',
                        ],
                        [
                            [0, 1, 3],
                            [0, 0, 9],
                            [0, 0, 0],
                            [0, 0, 0],
                        ],
                        marginalInputAmount,
                    ])];
            case 1:
                marginalOutputAmount = _a.sent();
                marketPrice = marginalOutputAmount / marginalInputAmount;
                return [2 /*return*/, marketPrice];
        }
    });
}); };
var getRebondApy = function () { return __awaiter(_this, void 0, void 0, function () {
    var alphaAccrualFactor, chickenInFee, floorPrice, marketPrice, marketPricePremium, rebondPeriodInDays, controllerAdjustedRebondPeriodInDays, rebondPeriodAccrualFactor, rebondRoi, rebondApr, rebondApy;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, contractCall(CHICKEN_BOND_MANAGER_ADDRESS, abi.chickenBondManager.calcUpdatedAccrualParameter)];
            case 1:
                alphaAccrualFactor = (_a.sent()) /
                    1e18 /
                    (24 * 60 * 60);
                return [4 /*yield*/, contractCall(CHICKEN_BOND_MANAGER_ADDRESS, abi.chickenBondManager.CHICKEN_IN_AMM_FEE)];
            case 2:
                chickenInFee = (_a.sent()) / 1e18;
                return [4 /*yield*/, contractCall(CHICKEN_BOND_MANAGER_ADDRESS, abi.chickenBondManager.calcSystemBackingRatio)];
            case 3:
                floorPrice = (_a.sent()) / 1e18;
                return [4 /*yield*/, _getBLusdMarketPrice()];
            case 4:
                marketPrice = _a.sent();
                marketPricePremium = (marketPrice / floorPrice) * (1 - chickenInFee);
                rebondPeriodInDays = alphaAccrualFactor *
                    ((1 + Math.sqrt(marketPricePremium)) / (marketPricePremium - 1));
                return [4 /*yield*/, _getControllerAdjustedRebondDays(rebondPeriodInDays)];
            case 5:
                controllerAdjustedRebondPeriodInDays = _a.sent();
                rebondPeriodAccrualFactor = (1 / floorPrice) *
                    (rebondPeriodInDays / (rebondPeriodInDays + alphaAccrualFactor));
                rebondRoi = (1 - chickenInFee) * rebondPeriodAccrualFactor * marketPrice - 1;
                rebondApr = rebondRoi * (365 / controllerAdjustedRebondPeriodInDays);
                rebondApy = Math.pow((1 + rebondApr / (365 / controllerAdjustedRebondPeriodInDays)), (365 / controllerAdjustedRebondPeriodInDays)) -
                    1;
                return [2 /*return*/, rebondApy * 100];
        }
    });
}); };
module.exports = { getLusdUsdPrice: getLusdUsdPrice, getRebondApy: getRebondApy, contractCall: contractCall };
