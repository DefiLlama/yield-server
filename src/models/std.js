const mongoose = require('mongoose');

const stdSchema = new mongoose.Schema(
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
  },
  { timestamps: true }
);

stdSchema.index({ pool: 1 });

const nameModel = 'Stds';
const nameCollection = nameModel.toLowerCase();
const stdModel = mongoose.model(nameModel, stdSchema, nameCollection);

module.exports = stdModel;
