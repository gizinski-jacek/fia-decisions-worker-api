import connectMongoDb from './mongo/mongo';
import axios from 'axios';
import puppeteer, { Browser, Page } from 'puppeteer';
import { readPDFPages } from './utils/pdfReader';
import { streamToBuffer } from './utils/streamToBuffer';
import { createPenaltyDocument } from './utils/transformToPenaltyDoc';
import {
	disallowedWordsInDocName,
	fiaDomain,
	seriesDocumentsPage,
} from './myData/myData';

import throng from 'throng';
import Queue from 'bull';
import { PenaltyModel, SeriesData } from 'types/myTypes';

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
	// Update with newest documents for the specified year.
	workQueue.process(
		'update-penalties-newest',
		maxJobsPerWorker,
		async (job) => {
			const browser: Browser = await puppeteer.launch({
				headless: true,
				defaultViewport: null,
			});
			try {
				const connectionSeriesYearDb = await connectMongoDb(
					job.data.seriesYearDb
				);
				const docList: PenaltyModel[] =
					await connectionSeriesYearDb.models.Penalty_Doc.find()
						.sort({ doc_date: -1 })
						.limit(1)
						.exec();
				// If no documents found in db, create a new update-penalties-all job.
				if (docList.length === 0) {
					const delegate = await workQueue.add('update-penalties-all', {
						series: job.data.series,
						year: job.data.year,
						seriesYearDb: job.data.seriesYearDb,
						seriesYearPageURL: job.data.seriesYearPageURL,
					});
					return {
						status: `No documents found in db, delegating to update-penalties-all worker.`,
						initial_job_id: job.id,
						delegated_to_job_id: delegate.id,
						series: delegate.data.series,
						year: delegate.data.year,
					};
				}
				const fiaPage: Page = await browser.newPage();
				await fiaPage.goto(job.data.seriesYearPageURL, {
					waitUntil: 'networkidle2',
					timeout: 90000,
				});
				await fiaPage.$$eval('a.event-title.use-ajax', (array) =>
					array.forEach((anchor) => anchor.click())
				);
				await new Promise((resolve) => setTimeout(resolve, 10000));
				const allDocsAnchors = await fiaPage.$$(
					'a[download=""][target="_blank"]'
				);
				const promises = allDocsAnchors.map(async (anchor) => {
					const href = await (await anchor.getProperty('href')).jsonValue();
					const published = await anchor.$eval(
						'.date-display-single',
						(p) => p.textContent
					);
					return {
						href: href.includes(fiaDomain) ? href : fiaDomain + href,
						published: published,
					};
				});
				const allDocsData = await Promise.all(promises);
				const allDocsHref: string[] = allDocsData
					.map((data) => {
						if (!data.href || !data.published) return;
						const fileName = data.href
							.slice(data.href.lastIndexOf('/') + 1)
							.trim()
							.toLowerCase();
						const disallowedDoc = disallowedWordsInDocName.some((str) =>
							fileName.toLowerCase().includes(str)
						);
						if (
							!disallowedDoc &&
							fileName.includes('car') &&
							(fileName.includes('decision') ||
								fileName.includes('offence') ||
								fileName.includes('infringment') ||
								fileName.includes('infringement'))
						) {
							const dateStrings = data.published.replace(' ', '.').split('.');
							const reformattedDate =
								new Date().getFullYear().toString().slice(0, -2) +
								dateStrings[2] +
								'-' +
								dateStrings[1] +
								'-' +
								dateStrings[0] +
								'T' +
								dateStrings[3];
							if (
								new Date(reformattedDate).getTime() + 24 * 60 * 60 * 1000 >=
								new Date(docList[0].doc_date).getTime()
							) {
								return data.href;
							}
						}
					})
					.filter((v) => v !== undefined) as string[];
				if (allDocsHref.length === 0) {
					return {
						status: 'Documents are up to date.',
						series: job.data.series,
						year: job.data.year,
					};
				}
				console.log(
					`Total number of new ${job.data.series} ${job.data.year} documents: ${allDocsHref.length}.`
				);
				const results = await Promise.allSettled(
					allDocsHref.map(
						(href, i) =>
							new Promise((resolve, reject) =>
								setTimeout(async () => {
									try {
										const responseFile = await axios.get(
											href.includes(fiaDomain) ? href : fiaDomain + href,
											{ responseType: 'stream', timeout: 15000 }
										);
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
												pdf_original_url: transformed.pdf_original_url,
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
										console.log(error);
										console.log(
											'Errored file URL: ' + href.includes(fiaDomain)
												? href
												: fiaDomain + href
										);
										reject(error);
									}
								}, 2000 * i)
							)
					)
				);
				browser.close();
				return {
					status: 'Finished updating newest documents.',
					series: job.data.series,
					year: job.data.year,
					new_documents_found: allDocsHref.length,
					new_documents_processed: results.length,
					successes: results.filter((obj) => obj.status === 'fulfilled').length,
					failures: results.filter((obj) => obj.status === 'rejected').length,
				};
			} catch (error: any) {
				browser.close();
				console.log(error);
				return { error };
			}
		}
	);

	// Update all documents for the specified year.
	workQueue.process('update-penalties-all', maxJobsPerWorker, async (job) => {
		const browser: Browser = await puppeteer.launch({
			headless: true,
			defaultViewport: null,
		});
		try {
			const fiaPage: Page = await browser.newPage();
			await fiaPage.goto(job.data.seriesYearPageURL, {
				waitUntil: 'networkidle2',
				timeout: 90000,
			});
			await fiaPage.$$eval('a.event-title.use-ajax', (array) =>
				array.forEach((anchor) => anchor.click())
			);
			await new Promise((resolve) => setTimeout(resolve, 10000));
			const allDocsAnchors: string[] = await fiaPage.$$eval(
				'a[download=""][target="_blank"]',
				(array) => array.map((a) => a.href)
			);
			const allDocsHref: string[] = allDocsAnchors
				.map((href) => {
					const fileName = href
						.slice(href.lastIndexOf('/') + 1)
						.trim()
						.toLowerCase();
					const disallowedDoc = disallowedWordsInDocName.some((str) =>
						fileName.toLowerCase().includes(str)
					);
					if (
						!disallowedDoc &&
						fileName.includes('car') &&
						(fileName.includes('decision') ||
							fileName.includes('offence') ||
							fileName.includes('infringment') ||
							fileName.includes('infringement'))
					) {
						return href;
					}
				})
				.filter((v) => v !== undefined) as string[];
			if (allDocsHref.length === 0) {
				return {
					status: 'No valid documents found.',
					series: job.data.series,
					year: job.data.year,
				};
			}
			console.log(
				`Total number of all scraped ${job.data.series} ${job.data.year} documents: ${allDocsHref.length}.`
			);
			const connectionSeriesYearDb = await connectMongoDb(
				job.data.seriesYearDb
			);
			const results = await Promise.allSettled(
				allDocsHref.map(
					(href, i) =>
						new Promise<void>((resolve, reject) =>
							setTimeout(async () => {
								try {
									const responseFile = await axios.get(
										href.includes(fiaDomain) ? href : fiaDomain + href,
										{ responseType: 'stream', timeout: 15000 }
									);
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
											pdf_original_url: transformed.pdf_original_url,
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
									console.log(
										'Errored file URL: ' + href.includes(fiaDomain)
											? href
											: fiaDomain + href
									);
									reject(error);
								}
							}, 2000 * i)
						)
				)
			);
			browser.close();
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
			browser.close();
			console.log(error);
			return { error };
		}
	});

	// Acquire years supported by each series from FIA website.
	workQueue.process('update-series-data', maxJobsPerWorker, async () => {
		const browser: Browser = await puppeteer.launch({
			headless: true,
			defaultViewport: null,
		});
		try {
			const getYears = async (
				series: string,
				url: string
			): Promise<SeriesData[]> => {
				const fiaPage: Page = await browser.newPage();
				await fiaPage.goto(url, {
					waitUntil: 'networkidle2',
					timeout: 90000,
				});
				const selectList = await fiaPage.$(
					'select#facetapi_select_facet_form_3'
				);
				if (!selectList) {
					throw new Error('Error getting years select element list.');
				}
				const allOptionsValues: string[] = await selectList.$$eval(
					'option',
					(array) => array.map((option) => option.value)
				);
				if (allOptionsValues === null) {
					throw new Error('Error getting select element options values.');
				}
				const seriesDataObj: SeriesData[] = allOptionsValues
					.map((value) => {
						if (!value || !value.includes('documents')) return;
						const optionYear = value
							.slice(value.lastIndexOf('/') + 1)
							.trim()
							.split('-')[1];
						const doc = {
							series: series,
							year: parseInt(optionYear),
							documents_url: value.includes(fiaDomain)
								? value
								: fiaDomain + value,
						};
						return doc;
					})
					.filter((v) => v !== undefined) as SeriesData[];
				return seriesDataObj;
			};
			const allSeriesDataObj: SeriesData[] = [];
			for (let [series, url] of Object.entries(seriesDocumentsPage)) {
				allSeriesDataObj.push(...(await getYears(series, url)));
			}
			if (allSeriesDataObj.length === 0) {
				return { status: 'No valid series data documents found.' };
			}
			console.log(
				`Total number of scraped series data documents: ${allSeriesDataObj.length}.`
			);
			const connectionSeriesDataDb = await connectMongoDb('Series_Data');
			const results = await Promise.allSettled(
				allSeriesDataObj.map(
					(doc, i) =>
						new Promise<void>((resolve, reject) =>
							setTimeout(async () => {
								try {
									const docExists =
										await connectionSeriesDataDb.models.Series_Data_Doc.findOne(
											{
												series: doc.series,
												year: doc.year,
												documents_url: doc.documents_url,
											}
										).exec();
									if (docExists) {
										console.log('Document already exists. Skipping.');
										resolve();
										return;
									}
									await connectionSeriesDataDb.models.Series_Data_Doc.create({
										...doc,
										manual_upload: false,
									});
									resolve();
								} catch (error: any) {
									console.log(error);
									console.log(
										'Errored doc URL: ' + doc.documents_url.includes(fiaDomain)
											? doc.documents_url
											: fiaDomain + doc.documents_url
									);
									reject(error);
								}
							}, 500 * i)
						)
				)
			);
			browser.close();
			return {
				status: 'Finished acquiring years supported by each series.',
				documents_found: allSeriesDataObj.length,
				documents_processed: results.length,
				successes: results.filter((obj) => obj.status === 'fulfilled').length,
				failures: results.filter((obj) => obj.status === 'rejected').length,
			};
		} catch (error: any) {
			browser.close();
			console.log(error);
			return { error };
		}
	});
}

// Initialize the clustered worker process
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
throng({ workers, start });
