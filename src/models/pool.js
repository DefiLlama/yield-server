const mongoose = require('mongoose');

const poolSchema = new mongoose.Schema(
  {
    pool: {
      type: String,
      required: [true, 'A pool must have an pool field'],
      trim: true,
    },
    chain: {
      type: String,
      required: [true, 'A pool must have a chain field'],
      trim: true,
    },
    project: {
      type: String,
      required: [true, 'A pool must have a project field'],
      trim: true,
    },
    // for uniswap (v2 vs v3)
    market: {
      type: String,
      trim: true,
    },
    symbol: {
      type: String,
      required: [true, 'A pool must have a symbol field'],
      trim: true,
    },
    tvlUsd: {
      type: Number,
      required: [true, 'A pool must have a tvlUsd field'],
    },
    apyFee: {
      type: Number,
      default: null,
    },
    apyReward: {
      type: Number,
      default: null,
    },
    apy: {
      type: Number,
      // either i set it to default null here or I'll need to replace
      // NaN and null values from the adaptors with 0? but that would imply a zero apy, which is just
      // misleading, so I rather remove the required in here
      default: null,
    },
    rewardTokens: {
      type: [String],
    },
    // for historical stuff in db, inserted that field via:
    // db.pools.updateMany({}, [{$set: {"timestamp": {$dateTrunc: {date: "$createdAt", unit: "hour"}}}}])
    timestamp: {
      type: Date,
      required: [true, 'A pool must have a timestamp field'],
    },
  },
  // i remove __v versionkey created by mongoose
  { versionKey: false }
);

// compound indices speed up queries significantly
// /latest -> ~50ms
// /chart/pool -> ~1ms
// /offsets/project/day -> ~1ms
poolSchema.index({ pool: 1, timestamp: -1 });
poolSchema.index({ project: 1, timestamp: -1 });

const nameModel = 'Pools';
const nameCollection = nameModel.toLowerCase();
const poolModel = mongoose.model(nameModel, poolSchema, nameCollection);

module.exports = poolModel;
