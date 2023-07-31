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
var BigNumber = require('bignumber.js');
var _a = require('graphql-request'), request = _a.request, gql = _a.gql;
var axios = require('axios');
var utils = require('../utils');
var GFI_ADDRESS = '0xdab396cCF3d84Cf2D07C4454e10C8A6F5b008D2b';
var USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
var SENIOR_POOL_ADDRESS = '0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822';
var API_URL = 'https://api.thegraph.com/subgraphs/name/goldfinch-eng/goldfinch-v2';
var apyQuery = gql(__makeTemplateObject(["\n  query {\n    seniorPools {\n      estimatedApy\n      estimatedApyFromGfiRaw\n      assets\n    }\n  }\n"], ["\n  query {\n    seniorPools {\n      estimatedApy\n      estimatedApyFromGfiRaw\n      assets\n    }\n  }\n"]));
var GFI = '0xdab396ccf3d84cf2d07c4454e10c8a6f5b008d2b';
var USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
function apy() {
    return __awaiter(this, void 0, void 0, function () {
        var prices, seniorPools, _a, estimatedApy, estimatedApyFromGfiRaw, assets, tvlUsd;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, axios.get("https://coins.llama.fi/prices/current/ethereum:" + GFI + ",ethereum:" + USDC)];
                case 1:
                    prices = (_b.sent()).data.coins;
                    return [4 /*yield*/, request(API_URL, apyQuery)];
                case 2:
                    seniorPools = (_b.sent()).seniorPools;
                    _a = seniorPools[0], estimatedApy = _a.estimatedApy, estimatedApyFromGfiRaw = _a.estimatedApyFromGfiRaw, assets = _a.assets;
                    tvlUsd = new BigNumber(assets).dividedBy(1e6).toNumber() *
                        prices["ethereum:" + USDC].price;
                    return [2 /*return*/, [
                            {
                                pool: SENIOR_POOL_ADDRESS,
                                chain: utils.formatChain('ethereum'),
                                project: 'goldfinch',
                                symbol: 'USDC',
                                tvlUsd: tvlUsd,
                                apyBase: parseFloat(estimatedApy) * 100,
                                apyReward: parseFloat(estimatedApyFromGfiRaw) *
                                    prices["ethereum:" + GFI].price *
                                    100,
                                underlyingTokens: [USDC_ADDRESS],
                                rewardTokens: [GFI_ADDRESS],
                                // borrow fields
                                ltv: 0, // permissioned
                            },
                        ]];
            }
        });
    });
}
module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://beta.app.goldfinch.finance/earn',
};
