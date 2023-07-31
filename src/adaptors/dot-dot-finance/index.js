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
var API_URL = 'https://api.dotdot.finance/api/lpDetails';
var STAKING_URL = 'https://api.dotdot.finance/api/pool2';
var getApy = function () { return __awaiter(_this, void 0, void 0, function () {
    var tokens, staking, stakingPool, pools, res;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, utils.getData(API_URL)];
            case 1:
                tokens = (_a.sent()).data.tokens;
                return [4 /*yield*/, utils.getData(STAKING_URL)];
            case 2:
                staking = (_a.sent()).data;
                stakingPool = {
                    pool: staking.token0 + "-dot-dot-finance",
                    chain: utils.formatChain('binance'),
                    project: 'dot-dot-finance',
                    symbol: staking.symbol0 + "-" + staking.symbol1,
                    tvlUsd: staking.totalLpStakedUSD,
                    apyReward: staking.apr,
                    underlyingTokens: [staking.token0, staking.token1],
                    rewardTokens: [staking.token0],
                };
                pools = tokens.map(function (pool) {
                    var apyReward = pool.dddAPR + pool.epxAPR + (pool.extraRewardsTotalApr || 0);
                    return {
                        pool: pool.pool + "-dot-dot-finance",
                        chain: utils.formatChain('binance'),
                        project: 'dot-dot-finance',
                        symbol: utils.formatSymbol(pool.symbol.replace('val3EPS', 'valBUSD/valUSDC/valUSDT')),
                        tvlUsd: pool.dddTvlUSD,
                        apyReward: apyReward,
                        apyBase: pool.baseApr || 0,
                        underlyingTokens: [pool.token],
                        rewardTokens: __spreadArray([
                            '0xaf41054c1487b0e5e2b9250c0332ecbce6ce9d71',
                            '0x84c97300a190676a19D1E13115629A11f8482Bd1'
                        ], pool.extraRewards.map(function (_a) {
                            var address = _a.address;
                            return address;
                        }), true),
                    };
                });
                res = __spreadArray(__spreadArray([], pools, true), [stakingPool], false).filter(function (p) { return utils.keepFinite(p); });
                return [2 /*return*/, res];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://dotdot.finance/#/stake',
};
