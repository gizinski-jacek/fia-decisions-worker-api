import connectMongoDb from '../mongo/mongo';
import { fiaDomain, supportedSeries } from '../myData/myData';
import { SeriesDataDocModel } from 'types/myTypes';
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
				<p><a href=https://github.com/gizinski-jacek/fia-decisions-worker-api>Backend API Github Repository</a></p>
				<p><a href=https://github.com/gizinski-jacek/fia-decisions>NextJS Client Github Repository</a></p>
			</main>`
	);
});

router.get(
	'/update-penalties-newest/penalties/:series/:year',
	async function (req: any, res: any, next: any) {
		// This would be where you could pass arguments to the job
		// Ex: workQueue.add({ url: 'https://www.heroku.com' })
		// Docs: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd
		try {
			const { UPDATE_PENALTIES_NEWEST_SECRET } = process.env;
			if (!UPDATE_PENALTIES_NEWEST_SECRET) {
				throw new Error(
					'Please define UPDATE_PENALTIES_NEWEST_SECRET environment variable inside .env.local'
				);
			}
			const { authorization } = req.headers;
			if (authorization === `Bearer ${UPDATE_PENALTIES_NEWEST_SECRET}`) {
				const series: string = req.params.series;
				const year: string = req.params.year;
				if (!series) {
					return res.status(422).json('Must provide a Series.');
				}
				if (!year) {
					return res.status(422).json('Must provide a Year.');
				}
				const seriesValid = supportedSeries.find(
					(s) => s.toLowerCase() === series.toLowerCase()
				);
				if (!seriesValid) {
					return res.status(422).json('Unsupported Series.');
				}
				const connectionSeriesDataDb = await connectMongoDb('Series_Data');
				const document_list_series_data: SeriesDataDocModel[] =
					await connectionSeriesDataDb.models.Series_Data_Doc.find({
						series: seriesValid,
					})
						.sort({ year: -1 })
						.exec();
				const dataExists = document_list_series_data.find(
					(doc) =>
						doc.series.toLowerCase() === seriesValid.toLowerCase() &&
						doc.year === parseInt(year)
				);
				if (!dataExists) {
					return res.status(422).json('Unsupported Year.');
				}
				if (!dataExists.documents_url) {
					return res
						.status(422)
						.json(
							'Missing FIA page URL. Unsupported Series, Year or Database error.'
						);
				}
				if (!dataExists.documents_url.includes(fiaDomain)) {
					return res
						.status(422)
						.json(
							'URL does not seem to point to https://www.fia.com domain. Aborting.'
						);
				}
				const seriesYearDb = `${
					dataExists.year
				}_${dataExists.series.toUpperCase()}_WC_Docs`;
				const job = await workQueue.add('update-penalties-all', {
					series: dataExists.series,
					year: dataExists.year,
					seriesYearDb: seriesYearDb,
					seriesYearPageURL: dataExists.documents_url,
				});
				return res.status(202).json({ id: job.id });
			} else {
				return res.status(401).end();
			}
		} catch (error: any) {
			return res.status(500).end();
		}
	}
);

router.get(
	'/update-penalties-all/penalties/:series/:year',
	async function (req: any, res: any, next: any) {
		// This would be where you could pass arguments to the job
		// Ex: workQueue.add({ url: 'https://www.heroku.com' })
		// Docs: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd
		try {
			const { UPDATE_PENALTIES_ALL_SECRET } = process.env;
			if (!UPDATE_PENALTIES_ALL_SECRET) {
				throw new Error(
					'Please define UPDATE_PENALTIES_ALL_SECRET environment variable inside .env.local'
				);
			}
			const { authorization } = req.headers;
			if (authorization === `Bearer ${UPDATE_PENALTIES_ALL_SECRET}`) {
				const series: string = req.params.series;
				const year: string = req.params.year;
				if (!series) {
					return res.status(422).json('Must provide a Series.');
				}
				if (!year) {
					return res.status(422).json('Must provide a Year.');
				}
				const seriesValid = supportedSeries.find(
					(s) => s.toLowerCase() === series.toLowerCase()
				);
				if (!seriesValid) {
					return res.status(422).json('Unsupported Series.');
				}
				const connectionSeriesDataDb = await connectMongoDb('Series_Data');
				const document_list_series_data: SeriesDataDocModel[] =
					await connectionSeriesDataDb.models.Series_Data_Doc.find({
						series: seriesValid,
					})
						.sort({ year: -1 })
						.exec();
				const dataExists = document_list_series_data.find(
					(doc) =>
						doc.series.toLowerCase() === seriesValid.toLowerCase() &&
						doc.year === parseInt(year)
				);
				if (!dataExists) {
					return res.status(422).json('Unsupported Year.');
				}
				if (!dataExists.documents_url) {
					return res
						.status(422)
						.json(
							'Missing FIA page URL. Unsupported Series, Year or Database error.'
						);
				}
				if (!dataExists.documents_url.includes(fiaDomain)) {
					return res
						.status(422)
						.json(
							'URL does not seem to point to https://www.fia.com domain. Aborting.'
						);
				}
				const seriesYearDb = `${
					dataExists.year
				}_${dataExists.series.toUpperCase()}_WC_Docs`;
				const job = await workQueue.add('update-penalties-all', {
					series: dataExists.series,
					year: dataExists.year,
					seriesYearDb: seriesYearDb,
					seriesYearPageURL: dataExists.documents_url,
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
	'/update-series-data',
	async function (req: any, res: any, next: any) {
		// This would be where you could pass arguments to the job
		// Ex: workQueue.add({ url: 'https://www.heroku.com' })
		// Docs: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd
		try {
			const { AUTO_UPDATE_SERIES_DATA_SECRET } = process.env;
			if (!AUTO_UPDATE_SERIES_DATA_SECRET) {
				throw new Error(
					'Please define AUTO_UPDATE_SERIES_DATA_SECRET environment variable inside .env.local'
				);
			}
			const { authorization } = req.headers;
			if (authorization === `Bearer ${AUTO_UPDATE_SERIES_DATA_SECRET}`) {
				const job = await workQueue.add('update-series-data');
				return res.status(202).json({ id: job.id });
			} else {
				return res.status(401).end();
			}
		} catch (error: any) {
			return res.status(500).end();
		}
	}
);

module.exports = router;
