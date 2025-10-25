// This file now acts as a wrapper/redirect to the new database layer
// All utils files that require('./data') will automatically use the database

module.exports = require('../database/queries');
