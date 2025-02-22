const erc20 = [
{
    inputs: [
        {
            name: "account",
            type: "felt"
        }
    ],
    name: "balanceOf",
    outputs: [
        {
            name: "balance",
            type: "Uint256"
        }
    ],
    stateMutability: "view",
    type: "function"
}
  ]
  
  const erc20abi = {};
  erc20.forEach((i) => (erc20abi[i.name] = i));
  
  module.exports = {
    erc20abi,
  };
  