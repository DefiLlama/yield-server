"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var _a = require('ethers').utils, formatUnits = _a.formatUnits, formatEther = _a.formatEther;
var ContractAbi = require('./abi');
var sdk = require('@defillama/sdk');
var _b = require('./addresses'), PREMIA_MINING_CONTRACT_ADDRESS = _b.PREMIA_MINING_CONTRACT_ADDRESS, PREMIA_TOKEN_ADDRESS = _b.PREMIA_TOKEN_ADDRESS;
var isCall = function (value) {
    return value === 'CALL';
};
var weiToNumber = function (value) {
    if (!value)
        return 0;
    return Number(formatEther(value));
};
var getCall = function (chain, method, params) {
    if (params === void 0) { params = []; }
    return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sdk.api.abi.call({
                        chain: chain,
                        target: PREMIA_MINING_CONTRACT_ADDRESS[chain],
                        abi: ContractAbi.find(function (e) { return e.name === method; }),
                        params: params,
                    })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
};
function getChainRewardData(chain) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        getCall(chain, 'getPremiaPerYear'),
                        getCall(chain, 'getTotalAllocationPoints'),
                    ])];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, {
                            premiaPerYear: result[0].output,
                            totalAllocations: result[1].output,
                        }];
            }
        });
    });
}
function getPoolRewardInfo(chain, pool) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCall(chain, 'getPoolInfo', [
                        pool.address,
                        isCall(pool.optionType),
                    ])];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, {
                            allocPoint: result.output.allocPoint,
                        }];
            }
        });
    });
}
function calcRewardAPY(_a) {
    var premiaPerYear = _a.premiaPerYear, totalAllocations = _a.totalAllocations, poolInfo = _a.poolInfo, premiaPrice = _a.premiaPrice, pool = _a.pool;
    var netSizeInUsd = pool.netSizeInUsd;
    var allocPoint = poolInfo.allocPoint;
    var _totalAllocations = Number(formatUnits(totalAllocations, 0));
    var _allocPoints = Number(formatUnits(allocPoint, 0));
    var _premiaPerYear = Number(formatUnits(premiaPerYear, 18));
    var premiaPerYearToThisPool = (_allocPoints / _totalAllocations) * _premiaPerYear;
    if (!netSizeInUsd || !_totalAllocations) {
        return 0;
    }
    var USDValueOfYearlyPoolRewards = premiaPerYearToThisPool * premiaPrice;
    var poolAPY = (USDValueOfYearlyPoolRewards / Number(formatEther(netSizeInUsd))) * 100;
    if (poolAPY) {
        return Number(poolAPY.toFixed(2));
    }
    return 0;
}
function convert(fetchedPool, chain, chainRewardData, price) {
    return __awaiter(this, void 0, void 0, function () {
        var name, netSizeInUsd, underlying, id, annualPercentageReturn, poolReward, rewardAPY;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    name = fetchedPool.name, netSizeInUsd = fetchedPool.netSizeInUsd, underlying = fetchedPool.underlying, id = fetchedPool.id, annualPercentageReturn = fetchedPool.annualPercentageReturn;
                    return [4 /*yield*/, getPoolRewardInfo(chain, fetchedPool)];
                case 1:
                    poolReward = _a.sent();
                    return [4 /*yield*/, calcRewardAPY(__assign(__assign({}, chainRewardData), { poolInfo: poolReward, pool: fetchedPool, premiaPrice: price }))];
                case 2:
                    rewardAPY = _a.sent();
                    return [2 /*return*/, {
                            chain: chain,
                            pool: id,
                            poolMeta: name,
                            underlyingTokens: [underlying.address],
                            apyReward: rewardAPY,
                            rewardTokens: [PREMIA_TOKEN_ADDRESS[chain]],
                            tvlUsd: weiToNumber(netSizeInUsd),
                            project: 'premia',
                            symbol: underlying.symbol,
                            apyBase: weiToNumber(annualPercentageReturn),
                            apyBaseInception: weiToNumber(annualPercentageReturn),
                        }];
            }
        });
    });
}
module.exports = {
    calcRewardAPY: calcRewardAPY,
    convert: convert,
    getChainRewardData: getChainRewardData,
};
