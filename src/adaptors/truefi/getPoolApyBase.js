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
var BigNumber = require('bignumber.js');
var erc20Abi = require('./abis/erc20.json');
var web3 = require('./connection').web3;
var YEAR_IN_DAYS = 365;
var SECOND_IN_MS = 1000;
var DAY_IN_SECONDS = 24 * 60 * 60;
var PRECISION = Math.pow(10, 10);
var APY_PRECISION = 10000;
var LENDER_ADDRESS = '0xa606dd423dF7dFb65Efe14ab66f5fDEBf62FF583';
function getInterestForPeriod(periodInDays, apyInBps) {
    return 1 + (apyInBps / APY_PRECISION) * (periodInDays / YEAR_IN_DAYS);
}
function getLoanWeightedApyValue(_a, nowInDays) {
    var apy = _a.apy, startDate = _a.startDate, endDate = _a.endDate, id = _a.id;
    return __awaiter(this, void 0, void 0, function () {
        var loanDuration, daysPassed, totalInterest, accruedInterest, loanTokenPrice, loan, lenderBalance, _b, scaledAmount;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (nowInDays > endDate) {
                        return [2 /*return*/, new BigNumber(0)];
                    }
                    loanDuration = (endDate - startDate) / DAY_IN_SECONDS;
                    daysPassed = (nowInDays - startDate) / DAY_IN_SECONDS;
                    totalInterest = getInterestForPeriod(loanDuration, apy);
                    accruedInterest = getInterestForPeriod(daysPassed, apy);
                    loanTokenPrice = Math.floor(accruedInterest / totalInterest * PRECISION);
                    loan = new web3.eth.Contract(erc20Abi, id);
                    _b = BigNumber.bind;
                    return [4 /*yield*/, loan.methods.balanceOf(LENDER_ADDRESS).call()];
                case 1:
                    lenderBalance = new (_b.apply(BigNumber, [void 0, _c.sent()]))();
                    scaledAmount = lenderBalance.multipliedBy(loanTokenPrice).div(PRECISION);
                    return [2 /*return*/, scaledAmount.multipliedBy(apy)];
            }
        });
    });
}
function getPoolApyBase(poolLoans, poolValue, tokenDecimals) {
    return __awaiter(this, void 0, void 0, function () {
        var nowInDays, loanWeightedApyValues, loansWeightedApySum, poolApyBaseInBps;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    nowInDays = Date.now() / SECOND_IN_MS;
                    return [4 /*yield*/, Promise.all(poolLoans.map(function (loan) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, getLoanWeightedApyValue(loan, nowInDays)];
                                case 1: return [2 /*return*/, _a.sent()];
                            }
                        }); }); }))];
                case 1:
                    loanWeightedApyValues = _a.sent();
                    loansWeightedApySum = loanWeightedApyValues.reduce(function (sum, value) { return sum.plus(value); }, new BigNumber(0));
                    poolApyBaseInBps = loansWeightedApySum.div(poolValue).toNumber() / (Math.pow(10, tokenDecimals));
                    return [2 /*return*/, poolApyBaseInBps / 100];
            }
        });
    });
}
module.exports = {
    getPoolApyBase: getPoolApyBase
};
