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
var axios = require('axios');
var utils = require('../utils');
var API_URL = 'https://api.maple.finance/v2/graphql';
var query = {
    operationName: 'getLendData',
    variables: {},
    query: 'query getLendData {\n  poolV2S(where: {activated: true}) {\n    ...PoolV2Overview\n    __typename\n  }\n  maple(id: "1") {\n    ...MapleOverview\n    __typename\n  }\n}\n\nfragment PoolV2Overview on PoolV2 {\n  assets\n apyData {\n    id\n    monthlyApyAfterFees\n    __typename\n  }\n  asset {\n    decimals\n    id\n    price\n    symbol\n    __typename\n  }\n  delegateManagementFeeRate\n  id\n  name\n  openToPublic\n  poolMeta {\n    ...PoolMetaV2\n    __typename\n  }\n  platformManagementFeeRate\n  principalOut\n  totalLoanOriginations\n  __typename\n}\n\nfragment PoolMetaV2 on PoolMetadata {\n  overview\n  poolDelegate {\n    aboutBusiness\n    totalAssetsUnderManagement\n    companyName\n    companySize\n    deckFileUrl\n    deckFileName\n    linkedIn\n    name\n    profileUrl\n    twitter\n    videoUrl\n    website\n    __typename\n  }\n  poolName\n  reportFileName\n  reportFileUrl\n  strategy\n  underwritingBullets\n  __typename\n}\n\nfragment MapleOverview on Maple {\n  id\n  totalActiveLoans\n  totalInterestEarned\n  totalInterestEarnedV2\n  totalLoanOriginations\n  __typename\n}',
};
var apy = function () { return __awaiter(_this, void 0, void 0, function () {
    var pools;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post(API_URL, query)];
            case 1:
                pools = (_a.sent()).data.data.poolV2S;
                return [2 /*return*/, pools
                        .map(function (pool) {
                        // exclude permissioned pools
                        if (!pool.openToPublic)
                            return {};
                        var tokenPrice = pool.asset.price / 1e8;
                        return {
                            pool: pool.apyData.id,
                            chain: utils.formatChain('ethereum'),
                            project: 'maple',
                            symbol: pool.asset.symbol,
                            poolMeta: pool.name,
                            tvlUsd: (Number(pool.assets) * tokenPrice) / Math.pow(10, pool.asset.decimals),
                            apyBase: Number(pool.apyData.monthlyApyAfterFees) / 1e28,
                            underlyingTokens: [pool.asset.id],
                            // borrow fields
                            ltv: 0, // permissioned
                        };
                    })
                        .filter(function (p) { return p.pool; })];
        }
    });
}); };
module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://app.maple.finance/#/earn',
};
