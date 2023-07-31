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
var superagent = require('superagent');
var fetch = require('node-fetch');
var ENDPOINT = 'https://mero.finance/api/apys';
var poolMetadata = {
    '0x4b45ADDfFa952bC7A81ffB73694287643915B050': {
        symbol: 'DAI',
        underlying: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
    '0x19C674f7679c33f5c0248D9F736b2726447c41cF': {
        symbol: 'ETH',
        underlying: '0x0000000000000000000000000000000000000000',
    },
    '0xEf251Ac05D180a0ffBcE8AE0FC65f175a09ae02f': {
        symbol: 'USDC',
        underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    '0x90272940265f21D57A8F9317A8d04a624F063903': {
        symbol: 'USDT',
        underlying: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
    '0x9492a8E34126eC4a8494bA77ec197d6De131d660': {
        symbol: 'FRAX',
        underlying: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    },
};
var getMeroApys = function () { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fetch(ENDPOINT)];
            case 1: return [2 /*return*/, (_a.sent()).json()];
        }
    });
}); };
var getEthPriceUsd = function () { return __awaiter(_this, void 0, void 0, function () {
    var key;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
                return [4 /*yield*/, superagent.post('https://coins.llama.fi/prices').send({
                        coins: [key],
                    })];
            case 1: return [2 /*return*/, (_a.sent()).body.coins[key].price];
        }
    });
}); };
var getPools = function () { return __awaiter(_this, void 0, void 0, function () {
    var _a, apys, ethPriceUsd;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, Promise.all([
                    getMeroApys(),
                    getEthPriceUsd(),
                ])];
            case 1:
                _a = _b.sent(), apys = _a[0], ethPriceUsd = _a[1];
                return [2 /*return*/, apys.map(function (apy) {
                        var metadata = poolMetadata[apy.pool];
                        return {
                            pool: apy.pool,
                            chain: 'Ethereum',
                            project: 'mero',
                            symbol: metadata.symbol,
                            tvlUsd: metadata.symbol === 'ETH' ? apy.tvl * ethPriceUsd : apy.tvl,
                            apyBase: apy.apy,
                            apyReward: 0,
                            underlyingTokens: [metadata.underlying],
                            rewardTokens: [],
                            url: "https://mero.finance/pool/mero" + metadata.symbol,
                        };
                    })];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: getPools,
};
