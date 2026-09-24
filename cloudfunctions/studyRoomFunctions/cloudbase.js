const cloudbase = require("@cloudbase/node-sdk");

const ENV_ID = process.env.CLOUDBASE_ENV_ID || "cloud1-d5g8q89yd66340db4";

const initOptions = { env: ENV_ID };
if (process.env.CLOUDBASE_SECRETID) initOptions.secretId = process.env.CLOUDBASE_SECRETID;
if (process.env.CLOUDBASE_SECRETKEY) initOptions.secretKey = process.env.CLOUDBASE_SECRETKEY;

const app = cloudbase.init(initOptions);

const rdbOptions = {};
if (process.env.CLOUDBASE_MYSQL_INSTANCE) rdbOptions.instance = process.env.CLOUDBASE_MYSQL_INSTANCE;
if (process.env.CLOUDBASE_MYSQL_DATABASE) rdbOptions.database = process.env.CLOUDBASE_MYSQL_DATABASE;
const db = Object.keys(rdbOptions).length ? app.rdb(rdbOptions) : app.rdb();

module.exports = { app, db, ENV_ID };
