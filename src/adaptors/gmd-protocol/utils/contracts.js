const { ethers } = require("ethers");
const {
  GMD_STAKING_ADDR,
  MINT_ADDR,
  MULTICALL_ADDR,
  PRICE_ADDR,
  VAULT_ADDR,
} = require("../abis/address");
const MultiCallABI = require("../abis/MultiCallABI.json");
const ERC20ABI = require("../abis/ERC20ABI.json");
const VaultABI = require("../abis/ValutABI.json");
const PriceABI = require("../abis/PriceABI.json");
const MintABI = require("../abis/MintABI.json");
const GMDStakingABI = require("../abis/GMDStakingABI.json");

exports.RPC_ENDPOINT = "https://arb-mainnet.g.alchemy.com/v2/-g2xRou0mvYu9_rsilf44FQREKzsGTo2";

exports.getContract = (abi, address, signer) => {
  const simpleRpcProvider = new ethers.providers.JsonRpcProvider(exports.RPC_ENDPOINT);
  const signerOrProvider = signer ?? simpleRpcProvider;
  return new ethers.Contract(address, abi, signerOrProvider);
};
exports.getTokenContract = (address, signer) => {
  return exports.getContract(ERC20ABI, address, signer);
};
exports.getVaultContract = (signer) => {
  return exports.getContract(VaultABI, VAULT_ADDR, signer);
};

exports.getPriceContract = (signer) => {
  return exports.getContract(PriceABI, PRICE_ADDR, signer);
};

exports.getMintContract = (signer) => {
  return exports.getContract(MintABI, MINT_ADDR, signer);
};

exports.getGMDStakingContract = (signer) => {
  return exports.getContract(GMDStakingABI, GMD_STAKING_ADDR, signer);
};

exports.getMulticallContract = (signer) => {
  return exports.getContract(MultiCallABI, MULTICALL_ADDR, signer);
};

exports.multicall = async (abi, calls) => {
  try {
    const itf = new ethers.utils.Interface(abi);
    const multi = exports.getMulticallContract();
    const calldata = calls.map((call) => [
      call.address.toLowerCase(),
      itf.encodeFunctionData(call.name, call.params),
    ]);

    const { returnData } = await multi.aggregate(calldata);
    const res = returnData.map((call, i) =>
      itf.decodeFunctionResult(calls[i].name, call)
    );

    return res;
  } catch (error) {
    console.log(error);
  }
};
