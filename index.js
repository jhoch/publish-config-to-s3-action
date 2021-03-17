const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const klawSync = require('klaw-sync');
const core = require('@actions/core');
const S3 = require('aws-sdk/clients/s3');

function getInputOrDefault(inputName, defaultValue) {
    const value = core.getInput('destination_filename', { required: false });
    if (value == null) {
        return defaultValue;
    }
    return value;
}

const AWS_ACCESS_KEY = core.getInput('aws_access_key', {
  required: true
});
const SECRET_ACCESS_KEY = core.getInput('aws_secret_access_key', {
  required: true
});
const BUCKET = core.getInput('aws_bucket', {
  required: true
});
const SOURCE_DIR = core.getInput('source_dir', {
  required: true
});
const DESTINATION_DIR = core.getInput('destination_dir', {
  required: true
});
const SECRET_HASH_SALT = core.getInput('secret_hash_salt', {
  required: true
});
const DEFAULT_CONFIG_FILE_EXTENSION = '.md';
const CONFIG_FILE_EXTENSION = getInputOrDefault('config_file_extension', DEFAULT_CONFIG_FILE_EXTENSION);
const DEFAULT_HASH_LENGTH = 12;
const HASH_LENGTH = getInputOrDefault('hash_length', DEFAULT_HASH_LENGTH);
const DEFAULT_DESTINATION_FILENAME = 'config';
const DESTINATION_FILENAME = getInputOrDefault('destination_filename', DEFAULT_DESTINATION_FILENAME);

const s3 = new S3({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: SECRET_ACCESS_KEY
});
const paths = klawSync(SOURCE_DIR, {
  nodir: true
});

function upload(params) {
  return new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) {
          core.error(err);
          reject(err);
          return;
      }
      core.info(`uploaded - ${data.Key}`);
      core.info(`located - ${data.Location}`);
      resolve(data.Location);
    });
  });
}

function run() {
  const sourceDir = path.join(process.cwd(), SOURCE_DIR);
  return Promise.all(
    paths.map(p => {
      const fileStream = fs.createReadStream(p.path);
      const basename = path.basename(p.path, CONFIG_FILE_EXTENSION);
      core.info(basename);
      const hash = crypto.createHmac('sha256', SECRET_HASH_SALT).update(basename).digest('hex').slice(0, HASH_LENGTH);
      core.info(HASH_LENGTH);
      core.info(hash);
      const bucketPath = path.join(DESTINATION_DIR, `${basename}-${hash}`, `${DESTINATION_FILENAME}.${CONFIG_FILE_EXTENSION}`);
      core.info(bucketPath);
      const params = {
        Bucket: BUCKET,
        ACL: 'private',
        Body: fileStream,
        Key: bucketPath,
        ContentType: 'text/plain'
      };
      return upload(params);
    })
  );
}

run()
  .then(locations => {
    core.info(`config locations - ${locations}`);
    core.setOutput('config_locations', locations);
  })
  .catch(err => {
    core.error(err);
    core.setFailed(err.message);
  });
