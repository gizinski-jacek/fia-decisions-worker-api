import { dbNameList, fiaPageList, supportedSeries } from '../myData/myData';
var Queue = require('bull');
var express = require('express');

const router = express.Router();

// Connect to a local redis intance locally, and the Heroku-provided URL in production
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
// Create / Connect to a named work queue
const workQueue = new Queue('worker', REDIS_URL);

// Handle GET for bulk document update requests.
router.get('/', (req: any, res: any, next: any) => {
	return res.send(
		`<main>
				<h2>FIA Penalties backend API.</h2>
				<h3>Handles bulk document updating.</h3>
				<p><a href=https://github.com/gizinski-jacek/fia-penalties-bulk-update-api>Backend API Github Repository</a></p>
				<p><a href=https://github.com/gizinski-jacek/fia-decisions>NextJS Client Github Repository</a></p>
			</main>`
	);
});

router.get(
	'/update-newest/penalties/:series/:year?',
	async function (req: any, res: any, next: any) {
		// This would be where you could pass arguments to the job
		// Ex: workQueue.add({ url: 'https://www.heroku.com' })
		// Docs: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd
		try {
			if (!process.env.CRON_JOB_UPDATE_NEWEST_SECRET) {
				throw new Error(
					'Please define CRON_JOB_UPDATE_NEWEST_SECRET environment variable inside .env.local'
				);
			}
			const { authorization } = req.headers;
			if (
				authorization === `Bearer ${process.env.CRON_JOB_UPDATE_NEWEST_SECRET}`
			) {
				const series = supportedSeries.find(
					(s) => s === req.params.series.toLowerCase()
				);
				const year = req.params.year || new Date().getFullYear().toString();
				if (!series) {
					return res.status(422).json('Unsupported series.');
				}
				const seriesYearDB = dbNameList[`${series}_${year}_db`];
				const seriesYearPageURL = fiaPageList[`${series}_${year}_page`];
				if (!seriesYearDB || !seriesYearPageURL) {
					return res.status(422).json('Unsupported year.');
				}
				const job = await workQueue.add('update-newest', {
					series,
					year,
					seriesYearDB,
					seriesYearPageURL,
				});
				return res.status(202).json({ id: job.id });
			} else {
				return res.status(401).end();
			}
		} catch (error: any) {
			console.log(error);
			return res.status(500).end();
		}
	}
);

router.get(
	'/update-all/penalties/:series/:year?',
	async function (req: any, res: any, next: any) {
		// This would be where you could pass arguments to the job
		// Ex: workQueue.add({ url: 'https://www.heroku.com' })
		// Docs: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd
		try {
			if (!process.env.CRON_JOB_UPDATE_ALL_SECRET) {
				throw new Error(
					'Please define CRON_JOB_UPDATE_ALL_SECRET environment variable inside .env.local'
				);
			}
			const { authorization } = req.headers;
			if (
				authorization === `Bearer ${process.env.CRON_JOB_UPDATE_ALL_SECRET}`
			) {
				const series = supportedSeries.find(
					(s) => s === req.params.series.toLowerCase()
				);
				const year = req.params.year || new Date().getFullYear().toString();
				if (!series) {
					return res.status(422).json('Unsupported series.');
				}
				const seriesYearDB = dbNameList[`${series}_${year}_db`];
				const seriesYearPageURL = fiaPageList[`${series}_${year}_page`];
				if (!seriesYearDB || !seriesYearPageURL) {
					return res.status(422).json('Unsupported year.');
				}
				const job = await workQueue.add('update-all', {
					series,
					year,
					seriesYearDB,
					seriesYearPageURL,
				});
				return res.status(202).json({ id: job.id });
			} else {
				return res.status(401).end();
			}
		} catch (error: any) {
			console.log(error);
			return res.status(500).end();
		}
	}
);

module.exports = router;
