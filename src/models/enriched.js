const mongoose = require('mongoose');

const msg = 'A pool must have a <> field';

const predictionSchema = new mongoose.Schema(
  {
    predictedClass: {
      type: Number,
    },
    predictedProbability: {
      type: Number,
    },
    confidence: {
      type: String,
      trim: true,
    },
  },
  { versionKey: false, _id: false }
);

const enrichedSchema = new mongoose.Schema(
  {
    pool: {
      type: String,
      required: [true, msg.replace('<>', 'pool')],
      trim: true,
      unique: true, // === mongoose sets it to unique index
    },
    chain: {
      type: String,
      required: [true, msg.replace('<>', 'chain')],
      trim: true,
    },
    project: {
      type: String,
      required: [true, msg.replace('<>', 'project')],
      trim: true,
    },
    market: {
      type: String,
      trim: true,
    },
    symbol: {
      type: String,
      required: [true, msg.replace('<>', 'symbol')],
      trim: true,
    },
    tvlUsd: {
      type: Number,
      required: [true, msg.replace('<>', 'tvlUsd')],
    },
    apy: {
      type: Number,
      default: null,
    },
    timestamp: {
      type: Date,
      required: [true, msg.replace('<>', 'timestamp')],
    },
    projectName: {
      type: String,
      trim: true,
      required: [true, msg.replace('<>', 'projectName')],
    },
    apyPct1D: {
      type: Number,
      default: null,
    },
    apyPct7D: {
      type: Number,
      default: null,
    },
    apyPct30D: {
      type: Number,
      default: null,
    },
    stablecoin: {
      type: Boolean,
      required: [true, msg.replace('<>', 'stablecoin')],
    },
    ilRisk: {
      type: String,
      trim: true,
      required: [true, msg.replace('<>', 'ilRisk')],
    },
    exposure: {
      type: String,
      trim: true,
      required: [true, msg.replace('<>', 'exposure')],
    },
    apyStdExpanding: {
      type: Number,
      default: null,
    },
    apyMeanExpanding: {
      type: Number,
      default: null,
    },
    Stability: {
      type: String,
      trim: true,
    },
    project_factorized: {
      type: Number,
    },
    chain_factorized: {
      type: Number,
    },
    predictions: {
      type: predictionSchema,
    },
  },
  { versionKey: false, timestamps: true }
);

enrichedSchema.index({ project: 1 });
enrichedSchema.index({ chain: 1 });

const nameModel = 'Enriched';
const nameCollection = nameModel.toLowerCase();
const enrichedModel = mongoose.model(nameModel, enrichedSchema, nameCollection);

module.exports = enrichedModel;
