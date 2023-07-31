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
var _a = require('graphql-request'), request = _a.request, gql = _a.gql;
var BN = require('bignumber.js');
var ARC_USDC_PAIR_ADDRESS = '0xeab0f20cb5536f07135f9d32c93fc77911317ab6';
var ARC_USDT_PAIR_ADDRESS = '0x309c5c0285d8051f7d4921b108526c173ef43507';
var AMM_SUBGRAPH_URL = 'https://api.archly.fi/subgraphs/name/archly/amm';
var pairsQuery = gql(__makeTemplateObject(["\n  query PairsQuery {\n    pairs: pairs(\n      first: 1000\n      orderBy: reserveUSD\n      orderDirection: desc\n      where: { reserve0_gt: 0.01, reserve1_gt: 0.01, reserveUSD_gt: 100 }\n    ) {\n      address: id\n      token0 {\n        address: id\n        symbol\n      }\n      token1 {\n        address: id\n        symbol\n      }\n      isStable\n      reserveUSD\n      volumeUSD\n      gaugeAddress\n    }\n  }\n"], ["\n  query PairsQuery {\n    pairs: pairs(\n      first: 1000\n      orderBy: reserveUSD\n      orderDirection: desc\n      where: { reserve0_gt: 0.01, reserve1_gt: 0.01, reserveUSD_gt: 100 }\n    ) {\n      address: id\n      token0 {\n        address: id\n        symbol\n      }\n      token1 {\n        address: id\n        symbol\n      }\n      isStable\n      reserveUSD\n      volumeUSD\n      gaugeAddress\n    }\n  }\n"]));
var pairQuery = gql(__makeTemplateObject(["\n  query pairQuery($id: String!) {\n    pair: pair(id: $id) {\n      token0Price\n      token1Price\n    }\n  }\n"], ["\n  query pairQuery($id: String!) {\n    pair: pair(id: $id) {\n      token0Price\n      token1Price\n    }\n  }\n"]));
var getPairs = function () { return __awaiter(_this, void 0, void 0, function () {
    var pairs;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(AMM_SUBGRAPH_URL, pairsQuery, {})];
            case 1:
                pairs = (_a.sent()).pairs;
                return [2 /*return*/, pairs];
        }
    });
}); };
var getArcUsdcPrice = function () { return __awaiter(_this, void 0, void 0, function () {
    var pair;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(AMM_SUBGRAPH_URL, pairQuery, {
                    id: ARC_USDC_PAIR_ADDRESS.toLowerCase(),
                })];
            case 1:
                pair = (_a.sent()).pair;
                return [2 /*return*/, pair != null ? pair.token0Price : 0];
        }
    });
}); };
var getArcUsdtPrice = function () { return __awaiter(_this, void 0, void 0, function () {
    var pair;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(AMM_SUBGRAPH_URL, pairQuery, {
                    id: ARC_USDT_PAIR_ADDRESS.toLowerCase(),
                })];
            case 1:
                pair = (_a.sent()).pair;
                return [2 /*return*/, pair != null ? pair.token1Price : 0];
        }
    });
}); };
var getArcPrice = function () { return __awaiter(_this, void 0, void 0, function () {
    var usdcPrice, usdtPrice;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getArcUsdcPrice()];
            case 1:
                usdcPrice = _a.sent();
                return [4 /*yield*/, getArcUsdtPrice()];
            case 2:
                usdtPrice = _a.sent();
                return [2 /*return*/, new BN(usdcPrice).plus(usdtPrice).div(2)];
        }
    });
}); };
module.exports = {
    getPairs: getPairs,
    getArcPrice: getArcPrice,
};
