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
var superagent = require('superagent');
var web3 = require('./connection').web3;
var getPoolValues = require('./getPoolValues').getPoolValues;
var getActiveLoans = require('./getActiveLoans').getActiveLoans;
var getPoolApyBase = require('./getPoolApyBase').getPoolApyBase;
var getPoolApyRewards = require('./getPoolApyRewards').getPoolApyRewards;
var multifarmAbi = require('./abis/multifarm.json');
var distributorAbi = require('./abis/distributor.json');
var utils = require('../utils');
var MULTIFARM_ADDRESS = '0xec6c3FD795D6e6f202825Ddb56E01b3c128b0b10'.toLowerCase();
var DISTRIBUTOR_ADDRESS = '0xc7AB606e551bebD69f7611CdA1Fc473f8E5b8f70'.toLowerCase();
var TRU_ADDRESS = '0x4c19596f5aaff459fa38b0f7ed92f11ae6543784'.toLowerCase();
var getAddressKey = function (address) { return "ethereum:" + address; };
var POOL_INFOS = [
    {
        symbol: 'USDC',
        address: '0xA991356d261fbaF194463aF6DF8f0464F8f1c742'.toLowerCase(),
        decimals: 6,
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'.toLowerCase(),
    },
    {
        symbol: 'USDT',
        address: '0x6002b1dcB26E7B1AA797A17551C6F487923299d7'.toLowerCase(),
        decimals: 6,
        tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'.toLowerCase(),
    },
    {
        symbol: 'TUSD',
        address: '0x97cE06c3e3D027715b2d6C22e67D5096000072E5'.toLowerCase(),
        decimals: 18,
        tokenAddress: '0x0000000000085d4780b73119b644ae5ecd22b376'.toLowerCase(),
    },
    {
        symbol: 'BUSD',
        address: '0x1Ed460D149D48FA7d91703bf4890F97220C09437'.toLowerCase(),
        decimals: 18,
        tokenAddress: '0x4fabb145d64652a948d72533023f6e7a623c7c53'.toLowerCase(),
    },
];
var buildPoolAdapter = function (_a, tokenPrice, allActiveLoans, truPrice, multifarm, distributor) {
    var address = _a.address, decimals = _a.decimals, symbol = _a.symbol, tokenAddress = _a.tokenAddress;
    return __awaiter(_this, void 0, void 0, function () {
        var poolActiveLoans, _b, poolValue, liquidValue, poolApyBase, poolApyRewards;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    poolActiveLoans = allActiveLoans.filter(function (_a) {
                        var poolAddress = _a.poolAddress;
                        return poolAddress === address;
                    });
                    return [4 /*yield*/, getPoolValues(address, decimals)];
                case 1:
                    _b = _c.sent(), poolValue = _b.poolValue, liquidValue = _b.liquidValue;
                    return [4 /*yield*/, getPoolApyBase(poolActiveLoans, poolValue, decimals)];
                case 2:
                    poolApyBase = _c.sent();
                    return [4 /*yield*/, getPoolApyRewards(address, decimals, truPrice, multifarm, distributor)];
                case 3:
                    poolApyRewards = _c.sent();
                    return [2 /*return*/, {
                            pool: address,
                            chain: utils.formatChain('ethereum'),
                            project: 'truefi',
                            symbol: symbol,
                            tvlUsd: liquidValue * tokenPrice,
                            apyBase: poolApyBase,
                            apyReward: poolApyRewards,
                            rewardTokens: [TRU_ADDRESS],
                            underlyingTokens: [tokenAddress],
                            // borrow fields
                            ltv: 0, // permissioned borrowing
                        }];
            }
        });
    });
};
var apy = function () { return __awaiter(_this, void 0, void 0, function () {
    var prices, truPrice, activeLoans, multifarm, distributor, adapters, _i, POOL_INFOS_1, poolInfo, tokenPriceKey, tokenPrice, adapter_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, superagent.post('https://coins.llama.fi/prices').send({
                    coins: __spreadArray(__spreadArray([], POOL_INFOS.map(function (_a) {
                        var tokenAddress = _a.tokenAddress;
                        return tokenAddress;
                    }).map(getAddressKey), true), [
                        getAddressKey(TRU_ADDRESS),
                    ], false),
                })];
            case 1:
                prices = (_a.sent()).body.coins;
                truPrice = prices[getAddressKey(TRU_ADDRESS)].price;
                return [4 /*yield*/, getActiveLoans()];
            case 2:
                activeLoans = _a.sent();
                multifarm = new web3.eth.Contract(multifarmAbi, MULTIFARM_ADDRESS);
                distributor = new web3.eth.Contract(distributorAbi, DISTRIBUTOR_ADDRESS);
                adapters = [];
                _i = 0, POOL_INFOS_1 = POOL_INFOS;
                _a.label = 3;
            case 3:
                if (!(_i < POOL_INFOS_1.length)) return [3 /*break*/, 6];
                poolInfo = POOL_INFOS_1[_i];
                tokenPriceKey = getAddressKey(poolInfo.tokenAddress);
                tokenPrice = prices[tokenPriceKey].price;
                return [4 /*yield*/, buildPoolAdapter(poolInfo, tokenPrice, activeLoans, truPrice, multifarm, distributor)];
            case 4:
                adapter_1 = _a.sent();
                adapters.push(adapter_1);
                _a.label = 5;
            case 5:
                _i++;
                return [3 /*break*/, 3];
            case 6: return [2 /*return*/, adapters];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://app.truefi.io/lend',
};
