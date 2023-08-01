"use strict";
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
exports.__esModule = true;
var returnHelper_1 = require("./returnHelper");
// const { gql, request } = require('graphql-request');
var graphql_request_1 = require("graphql-request");
// const sdk = require('@defillama/sdk');
// const utils = require('../utils');
// import {superagent} from 'superagent'
// const superagent = require('superagent');
// const { HttpRequest } = require('aws-sdk');
var axios_1 = require("axios");
// add chain deployments and subgraph endpoints here
var supportedChains = [
    {
        name: 'Polygon',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-polygon',
        chainId: 137,
        merkl: true,
        identifier: 'polygon'
    },
    {
        name: 'Arbitrum',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-arbitrum',
        chainId: 42161,
        merkl: true,
        identifier: 'arbitrum'
    },
    {
        name: 'Optimism',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-optimism',
        chainId: 10,
        merkl: true,
        identifier: 'optimism'
    },
    {
        name: 'Binance',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-bsc',
        chainId: 56,
        merkl: false,
        identifier: 'bsc'
    },
    {
        name: 'Evmos',
        subgraphEndpoint: 'https://subgraph.satsuma-prod.com/769a117cc018/steer/steer-protocol-evmos/api',
        chainId: 9001,
        merkl: false,
        identifier: 'evmos'
    },
    {
        name: 'Avalanche',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/rakeshbhatt10/avalance-test-subgraph',
        chainId: 43114,
        merkl: false,
        identifier: 'avax'
    },
    {
        name: 'Thundercore',
        subgraphEndpoint: 'http://52.77.49.1:8000/subgraphs/name/steerprotocol/steer-thundercore',
        chainId: 108,
        merkl: false,
        identifier: 'thundercore'
    }
];
// Fetch active vaults and associated data @todo limited to 1000 per chain
var query = "\n{\n    vaults(first: 1000, where: {totalLPTokensIssued_not: \"0\"}) {\n      weeklyFeeAPR\n      beaconName\n      feeTier\n      id\n      pool\n      token0\n      token0Symbol\n      token0Decimals\n      token1\n      token1Symbol\n      token1Decimals\n      totalLPTokensIssued\n      totalAmount1\n      totalAmount0\n      strategyToken {\n        id\n      }\n    }\n  }";
var getPools = function () { return __awaiter(void 0, void 0, void 0, function () {
    var pools, _loop_1, _i, supportedChains_1, chainInfo;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pools = [];
                _loop_1 = function (chainInfo) {
                    var data, tokenList, coinRequest, response, tokenPrices, incentivizedPools, merklRequest, rewardInfo_1, chainPools;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0: return [4 /*yield*/, (0, graphql_request_1.request)(chainInfo.subgraphEndpoint, query)
                                // get tokens
                            ];
                            case 1:
                                data = _b.sent();
                                tokenList = new Set();
                                data.vaults.forEach(function (vaultInfo) {
                                    tokenList.add((chainInfo.identifier + ':' + vaultInfo.token0).toLowerCase());
                                    tokenList.add((chainInfo.identifier + ':' + vaultInfo.token1).toLowerCase());
                                });
                                coinRequest = "https://coins.llama.fi/prices/current/" + Array.from(tokenList).toString();
                                return [4 /*yield*/, axios_1["default"].get(coinRequest)];
                            case 2:
                                response = (_b.sent());
                                tokenPrices = response.data.coins;
                                incentivizedPools = [];
                                if (!chainInfo.merkl) return [3 /*break*/, 4];
                                merklRequest = "https://api.angle.money/v1/merkl?chainId=" + chainInfo.chainId;
                                return [4 /*yield*/, axios_1["default"].get(merklRequest)];
                            case 3:
                                rewardInfo_1 = _b.sent();
                                Object.keys(rewardInfo_1.data.pools).forEach(function (key) {
                                    // token listed is most recent distribution, may change over time
                                    var pool = rewardInfo_1.data.pools[key];
                                    incentivizedPools.push({ pool: pool.pool, apr: pool.aprs['Average APR (rewards / pool TVL)'], token: pool.distributionData[pool.distributionData.length - 1].token });
                                });
                                _b.label = 4;
                            case 4: return [4 /*yield*/, Promise.all(data.vaults.map(function (vault) { return __awaiter(void 0, void 0, void 0, function () {
                                    var totalUSD0, totalUSD1, poolTvl, rewardToken, rewardAPY, rewardPool, vaultApr, vaultSnapshots, snapshots, averageFeePerHoldingPerSecond;
                                    var _a, _b;
                                    return __generator(this, function (_c) {
                                        switch (_c.label) {
                                            case 0:
                                                totalUSD0 = Number(vault.totalAmount0) * ((_a = tokenPrices[chainInfo.identifier.toLowerCase() + ":" + vault.token0]) === null || _a === void 0 ? void 0 : _a.price) / (Math.pow(10, Number(vault.token0Decimals)));
                                                totalUSD1 = Number(vault.totalAmount1) * ((_b = tokenPrices[chainInfo.identifier.toLowerCase() + ":" + vault.token1]) === null || _b === void 0 ? void 0 : _b.price) / (Math.pow(10, Number(vault.token1Decimals)));
                                                poolTvl = totalUSD0 + totalUSD1;
                                                rewardToken = null;
                                                rewardAPY = 0;
                                                rewardPool = incentivizedPools.filter(function (pool) { return pool.pool.toLowerCase() === vault.pool.toLowerCase(); });
                                                if (rewardPool.length) {
                                                    if (rewardPool[0].token) {
                                                        rewardToken = rewardPool[0].token;
                                                        rewardAPY = rewardPool[0].apr;
                                                    }
                                                }
                                                vaultApr = 0;
                                                return [4 /*yield*/, (0, returnHelper_1.getSnapshotsFromSubgraph)(vault.id.toLowerCase(), chainInfo.subgraphEndpoint)
                                                    // filter to last 7 days or two snapshots
                                                ];
                                            case 1:
                                                vaultSnapshots = _c.sent();
                                                snapshots = (0, returnHelper_1.filterSnapshotData)(vaultSnapshots, returnHelper_1.Period.Week);
                                                if (snapshots.length !== 0) {
                                                    averageFeePerHoldingPerSecond = (0, returnHelper_1.getAverageReturnPerSecondFromSnapshots)(snapshots);
                                                    vaultApr = averageFeePerHoldingPerSecond * returnHelper_1.YEAR_IN_SECONDS;
                                                }
                                                return [2 /*return*/, {
                                                        pool: (vault.id + '-' + chainInfo.name).toLowerCase(),
                                                        chain: chainInfo.name,
                                                        project: 'steer-protocol',
                                                        symbol: (vault.token0Symbol + '-' + vault.token1Symbol),
                                                        tvlUsd: poolTvl,
                                                        apyBase: vaultApr,
                                                        apyReward: rewardAPY,
                                                        rewardTokens: rewardToken == null ? [] : [rewardToken],
                                                        underlyingTokens: [vault.token0, vault.token1],
                                                        poolMeta: vault.beaconName,
                                                        url: "https://app.steer.finance/app/" + vault.strategyToken.id + "/vault/" + vault.id + "?engine=" + vault.beaconName + "&chainId=" + chainInfo.chainId
                                                    }];
                                        }
                                    });
                                }); }))];
                            case 5:
                                chainPools = _b.sent();
                                pools.push.apply(pools, (chainPools));
                                return [2 /*return*/];
                        }
                    });
                };
                _i = 0, supportedChains_1 = supportedChains;
                _a.label = 1;
            case 1:
                if (!(_i < supportedChains_1.length)) return [3 /*break*/, 4];
                chainInfo = supportedChains_1[_i];
                return [5 /*yield**/, _loop_1(chainInfo)];
            case 2:
                _a.sent();
                _a.label = 3;
            case 3:
                _i++;
                return [3 /*break*/, 1];
            case 4:
                ;
                return [2 /*return*/, pools];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getPools
};
