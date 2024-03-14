import connectMongoDb from './mongo/mongo';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { readPDFPages } from './utils/pdfReader';
import { streamToBuffer } from './utils/streamToBuffer';
import { createPenaltyDocument } from './utils/transformToPenaltyDoc';
import { disallowedWordsInDocName, fiaDomain } from './myData/myData';

import throng from 'throng';
import Queue from 'bull';

// Connect to a local redis instance locally, and the Heroku-provided URL in production.
const REDIS_URL =
	process.env.NODE_ENV === 'production'
		? process.env.REDIS_URL
		: 'redis://127.0.0.1:6379';

// Spin up multiple processes to handle jobs to take advantage of more CPU cores.
// See: https://devcenter.heroku.com/articles/node-concurrency for more info.
const workers = process.env.WEB_CONCURRENCY || 2;

// The maximum number of jobs each worker should process at once. This will need to
// be tuned for your application.If each job is mostly waiting on network responses
// it can be much higher.If each job is CPU - intensive, it might need to be much lower.
const maxJobsPerWorker = 1;

function start() {
	if (!REDIS_URL) {
		throw new Error(
			'Please define the REDIS_URL environment variable inside .env.local'
		);
	}
	// Connect to the named work queue.
	let workQueue = new Queue('worker', REDIS_URL);
	// Processing named jobs.
	// Updating with newest documents for the specified year.
	workQueue.process('update-newest', maxJobsPerWorker, async (job) => {
		try {
			const connectionSeriesYearDb = await connectMongoDb(
				job.data.seriesYearDB
			);
			const docList = await connectionSeriesYearDb.models.Penalty_Doc.find()
				.sort({ doc_date: -1 })
				.limit(1)
				.exec();
			// If no documents found in db, create a new update-all job.
			if (docList.length === 0) {
				const delegate = await workQueue.add('update-all', {
					series: job.data.series,
					year: job.data.year,
					seriesYearDB: job.data.seriesYearDB,
					seriesYearPageURL: job.data.seriesYearPageURL,
				});
				return {
					status: `No documents found in db, delegating to update-all worker.`,
					initial_job_id: job.id,
					delegated_to_job_id: delegate.id,
					series: delegate.data.series,
					year: delegate.data.year,
				};
			}
			const responseSite = await axios.get(job.data.seriesYearPageURL, {
				timeout: 15000,
			});
			const { document } = new JSDOM(responseSite.data).window;
			const listView: HTMLElement | null = document.getElementById('list-view');
			if (!listView) {
				throw new Error('Error getting page with penalties.');
			}
			const mainDoc: HTMLDivElement | null = listView.querySelector(
				'.decision-document-list'
			);
			if (!mainDoc) {
				throw new Error('Error getting list of penalties.');
			}
			const allDocAnchors: NodeList = mainDoc.querySelectorAll('a');
			const allDocsHref: string[] = [];
			allDocAnchors.forEach((link: any) => {
				const fileName = link.href
					.slice(link.href.lastIndexOf('/') + 1)
					.trim()
					.toLowerCase();
				const disallowedDoc = disallowedWordsInDocName.some((str) =>
					fileName.toLowerCase().includes(str)
				);
				if (
					!disallowedDoc &&
					((fileName.includes('decision') && fileName.includes('car')) ||
						(fileName.includes('offence') && fileName.includes('car')) ||
						(fileName.includes('infringment') && fileName.includes('car')) ||
						(fileName.includes('infringement') && fileName.includes('car')))
				) {
					const published = link.querySelector(
						'.date-display-single'
					)?.textContent;
					if (!published) {
						allDocsHref.push(link.href);
						return;
					}
					const dateAndTime = published.split(' ');
					const dateStrings = dateAndTime[0].split('.');
					const reformattedDate =
						'20' +
						dateStrings[2] +
						'/' +
						dateStrings[1] +
						'/' +
						dateStrings[0] +
						' ' +
						dateAndTime[1];
					if (
						new Date(reformattedDate).getTime() + 24 * 60 * 60 * 1000 >=
						new Date(docList[0].doc_date).getTime()
					) {
						allDocsHref.push(link.href);
						return;
					}
				}
			});
			if (allDocsHref.length === 0) {
				return {
					status: 'Documents are up to date.',
					series: job.data.series,
					year: job.data.year,
					new_documents_found: allDocsHref.length,
				};
			}
			console.log(`Total number of new documents: ${allDocsHref.length}.`);
			const results = await Promise.allSettled(
				allDocsHref.map(
					(href, i) =>
						new Promise((resolve, reject) =>
							setTimeout(async () => {
								try {
									const responseFile = await axios.get(fiaDomain + href, {
										responseType: 'stream',
										timeout: 15000,
									});
									const fileBuffer = await streamToBuffer(responseFile.data);
									const readPDF = await readPDFPages(fileBuffer);
									const transformed = createPenaltyDocument(
										href,
										readPDF as any,
										job.data.series as 'f1' | 'f2' | 'f3'
									);
									const docExists =
										await connectionSeriesYearDb.models.Penalty_Doc.findOne({
											series: transformed.series,
											doc_type: transformed.doc_type,
											doc_name: transformed.doc_name,
											doc_date: transformed.doc_date,
											penalty_type: transformed.penalty_type,
											grand_prix: transformed.grand_prix,
											weekend: transformed.weekend,
											incident_title: transformed.incident_title,
										});
									if (docExists) {
										console.log('Document already exists. Skipping.');
										resolve(null);
										return;
									}
									await connectionSeriesYearDb.models.Penalty_Doc.create({
										...transformed,
										manual_upload: false,
									});
									resolve(null);
								} catch (error: any) {
									reject(error);
								}
							}, 2000 * i)
						)
				)
			);
			return {
				status: 'Finished updating new documents.',
				series: job.data.series,
				year: job.data.year,
				new_documents_found: allDocsHref.length,
				new_documents_processed: results.length,
				successes: results.filter((obj) => obj.status === 'fulfilled').length,
				failures: results.filter((obj) => obj.status === 'rejected').length,
			};
		} catch (error: any) {
			console.log(error);
			return { error };
		}
	});

	// Updating all documents for the specified year.
	workQueue.process('update-all', maxJobsPerWorker, async (job) => {
		try {
			const responseSite = await axios.get(job.data.seriesYearPageURL, {
				timeout: 15000,
			});
			const { document } = new JSDOM(responseSite.data).window;
			const listView: HTMLElement | null = document.getElementById('list-view');
			if (!listView) {
				throw new Error('Error getting page with penalties.');
			}
			const mainDoc: HTMLDivElement | null = listView.querySelector(
				'.decision-document-list'
			);
			if (!mainDoc) {
				throw new Error('Error getting list of penalties.');
			}
			const allDocAnchors: NodeList = mainDoc.querySelectorAll('a');
			const allDocsHref: string[] = [];
			allDocAnchors.forEach((link: any) => {
				const fileName = link.href
					.slice(link.href.lastIndexOf('/') + 1)
					.trim()
					.toLowerCase();
				const disallowedDoc = disallowedWordsInDocName.some((str) =>
					fileName.toLowerCase().includes(str)
				);
				if (
					!disallowedDoc &&
					((fileName.includes('decision') && fileName.includes('car')) ||
						(fileName.includes('offence') && fileName.includes('car')) ||
						(fileName.includes('infringment') && fileName.includes('car')) ||
						(fileName.includes('infringement') && fileName.includes('car')))
				) {
					allDocsHref.push(link.href);
				}
			});
			if (allDocsHref.length === 0) {
				return {
					status: 'No valid documents found.',
					series: job.data.series,
					year: job.data.year,
					new_documents_found: allDocsHref.length,
				};
			}
			console.log(`Total number of scraped documents: ${allDocsHref.length}.`);
			const connectionSeriesYearDb = await connectMongoDb(
				job.data.seriesYearDB
			);
			const results = await Promise.allSettled(
				allDocsHref.map(
					(href, i) =>
						new Promise<void>((resolve, reject) =>
							setTimeout(async () => {
								try {
									const responseFile = await axios.get(fiaDomain + href, {
										responseType: 'stream',
										timeout: 15000,
									});
									const fileBuffer = await streamToBuffer(responseFile.data);
									const readPDF = await readPDFPages(fileBuffer);
									const transformed = createPenaltyDocument(
										href,
										readPDF as any,
										job.data.series as 'f1' | 'f2' | 'f3'
									);
									const docExists =
										await connectionSeriesYearDb.models.Penalty_Doc.findOne({
											series: transformed.series,
											doc_type: transformed.doc_type,
											doc_name: transformed.doc_name,
											doc_date: transformed.doc_date,
											penalty_type: transformed.penalty_type,
											grand_prix: transformed.grand_prix,
											weekend: transformed.weekend,
											incident_title: transformed.incident_title,
										});
									if (docExists) {
										console.log('Document already exists. Skipping.');
										resolve();
										return;
									}
									await connectionSeriesYearDb.models.Penalty_Doc.create({
										...transformed,
										manual_upload: false,
									});
									resolve();
								} catch (error: any) {
									console.log(error);
									reject(error);
								}
							}, 2000 * i)
						)
				)
			);
			return {
				status: 'Finished updating all documents.',
				series: job.data.series,
				year: job.data.year,
				documents_found: allDocsHref.length,
				documents_processed: results.length,
				successes: results.filter((obj) => obj.status === 'fulfilled').length,
				failures: results.filter((obj) => obj.status === 'rejected').length,
			};
		} catch (error: any) {
			console.log(error);
			return { error };
		}
	});
}

// Initialize the clustered worker process
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
throng({ workers, start });
