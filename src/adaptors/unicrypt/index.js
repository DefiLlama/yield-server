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
var utils = require('../utils');
var fetch = require('node-fetch');
var API_URL = 'https://api-chain-eth.unicrypt.network/api/v1/farms/search';
var SECONDS_PER_DAY = 86400;
var getData = function () { return __awaiter(_this, void 0, void 0, function () {
    var body;
    var _this = this;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                body = {
                    filters: { sort: 'tvl', sortAscending: false },
                    page: 0,
                    rows_per_page: 100,
                };
                return [4 /*yield*/, fetch(API_URL, {
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify(body),
                        method: 'POST',
                    }).then(function (data) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, data.json()];
                            case 1: return [2 /*return*/, _a.sent()];
                        }
                    }); }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
var getApy = function () { return __awaiter(_this, void 0, void 0, function () {
    var farms, pools;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getData()];
            case 1:
                farms = (_a.sent()).rows;
                pools = farms.map(function (farm) {
                    var isLp = !!farm.meta.lp_meta;
                    var symbol = isLp
                        ? farm.meta.lp_meta.token0.symbol + "-" + farm.meta.lp_meta.token1.symbol + " LP"
                        : farm.stoken_symbol;
                    var lockDuration = farm.meta.min_staking_period / SECONDS_PER_DAY;
                    return {
                        pool: farm.spool_address,
                        chain: utils.formatChain('ethereum'),
                        project: 'unicrypt',
                        symbol: symbol.replace('LP', '').trim(),
                        poolMeta: lockDuration > 2 ? lockDuration + " days lock" : null,
                        apy: farm.apy,
                        tvlUsd: farm.tvl,
                        underlyingTokens: isLp
                            ? [farm.meta.lp_meta.token0.address, farm.meta.lp_meta.token1.address]
                            : [farm.meta.staking_token.address],
                        rewardTokens: farm.meta.rewards.map(function (_a) {
                            var address = _a.address;
                            return address;
                        }),
                    };
                });
                return [2 /*return*/, pools];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://app.unicrypt.network/chain/mainnet/farms',
};
