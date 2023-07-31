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
exports.getAverageReturnPerSecondFromSnapshots = exports.getTotalValueInToken1 = exports.filterSnapshotData = exports.getSnapshotsFromSubgraph = exports.getGraphUrl = exports.networkData = exports.Period = exports.Chain = exports.MONTH_IN_SECONDS = exports.WEEK_IN_SECONDS = exports.YEAR_IN_SECONDS = exports.DAY_IN_SECONDS = void 0;
var axios_1 = require("axios");
var ethers_1 = require("ethers");
var PRECISION = ethers_1.BigNumber.from('10').pow(ethers_1.BigNumber.from('36'));
var X192 = ethers_1.BigNumber.from('2').pow(ethers_1.BigNumber.from('192'));
exports.DAY_IN_SECONDS = 24 * 60 * 60;
exports.YEAR_IN_SECONDS = exports.DAY_IN_SECONDS * 365;
exports.WEEK_IN_SECONDS = exports.DAY_IN_SECONDS * 7;
exports.MONTH_IN_SECONDS = exports.DAY_IN_SECONDS * 30;
var EpochTime = 1688593733;
var Chain;
(function (Chain) {
    Chain["Mainnet"] = "Mainnet";
    Chain["Polygon"] = "Polygon";
    Chain["Arbitrum"] = "Arbitrum";
    Chain["Optimism"] = "Optimism";
    Chain["BSC"] = "BSC";
    Chain["Evmos"] = "Evmos";
    Chain["Metis"] = "Metis";
    Chain["Avalanche"] = "Avalanche";
    Chain["PolygonZkEVM"] = "PolygonZkEVM";
    Chain["ThunderCore"] = "ThunderCore";
})(Chain = exports.Chain || (exports.Chain = {}));
var Period;
(function (Period) {
    Period[Period["Day"] = exports.DAY_IN_SECONDS] = "Day";
    Period[Period["Week"] = exports.WEEK_IN_SECONDS] = "Week";
    Period[Period["Month"] = exports.MONTH_IN_SECONDS] = "Month";
    Period[Period["Year"] = exports.YEAR_IN_SECONDS] = "Year";
    Period[Period["Lifetime"] = EpochTime] = "Lifetime";
})(Period = exports.Period || (exports.Period = {}));
exports.networkData = [
    { chainId: 1, wrappedNativeToken: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', name: Chain.Mainnet },
    { chainId: 3, wrappedNativeToken: 'WETH', address: '0xc778417E063141139Fce010982780140Aa0cD5Ab' },
    { chainId: 4, wrappedNativeToken: 'WETH', address: '0xc778417E063141139Fce010982780140Aa0cD5Ab' },
    { chainId: 5, wrappedNativeToken: 'WETH', address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6' },
    { chainId: 42, wrappedNativeToken: 'WETH', address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' },
    { chainId: 10, wrappedNativeToken: 'WETH', address: '0x4200000000000000000000000000000000000006', name: Chain.Optimism },
    { chainId: 69, wrappedNativeToken: 'WETH', address: '0x4200000000000000000000000000000000000006' },
    { chainId: 42161, wrappedNativeToken: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', name: Chain.Arbitrum },
    { chainId: 421611, wrappedNativeToken: 'WETH', address: '0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681' },
    { chainId: 137, wrappedNativeToken: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', name: Chain.Polygon },
    { chainId: 56, wrappedNativeToken: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', name: Chain.BSC },
    { chainId: 80001, wrappedNativeToken: 'WMATIC', address: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889' },
    { chainId: 9001, wrappedNativeToken: 'WEVMOS', address: '0xD4949664cD82660AaE99bEdc034a0deA8A0bd517', name: Chain.Evmos },
    { chainId: 1088, wrappedNativeToken: 'METIS', address: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000', name: Chain.Metis },
    { chainId: 43114, wrappedNativeToken: 'WAVAX', address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', name: Chain.Avalanche },
    { chainId: 1101, wrappedNativeToken: 'WMATIC', address: '0xa2036f0538221a77A3937F1379699f44945018d0', name: Chain.PolygonZkEVM },
    { chainId: 108, wrappedNativeToken: 'WTT', address: '0x413cEFeA29F2d07B8F2acFA69d92466B9535f717', name: Chain.ThunderCore },
];
function getGraphUrl(network) {
    if (network === 5) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/subgraph";
    }
    else if (network === 80001) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/mumbai";
    }
    else if (network === 137) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-polygon";
    }
    else if (network === 10) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-optimism";
    }
    else if (network === 42161) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-arbitrum";
    }
    else if (network === 421613) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol---arb-goerli";
    }
    else if (network === 420) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-optimism-goerli";
    }
    else if (network === 56) {
        return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-bsc";
    }
    else if (network === 9001) {
        return "https://subgraph.satsuma-prod.com/769a117cc018/steer/steer-protocol-evmos/api";
    }
    else if (network === 1088) {
        return "https://subgraph.satsuma-prod.com/769a117cc018/steer/steer-protocol-metis/api";
    }
    else if (network === 43114) {
        return "https://api.thegraph.com/subgraphs/name/rakeshbhatt10/avalance-test-subgraph";
    }
    else if (network === 108) {
        return "https://subgraph.steer.finance/thundercore/subgraphs/name/steerprotocol/steer-thundercore";
    }
    else if (network === 1101) {
        return "https://subgraph.steer.finance/zkevm/subgraphs/name/steerprotocol/steer-zkevm";
    }
    else if (network === 42220) {
        return "https://api.thegraph.com/subgraphs/name/rakeshbhatt10/steer-test-celo";
    }
    return null;
}
exports.getGraphUrl = getGraphUrl;
function getSnapshotsFromSubgraph(vaultAddress, subgraphURL) {
    return __awaiter(this, void 0, void 0, function () {
        var query, data, config, jobsData, snapshots;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    query = "{\n        vaultSnapshots(first: 1000, orderBy:timestamp, orderDirection:desc, where: {vaultAddress: \"" + vaultAddress + "\"}) {\n            id\n         totalSupply\n         totalAmount0\n         vaultAddress {\n           id\n         }\n         totalAmount1\n         fees1\n         fees0\n         sqrtPriceX96\n         timestamp\n        }\n       }";
                    data = JSON.stringify({
                        variables: {
                            vaultAddress: vaultAddress
                        },
                        query: query
                    });
                    config = {
                        method: 'post',
                        url: subgraphURL,
                        headers: {
                            'content-type': 'application/json'
                        },
                        data: data
                    };
                    return [4 /*yield*/, axios_1["default"]
                            .request(config)
                            .then(function (response) { return response.data; })];
                case 1:
                    jobsData = _a.sent();
                    snapshots = jobsData.data.vaultSnapshots;
                    // filter out empty snapshots
                    snapshots = snapshots.filter(function (snapshot) { return snapshot.totalSupply !== '0'; });
                    //sort them asc
                    snapshots.sort(function (a, b) { return a.timestamp - b.timestamp; });
                    return [2 /*return*/, snapshots];
            }
        });
    });
}
exports.getSnapshotsFromSubgraph = getSnapshotsFromSubgraph;
// return only the past number of snapshots from the period
function filterSnapshotData(data, timePeriod) {
    // Get the current timestamp in seconds
    var now = Math.floor(Date.now() / 1000);
    // filter by week, if only one or no snapshots, pull last 1 or 2 snapshots
    // If the data length is 7 days or less, return all data
    if (data.length === 2) {
        return data;
    }
    else if (data.length < 2) {
        return [];
    }
    // Filter out data that is older than 7 days
    var filteredSnapshots = data.filter(function (entry) { return now - parseInt(entry.timestamp) <= timePeriod; });
    // if there is less than 2 snapshots filtered, and there are more in the unfiltered, pull those down
    if (filteredSnapshots.length <= 1) {
        filteredSnapshots = data.slice(-2);
    }
    return filteredSnapshots;
}
exports.filterSnapshotData = filterSnapshotData;
// Get value of asset pair with current price
function getTotalValueInToken1(_token0Amount, _token1Amount, _sqrtPriceX96) {
    var token0Amount = ethers_1.BigNumber.from(_token0Amount);
    var token1Amount = ethers_1.BigNumber.from(_token1Amount);
    var sqrtPriceX96 = ethers_1.BigNumber.from(_sqrtPriceX96);
    var sqrtPrice = sqrtPriceX96.pow(2);
    var price = sqrtPrice.mul(PRECISION).div(X192);
    var ratio = parseFloat(price.toString()) / Math.pow(10, 36);
    // calculate amount1 in terms of amount0
    var amount1 = ratio * parseInt(token0Amount.toString());
    // calculate the total value of the pool
    return amount1 + parseInt((token1Amount.toString()));
}
exports.getTotalValueInToken1 = getTotalValueInToken1;
// Analyzis array of snapshots to give the average fee return per second
function getAverageReturnPerSecondFromSnapshots(snapshots) {
    var performanceIntervals = [];
    var numSnapshots = snapshots.length;
    // now we have our snapshots, we can calculate the return per second
    for (var i = 1; i < numSnapshots; i++) {
        // calculate holdings and fees
        // calculates starting holdings at current prices
        var startingHoldings = getTotalValueInToken1(snapshots[i - 1].totalAmount0, snapshots[i - 1].totalAmount1, snapshots[i].sqrtPriceX96);
        // change in fees with current prices
        var netFees = getTotalValueInToken1((Number(snapshots[i].fees0) - Number(snapshots[i - 1].fees0)).toString(), (Number(snapshots[i].fees1) - Number(snapshots[i - 1].fees1)).toString(), snapshots[i].sqrtPriceX96);
        var duration = Number(snapshots[i].timestamp) - Number(snapshots[i - 1].timestamp);
        // create arrays of performance intervals
        var interval = {
            startingHoldingsInToken1: startingHoldings,
            netFeesMeasuredInToken1: netFees,
            durationInSeconds: duration,
            averageFeePerHolding: netFees / startingHoldings,
            averageFeePHPerSecond: (netFees / startingHoldings) / duration
        };
        // If the price spikes we get infinite values and NaNs
        if (!isNaN(interval.averageFeePHPerSecond) && isFinite(interval.averageFeePHPerSecond))
            performanceIntervals.push(interval);
    }
    var averageFeePHPSSum = performanceIntervals.map(function (interval) {
        return interval.averageFeePHPerSecond;
    }).reduce(function (total, current) { return total + current; }, 0);
    var averageFeePerHoldingPerSecond = averageFeePHPSSum / (performanceIntervals.length);
    return averageFeePerHoldingPerSecond;
}
exports.getAverageReturnPerSecondFromSnapshots = getAverageReturnPerSecondFromSnapshots;
