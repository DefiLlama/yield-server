const S3 = require('aws-sdk/clients/s3');

const r2 = () =>
  new S3({
    endpoint: `https://${process.env.R2_ENDPOINT}`,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
    region: 'auto',
  });

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

function next21Minutedate() {
  const dt = new Date();
  dt.setHours(dt.getHours() + 1);
  dt.setMinutes(22);
  return dt;
}
module.exports.next21Minutedate = next21Minutedate;

module.exports.storeAPIResponse = (
  bucket,
  filename,
  body,
  expires = next21Minutedate()
) => {
  return r2()
    .upload({
      Bucket: bucket,
      Key: filename,
      Body: JSON.stringify(body),
      Expires: expires,
      ContentType: 'application/json',
    })
    .promise();
};
