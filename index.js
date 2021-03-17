const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const core = require('@actions/core');
const S3 = require('aws-sdk/clients/s3');
const matter = require('gray-matter');
const klawSync = require('klaw-sync');

const readFile = promisify(fs.readFile);

function getInputOrDefault(inputName, defaultValue) {
    const value = core.getInput(inputName, { required: false });
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

async function uploadShowConfigs(configJson) {
  core.info(JSON.stringify(Object.keys(configJson)));
  return Promise.all(['streamUrlsPrimary', 'streamUrlsSecondary', 'streamUrlsTertiary'].map(async showKey => {
    const showConfig = configJson[showKey];
    core.info(showKey, JSON.stringify(showConfig));
    const { showId } = showConfig;
    if (showId == null || showId.trim() === '') {
      return;
    }
    const bucketPath = path.join(DESTINATION_DIR, '../shows', showId, `${DESTINATION_FILENAME}.json`);
    const params = {
      Bucket: BUCKET,
      ACL: 'public-read',
      Body: JSON.stringify(showConfig, null, 2),
      Key: bucketPath,
      ContentType: 'application/json'
    };
    return upload(params);
  }));
}

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
    paths.map(async p => {
      const fileContents = await readFile(p.path);fs.createReadStream(p.path);
      const contentsAsJson = matter(fileContents.toString()).data;
      const basename = path.basename(p.path, '.md');
      const hash = crypto.createHmac('sha256', SECRET_HASH_SALT).update(basename).digest('hex').slice(0, HASH_LENGTH);
      const bucketPath = path.join(DESTINATION_DIR, `${basename}-${hash}`, `${DESTINATION_FILENAME}.json`);
      await uploadShowConfigs(contentsAsJson);
      const params = {
        Bucket: BUCKET,
        ACL: 'public-read',
        Body: JSON.stringify(contentsAsJson, null, 2),
        Key: bucketPath,
        ContentType: 'application/json'
      };
      return upload(params);
    })
  );
}

run()
  .then(locations => {
    core.info(`config locations - ${locations}`);
    core.setOutput('locations', locations);
  })
  .catch(err => {
    core.error(err);
    core.setFailed(err.message);
  });
