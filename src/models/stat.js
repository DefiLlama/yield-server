const mongoose = require('mongoose');

const statSchema = new mongoose.Schema(
  {
    pool: {
      type: String,
      required: [true, 'A pool must have an pool field'],
      trim: true,
    },
    count: {
      type: Number,
      default: null,
    },
    // meanAPY and mean2APY are used for calculating mu and sigma of apy series for the ML algorithm
    meanAPY: {
      type: Number,
      default: null,
    },
    mean2APY: {
      type: Number,
      default: null,
    },
    // meanDR, mean2DR and productDR are used for calculating mu and sigma of daily return (DR) series for the scatterchart
    meanDR: {
      type: Number,
      default: null,
    },
    mean2DR: {
      type: Number,
      default: null,
    },
    productDR: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

statSchema.index({ pool: 1 });

const nameModel = 'Stats';
const nameCollection = nameModel.toLowerCase();
const statModel = mongoose.model(nameModel, statSchema, nameCollection);

module.exports = statModel;
