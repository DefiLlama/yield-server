const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema(
  {
    project: {
      type: String,
      required: [true, 'A url must have a project field'],
    },
    url: {
      type: String,
      default: [true, 'A url must have a url field'],
    },
  },
  { versionKey: false }
);

urlSchema.index({ project: 1 });

const nameModel = 'Url';
const nameCollection = nameModel.toLowerCase();
const urlModel = mongoose.model(nameModel, urlSchema, nameCollection);

module.exports = urlModel;
