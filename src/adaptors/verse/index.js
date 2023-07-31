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
var sdk = require('@defillama/sdk');
var _a = require('graphql-request'), request = _a.request, gql = _a.gql;
var utils = require('../utils');
var url = 'https://api.thegraph.com/subgraphs/name/arnkthr/ethv1';
var query = gql(__makeTemplateObject(["\n    {\n        pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {\n            id\n            reserve0\n            reserve1\n            volumeUSD\n            token0 {\n                symbol\n                id\n            }\n            token1 {\n                symbol\n                id\n            }\n\n        }\n    }\n"], ["\n    {\n        pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {\n            id\n            reserve0\n            reserve1\n            volumeUSD\n            token0 {\n                symbol\n                id\n            }\n            token1 {\n                symbol\n                id\n            }\n\n        }\n    }\n"]));
var queryPrior = gql(__makeTemplateObject(["\n  {\n    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { \n      id \n      volumeUSD \n    }\n  }\n"], ["\n  {\n    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { \n      id \n      volumeUSD \n    }\n  }\n"]));
//
var getPoolsData = function (chainString, url, query, queryPrior, version, timestamp) { return __awaiter(_this, void 0, void 0, function () {
    var _a, block, blockPrior, _b, _, blockPrior7d, queryC, dataNow, queryPriorC, dataPrior, dataPrior7d;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, utils.getBlocks(chainString, timestamp, [
                    url,
                ])];
            case 1:
                _a = _c.sent(), block = _a[0], blockPrior = _a[1];
                return [4 /*yield*/, utils.getBlocks(chainString, timestamp, [url], 604800)];
            case 2:
                _b = _c.sent(), _ = _b[0], blockPrior7d = _b[1];
                queryC = query;
                return [4 /*yield*/, request(url, queryC.replace('<PLACEHOLDER>', block))];
            case 3:
                dataNow = _c.sent();
                dataNow = dataNow.pairs;
                queryPriorC = queryPrior;
                return [4 /*yield*/, request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior))];
            case 4:
                dataPrior = _c.sent();
                dataPrior = dataPrior.pairs;
                return [4 /*yield*/, request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))];
            case 5:
                dataPrior7d = (_c.sent()).pairs;
                return [4 /*yield*/, utils.tvl(dataNow, chainString)];
            case 6:
                // calculate tvl
                dataNow = _c.sent();
                // calculate apy
                dataNow = dataNow.map(function (el) { return utils.apy(el, dataPrior, dataPrior7d, version); });
                return [2 /*return*/, dataNow.map(function (p) {
                        var symbol = utils.formatSymbol(p.token0.symbol + "-" + p.token1.symbol);
                        var underlyingTokens = [p.token0.id, p.token1.id];
                        var token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
                        var token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
                        var chain = chainString === 'ethereum' ? 'mainnet' : chainString;
                        return {
                            pool: p.id,
                            chain: utils.formatChain(chainString),
                            project: 'verse',
                            symbol: symbol,
                            tvlUsd: p.totalValueLockedUSD,
                            apyBase: p.apy1d,
                            apyBase7d: p.apy7d,
                            underlyingTokens: underlyingTokens,
                            url: 'https://verse.bitcoin.com/pools/',
                            volumeUsd1d: p.volumeUSD1d,
                            volumeUsd7d: p.volumeUSD7d,
                        };
                    })];
        }
    });
}); };
var verseYield = function (timestamp) {
    if (timestamp === void 0) { timestamp = null; }
    return __awaiter(_this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getPoolsData('ethereum', url, query, queryPrior, 'v2', timestamp)];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, data.filter(function (p) { return utils.keepFinite(p); })];
            }
        });
    });
};
module.exports = {
    timetravel: false,
    apy: verseYield,
};
