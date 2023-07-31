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
var XCAL_USDC_PAIR_ADRESS = '0x2Cc6AC1454490AfA83333Fabc84345FaD751285B';
var SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/0xleez/xcali-arbitrum';
var swapPairsQuery = gql(__makeTemplateObject(["\n  query PairsQuery {\n    pairs: swapPairs(\n      first: 1000\n      orderBy: reserveUSD\n      orderDirection: desc\n      where: { reserve0_gt: 0.01, reserve1_gt: 0.01, reserveUSD_gt: 1000 }\n    ) {\n      address: id\n      token0 {\n        address: id\n        symbol\n      }\n      token1 {\n        address: id\n        symbol\n      }\n      stable\n      reserveUSD\n      volumeUSD\n      gaugeAddress\n    }\n  }\n"], ["\n  query PairsQuery {\n    pairs: swapPairs(\n      first: 1000\n      orderBy: reserveUSD\n      orderDirection: desc\n      where: { reserve0_gt: 0.01, reserve1_gt: 0.01, reserveUSD_gt: 1000 }\n    ) {\n      address: id\n      token0 {\n        address: id\n        symbol\n      }\n      token1 {\n        address: id\n        symbol\n      }\n      stable\n      reserveUSD\n      volumeUSD\n      gaugeAddress\n    }\n  }\n"]));
var swapPairQuery = gql(__makeTemplateObject(["\n  query pairQuery($id: String!) {\n    pair: swapPair(id: $id) {\n      token1Price\n    }\n  }\n"], ["\n  query pairQuery($id: String!) {\n    pair: swapPair(id: $id) {\n      token1Price\n    }\n  }\n"]));
var getSwapPairs = function () { return __awaiter(_this, void 0, void 0, function () {
    var pairs;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(SUBGRAPH_URL, swapPairsQuery, {})];
            case 1:
                pairs = (_a.sent()).pairs;
                return [2 /*return*/, pairs];
        }
    });
}); };
var getXCALPrice = function () { return __awaiter(_this, void 0, void 0, function () {
    var pair;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request(SUBGRAPH_URL, swapPairQuery, {
                    id: XCAL_USDC_PAIR_ADRESS.toLowerCase(),
                })];
            case 1:
                pair = (_a.sent()).pair;
                return [2 /*return*/, pair.token1Price];
        }
    });
}); };
module.exports = {
    getSwapPairs: getSwapPairs,
    getXCALPrice: getXCALPrice,
};
