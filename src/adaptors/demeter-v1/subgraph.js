var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
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
var _a = require('graphql-request'), request = _a.request, gql = _a.gql;
var SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/0xleez/xcali-arbitrum';
var DEMETER_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/sperax/demeter-protocol-arbitrum';
var UNISWAP_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/messari/uniswap-v3-arbitrum';
var CAMELOT_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm';
var FarmsQuery = gql(__makeTemplateObject(["\n  query FarmsQuery {\n    farms: initFarms(\n      first: 1000\n      orderBy: timeStampUnix\n      orderDirection: desc\n    ) {\n      id\n      poolAddress\n      camelotLpToken\n      versionName\n    }\n  }\n"], ["\n  query FarmsQuery {\n    farms: initFarms(\n      first: 1000\n      orderBy: timeStampUnix\n      orderDirection: desc\n    ) {\n      id\n      poolAddress\n      camelotLpToken\n      versionName\n    }\n  }\n"]));
var uniswapPoolsQuery = gql(__makeTemplateObject(["\nquery pools{\nuniswapPools: liquidityPools(\n  first: 1000\n  where: {id: \"<ADDRESS>\"}\n  orderBy: createdBlockNumber\n  orderDirection: desc\n) {\n  id\n  name\n  symbol\n  createdBlockNumber\n  cumulativeDepositCount\n\n  lastSnapshotDayID\n  totalLiquidityUSD\n  activeLiquidityUSD\n  totalValueLockedUSD\n}\n}\n"], ["\nquery pools{\nuniswapPools: liquidityPools(\n  first: 1000\n  where: {id: \"<ADDRESS>\"}\n  orderBy: createdBlockNumber\n  orderDirection: desc\n) {\n  id\n  name\n  symbol\n  createdBlockNumber\n  cumulativeDepositCount\n\n  lastSnapshotDayID\n  totalLiquidityUSD\n  activeLiquidityUSD\n  totalValueLockedUSD\n}\n}\n"]));
var camelotPoolsQuery = gql(__makeTemplateObject(["\n  query FarmsQuery {\n    farms: initFarms(\n      first: 1000\n      orderBy: timeStampUnix\n      orderDirection: desc\n    ) {\n      id\n      poolAddress\n      camelotLpToken\n      versionName\n    }\n  }\n"], ["\n  query FarmsQuery {\n    farms: initFarms(\n      first: 1000\n      orderBy: timeStampUnix\n      orderDirection: desc\n    ) {\n      id\n      poolAddress\n      camelotLpToken\n      versionName\n    }\n  }\n"]));
var getDemeterFarms = function () { return __awaiter(_this, void 0, void 0, function () {
    var farms;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(DEMETER_SUBGRAPH_URL, FarmsQuery, {})];
            case 1:
                farms = (_a.sent()).farms;
                return [2 /*return*/, farms];
        }
    });
}); };
var getCamelotPools = function () { return __awaiter(_this, void 0, void 0, function () {
    var pools;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(CAMELOT_SUBGRAPH_URL, camelotPoolsQuery, {})];
            case 1:
                pools = (_a.sent()).pools;
                return [2 /*return*/, pools];
        }
    });
}); };
var getUniswapPools = function () { return __awaiter(_this, void 0, void 0, function () {
    var uniswapPools;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(UNISWAP_SUBGRAPH_URL, uniswapPoolsQuery.replace('<ADDRESS>', "0x9dc903fe57e53441fd3e0ce8ccbea28c1725ab3d"))];
            case 1:
                uniswapPools = (_a.sent()).uniswapPools;
                //  const { uniswapPools } = await request(UNISWAP_SUBGRAPH_URL, uniswapPoolsQuery, {});
                console.log(uniswapPools);
                return [2 /*return*/, uniswapPools];
        }
    });
}); };
var separatePools = function () { return __awaiter(_this, void 0, void 0, function () {
    var getPools, FilterPools, uniswapPools, camelotPools;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getDemeterFarms()];
            case 1:
                getPools = _a.sent();
                FilterPools = function (pools) {
                    var uniswapPools = new Set();
                    var camelotPools = new Set();
                    return pools.filter(function (pool) {
                        var version = pool.versionName;
                        if (version.includes('Uniswap')) {
                            uniswapPools.add(pool.poolAddress);
                            return true;
                        }
                        else if (version.includes('Camelot')) {
                            camelotPools.add(pool.poolAddress);
                            return true;
                        }
                        else {
                            return false;
                        }
                    });
                };
                uniswapPools = [];
                camelotPools = [];
                FilterPools(getPools).forEach(function (pool) {
                    if (pool.camelotLpToken != '0x00000000') {
                        camelotPools.push(pool.poolAddress);
                    }
                    else {
                        uniswapPools.push(pool.poolAddress);
                    }
                });
                return [2 /*return*/, [uniswapPools, camelotPools]];
        }
    });
}); };
module.exports = {
    getUniswapPools: getUniswapPools,
};
