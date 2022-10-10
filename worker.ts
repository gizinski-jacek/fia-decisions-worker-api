import connectMongo from './mongo/mongo';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { readPDFPages } from './utils/pdfReader';
import { streamToBuffer } from './utils/streamToBuffer';
import { transformToDecOffDoc } from './utils/transformToDecOffDoc';
import { disallowedWordsInDocName, fiaDomain } from './myData/myData';

import throng from 'throng';
import Queue from 'bull';

// Connect to a local redis instance locally, and the Heroku-provided URL in production.
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Spin up multiple processes to handle jobs to take advantage of more CPU cores.
// See: https://devcenter.heroku.com/articles/node-concurrency for more info.
const workers = process.env.WEB_CONCURRENCY || 2;

// The maximum number of jobs each worker should process at once. This will need to
// be tuned for your application.If each job is mostly waiting on network responses
// it can be much higher.If each job is CPU - intensive, it might need to be much lower.
const maxJobsPerWorker = 50;

function start() {
	// Connect to the named work queue.
	let workQueue = new Queue('worker', REDIS_URL);
	// Processing named jobs.
	workQueue.process('update-all', maxJobsPerWorker, async (job) => {
		try {
			const responseSite = await axios.get(job.data.seriesYearPageURL, {
				timeout: 15000,
			});
			const { document } = new JSDOM(responseSite.data).window;
			const listView: HTMLElement | null = document.getElementById('list-view');
			if (!listView) {
				throw new Error('Error getting main page');
			}
			const mainDoc: HTMLDivElement | null = listView.querySelector(
				'.decision-document-list'
			);
			if (!mainDoc) {
				throw new Error('Error getting document list.');
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
						(fileName.includes('offence') && fileName.includes('car')))
				) {
					allDocsHref.push(link.href);
				}
			});
			if (allDocsHref.length === 0) {
				return { value: 'Updating all files finished.' };
			}
			console.log(`Total number of scraped documents: ${allDocsHref.length}.`);
			const conn = await connectMongo(job.data.seriesYearDB);
			const results = await Promise.allSettled(
				allDocsHref.slice(0, 3).map(
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
									const transformed = transformToDecOffDoc(
										href,
										readPDF as any,
										job.data.series as 'f1' | 'f2' | 'f3'
									);
									const docExists = await conn.models.Decision_Offence.findOne({
										series: job.data.series,
										doc_type: transformed.doc_type,
										doc_name: transformed.doc_name,
										doc_date: transformed.doc_date,
										penalty_type: transformed.penalty_type,
										grand_prix: transformed.grand_prix,
										weekend: transformed.weekend,
									});
									if (docExists) {
										console.log('Document already exists. Skipping.');
										resolve();
										return;
									}
									await conn.models.Decision_Offence.create({
										...transformed,
										manual_upload: false,
									});
									resolve();
								} catch (error: any) {
									console.log(error);
									reject(error);
								}
							}, 1000 * i)
						)
				)
			);
			return {
				status: 'Finished updating all documents.',
				series: job.data.series.toUpperCase(),
				year: job.data.year,
				new_documents_count: allDocsHref.length,
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
