import mongoose, { MongooseOptions } from 'mongoose';

const MONGODB_URI =
	process.env.NODE_ENV === 'production'
		? process.env.MONGODB_URI
		: process.env.MONGODB_URI_DEV;

if (!MONGODB_URI) {
	throw new Error(
		'Please define the MONGODB_URI / MONGODB_URI_DEV environment variable inside .env.local'
	);
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
	cached = global.mongoose = { client: null };
}

const connectMongoDb = async (dbName: string) => {
	try {
		const opts: MongooseOptions = {
			bufferCommands: true,
		};
		if (!cached.client) {
			const client = await mongoose.connect(
				MONGODB_URI + dbName + '?retryWrites=true&w=majority',
				opts
			);
			if (dbName === 'Other_Docs') {
				if (!client.models.Missing_Doc) {
					client.model('Missing_Doc', require('../models/missingDoc'));
				}
				if (!client.models.Contact_Doc) {
					client.model('Contact_Doc', require('../models/contactDoc'));
				}
				if (!client.models.Penalty_Doc) {
					client.model('Penalty_Doc', require('../models/penaltyDoc'));
				}
			} else if (dbName === 'Series_Data') {
				if (!client.models.Series_Data_Doc) {
					client.model('Series_Data_Doc', require('../models/seriesDataDoc'));
				}
			} else {
				if (!client.models.Penalty_Doc) {
					client.model('Penalty_Doc', require('../models/penaltyDoc'));
				}
			}

			cached.client = client;
			return client.connection;
		}
		const dbConnectionExists = cached.client.connections.find(
			(conn) => conn.name === dbName
		);
		if (!dbConnectionExists) {
			const connection = cached.client.createConnection(
				MONGODB_URI + dbName + '?retryWrites=true&w=majority',
				opts
			);
			if (dbName === 'Other_Docs') {
				if (!connection.models.Missing_Doc) {
					connection.model('Missing_Doc', require('../models/missingDoc'));
				}
				if (!connection.models.Contact_Doc) {
					connection.model('Contact_Doc', require('../models/contactDoc'));
				}
				if (!connection.models.Penalty_Doc) {
					connection.model('Penalty_Doc', require('../models/penaltyDoc'));
				}
			} else if (dbName === 'Series_Data') {
				if (!connection.models.Series_Data_Doc) {
					connection.model(
						'Series_Data_Doc',
						require('../models/seriesDataDoc')
					);
				}
			} else {
				if (!connection.models.Penalty_Doc) {
					connection.model('Penalty_Doc', require('../models/penaltyDoc'));
				}
			}
			return connection;
		}
		return dbConnectionExists;
	} catch (error) {
		console.log(error);
		throw new Error('Error connecting to database.');
	}
};

export default connectMongoDb;
