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
var BigNumber = require('bignumber.js');
var axios = require('axios');
var _a = require('./utils'), calculateLendTableData = _a.calculateLendTableData, calcFarmTableData = _a.calcFarmTableData, commonCall = _a.commonCall, getVolume = _a.getVolume, getTvl = _a.getTvl;
var tokensMetadata = require('./tokens_metadata');
var PEMBROCK_CONTRACT = 'v1.pembrock.near';
var REF_FINANCE_CONTRACT = 'v2.ref-finance.near';
var REF_BOOST_CONTRACT = 'boostfarm.ref-labs.near';
var PEM_TOKEN = 'token.pembrock.near';
var indexerUrl = 'https://indexer.ref.finance/';
var endpoint = 'https://rpc.mainnet.near.org/';
var getNearPrice = function () { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, commonCall('https://helper.mainnet.near.org', 'get')
                .then(function (res) { return res.json(); })
                .then(function (price) {
                return price.near.usd.toString();
            })
                .catch(function () { return []; })];
    });
}); };
function call(contract, method, args) {
    if (args === void 0) { args = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, axios.post(endpoint, {
                        jsonrpc: '2.0',
                        id: '1',
                        method: 'query',
                        params: {
                            request_type: 'call_function',
                            finality: 'final',
                            account_id: contract,
                            method_name: method,
                            args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
                        },
                    })];
                case 1:
                    result = _a.sent();
                    if (result.data.error) {
                        throw new Error(result.data.error.message + ": " + result.data.error.data);
                    }
                    return [2 /*return*/, JSON.parse(Buffer.from(result.data.result.result).toString())];
            }
        });
    });
}
function getFormattedFarms(tokenPrices) {
    return __awaiter(this, void 0, void 0, function () {
        var farms, volume, tvl, tokens, arr, _i, arr_1, farm, pool, seed_id, listFarmsBySeed, seedInfo, tokensList;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, call(PEMBROCK_CONTRACT, 'get_farms', {})];
                case 1:
                    farms = _a.sent();
                    return [4 /*yield*/, Promise.all(Object.keys(farms).map(function (key) {
                            return getVolume(farms[key]['ref_pool_id']);
                        }))];
                case 2:
                    volume = _a.sent();
                    return [4 /*yield*/, Promise.all(Object.keys(farms).map(function (key) {
                            return getTvl(farms[key]['ref_pool_id']);
                        }))];
                case 3:
                    tvl = _a.sent();
                    return [4 /*yield*/, call(PEMBROCK_CONTRACT, 'get_tokens', {})];
                case 4:
                    tokens = _a.sent();
                    arr = Object.keys(farms).map(function (key) { return (__assign(__assign({}, farms[key]), { pem_farm_id: +key })); });
                    arr.forEach(function (item, index) {
                        // we need only 7 days exclude current day
                        item.volume = volume[index].slice(1, 8);
                        // we need only 7 days exclude current day
                        item.tvl = tvl[index].slice(1, 8);
                        item.token1 = tokens[item.token1_id];
                        item.token2 = tokens[item.token2_id];
                        item.t1meta = tokensMetadata[item.token1_id];
                        item.t2meta = tokensMetadata[item.token2_id];
                        item.tokensPriceList = tokenPrices || [];
                    });
                    _i = 0, arr_1 = arr;
                    _a.label = 5;
                case 5:
                    if (!(_i < arr_1.length)) return [3 /*break*/, 10];
                    farm = arr_1[_i];
                    return [4 /*yield*/, commonCall(indexerUrl, "list-pools-by-ids?ids=" + farm.ref_pool_id)];
                case 6:
                    pool = _a.sent();
                    farm.pool = pool[0];
                    seed_id = REF_FINANCE_CONTRACT + "@" + farm.ref_pool_id;
                    return [4 /*yield*/, call(REF_BOOST_CONTRACT, 'list_seed_farms', {
                            seed_id: seed_id,
                        })];
                case 7:
                    listFarmsBySeed = _a.sent();
                    return [4 /*yield*/, call(REF_BOOST_CONTRACT, 'get_seed', { seed_id: seed_id })];
                case 8:
                    seedInfo = _a.sent();
                    farm.listFarmsBySeed = listFarmsBySeed;
                    farm.seedInfo = seedInfo;
                    _a.label = 9;
                case 9:
                    _i++;
                    return [3 /*break*/, 5];
                case 10:
                    tokensList = Object.entries(tokens).map(function (_a) {
                        var key = _a[0], value = _a[1];
                        return (__assign(__assign({ id: key }, value), { refPrice: tokenPrices[key].price, metadata: tokensMetadata[key] }));
                    });
                    return [2 /*return*/, [arr, tokensList]];
            }
        });
    });
}
function getLendPoolApyData(tokenInfos, pemTokenPrice) {
    var _a;
    return __awaiter(this, void 0, void 0, function () {
        var lendPools, lendPoolsApyData, _i, _b, _c, token, lendPoolInfo, tokenInfo, tokenPrice, totalLendAPY;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, call(PEMBROCK_CONTRACT, 'get_tokens', {
                        account_id: PEMBROCK_CONTRACT,
                    })];
                case 1:
                    lendPools = _d.sent();
                    lendPoolsApyData = [];
                    for (_i = 0, _b = Object.entries(lendPools); _i < _b.length; _i++) {
                        _c = _b[_i], token = _c[0], lendPoolInfo = _c[1];
                        if (token === 'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near')
                            continue;
                        tokenInfo = tokenInfos[token];
                        tokenPrice = new BigNumber(lendPoolInfo.total_supply)
                            .multipliedBy(tokenInfo.price)
                            .shiftedBy(-tokenInfo.decimal);
                        totalLendAPY = calculateLendTableData(__assign(__assign({}, lendPoolInfo), { metadata: tokensMetadata[token], refPrice: tokenInfo.price }), pemTokenPrice).totalLendAPY;
                        lendPoolsApyData.push({
                            pool: token + "-lending",
                            chain: 'NEAR',
                            project: 'pembrock-finance',
                            symbol: (_a = tokensMetadata[token]) === null || _a === void 0 ? void 0 : _a.symbol,
                            poolMeta: 'Ref-Finance',
                            apy: +totalLendAPY,
                            tvlUsd: tokenPrice.toNumber(),
                        });
                    }
                    return [2 /*return*/, lendPoolsApyData];
            }
        });
    });
}
function getFarmPoolApyData(tokenInfos) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, farms, tokens, farmPoolsApyData, _i, _b, farm, token1_1, token2, leverage, dataBorrowToken1, dataBorrowToken2, data;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, getFormattedFarms(tokenInfos)];
                case 1:
                    _a = _c.sent(), farms = _a[0], tokens = _a[1];
                    farmPoolsApyData = [];
                    for (_i = 0, _b = Object.values(farms); _i < _b.length; _i++) {
                        farm = _b[_i];
                        token1_1 = tokensMetadata[farm['token1_id']];
                        token2 = tokensMetadata[farm['token2_id']];
                        leverage = 1000;
                        dataBorrowToken1 = calcFarmTableData(farm, true, leverage, tokens);
                        dataBorrowToken2 = calcFarmTableData(farm, false, leverage, tokens);
                        data = dataBorrowToken1.apy > dataBorrowToken2.apy
                            ? dataBorrowToken1
                            : dataBorrowToken2;
                        farmPoolsApyData.push({
                            pool: "ref-pool-" + farm.ref_pool_id + "-farming",
                            chain: 'NEAR',
                            project: 'pembrock-finance',
                            symbol: (token1_1 === null || token1_1 === void 0 ? void 0 : token1_1.symbol) + "-" + (token2 === null || token2 === void 0 ? void 0 : token2.symbol),
                            poolMeta: 'Ref-Finance',
                            apy: +data.apy,
                            tvlUsd: +data.tvl,
                        });
                    }
                    return [2 /*return*/, farmPoolsApyData];
            }
        });
    });
}
function getPemApy() {
    return __awaiter(this, void 0, void 0, function () {
        var tokenInfos, pemToken, lendPools, farmPools;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, commonCall(indexerUrl, 'list-token-price')];
                case 1:
                    tokenInfos = _a.sent();
                    pemToken = tokenInfos[PEM_TOKEN];
                    return [4 /*yield*/, getLendPoolApyData(tokenInfos, pemToken.price)];
                case 2:
                    lendPools = _a.sent();
                    return [4 /*yield*/, getFarmPoolApyData(tokenInfos)];
                case 3:
                    farmPools = _a.sent();
                    return [2 /*return*/, __spreadArray(__spreadArray([], lendPools, true), farmPools, true).filter(function (p) { return p.symbol && !p.symbol.includes('undefined'); })];
            }
        });
    });
}
module.exports = {
    timetravel: false,
    apy: getPemApy,
    url: 'https://app.pembrock.finance/farm',
};
