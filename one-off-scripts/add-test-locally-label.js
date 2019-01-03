/*
This is a one-off script to run on all open PRs to add the
"status: need to test locally" label to any PR with an existing
"scope: curriculum" label on it.
*/

require('dotenv').config();

const { getPRs, getUserInput } = require('../lib/get-prs');
const { addLabels } = require('../lib/pr-tasks');
const { rateLimiter, savePrData, ProcessingLog } = require('../lib/utils');

const log = new ProcessingLog('all-locally-tested-labels');

(async() => {
  const { totalPRs, firstPR, lastPR } = await getUserInput();
  const prPropsToGet = ['number', 'labels'];
  const { openPRs } = await getPRs(totalPRs, firstPR, lastPR, prPropsToGet);

  if (openPRs.length) {
    savePrData(openPRs, firstPR, lastPR);
    log.start();
    console.log('Starting labeling process...');
    for (let count = 0; count < openPRs.length; count++) {
      let { number, labels } = openPRs[count];
      // holds potential labels to add based on file path
      const labelsToAdd = {};
      const existingLabels = labels.map(({ name }) => name);
      if (existingLabels.includes('scope: curriculum')) {
        labelsToAdd['status: need to test locally'] = 1;
      }

      /* only adds needed labels which are NOT currently on the PR. */
      const newLabels = Object.keys(labelsToAdd).filter(label => {
        return !existingLabels.includes(label);
      });
      if (newLabels.length) {
        log.add(number, { labels: newLabels });
        if (process.env.PRODUCTION_RUN === 'true') {
          addLabels(number, newLabels, log);
          await rateLimiter(+process.env.RATELIMIT_INTERVAL || 1500);
        }
      } else {
        log.add(number, { number, labels: 'none added' });
      }
    }
  }
})()
.then(() => {
  log.finish();
  console.log('Successfully completed labeling');
})
.catch(err => {
  log.finish();
  console.log(err);
});
