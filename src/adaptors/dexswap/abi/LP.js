const LP_ABI = [
	{
		'constant': true,
		'inputs': [],
		'name': 'getReserves',
		'outputs': [
			{
				'internalType': 'uint112',
				'name': '_reserve0',
				'type': 'uint112'
			},
			{
				'internalType': 'uint112',
				'name': '_reserve1',
				'type': 'uint112'
			},
			{
				'internalType': 'uint32',
				'name': '_blockTimestampLast',
				'type': 'uint32'
			}
		],
		'payable': false,
		'stateMutability': 'view',
		'type': 'function'
	},
	{
		'constant': true,
		'inputs': [],
		'name': 'totalSupply',
		'outputs': [
			{
				'internalType': 'uint256',
				'name': '',
				'type': 'uint256'
			}
		],
		'payable': false,
		'stateMutability': 'view',
		'type': 'function'
	}
]

module.exports = {
  LP_ABI,
}