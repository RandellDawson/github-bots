require('dotenv').config();

const path = require('path');
const fs = require('fs');
const formatDate = require('date-fns/format');

const { owner, repo, fccBaseUrl, prBaseUrl } = require('./constants');
const { saveToFile, openJSONFile } = require('./fileFunctions');
const { octokitConfig, octokitAuth } = require('./octokitConfig');
const octokit = require('@octokit/rest')(octokitConfig);
const { getOpenPrs, getPrRange } = require('./getOpenPrs');
const { validLabels } = require('./validLabels');
const { addLabels } = require('./addLabels');
const { guideFolderChecks } = require('./guideFolderChecks');
const { addComment } = require('./addComment');
const { rateLimiter, savePrData } = require('./utils');

octokit.authenticate(octokitAuth);

const { PrProcessingLog } = require('./prProcessingLog');
const log = new PrProcessingLog();

const prPropsToGet = ['number', 'labels', 'user'];

(async () => {
  const { firstPR, lastPR } = await getPrRange();
  const { openPRs } = await getOpenPrs(firstPR, lastPR, prPropsToGet);

  if (openPRs.length) {
    savePrData(openPRs, firstPR, lastPR);

    log.start();
    console.log('Starting labeling process...');
    for (let count = 0; count < openPRs.length; count++) {
      let { number, labels, user: { login: username } } = openPRs[count];
      const { data: prFiles } = await octokit.pullRequests.getFiles({ owner, repo, number });
      log.add(number, 'labels', 'comment');
      const labelsToAdd = {}; // holds potential labels to add based on file path

      const guideFolderErrorsComment = guideFolderChecks(prFiles, username);
      if (guideFolderErrorsComment) {
        log.update(number, 'comment', guideFolderErrorsComment);
        if (process.env.PRODUCTION_RUN === 'true') {
          const result = await addComment(number, guideFolderErrorsComment);
        }
        await rateLimiter(process.env.RATELIMIT_INTERVAL | 1500);
        labelsToAdd['status: needs update'] = 1;
      }
      else {
        log.update(number, 'comment', 'not added');
      }

      const existingLabels = labels.map(({ name }) => name);

      prFiles.forEach(({ filename }) => {
        /* remove '/challenges' from filename so language variable hold the language */
        const filenameReplacement = filename.replace(/^curriculum\/challenges\//, 'curriculum\/');
        const regex = /^(docs|curriculum|guide)(?:\/)(arabic|chinese|portuguese|russian|spanish)?\/?/
        const [ _, articleType, language ] = filenameReplacement.match(regex) || []; // need an array to pass to labelsAdder

        if (articleType && validLabels[articleType]) {
          labelsToAdd[validLabels[articleType]] = 1
        }
        if (language && validLabels[language]) {
          labelsToAdd[validLabels[language]] = 1
        }
        if (articleType === 'curriculum') {
          labelsToAdd['status: need to test locally'] = 1;
        }
      })

      /* this next section only adds needed labels which are NOT currently on the PR. */
      const newLabels = Object.keys(labelsToAdd).filter(label => !existingLabels.includes(label));
      if (newLabels.length) {
        log.update(number, 'labels', newLabels);
        if (process.env.PRODUCTION_RUN === 'true') {
          addLabels(number, newLabels, log);
        }
        await rateLimiter(process.env.RATELIMIT_INTERVAL | 1500);
      }
      else {
        log.update(number, 'labels', 'none added');
      }
      if (count % 25 === 0) {
        log.export()
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
  console.log(err)
})
