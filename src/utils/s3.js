const S3 = require('aws-sdk/clients/s3');

exports.writeToS3 = async (bucket, key, body) => {
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

exports.readFromS3 = async (bucket, key) => {
  const params = {
    Bucket: bucket,
    Key: key,
  };
  const s3 = new S3();
  const resp = await s3.getObject(params).promise();
  return JSON.parse(resp.Body);
};
