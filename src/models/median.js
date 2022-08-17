const mongoose = require('mongoose');

const medianSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: [true, 'A pool must have a timestamp field'],
    },
    medianAPY: {
      type: Number,
      required: [true, 'A pool must have a medianAPY field'],
    },
    uniquePools: {
      type: Number,
      default: [true, 'A pool must have a uniquePools field'],
    },
  },
  { versionKey: false }
);

medianSchema.index({ timestamp: 1 });

const nameModel = 'Median';
const nameCollection = nameModel.toLowerCase();
const medianModel = mongoose.model(nameModel, medianSchema, nameCollection);

module.exports = medianModel;
