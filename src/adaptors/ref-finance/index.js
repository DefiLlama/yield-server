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
var axios = require('axios');
var FARM_V1_CONTRACT = 'v2.ref-farming.near';
var FARM_V2_CONTRACT = 'boostfarm.ref-labs.near';
var endpoint = 'https://rpc.mainnet.near.org/';
var indexerUrl = 'https://indexer.ref.finance/';
var sodakiApiUrl = 'https://api.stats.ref.finance/api';
var STABLE_POOL_IDS = ['1910', '3020', '3364', '3433'];
var boostBlackList = ['3612'];
var LP_TOKEN_DECIMALS = 24;
var LP_STABLE_TOKEN_DECIMALS = 18;
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
function getListSeedsInfo() {
    return call(FARM_V2_CONTRACT, 'list_seeds_info');
}
function getListSeedFarms(seed_id) {
    return call(FARM_V2_CONTRACT, 'list_seed_farms', { seed_id: seed_id });
}
function getPoolsByIds(poolIds) {
    var ids = poolIds.join('|');
    if (!ids)
        return [];
    return commonCall(indexerUrl, 'list-pools-by-ids', { ids: ids });
}
function get24hVolume(pool_id) {
    return __awaiter(this, void 0, void 0, function () {
        var requestUrl;
        return __generator(this, function (_a) {
            requestUrl = sodakiApiUrl + ("/pool/" + pool_id + "/rolling24hvolume/sum");
            return [2 /*return*/, commonCall(requestUrl, '')];
        });
    });
}
function ftGetTokenMetadata(tokenId) {
    return call(tokenId, 'ft_metadata');
}
function getTokenPrices() {
    return commonCall(indexerUrl, 'list-token-price');
}
function getPoolFeeApr(dayVolume, pool) {
    var result = '0';
    if (dayVolume) {
        var total_fee = pool.total_fee, tvl = pool.tvl;
        var revenu24h = (total_fee / 10000) * 0.8 * Number(dayVolume);
        if (tvl > 0 && revenu24h > 0) {
            var annualisedFeesPrct = ((revenu24h * 365) / tvl) * 100;
            result = annualisedFeesPrct.toString();
        }
    }
    return result;
}
function getV2SeedFarmsPools() {
    return __awaiter(this, void 0, void 0, function () {
        var list_seeds, farmsPromiseList, poolIds, temp_farms, list_farms, pools, ids, promiseVolume, allPools24Volume, tempMap, seedsFarmsPools;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getListSeedsInfo()];
                case 1:
                    list_seeds = _a.sent();
                    list_seeds = list_seeds.filter(function (s) { return !s.seed_id.includes('dclv2.ref-labs.nea'); });
                    farmsPromiseList = [];
                    poolIds = new Set();
                    list_seeds.forEach(function (seed) {
                        var seed_id = seed.seed_id;
                        if (seed_id.indexOf('@') > -1) {
                            var poolId = seed_id.substring(seed_id.indexOf('@') + 1);
                            poolIds.add(poolId);
                        }
                        farmsPromiseList.push(getListSeedFarms(seed_id));
                    });
                    return [4 /*yield*/, Promise.all(farmsPromiseList)];
                case 2:
                    temp_farms = _a.sent();
                    list_farms = [];
                    temp_farms.forEach(function (farms) {
                        var runningFarms = farms.filter(function (farm) {
                            if (farm.status != 'Ended')
                                return true;
                        });
                        list_farms.push(runningFarms);
                    });
                    return [4 /*yield*/, getPoolsByIds(Array.from(poolIds))];
                case 3:
                    pools = _a.sent();
                    ids = Array.from(poolIds);
                    promiseVolume = ids.map(function (poolId) {
                        return get24hVolume(poolId);
                    });
                    return [4 /*yield*/, Promise.all(promiseVolume)];
                case 4:
                    allPools24Volume = _a.sent();
                    tempMap = {};
                    ids.forEach(function (id, index) {
                        tempMap[id] = allPools24Volume[index];
                    });
                    seedsFarmsPools = [];
                    list_seeds.forEach(function (seed, index) {
                        var pool = null;
                        if (seed.seed_id.indexOf('@') > -1) {
                            var id_1 = seed.seed_id.substring(seed.seed_id.indexOf('@') + 1);
                            pool = pools.find(function (p) {
                                if (+p.id == +id_1)
                                    return true;
                            });
                        }
                        // filter no farms seed
                        if (list_farms[index].length > 0) {
                            var poolApy = getPoolFeeApr(tempMap[pool.id], pool);
                            seedsFarmsPools.push({
                                id: seed.seed_id,
                                seed: seed,
                                farmList: list_farms[index],
                                pool: pool,
                                poolApy: poolApy,
                            });
                        }
                    });
                    return [2 /*return*/, seedsFarmsPools];
            }
        });
    });
}
function toReadableNumber(decimals, number) {
    if (!decimals)
        return number;
    var wholeStr = number.substring(0, number.length - decimals) || '0';
    var fractionStr = number
        .substring(number.length - decimals)
        .padStart(decimals, '0')
        .substring(0, decimals);
    return (wholeStr + "." + fractionStr).replace(/\.?0+$/, '');
}
function getV2FarmData() {
    return __awaiter(this, void 0, void 0, function () {
        var v2_list, tokenPriceList, target_list, promise_new_list;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getV2SeedFarmsPools()];
                case 1:
                    v2_list = _a.sent();
                    return [4 /*yield*/, getTokenPrices()];
                case 2:
                    tokenPriceList = _a.sent();
                    target_list = [];
                    promise_new_list = v2_list.map(function (data) { return __awaiter(_this, void 0, void 0, function () {
                        var farmList, promise_farm_meta_data;
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    farmList = data.farmList;
                                    promise_farm_meta_data = farmList.map(function (farm) { return __awaiter(_this, void 0, void 0, function () {
                                        var tokenId, tokenMetadata;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0:
                                                    tokenId = farm.terms.reward_token;
                                                    return [4 /*yield*/, ftGetTokenMetadata(tokenId)];
                                                case 1:
                                                    tokenMetadata = _a.sent();
                                                    farm.token_meta_data = tokenMetadata;
                                                    return [2 /*return*/, farm];
                                            }
                                        });
                                    }); });
                                    return [4 /*yield*/, Promise.all(promise_farm_meta_data)];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [4 /*yield*/, Promise.all(promise_new_list)];
                case 3:
                    _a.sent();
                    v2_list.forEach(function (data) { return __awaiter(_this, void 0, void 0, function () {
                        var seed, pool, farmList, poolApy, total_seed_amount, tvl, id, shares_total_supply, DECIMALS, seedTotalStakedAmount, poolShares, seedTvl, totalApy, rewardsTokens, token_symbols, token_account_ids, baseApy, target;
                        return __generator(this, function (_a) {
                            seed = data.seed, pool = data.pool, farmList = data.farmList, poolApy = data.poolApy;
                            total_seed_amount = seed.total_seed_amount;
                            tvl = pool.tvl, id = pool.id, shares_total_supply = pool.shares_total_supply;
                            DECIMALS = new Set(STABLE_POOL_IDS || []).has(id === null || id === void 0 ? void 0 : id.toString())
                                ? LP_STABLE_TOKEN_DECIMALS
                                : LP_TOKEN_DECIMALS;
                            seedTotalStakedAmount = toReadableNumber(DECIMALS, total_seed_amount);
                            poolShares = Number(toReadableNumber(DECIMALS, shares_total_supply));
                            seedTvl = poolShares == 0
                                ? 0
                                : Number(((Number(seedTotalStakedAmount) * tvl) / poolShares).toString());
                            totalApy = 0;
                            rewardsTokens = [];
                            farmList.forEach(function (farm) {
                                var _a;
                                var token_meta_data = farm.token_meta_data;
                                var _b = farm.terms, daily_reward = _b.daily_reward, reward_token = _b.reward_token;
                                var readableNumber = toReadableNumber(token_meta_data.decimals, daily_reward);
                                var reward_token_price = Number(((_a = tokenPriceList[reward_token]) === null || _a === void 0 ? void 0 : _a.price) || 0);
                                var apy = seedTvl == 0
                                    ? 0
                                    : (Number(readableNumber) * 360 * reward_token_price) / seedTvl;
                                totalApy += Number(apy);
                                rewardsTokens.push(reward_token);
                            });
                            token_symbols = pool.token_symbols, token_account_ids = pool.token_account_ids;
                            baseApy = poolApy / 2;
                            if (boostBlackList.indexOf(pool.id) == -1) {
                                target = {
                                    pool: 'ref-pool-' + pool.id,
                                    chain: 'NEAR',
                                    project: 'ref-finance',
                                    symbol: token_symbols === null || token_symbols === void 0 ? void 0 : token_symbols.join('-'),
                                    tvlUsd: seedTvl,
                                    apyReward: totalApy * 100,
                                    apyBase: Number(baseApy),
                                    underlyingTokens: token_account_ids,
                                    rewardTokens: rewardsTokens,
                                };
                                target_list.push(target);
                            }
                            return [2 /*return*/];
                        });
                    }); });
                    return [2 /*return*/, target_list];
            }
        });
    });
}
module.exports = {
    timetravel: false,
    apy: getV2FarmData,
    url: 'https://app.ref.finance/v2farms',
};
