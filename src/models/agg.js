const mongoose = require('mongoose');

const aggSchema = new mongoose.Schema(
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
    mean: {
      type: Number,
      default: null,
    },
    mean2: {
      type: Number,
      default: null,
    },
    returnProduct: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

aggSchema.index({ pool: 1 });

const nameModel = 'Aggregations';
const nameCollection = nameModel.toLowerCase();
const aggModel = mongoose.model(nameModel, aggSchema, nameCollection);

module.exports = aggModel;
