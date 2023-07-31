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
var axios = require('axios');
var BigNumber = require('bignumber.js');
var statsUrl = 'https://api.stats.ref.finance/';
var PEM_TOKEN = 'token.pembrock.near';
function commonCall(url, method, args) {
    if (args === void 0) { args = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, axios({
                        method: 'get',
                        url: url + method,
                        params: args,
                    })];
                case 1:
                    result = _a.sent();
                    if (result.data.error) {
                        throw new Error(result.data.error.message + ": " + result.data.error.data);
                    }
                    return [2 /*return*/, result.data];
            }
        });
    });
}
var apr2apy = function (apr) {
    return apr.div(365).plus(1).pow(365).minus(1);
};
var getTvl = function (id) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, commonCall(statsUrl, "api/pool/" + id + "/tvl")];
    });
}); };
var getVolume = function (id) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, commonCall(statsUrl, "api/pool/" + id + "/volume")];
    });
}); };
var calcTradingFees = function (farm) {
    var pool = farm.pool, volume = farm.volume, tvl = farm.tvl;
    var sevenDaysSumVolume = Object.keys(volume).reduce(function (sum, item) {
        return sum.plus(new BigNumber(volume[item]['volume_dollar']));
    }, new BigNumber(0));
    var sevenDaysSumTvl = Object.keys(tvl).reduce(function (sum, item) {
        return sum.plus(new BigNumber(tvl[item]['asset_tvl']).plus(new BigNumber(tvl[item]['fiat_tvl'])));
    }, new BigNumber(0));
    // Calc Trading Fees
    var tradingFees = !sevenDaysSumTvl.isZero()
        ? sevenDaysSumVolume
            .multipliedBy(365)
            .multipliedBy(pool ? pool['total_fee'] : 0)
            .multipliedBy(0.8) // 20% of total fee takes the exchange
            .dividedBy(sevenDaysSumTvl)
            .dividedBy(10000) // fee divisor
        : new BigNumber(0);
    return tradingFees;
};
var calcYieldFarming = function (farm) {
    var listFarmsBySeed = farm.listFarmsBySeed, seedInfo = farm.seedInfo, pool = farm.pool, tokensPriceList = farm.tokensPriceList;
    // Calc Yield Farming
    var refTVL = pool && new BigNumber(pool['tvl']);
    var refSharesTotalSupply = pool && new BigNumber(pool['shares_total_supply']);
    var yieldFarming = new BigNumber(0);
    var stakedAmount = new BigNumber(seedInfo ? seedInfo['total_seed_amount'] : 0);
    var stakedTVL = stakedAmount
        .multipliedBy(refTVL)
        .dividedBy(refSharesTotalSupply);
    listFarmsBySeed === null || listFarmsBySeed === void 0 ? void 0 : listFarmsBySeed.forEach(function (el) {
        var rewardTokenId = el['terms']['reward_token'];
        var rewardTokenPrice = tokensPriceList[rewardTokenId]['price'];
        var tokenDecimals = tokensPriceList[rewardTokenId]['decimal'];
        var rewardPerDay = el['terms']['daily_reward'];
        var farmApr = new BigNumber(365)
            .multipliedBy(rewardPerDay)
            .multipliedBy(rewardTokenPrice)
            .dividedBy(stakedTVL)
            .shiftedBy(-tokenDecimals);
        yieldFarming = yieldFarming.plus(farmApr);
    });
    return yieldFarming;
};
var calcLeveragedFarmData = function (farm, leverage, debtRate, token, pemToken) {
    var rewardsAPR = calcDebtRewardsAPR(token, pemToken === null || pemToken === void 0 ? void 0 : pemToken.refPrice);
    var _leverage = new BigNumber(leverage);
    var yieldFarming = calcYieldFarming(farm);
    var tradingFees = calcTradingFees(farm);
    var yieldFarmingLev = yieldFarming.multipliedBy(_leverage).dividedBy(1000);
    var tradingFeesLev = tradingFees.multipliedBy(_leverage).dividedBy(1000);
    var borrowInterestLev = _leverage
        .minus(1000)
        .negated()
        .multipliedBy(debtRate)
        .dividedBy(1000); // leverage divisor // ! differe from docs, not divided by 10000
    var rewardsAprLev = _leverage
        .minus(1000)
        .multipliedBy(rewardsAPR)
        .dividedBy(1000); // leverage divisor
    // Calc Total APR
    var totalApr = yieldFarmingLev.plus(tradingFeesLev).plus(borrowInterestLev);
    // Calc DailyAPR Apr
    var dailyAPR = totalApr.dividedBy(365);
    // Calc APY
    var totalApy = dailyAPR
        .plus(1)
        .pow(365)
        .minus(1)
        .plus(rewardsAprLev.isNaN() ? 0 : rewardsAprLev); // ! differe from docs, rewardsAprLev added
    return { totalApy: totalApy };
};
function formatBigNumber(num, showDecimals) {
    if (showDecimals === void 0) { showDecimals = 2; }
    var _num = new BigNumber(num);
    return _num.isNaN() ? '--' : _num.toFixed(showDecimals);
}
var calcFarmTVL = function (farm, tokens) {
    var _a, _b;
    var _c = [farm.token1_id, farm.token2_id], token1_id = _c[0], token2_id = _c[1];
    var token1 = tokens.find(function (token) { return token.id === token1_id; });
    var token2 = tokens.find(function (token) { return token.id === token2_id; });
    // this condition if we don't have enough data
    var refPrice1 = (token1 === null || token1 === void 0 ? void 0 : token1.refPrice) || '0';
    var refPrice2 = (token2 === null || token2 === void 0 ? void 0 : token2.refPrice) || '0';
    var tokenDecimals1 = ((_a = token1 === null || token1 === void 0 ? void 0 : token1.metadata) === null || _a === void 0 ? void 0 : _a.decimals) || 18;
    var tokenDecimals2 = ((_b = token2 === null || token2 === void 0 ? void 0 : token2.metadata) === null || _b === void 0 ? void 0 : _b.decimals) || 18;
    var token1_value = new BigNumber(farm.value)
        .multipliedBy(farm.pool.amounts[0])
        .multipliedBy(refPrice1)
        .dividedBy(farm.pool.shares_total_supply)
        .shiftedBy(-tokenDecimals1);
    var token2_value = new BigNumber(farm.value)
        .multipliedBy(farm.pool.amounts[1])
        .multipliedBy(refPrice2)
        .dividedBy(farm.pool.shares_total_supply)
        .shiftedBy(-tokenDecimals2);
    return token1_value.plus(token2_value);
};
var calcFarmTableData = function (farm, debtIsToken1, leverage, tokens) {
    var pemToken = tokens === null || tokens === void 0 ? void 0 : tokens.find(function (item) { return item.id === PEM_TOKEN; });
    var token = tokens === null || tokens === void 0 ? void 0 : tokens.find(function (item) { return item.id === (debtIsToken1 ? farm.token1_id : farm.token2_id); });
    var debtRate = new BigNumber(token.debt_rate).shiftedBy(-24);
    var calcData = calcLeveragedFarmData(farm, leverage, debtRate, token, pemToken);
    return {
        tvl: formatBigNumber(calcFarmTVL(farm, tokens)),
        apy: formatBigNumber(calcData.totalApy.multipliedBy(100)),
    };
};
var calcLendRewardsAPR = function (token, pemTokenPrice) {
    var _a;
    return ((_a = token.metadata) === null || _a === void 0 ? void 0 : _a.decimals)
        ? new BigNumber(52)
            .multipliedBy(token.lend_reward_rate_per_week)
            .multipliedBy(pemTokenPrice)
            .shiftedBy(token.metadata.decimals)
            .dividedBy(token.total_supply)
            .dividedBy(token.refPrice)
            .shiftedBy(-18)
        : BigNumber(0);
};
var calcDebtRewardsAPR = function (token, pemTokenPrice) {
    var _a;
    return ((_a = token.metadata) === null || _a === void 0 ? void 0 : _a.decimals)
        ? new BigNumber(52)
            .multipliedBy(token.debt_reward_rate_per_week)
            .multipliedBy(pemTokenPrice)
            .shiftedBy(token.metadata.decimals)
            .dividedBy(token.total_borrowed)
            .dividedBy(token.refPrice)
            .shiftedBy(-18)
        : BigNumber(0);
};
var calculateLendTableData = function (token, pemTokenPrice) {
    // TODO: use settings.borrow_fee
    var borrow_fee = 100; // 10%
    var debt_rate = new BigNumber(token.debt_rate).shiftedBy(-24);
    var lendAPR = token.total_supply
        ? debt_rate
            .multipliedBy(10000 - borrow_fee)
            .multipliedBy(token.total_borrowed)
            .dividedBy(token.total_supply)
            .dividedBy(10000) // borrow_fee divisor
        : new BigNumber(0);
    var lendRewardsAPR = calcLendRewardsAPR(token, pemTokenPrice).multipliedBy(100);
    var lendAPY = apr2apy(lendAPR).multipliedBy(100);
    var totalLendAPY = lendAPY.plus(lendRewardsAPR);
    return {
        totalLendAPY: totalLendAPY.toFixed(2),
    };
};
module.exports = {
    calculateLendTableData: calculateLendTableData,
    calcFarmTableData: calcFarmTableData,
    commonCall: commonCall,
    getVolume: getVolume,
    getTvl: getTvl,
};
