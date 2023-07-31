module.exports = {
    "balance": {
        "inputs": [],
        "name": "balance",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    "totalDebt": {
        "inputs": [],
        "name": "totalDebt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    "collateralFactorBps": {
        "inputs": [],
        "name": "collateralFactorBps",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    "borrowPaused": {
        "inputs": [],
        "name": "borrowPaused",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    "collateral": {
        "inputs": [],
        "name": "collateral",
        "outputs": [
            {
                "internalType": "contract IERC20",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    "market": [
        "function totalDebt() public view returns (uint)",
        "event CreateEscrow(address indexed user, address escrow)",
    ],
    "dbr": [
        "event AddMarket(address indexed market)"
    ]
};
