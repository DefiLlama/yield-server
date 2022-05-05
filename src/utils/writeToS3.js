const S3 = require('aws-sdk/clients/s3');

module.exports = async (bucket, key, body) => {
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
