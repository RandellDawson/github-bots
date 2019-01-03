require('dotenv').config();
const { closeOpen } = require('../lib/pr-tasks');
const { openJSONFile, ProcessingLog, rateLimiter } = require('../lib/utils');

const log = new ProcessingLog('prs-closed-reopened');

log.start();
const getUserInput = async() => {
  let [ n, f, filename ] = process.argv;

  if (!filename) {
    throw 'Specify a file with PRs which needed to be closed and reopened.';
  }

  let fileObj = openJSONFile(filename);
  let { prs } = fileObj;
  if (!prs.length) {
    throw 'Either no PRs found in file or there or an error occurred.';
  }
  return { prs };
};

(async() => {
  const { prs } = await getUserInput();
  return prs;
})()
.then(async(prs) => {
  for (let { number, errorDesc } of prs) {
    if (errorDesc !== 'unknown error') {
      log.add(number, { number, closedOpened: true, errorDesc });
      if (process.env.PRODUCTION_RUN === 'true') {
         await closeOpen(number);
         await rateLimiter(90000);
      }
    } else {
      log.add(number, { number, closedOpened: false, errorDesc });
    }
  }
})
.then(() => {
  log.finish();
  console.log('closing/reopening of PRs complete');
})
.catch(err => {
  log.finish();
  console.log(err);
});
