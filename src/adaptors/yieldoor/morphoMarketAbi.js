const morphoMarketAbi = [
  {
    inputs: [
      {
        internalType: "contract IMorpho",
        name: "morpho",
        type: "address",
      },
      {
        internalType: "Id",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "contract IAdaptiveCurveIrm",
        name: "adaptiveCurveIrm",
        type: "address",
      }
    ],
    name: "query",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "loanToken",
                type: "address",
              },
              {
                internalType: "address",
                name: "collateralToken",
                type: "address",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
              {
                internalType: "address",
                name: "irm",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              }
            ],
            internalType: "struct MarketParams",
            name: "marketParams",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint128",
                name: "totalSupplyAssets",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "totalSupplyShares",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "totalBorrowAssets",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "totalBorrowShares",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "lastUpdate",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "fee",
                type: "uint128",
              }
            ],
            internalType: "struct Market",
            name: "market",
            type: "tuple",
          },
          {
            internalType: "bool",
            name: "hasPrice",
            type: "bool",
          },
          {
            internalType: "uint256",
            name: "price",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rateAtTarget",
            type: "uint256",
          }
        ],
        internalType: "struct MarketResponse",
        name: "res",
        type: "tuple",
      }
    ],
    stateMutability: "view",
    type: "function",
  }
];

const code = "0x608080604052346015576104f8908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c63d8f172c414610025575f80fd5b34610285576060366003190112610285576004356001600160a01b0381169190829003610285576044356001600160a01b0381169290602435908490036102855761006f8361042c565b60405161007b8161042c565b5f81525f60208201525f60408201525f60608201525f60808201528352602083016040516100a88161045c565b5f81525f60208201525f60408201525f60608201525f60808201525f60a0820152815260408401905f825260608501925f845260808601945f8652604051632c3c915760e01b815282600482015260a081602481855afa908115610291575f9161039f575b5060249160c091895260405192838092632e3071cd60e11b82528660048301525afa908115610291575f91610302575b5082528551604001516001600160a01b03168061029c575b508551606001516001600160a01b0316871461021e575b5060408051955180516001600160a01b0390811688526020808301518216818a015282840151821689850152606080840151909216828a015260809283015189840152935180516001600160801b0390811660a08b81019190915295820151811660c08b015293810151841660e08a0152908101518316610100890152908101518216610120880152909101511661014085015251151561016084015251610180830152516101a08201526101c09150f35b6020906024604051809981936301977b5760e01b835260048301525afa958615610291575f96610258575b509483526101c09460a061016c565b95506020863d602011610289575b8161027360209383610478565b810103126102855794519460a0610249565b5f80fd5b3d9150610266565b6040513d5f823e3d90fd5b60206004916040519283809263501ad8ff60e11b82525afa5f91816102ce575b5015610155576001845284525f610155565b9091506020813d6020116102fa575b816102ea60209383610478565b810103126102855751905f6102bc565b3d91506102dd565b905060c0813d60c011610397575b8161031d60c09383610478565b810103126102855761038c60a0604051926103378461045c565b610340816104ae565b845261034e602082016104ae565b602085015261035f604082016104ae565b6040850152610370606082016104ae565b6060850152610381608082016104ae565b6080850152016104ae565b60a08201525f61013d565b3d9150610310565b905060a0813d60a011610424575b816103ba60a09383610478565b810103126102855760249160c0916080604051916103d78361042c565b6103e08161049a565b83526103ee6020820161049a565b60208401526103ff6040820161049a565b60408401526104106060820161049a565b60608401520151608082015291509161010d565b3d91506103ad565b60a0810190811067ffffffffffffffff82111761044857604052565b634e487b7160e01b5f52604160045260245ffd5b60c0810190811067ffffffffffffffff82111761044857604052565b90601f8019910116810190811067ffffffffffffffff82111761044857604052565b51906001600160a01b038216820361028557565b51906001600160801b03821682036102855756fea2646970667358221220acbd98f027aaca3ed2f90675c4eece5d7bd1a9fbbbb62956dae5a7491ebc745564736f6c634300081b0033";

module.exports = { morphoMarketAbi, code };