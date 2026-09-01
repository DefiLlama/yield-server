module.exports = [
  {
    "type": "impl",
    "name": "DefaultExtensionPOV2Impl",
    "interface_name": "vesu::v2::default_extension_po_v2::IDefaultExtensionPOV2"
  },
  {
    "type": "enum",
    "name": "vesu::vendor::pragma::AggregationMode",
    "variants": [
      {
        "name": "Median",
        "type": "()"
      },
      {
        "name": "Mean",
        "type": "()"
      },
      {
        "name": "Error",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::components::pragma_oracle::OracleConfig",
    "members": [
      {
        "name": "pragma_key",
        "type": "core::felt252"
      },
      {
        "name": "timeout",
        "type": "core::integer::u64"
      },
      {
        "name": "number_of_sources",
        "type": "core::integer::u32"
      },
      {
        "name": "start_time_offset",
        "type": "core::integer::u64"
      },
      {
        "name": "time_window",
        "type": "core::integer::u64"
      },
      {
        "name": "aggregation_mode",
        "type": "vesu::vendor::pragma::AggregationMode"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::components::fee_model::FeeConfig",
    "members": [
      {
        "name": "fee_recipient",
        "type": "core::starknet::contract_address::ContractAddress"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::integer::u256",
    "members": [
      {
        "name": "low",
        "type": "core::integer::u128"
      },
      {
        "name": "high",
        "type": "core::integer::u128"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::components::interest_rate_model::InterestRateConfig",
    "members": [
      {
        "name": "min_target_utilization",
        "type": "core::integer::u256"
      },
      {
        "name": "max_target_utilization",
        "type": "core::integer::u256"
      },
      {
        "name": "target_utilization",
        "type": "core::integer::u256"
      },
      {
        "name": "min_full_utilization_rate",
        "type": "core::integer::u256"
      },
      {
        "name": "max_full_utilization_rate",
        "type": "core::integer::u256"
      },
      {
        "name": "zero_utilization_rate",
        "type": "core::integer::u256"
      },
      {
        "name": "rate_half_life",
        "type": "core::integer::u256"
      },
      {
        "name": "target_rate_percent",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::components::position_hooks::LiquidationConfig",
    "members": [
      {
        "name": "liquidation_factor",
        "type": "core::integer::u64"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::components::position_hooks::ShutdownConfig",
    "members": [
      {
        "name": "recovery_period",
        "type": "core::integer::u64"
      },
      {
        "name": "subscription_period",
        "type": "core::integer::u64"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::LTVConfig",
    "members": [
      {
        "name": "max_ltv",
        "type": "core::integer::u64"
      }
    ]
  },
  {
    "type": "enum",
    "name": "vesu::extension::components::position_hooks::ShutdownMode",
    "variants": [
      {
        "name": "None",
        "type": "()"
      },
      {
        "name": "Recovery",
        "type": "()"
      },
      {
        "name": "Subscription",
        "type": "()"
      },
      {
        "name": "Redemption",
        "type": "()"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::bool",
    "variants": [
      {
        "name": "False",
        "type": "()"
      },
      {
        "name": "True",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::components::position_hooks::ShutdownStatus",
    "members": [
      {
        "name": "shutdown_mode",
        "type": "vesu::extension::components::position_hooks::ShutdownMode"
      },
      {
        "name": "violating",
        "type": "core::bool"
      },
      {
        "name": "previous_violation_timestamp",
        "type": "core::integer::u64"
      },
      {
        "name": "count_at_violation_timestamp",
        "type": "core::integer::u128"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::components::position_hooks::Pair",
    "members": [
      {
        "name": "total_collateral_shares",
        "type": "core::integer::u256"
      },
      {
        "name": "total_nominal_debt",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::AssetParams",
    "members": [
      {
        "name": "asset",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "floor",
        "type": "core::integer::u256"
      },
      {
        "name": "initial_rate_accumulator",
        "type": "core::integer::u256"
      },
      {
        "name": "initial_full_utilization_rate",
        "type": "core::integer::u256"
      },
      {
        "name": "max_utilization",
        "type": "core::integer::u256"
      },
      {
        "name": "is_legacy",
        "type": "core::bool"
      },
      {
        "name": "fee_rate",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<vesu::data_model::AssetParams>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<vesu::data_model::AssetParams>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::default_extension_po::VTokenParams",
    "members": [
      {
        "name": "v_token_name",
        "type": "core::felt252"
      },
      {
        "name": "v_token_symbol",
        "type": "core::felt252"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<vesu::extension::default_extension_po::VTokenParams>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<vesu::extension::default_extension_po::VTokenParams>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::LTVParams",
    "members": [
      {
        "name": "collateral_asset_index",
        "type": "core::integer::u32"
      },
      {
        "name": "debt_asset_index",
        "type": "core::integer::u32"
      },
      {
        "name": "max_ltv",
        "type": "core::integer::u64"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<vesu::data_model::LTVParams>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<vesu::data_model::LTVParams>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<vesu::extension::components::interest_rate_model::InterestRateConfig>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<vesu::extension::components::interest_rate_model::InterestRateConfig>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::default_extension_po::PragmaOracleParams",
    "members": [
      {
        "name": "pragma_key",
        "type": "core::felt252"
      },
      {
        "name": "timeout",
        "type": "core::integer::u64"
      },
      {
        "name": "number_of_sources",
        "type": "core::integer::u32"
      },
      {
        "name": "start_time_offset",
        "type": "core::integer::u64"
      },
      {
        "name": "time_window",
        "type": "core::integer::u64"
      },
      {
        "name": "aggregation_mode",
        "type": "vesu::vendor::pragma::AggregationMode"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<vesu::extension::default_extension_po::PragmaOracleParams>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<vesu::extension::default_extension_po::PragmaOracleParams>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::default_extension_po::LiquidationParams",
    "members": [
      {
        "name": "collateral_asset_index",
        "type": "core::integer::u32"
      },
      {
        "name": "debt_asset_index",
        "type": "core::integer::u32"
      },
      {
        "name": "liquidation_factor",
        "type": "core::integer::u64"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<vesu::extension::default_extension_po::LiquidationParams>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<vesu::extension::default_extension_po::LiquidationParams>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::DebtCapParams",
    "members": [
      {
        "name": "collateral_asset_index",
        "type": "core::integer::u32"
      },
      {
        "name": "debt_asset_index",
        "type": "core::integer::u32"
      },
      {
        "name": "debt_cap",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<vesu::data_model::DebtCapParams>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<vesu::data_model::DebtCapParams>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::default_extension_po::ShutdownParams",
    "members": [
      {
        "name": "recovery_period",
        "type": "core::integer::u64"
      },
      {
        "name": "subscription_period",
        "type": "core::integer::u64"
      },
      {
        "name": "ltv_params",
        "type": "core::array::Span::<vesu::data_model::LTVParams>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::extension::default_extension_po::FeeParams",
    "members": [
      {
        "name": "fee_recipient",
        "type": "core::starknet::contract_address::ContractAddress"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<(core::felt252, core::felt252, core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress)>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<(core::felt252, core::felt252, core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress)>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<(core::starknet::contract_address::ContractAddress, vesu::extension::components::interest_rate_model::InterestRateConfig)>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<(core::starknet::contract_address::ContractAddress, vesu::extension::components::interest_rate_model::InterestRateConfig)>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<(core::starknet::contract_address::ContractAddress, vesu::extension::components::pragma_oracle::OracleConfig)>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<(core::starknet::contract_address::ContractAddress, vesu::extension::components::pragma_oracle::OracleConfig)>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::extension::components::position_hooks::LiquidationConfig)>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::extension::components::position_hooks::LiquidationConfig)>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::extension::components::position_hooks::Pair)>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::extension::components::position_hooks::Pair)>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, core::integer::u256)>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, core::integer::u256)>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::data_model::LTVConfig)>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::data_model::LTVConfig)>"
      }
    ]
  },
  {
    "type": "interface",
    "name": "vesu::v2::default_extension_po_v2::IDefaultExtensionPOV2",
    "items": [
      {
        "type": "function",
        "name": "pool_name",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "core::felt252"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "pool_owner",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "shutdown_mode_agent",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "pragma_oracle",
        "inputs": [],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "pragma_summary",
        "inputs": [],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "oracle_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::pragma_oracle::OracleConfig"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "fee_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::fee_model::FeeConfig"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "debt_caps",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u256"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "interest_rate_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::interest_rate_model::InterestRateConfig"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "liquidation_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::position_hooks::LiquidationConfig"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "shutdown_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::position_hooks::ShutdownConfig"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "shutdown_ltv_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::data_model::LTVConfig"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "shutdown_status",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::position_hooks::ShutdownStatus"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "pairs",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::position_hooks::Pair"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "violation_timestamp_for_pair",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u64"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "violation_timestamp_count",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "violation_timestamp",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u128"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "oldest_violation_timestamp",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u64"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "next_violation_timestamp",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "violation_timestamp",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u64"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "v_token_for_collateral_asset",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "collateral_asset_for_v_token",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "v_token",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "create_pool",
        "inputs": [
          {
            "name": "name",
            "type": "core::felt252"
          },
          {
            "name": "asset_params",
            "type": "core::array::Span::<vesu::data_model::AssetParams>"
          },
          {
            "name": "v_token_params",
            "type": "core::array::Span::<vesu::extension::default_extension_po::VTokenParams>"
          },
          {
            "name": "ltv_params",
            "type": "core::array::Span::<vesu::data_model::LTVParams>"
          },
          {
            "name": "interest_rate_configs",
            "type": "core::array::Span::<vesu::extension::components::interest_rate_model::InterestRateConfig>"
          },
          {
            "name": "pragma_oracle_params",
            "type": "core::array::Span::<vesu::extension::default_extension_po::PragmaOracleParams>"
          },
          {
            "name": "liquidation_params",
            "type": "core::array::Span::<vesu::extension::default_extension_po::LiquidationParams>"
          },
          {
            "name": "debt_caps",
            "type": "core::array::Span::<vesu::data_model::DebtCapParams>"
          },
          {
            "name": "shutdown_params",
            "type": "vesu::extension::default_extension_po::ShutdownParams"
          },
          {
            "name": "fee_params",
            "type": "vesu::extension::default_extension_po::FeeParams"
          },
          {
            "name": "owner",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::felt252"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "add_asset",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset_params",
            "type": "vesu::data_model::AssetParams"
          },
          {
            "name": "v_token_params",
            "type": "vesu::extension::default_extension_po::VTokenParams"
          },
          {
            "name": "interest_rate_config",
            "type": "vesu::extension::components::interest_rate_model::InterestRateConfig"
          },
          {
            "name": "pragma_oracle_params",
            "type": "vesu::extension::default_extension_po::PragmaOracleParams"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_asset_parameter",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "parameter",
            "type": "core::felt252"
          },
          {
            "name": "value",
            "type": "core::integer::u256"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_debt_cap",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_cap",
            "type": "core::integer::u256"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_interest_rate_parameter",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "parameter",
            "type": "core::felt252"
          },
          {
            "name": "value",
            "type": "core::integer::u256"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_oracle_parameter",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "parameter",
            "type": "core::felt252"
          },
          {
            "name": "value",
            "type": "core::felt252"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_liquidation_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "liquidation_config",
            "type": "vesu::extension::components::position_hooks::LiquidationConfig"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_ltv_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "ltv_config",
            "type": "vesu::data_model::LTVConfig"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_shutdown_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "shutdown_config",
            "type": "vesu::extension::components::position_hooks::ShutdownConfig"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_shutdown_ltv_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "shutdown_ltv_config",
            "type": "vesu::data_model::LTVConfig"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_shutdown_mode",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "shutdown_mode",
            "type": "vesu::extension::components::position_hooks::ShutdownMode"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_pool_owner",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "owner",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_shutdown_mode_agent",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "shutdown_mode_agent",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "update_shutdown_status",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "debt_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::extension::components::position_hooks::ShutdownMode"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_fee_config",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "fee_config",
            "type": "vesu::extension::components::fee_model::FeeConfig"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "claim_fees",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "collateral_asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "migrate_pool",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "name",
            "type": "core::felt252"
          },
          {
            "name": "v_token_configs",
            "type": "core::array::Span::<(core::felt252, core::felt252, core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress)>"
          },
          {
            "name": "interest_rate_configs",
            "type": "core::array::Span::<(core::starknet::contract_address::ContractAddress, vesu::extension::components::interest_rate_model::InterestRateConfig)>"
          },
          {
            "name": "pragma_oracle_configs",
            "type": "core::array::Span::<(core::starknet::contract_address::ContractAddress, vesu::extension::components::pragma_oracle::OracleConfig)>"
          },
          {
            "name": "liquidation_configs",
            "type": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::extension::components::position_hooks::LiquidationConfig)>"
          },
          {
            "name": "pairs",
            "type": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::extension::components::position_hooks::Pair)>"
          },
          {
            "name": "debt_caps",
            "type": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, core::integer::u256)>"
          },
          {
            "name": "shutdown_ltv_configs",
            "type": "core::array::Span::<(core::starknet::contract_address::ContractAddress, core::starknet::contract_address::ContractAddress, vesu::data_model::LTVConfig)>"
          },
          {
            "name": "shutdown_config",
            "type": "vesu::extension::components::position_hooks::ShutdownConfig"
          },
          {
            "name": "fee_config",
            "type": "vesu::extension::components::fee_model::FeeConfig"
          },
          {
            "name": "owner",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_migrator",
        "inputs": [
          {
            "name": "migrator",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_extension_utils_class_hash",
        "inputs": [
          {
            "name": "extension",
            "type": "core::felt252"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "upgrade_name",
        "inputs": [],
        "outputs": [
          {
            "type": "core::felt252"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "upgrade",
        "inputs": [
          {
            "name": "new_implementation",
            "type": "core::starknet::class_hash::ClassHash"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      }
    ]
  },
  {
    "type": "impl",
    "name": "ExtensionImpl",
    "interface_name": "vesu::extension::interface::IExtension"
  },
  {
    "type": "struct",
    "name": "vesu::data_model::AssetPrice",
    "members": [
      {
        "name": "value",
        "type": "core::integer::u256"
      },
      {
        "name": "is_valid",
        "type": "core::bool"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::AssetConfig",
    "members": [
      {
        "name": "total_collateral_shares",
        "type": "core::integer::u256"
      },
      {
        "name": "total_nominal_debt",
        "type": "core::integer::u256"
      },
      {
        "name": "reserve",
        "type": "core::integer::u256"
      },
      {
        "name": "max_utilization",
        "type": "core::integer::u256"
      },
      {
        "name": "floor",
        "type": "core::integer::u256"
      },
      {
        "name": "scale",
        "type": "core::integer::u256"
      },
      {
        "name": "is_legacy",
        "type": "core::bool"
      },
      {
        "name": "last_updated",
        "type": "core::integer::u64"
      },
      {
        "name": "last_rate_accumulator",
        "type": "core::integer::u256"
      },
      {
        "name": "last_full_utilization_rate",
        "type": "core::integer::u256"
      },
      {
        "name": "fee_rate",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::Position",
    "members": [
      {
        "name": "collateral_shares",
        "type": "core::integer::u256"
      },
      {
        "name": "nominal_debt",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::Context",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252"
      },
      {
        "name": "extension",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "collateral_asset",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "debt_asset",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "collateral_asset_config",
        "type": "vesu::data_model::AssetConfig"
      },
      {
        "name": "debt_asset_config",
        "type": "vesu::data_model::AssetConfig"
      },
      {
        "name": "collateral_asset_price",
        "type": "vesu::data_model::AssetPrice"
      },
      {
        "name": "debt_asset_price",
        "type": "vesu::data_model::AssetPrice"
      },
      {
        "name": "collateral_asset_fee_shares",
        "type": "core::integer::u256"
      },
      {
        "name": "debt_asset_fee_shares",
        "type": "core::integer::u256"
      },
      {
        "name": "max_ltv",
        "type": "core::integer::u64"
      },
      {
        "name": "user",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "position",
        "type": "vesu::data_model::Position"
      }
    ]
  },
  {
    "type": "enum",
    "name": "vesu::data_model::AmountType",
    "variants": [
      {
        "name": "Delta",
        "type": "()"
      },
      {
        "name": "Target",
        "type": "()"
      }
    ]
  },
  {
    "type": "enum",
    "name": "vesu::data_model::AmountDenomination",
    "variants": [
      {
        "name": "Native",
        "type": "()"
      },
      {
        "name": "Assets",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "alexandria_math::i257::i257",
    "members": [
      {
        "name": "abs",
        "type": "core::integer::u256"
      },
      {
        "name": "is_negative",
        "type": "core::bool"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::Amount",
    "members": [
      {
        "name": "amount_type",
        "type": "vesu::data_model::AmountType"
      },
      {
        "name": "denomination",
        "type": "vesu::data_model::AmountDenomination"
      },
      {
        "name": "value",
        "type": "alexandria_math::i257::i257"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<core::felt252>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<core::felt252>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "vesu::data_model::UnsignedAmount",
    "members": [
      {
        "name": "amount_type",
        "type": "vesu::data_model::AmountType"
      },
      {
        "name": "denomination",
        "type": "vesu::data_model::AmountDenomination"
      },
      {
        "name": "value",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "interface",
    "name": "vesu::extension::interface::IExtension",
    "items": [
      {
        "type": "function",
        "name": "singleton",
        "inputs": [],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "price",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "vesu::data_model::AssetPrice"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "interest_rate",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "utilization",
            "type": "core::integer::u256"
          },
          {
            "name": "last_updated",
            "type": "core::integer::u64"
          },
          {
            "name": "last_full_utilization_rate",
            "type": "core::integer::u256"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u256"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "rate_accumulator",
        "inputs": [
          {
            "name": "pool_id",
            "type": "core::felt252"
          },
          {
            "name": "asset",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "utilization",
            "type": "core::integer::u256"
          },
          {
            "name": "last_updated",
            "type": "core::integer::u64"
          },
          {
            "name": "last_rate_accumulator",
            "type": "core::integer::u256"
          },
          {
            "name": "last_full_utilization_rate",
            "type": "core::integer::u256"
          }
        ],
        "outputs": [
          {
            "type": "(core::integer::u256, core::integer::u256)"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "before_modify_position",
        "inputs": [
          {
            "name": "context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "collateral",
            "type": "vesu::data_model::Amount"
          },
          {
            "name": "debt",
            "type": "vesu::data_model::Amount"
          },
          {
            "name": "data",
            "type": "core::array::Span::<core::felt252>"
          },
          {
            "name": "caller",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "(vesu::data_model::Amount, vesu::data_model::Amount)"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "after_modify_position",
        "inputs": [
          {
            "name": "context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "collateral_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "collateral_shares_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "debt_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "nominal_debt_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "data",
            "type": "core::array::Span::<core::felt252>"
          },
          {
            "name": "caller",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "before_transfer_position",
        "inputs": [
          {
            "name": "from_context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "to_context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "collateral",
            "type": "vesu::data_model::UnsignedAmount"
          },
          {
            "name": "debt",
            "type": "vesu::data_model::UnsignedAmount"
          },
          {
            "name": "data",
            "type": "core::array::Span::<core::felt252>"
          },
          {
            "name": "caller",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "(vesu::data_model::UnsignedAmount, vesu::data_model::UnsignedAmount)"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "after_transfer_position",
        "inputs": [
          {
            "name": "from_context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "to_context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "collateral_delta",
            "type": "core::integer::u256"
          },
          {
            "name": "collateral_shares_delta",
            "type": "core::integer::u256"
          },
          {
            "name": "debt_delta",
            "type": "core::integer::u256"
          },
          {
            "name": "nominal_debt_delta",
            "type": "core::integer::u256"
          },
          {
            "name": "data",
            "type": "core::array::Span::<core::felt252>"
          },
          {
            "name": "caller",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "before_liquidate_position",
        "inputs": [
          {
            "name": "context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "data",
            "type": "core::array::Span::<core::felt252>"
          },
          {
            "name": "caller",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "(core::integer::u256, core::integer::u256, core::integer::u256)"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "after_liquidate_position",
        "inputs": [
          {
            "name": "context",
            "type": "vesu::data_model::Context"
          },
          {
            "name": "collateral_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "collateral_shares_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "debt_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "nominal_debt_delta",
            "type": "alexandria_math::i257::i257"
          },
          {
            "name": "bad_debt",
            "type": "core::integer::u256"
          },
          {
            "name": "data",
            "type": "core::array::Span::<core::felt252>"
          },
          {
            "name": "caller",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "external"
      }
    ]
  },
  {
    "type": "constructor",
    "name": "constructor",
    "inputs": [
      {
        "name": "singleton",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "oracle_address",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "summary_address",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "v_token_class_hash",
        "type": "core::felt252"
      },
      {
        "name": "v_token_v2_class_hash",
        "type": "core::felt252"
      },
      {
        "name": "migrator",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "extension_utils_class_hash",
        "type": "core::felt252"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::position_hooks::position_hooks_component::SetLiquidationConfig",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "collateral_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "debt_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "liquidation_config",
        "type": "vesu::extension::components::position_hooks::LiquidationConfig",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::position_hooks::position_hooks_component::SetShutdownConfig",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "shutdown_config",
        "type": "vesu::extension::components::position_hooks::ShutdownConfig",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::position_hooks::position_hooks_component::SetShutdownLTVConfig",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "collateral_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "debt_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "shutdown_ltv_config",
        "type": "vesu::data_model::LTVConfig",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::position_hooks::position_hooks_component::SetDebtCap",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "collateral_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "debt_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "debt_cap",
        "type": "core::integer::u256",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::position_hooks::position_hooks_component::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "SetLiquidationConfig",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::SetLiquidationConfig",
        "kind": "nested"
      },
      {
        "name": "SetShutdownConfig",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::SetShutdownConfig",
        "kind": "nested"
      },
      {
        "name": "SetShutdownLTVConfig",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::SetShutdownLTVConfig",
        "kind": "nested"
      },
      {
        "name": "SetDebtCap",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::SetDebtCap",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::interest_rate_model::interest_rate_model_component::SetInterestRateConfig",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "data"
      },
      {
        "name": "asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "interest_rate_config",
        "type": "vesu::extension::components::interest_rate_model::InterestRateConfig",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::interest_rate_model::interest_rate_model_component::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "SetInterestRateConfig",
        "type": "vesu::extension::components::interest_rate_model::interest_rate_model_component::SetInterestRateConfig",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::pragma_oracle::pragma_oracle_component::SetOracleConfig",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "data"
      },
      {
        "name": "asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "oracle_config",
        "type": "vesu::extension::components::pragma_oracle::OracleConfig",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::pragma_oracle::pragma_oracle_component::SetOracleParameter",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "data"
      },
      {
        "name": "asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "parameter",
        "type": "core::felt252",
        "kind": "data"
      },
      {
        "name": "value",
        "type": "core::felt252",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::pragma_oracle::pragma_oracle_component::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "SetOracleConfig",
        "type": "vesu::extension::components::pragma_oracle::pragma_oracle_component::SetOracleConfig",
        "kind": "nested"
      },
      {
        "name": "SetOracleParameter",
        "type": "vesu::extension::components::pragma_oracle::pragma_oracle_component::SetOracleParameter",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::map_list::map_list_component::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "vesu::extension::components::fee_model::fee_model_component::SetFeeConfig",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "fee_config",
        "type": "vesu::extension::components::fee_model::FeeConfig",
        "kind": "key"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::fee_model::fee_model_component::ClaimFees",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "collateral_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "debt_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "recipient",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "amount",
        "type": "core::integer::u256",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::fee_model::fee_model_component::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "SetFeeConfig",
        "type": "vesu::extension::components::fee_model::fee_model_component::SetFeeConfig",
        "kind": "nested"
      },
      {
        "name": "ClaimFees",
        "type": "vesu::extension::components::fee_model::fee_model_component::ClaimFees",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::tokenization::tokenization_component::CreateVToken",
    "kind": "struct",
    "members": [
      {
        "name": "v_token",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "collateral_asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::extension::components::tokenization::tokenization_component::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "CreateVToken",
        "type": "vesu::extension::components::tokenization::tokenization_component::CreateVToken",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::v2::default_extension_po_v2::DefaultExtensionPOV2::SetAssetParameter",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "asset",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "parameter",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "value",
        "type": "core::integer::u256",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::v2::default_extension_po_v2::DefaultExtensionPOV2::SetPoolOwner",
    "kind": "struct",
    "members": [
      {
        "name": "pool_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::v2::default_extension_po_v2::DefaultExtensionPOV2::ContractUpgraded",
    "kind": "struct",
    "members": [
      {
        "name": "new_implementation",
        "type": "core::starknet::class_hash::ClassHash",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "vesu::v2::default_extension_po_v2::DefaultExtensionPOV2::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "PositionHooksEvents",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::Event",
        "kind": "nested"
      },
      {
        "name": "InterestRateModelEvents",
        "type": "vesu::extension::components::interest_rate_model::interest_rate_model_component::Event",
        "kind": "nested"
      },
      {
        "name": "PragmaOracleEvents",
        "type": "vesu::extension::components::pragma_oracle::pragma_oracle_component::Event",
        "kind": "nested"
      },
      {
        "name": "MapListEvents",
        "type": "vesu::map_list::map_list_component::Event",
        "kind": "nested"
      },
      {
        "name": "FeeModelEvents",
        "type": "vesu::extension::components::fee_model::fee_model_component::Event",
        "kind": "nested"
      },
      {
        "name": "TokenizationEvents",
        "type": "vesu::extension::components::tokenization::tokenization_component::Event",
        "kind": "nested"
      },
      {
        "name": "SetAssetParameter",
        "type": "vesu::v2::default_extension_po_v2::DefaultExtensionPOV2::SetAssetParameter",
        "kind": "nested"
      },
      {
        "name": "SetPoolOwner",
        "type": "vesu::v2::default_extension_po_v2::DefaultExtensionPOV2::SetPoolOwner",
        "kind": "nested"
      },
      {
        "name": "CreateVToken",
        "type": "vesu::extension::components::tokenization::tokenization_component::CreateVToken",
        "kind": "nested"
      },
      {
        "name": "SetInterestRateConfig",
        "type": "vesu::extension::components::interest_rate_model::interest_rate_model_component::SetInterestRateConfig",
        "kind": "nested"
      },
      {
        "name": "SetOracleConfig",
        "type": "vesu::extension::components::pragma_oracle::pragma_oracle_component::SetOracleConfig",
        "kind": "nested"
      },
      {
        "name": "SetLiquidationConfig",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::SetLiquidationConfig",
        "kind": "nested"
      },
      {
        "name": "SetDebtCap",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::SetDebtCap",
        "kind": "nested"
      },
      {
        "name": "SetShutdownLTVConfig",
        "type": "vesu::extension::components::position_hooks::position_hooks_component::SetShutdownLTVConfig",
        "kind": "nested"
      },
      {
        "name": "ContractUpgraded",
        "type": "vesu::v2::default_extension_po_v2::DefaultExtensionPOV2::ContractUpgraded",
        "kind": "nested"
      }
    ]
  }
]