require('dotenv').config();
const _cliProgress = require('cli-progress');

const { owner, repo, octokitConfig, octokitAuth } = require('../constants');

const octokit = require('@octokit/rest')(octokitConfig);
const { getRange, getCount } = require('./pr-stats');

octokit.authenticate(octokitAuth);

const paginate = async function paginate (method, octokit, firstPR, lastPR, prPropsToGet, progressBar) {

  const prFilter = (prs, first, last, prPropsToGet) => {
    const filtered = [];
    for (let pr of prs) {
      if (pr.number >= first && pr.number <= last) {
        const propsObj = prPropsToGet.reduce((obj, prop) => {
          obj[prop] = pr[prop];
          return obj;
        } ,{});
        filtered.push(propsObj);
      }
      if (pr.number >= last) {
        done = true;
        return filtered;
      }
    }
    return filtered;
  };

  const methodProps = {
    owner,  repo, state: 'open',
    base: 'master',  sort: 'created',
    direction: 'asc', page: 1, per_page: 100
  };

  let done = false; // will be true when lastPR is seen in paginated results
  let response = await method(methodProps);
  let { data } = response;
  data = prFilter(data, firstPR, lastPR, prPropsToGet);
  while (octokit.hasNextPage(response) && !done ) {
    response = await octokit.getNextPage(response);
    let dataFiltered = prFilter(response.data, firstPR, lastPR, prPropsToGet);
    data = data.concat(dataFiltered);
    progressBar.increment(dataFiltered.length);
  }
  return data;
};

const getUserInput = async () => {
  let [ n, f, type, start, end ] = process.argv;
  let [ firstPR, lastPR ] = await getRange().then(data => data);
  if (type !== 'all' && type !== 'range') {
    throw `Please specify either all or range for 1st arg.`;
  }
  if (type === 'range') {
    start = parseInt(start);
    end = parseInt(end);
    if (!start || !end) {
      throw `Please specify both a starting PR # (2nd arg) and ending PR # (3rd arg).`;
    }
    if (start > end) {
      throw `Starting PR # must be less than or equal to end PR #.`;
    }
    if (start < firstPR)  {
      throw `Starting PR # can not be less than first open PR # (${firstPR})`;
    }
    firstPR = start
    if (end > lastPR)  {
      throw `Ending PR # can not be greater than last open PR # (${lastPR})`;
    }
    lastPR = end;
  }
  const totalPRs = await getCount().then(data => data);
  return {totalPRs, firstPR, lastPR};
};

const getPRs = async (totalPRs, firstPR, lastPR, prPropsToGet) => {
  const getPRsBar = new _cliProgress.Bar({
    format: `Part 1 of 2: Retrieving PRs (${firstPR}-${lastPR}) [{bar}] {percentage}%`
  }, _cliProgress.Presets.shades_classic);
  getPRsBar.start(totalPRs, 0);
  let openPRs = await paginate(octokit.pullRequests.list, octokit, firstPR, lastPR, prPropsToGet, getPRsBar);
  getPRsBar.update(totalPRs);
  getPRsBar.stop();
  console.log(`# of PRs retrieved: ${openPRs.length}`);
  return { firstPR, lastPR, openPRs };
}

module.exports = { getPRs, getUserInput };
