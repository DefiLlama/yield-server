const mongoose = require('mongoose');

const medianSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      // required: [true, 'A new entry requires a timestamp field'],
    },
    medianAPY: {
      type: Number,
      default: [true, 'A new entry requires a medianAPY field'],
    },
    uniquePools: {
      type: Number,
      default: [true, 'A new entry requires a uniquePools field'],
    },
  },
  // i remove __v versionkey created by mongoose
  { versionKey: false }
);

const nameModel = 'Median';
const nameCollection = nameModel.toLowerCase();
const medianModel = mongoose.model(nameModel, medianSchema, nameCollection);

module.exports = medianModel;
