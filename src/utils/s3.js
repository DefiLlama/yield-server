const S3 = require('aws-sdk/clients/s3');
const { constants, brotliCompressSync } = require("zlib");

module.exports.writeToS3 = async (bucket, key, body) => {
  const params = {
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(body),
  };
  const s3 = new S3();
  const resp = await s3.upload(params).promise();
  const msg = `saved to ${resp.Location}`;
  console.log(msg);

  return resp;
};

module.exports.readFromS3 = async (bucket, key) => {
  const params = {
    Bucket: bucket,
    Key: key,
  };
  const s3 = new S3();
  const resp = await s3.getObject(params).promise();
  return JSON.parse(resp.Body);
};

function compress(data) {
  return brotliCompressSync(data, {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
  });
}

function next21Minutedate() {
  const dt = new Date()
  dt.setHours(dt.getHours() + 1);
  dt.setMinutes(21)
  return dt
}

module.exports.storeCompressed = (bucket, filename, body) => {
  return new S3().upload({
    Bucket: bucket,
    Key: filename,
    Body: compress(JSON.stringify(body)),
    ACL: "public-read",
    Expires: next21Minutedate(),
    ContentEncoding: 'br',
    ContentType: "application/json"
  }).promise()
}