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
var axios = require('axios');
var utils = require('../utils');
var SavingsVaultViews = require('./abis/SavingsVaultViews.abi.json');
var SavingsVault = require('./abis/SavingsVault.abi.js');
var project = 'phuture';
var url = 'https://app.phuture.finance';
var usvAddress = '0x6bAD6A9BcFdA3fd60Da6834aCe5F93B8cFed9598';
var usvViewAddress = '0xE574beBdDB460e3E0588F1001D24441102339429';
var main = function (chain) { return function () { return __awaiter(_this, void 0, void 0, function () {
    var asset, totalAssets, apy, usdcPrice;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, sdk.api.abi.call({
                    chain: chain,
                    abi: SavingsVault.find(function (m) { return m.name === 'asset'; }),
                    target: usvAddress,
                })];
            case 1:
                asset = (_a.sent()).output;
                return [4 /*yield*/, sdk.api.abi.call({
                        chain: chain,
                        abi: SavingsVault.find(function (m) { return m.name === 'totalSupply'; }),
                        target: usvAddress,
                    })];
            case 2:
                totalAssets = (_a.sent()).output;
                return [4 /*yield*/, sdk.api.abi.call({
                        chain: chain,
                        abi: SavingsVaultViews.getAPY,
                        params: [usvAddress],
                        target: usvViewAddress,
                    })];
            case 3:
                apy = (_a.sent()).output;
                return [4 /*yield*/, axios.get("https://coins.llama.fi/prices/current/ethereum:" + asset)];
            case 4:
                usdcPrice = (_a.sent()).data.coins;
                return [2 /*return*/, [
                        {
                            pool: (usvAddress + "-" + chain).toLowerCase(),
                            chain: utils.formatChain(chain),
                            project: project,
                            symbol: 'USDC',
                            tvlUsd: (+totalAssets / 1e18) * usdcPrice["ethereum:" + asset].price,
                            apyBase: apy / 10e6,
                            rewardTokens: [asset],
                            underlyingTokens: [asset],
                            url: url + '/index/' + usvAddress.toLowerCase(),
                            poolMeta: 'USV',
                        },
                    ]];
        }
    });
}); }; };
module.exports = {
    timetravel: true,
    apy: main('ethereum'),
    url: url,
};
